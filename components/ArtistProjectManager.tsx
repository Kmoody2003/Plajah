/**
 * Artist Project Manager
 * Full business operations hub for artists, bands, and creator businesses.
 *
 * Tabs: Overview · Payroll · Contracts · Invoices · Tasks · Vendors · Venues · Ad Hub
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, FileText, Receipt, CheckSquare, Truck, MapPin, Megaphone,
  Plus, ChevronRight, X, Edit2, Trash2, Download, Send, CheckCircle2,
  Clock, AlertCircle, DollarSign, Calendar, Phone, Mail, Globe,
  Star, TrendingUp, BarChart2, Briefcase, Music2, Building2,
  Copy, Eye, Package, Zap, ArrowRight, Shield, Search, Filter,
  Mic, Layers, Ticket, Radio, Sparkles, Disc3,
  Camera, Film, Clapperboard, Scissors, BookOpen, PenLine, Newspaper, Award, Target, BookMarked,
  LayoutDashboard, ClipboardList, Utensils, UserCheck, MessageSquare, Square,
} from 'lucide-react';
import { UserProfile } from '../types';
import {
  FilmProductionProvider, ProductionHubTab, CallSheetsTab, RosterTab, DailyBriefTab, CraftServicesTab, ReportsTab, useProd,
} from './film/FilmProductionSuite';
import * as FilmProduction from '../services/filmProductionService';
import { patchSceneWithAction, putLocationWithAction } from '../services/productionActionService';
import { askProductionBrain, type ProductionBrainAnswer } from '../services/productionIntelligenceService';
import { addHqAsset } from '../services/orgAssets';
import { buildFabulaProjectFromTakes } from '../services/filmEditBridge';
import { transcribeAndScoreTake, coverageGaps } from '../services/takeScoring';
import { startTakeRecorder, recordingToFile, pendingCameraTiers, type TakeRecorderHandle } from '../services/takeCapture';
import { compareFrames, grabFrame, type ContinuityResult } from '../services/continuityCheck';
import { subscribeBreakdownElements, type BreakdownElement } from '../services/productionBreakdownService';
import { uploadFile } from '../services/backendService';
import { FilmStaffingTab } from './film/FilmStaffingTab';
import { FilmBreakdownTab } from './film/FilmBreakdownTab';
import { FilmScheduleTab as ProductionScheduleTab } from './film/FilmScheduleTab';
import ProductionChatWorkspace from './film/ProductionChatWorkspace';
import { listWritingProjects, type WritingProject, type WritingChapter } from '../services/loreaProjectsService';
import { MusicReleasesTab } from './music/MusicReleasesTab';
import {
  fetchMyProductions, fetchSongs, IS_ON_RECORD,
  PRODUCTION_STATUSES as MELOS_STATUSES, stateMeta, commitmentMeta,
  type MelosProduction, type SongState, type Commitment, type ProductionStatus,
} from '../services/melosService';
import { isDemoMode, setDemoMode, subscribeDemoMode } from '../services/demoMode';

// ─── Storage helpers ────────────────────────────────────────────────────────────

/** Writer demo rows (seeded by ensureWriterDemo) carry these sentinel ids. */
const WRITER_DEMO_IDS = new Set(['proj1', 'proj2', 'proj3']);

function pmStore<T>(key: string): { get: () => T[]; set: (v: T[]) => void } {
  const K = `plajah_pm_${key}_v1`;
  return {
    get: () => { try { return JSON.parse(localStorage.getItem(K) || '[]'); } catch { return []; } },
    set: (v) => { try { localStorage.setItem(K, JSON.stringify(v)); } catch {} },
  };
}

function uuid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
function fmtDate(ts: number) { return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function fmtCurrency(n: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n); }

// ─── Types ──────────────────────────────────────────────────────────────────────

type ContractType = 'PERFORMANCE' | 'RECORDING' | 'MANAGEMENT' | 'LICENSING' | 'SYNC' | 'PUBLISHING' | 'BOOKING' | 'SPONSORSHIP';
type ContractStatus = 'DRAFT' | 'SENT' | 'SIGNED' | 'EXPIRED' | 'CANCELLED';
type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';
type VendorCategory = 'SOUND' | 'LIGHTING' | 'CATERING' | 'TRANSPORT' | 'SECURITY' | 'MERCH' | 'FILMING' | 'STAGING' | 'PHOTOGRAPHY' | 'OTHER';

interface BandMember {
  id: string;
  name: string;
  role: string;
  email: string;
  splitPercent: number;
  totalPaid: number;
}

interface Contract {
  id: string;
  type: ContractType;
  title: string;
  counterparty: string;
  value: number;
  startDate: number;
  endDate?: number;
  status: ContractStatus;
  notes: string;
  createdAt: number;
}

interface InvoiceLineItem {
  description: string;
  qty: number;
  rate: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  client: string;
  clientEmail: string;
  lineItems: InvoiceLineItem[];
  dueDate: number;
  status: InvoiceStatus;
  notes: string;
  createdAt: number;
  paidAt?: number;
}

interface Task {
  id: string;
  title: string;
  description: string;
  assignee: string;
  dueDate?: number;
  priority: TaskPriority;
  status: TaskStatus;
  category: string;
  createdAt: number;
}

interface Vendor {
  id: string;
  name: string;
  category: VendorCategory;
  contact: string;
  phone: string;
  email: string;
  rate: string;
  rating: number;
  timesUsed: number;
  notes: string;
  createdAt: number;
}

interface Venue {
  id: string;
  name: string;
  city: string;
  state: string;
  capacity: number;
  contact: string;
  phone: string;
  email: string;
  website: string;
  notes: string;
  timesBooked: number;
  lastBooked?: number;
  rating: number;
  createdAt: number;
}

// ─── Storage instances ────────────────────────────────────────────────────────

const memberStore  = pmStore<BandMember>('members');
const contractStore= pmStore<Contract>('contracts');
const invoiceStore = pmStore<Invoice>('invoices');
const taskStore    = pmStore<Task>('tasks');
const vendorStore  = pmStore<Vendor>('vendors');
const venueStore   = pmStore<Venue>('venues');

// ─── Constants / style helpers ─────────────────────────────────────────────────

const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  PERFORMANCE: 'Performance',  RECORDING: 'Recording',   MANAGEMENT: 'Management',
  LICENSING: 'Licensing',      SYNC: 'Sync License',     PUBLISHING: 'Publishing',
  BOOKING: 'Booking',          SPONSORSHIP: 'Sponsorship',
};

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  DRAFT:     { bg: 'bg-white/5',          text: 'text-white/40',    label: 'Draft' },
  SENT:      { bg: 'bg-blue-500/15',      text: 'text-blue-400',    label: 'Sent' },
  SIGNED:    { bg: 'bg-emerald-500/15',   text: 'text-emerald-400', label: 'Signed' },
  EXPIRED:   { bg: 'bg-white/5',          text: 'text-white/30',    label: 'Expired' },
  CANCELLED: { bg: 'bg-red-500/10',       text: 'text-red-400/60',  label: 'Cancelled' },
  PAID:      { bg: 'bg-emerald-500/15',   text: 'text-emerald-400', label: 'Paid' },
  OVERDUE:   { bg: 'bg-red-500/15',       text: 'text-red-400',     label: 'Overdue' },
  TODO:      { bg: 'bg-white/5',          text: 'text-white/40',    label: 'To Do' },
  IN_PROGRESS:{ bg: 'bg-orange-500/15',   text: 'text-orange-400',  label: 'In Progress' },
  DONE:      { bg: 'bg-emerald-500/15',   text: 'text-emerald-400', label: 'Done' },
  LOW:       { bg: 'bg-white/5',          text: 'text-white/30',    label: 'Low' },
  MEDIUM:    { bg: 'bg-yellow-500/15',    text: 'text-yellow-400',  label: 'Medium' },
  HIGH:      { bg: 'bg-orange-500/15',    text: 'text-orange-400',  label: 'High' },
  URGENT:    { bg: 'bg-red-500/15',       text: 'text-red-400',     label: 'Urgent' },
};

const VENDOR_ICONS: Record<VendorCategory, string> = {
  SOUND:'🔊', LIGHTING:'💡', CATERING:'🍽️', TRANSPORT:'🚐', SECURITY:'🛡️',
  MERCH:'👕', FILMING:'🎥', STAGING:'🏗️', PHOTOGRAPHY:'📸', OTHER:'📦',
};

// ─── Sub-components ────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE['DRAFT'];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string }> = ({ icon, label, value, sub, color }) => (
  <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 flex items-center gap-3">
    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}20`, color }}>
      {icon}
    </div>
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-white/30">{label}</p>
      <p className="text-lg font-black text-white leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-white/30 mt-0.5">{sub}</p>}
    </div>
  </div>
);

const EmptyState: React.FC<{ icon: React.ReactNode; title: string; body: string; cta?: string; onCta?: () => void }> = ({ icon, title, body, cta, onCta }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
    <div className="w-16 h-16 rounded-3xl flex items-center justify-center border border-dashed border-white/15 text-white/20">
      {icon}
    </div>
    <div className="max-w-xs">
      <p className="text-sm font-black uppercase tracking-widest text-white/40 mb-2">{title}</p>
      <p className="text-xs text-white/25 leading-relaxed">{body}</p>
    </div>
    {cta && onCta && (
      <button onClick={onCta} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#FF8C00]/15 border border-[#FF8C00]/30 text-[#FF8C00] text-xs font-black uppercase tracking-widest hover:bg-[#FF8C00]/25 transition-all">
        <Plus size={13} /> {cta}
      </button>
    )}
  </div>
);

// ─── Tab: Overview ─────────────────────────────────────────────────────────────

const OverviewTab: React.FC<{ onSwitchTab: (t: PMTab) => void }> = ({ onSwitchTab }) => {
  const members   = memberStore.get();
  const contracts = contractStore.get();
  const invoices  = invoiceStore.get();
  const tasks     = taskStore.get();
  const vendors   = vendorStore.get();
  const venues    = venueStore.get();

  const totalOwed    = invoices.filter(i => i.status === 'SENT' || i.status === 'OVERDUE').reduce((s, i) => s + i.lineItems.reduce((a, l) => a + l.qty * l.rate, 0), 0);
  const totalPaid    = invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + i.lineItems.reduce((a, l) => a + l.qty * l.rate, 0), 0);
  const pendingTasks = tasks.filter(t => t.status !== 'DONE').length;
  const signedContracts = contracts.filter(c => c.status === 'SIGNED').length;

  const quickLinks: { icon: React.ReactNode; label: string; tab: PMTab; count?: number; color: string }[] = [
    { icon: <Mic size={16} />,        label: 'Events',       tab: 'events',     count: undefined,         color: '#FF8C00' },
    { icon: <Layers size={16} />,     label: 'Boards',       tab: 'boards',     count: undefined,         color: '#a855f7' },
    { icon: <Megaphone size={16} />,  label: 'Promote',      tab: 'promote',    count: undefined,         color: '#6366f1' },
    { icon: <Users size={16} />,      label: 'Band Payroll', tab: 'payroll',    count: members.length,    color: '#FF8C00' },
    { icon: <FileText size={16} />,   label: 'Contracts',    tab: 'contracts',  count: contracts.length,  color: '#a855f7' },
    { icon: <Receipt size={16} />,    label: 'Invoices',     tab: 'invoices',   count: invoices.length,   color: '#10b981' },
    { icon: <CheckSquare size={16} />,label: 'Tasks',        tab: 'tasks',      count: pendingTasks,      color: '#3b82f6' },
    { icon: <Truck size={16} />,      label: 'Vendors',      tab: 'vendors',    count: vendors.length,    color: '#f59e0b' },
    { icon: <MapPin size={16} />,     label: 'Venues',       tab: 'venues',     count: venues.length,     color: '#ef4444' },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<DollarSign size={18} />} label="Outstanding"  value={fmtCurrency(totalOwed)} sub="Awaiting payment" color="#f97316" />
        <StatCard icon={<CheckCircle2 size={18} />} label="Collected" value={fmtCurrency(totalPaid)} sub="Total invoiced" color="#10b981" />
        <StatCard icon={<CheckSquare size={18} />} label="Open Tasks" value={pendingTasks} sub={`${tasks.length} total`} color="#3b82f6" />
        <StatCard icon={<FileText size={18} />}   label="Active Contracts" value={signedContracts} sub={`${contracts.length} total`} color="#a855f7" />
      </div>

      {/* Quick nav */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30 mb-4">Management Tools</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {quickLinks.map(({ icon, label, tab, count, color }) => (
            <button
              key={tab}
              onClick={() => onSwitchTab(tab)}
              className="flex items-center gap-3 p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl hover:border-white/15 hover:bg-white/[0.06] transition-all group text-left"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}20`, color }}>
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-white">{label}</p>
                <p className="text-[10px] text-white/30">{count ?? 0} item{count !== 1 ? 's' : ''}</p>
              </div>
              <ArrowRight size={14} className="text-white/20 group-hover:text-white/50 transition-colors shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* Overdue alerts */}
      {invoices.some(i => i.status === 'OVERDUE') && (
        <div className="p-4 bg-red-500/10 border border-red-500/25 rounded-2xl flex items-start gap-3">
          <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-black text-red-400">Overdue Invoices</p>
            <p className="text-xs text-red-400/70 mt-0.5">
              You have {invoices.filter(i => i.status === 'OVERDUE').length} overdue invoice{invoices.filter(i => i.status === 'OVERDUE').length !== 1 ? 's' : ''}. Follow up to collect payment.
            </p>
            <button onClick={() => onSwitchTab('invoices')} className="mt-2 text-xs font-black text-red-400 hover:text-red-300 underline underline-offset-2">View invoices →</button>
          </div>
        </div>
      )}
    </motion.div>
  );
};

// ─── Tab: Payroll ──────────────────────────────────────────────────────────────

const PayrollTab: React.FC = () => {
  const [members, setMembers] = useState<BandMember[]>(() => memberStore.get());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', role: '', email: '', splitPercent: '' });

  const save = (m: BandMember[]) => { memberStore.set(m); setMembers(m); };

  const addMember = () => {
    if (!form.name.trim()) return;
    const pct = Math.min(100, Math.max(0, parseFloat(form.splitPercent) || 0));
    save([...members, { id: uuid(), name: form.name, role: form.role, email: form.email, splitPercent: pct, totalPaid: 0 }]);
    setForm({ name: '', role: '', email: '', splitPercent: '' });
    setAdding(false);
  };

  const removeMember = (id: string) => save(members.filter(m => m.id !== id));

  const totalSplit = members.reduce((s, m) => s + m.splitPercent, 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black uppercase tracking-widest text-white">Band Payroll</h3>
          <p className="text-xs text-white/35 mt-0.5">Manage payment splits for band members and collaborators</p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FF8C00]/15 border border-[#FF8C00]/30 text-[#FF8C00] text-xs font-black uppercase tracking-widest hover:bg-[#FF8C00]/25 transition-all">
          <Plus size={13} /> Add Member
        </button>
      </div>

      {/* Split gauge */}
      {members.length > 0 && (
        <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Split Allocation</p>
            <p className={`text-xs font-black ${totalSplit > 100 ? 'text-red-400' : totalSplit === 100 ? 'text-emerald-400' : 'text-white/40'}`}>
              {totalSplit.toFixed(1)}% / 100%
            </p>
          </div>
          <div className="h-2 bg-white/8 rounded-full overflow-hidden flex">
            {members.map((m, i) => {
              const colors = ['#FF8C00','#a855f7','#10b981','#3b82f6','#f59e0b','#ef4444','#ec4899'];
              return (
                <div key={m.id} className="h-full transition-all" title={`${m.name}: ${m.splitPercent}%`}
                  style={{ width: `${Math.min(m.splitPercent, 100)}%`, background: colors[i % colors.length] }} />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-3">
            {members.map((m, i) => {
              const colors = ['#FF8C00','#a855f7','#10b981','#3b82f6','#f59e0b','#ef4444','#ec4899'];
              return (
                <span key={m.id} className="flex items-center gap-1.5 text-[10px] font-black text-white/50">
                  <span className="w-2 h-2 rounded-full" style={{ background: colors[i % colors.length] }} />
                  {m.name} {m.splitPercent}%
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Member list */}
      {members.length === 0 && !adding
        ? <EmptyState icon={<Users size={28} />} title="No band members yet" body="Add band members or collaborators to set up payment splits for your earnings." cta="Add First Member" onCta={() => setAdding(true)} />
        : (
          <div className="space-y-3">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl group">
                <div className="w-10 h-10 rounded-xl bg-[#FF8C00]/15 flex items-center justify-center shrink-0">
                  <span className="text-sm font-black text-[#FF8C00]">{m.name[0]?.toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white">{m.name}</p>
                  <p className="text-xs text-white/40">{m.role}{m.email ? ` · ${m.email}` : ''}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-black text-[#FF8C00]">{m.splitPercent}%</p>
                  <p className="text-[10px] text-white/25">of earnings</p>
                </div>
                <button onClick={() => removeMember(m.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/15 text-white/30 hover:text-red-400 transition-all">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )
      }

      {/* Add member form */}
      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-5 bg-white/[0.04] border border-white/10 rounded-2xl space-y-4">
            <p className="text-sm font-black text-white">New Band Member</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'name', label: 'Name', placeholder: 'e.g. Marcus Johnson' },
                { key: 'role', label: 'Role', placeholder: 'e.g. Drummer' },
                { key: 'email', label: 'Email', placeholder: 'marcus@email.com' },
                { key: 'splitPercent', label: 'Split %', placeholder: '25' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">{f.label}</label>
                  <input
                    value={form[f.key as keyof typeof form]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2.5 bg-black/20 border border-white/10 focus:border-[#FF8C00]/50 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold transition-all"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={addMember} className="px-5 py-2.5 rounded-xl bg-[#FF8C00] text-black text-xs font-black uppercase tracking-widest hover:bg-[#FF8C00]/80 transition-all">Add</button>
              <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl bg-white/5 text-white/50 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ─── Tab: Contracts ────────────────────────────────────────────────────────────

const CONTRACT_TEMPLATES: { type: ContractType; clauses: string[] }[] = [
  { type: 'PERFORMANCE', clauses: [
    'Artist agrees to perform for the duration specified, in a professional manner.',
    'Venue agrees to provide sound, lighting, and backline as specified in the technical rider.',
    'Payment due in full within 7 days of performance.',
    'Cancellation within 14 days: 50% kill fee applies. Within 48 hours: 100% kill fee.',
    'Artist retains all rights to recorded performances unless otherwise agreed.',
  ]},
  { type: 'RECORDING', clauses: [
    'Studio agrees to provide [X] hours of recording time as specified.',
    'Engineer services included for the duration of the session.',
    'All session recordings remain property of the Artist until released to label.',
    'Studio may not use recordings in any promotional capacity without written consent.',
  ]},
  { type: 'SYNC', clauses: [
    'Rights granted for synchronization of the specified Master Recording with visual media.',
    'License term: [DURATION]. Territory: [TERRITORY].',
    'Royalty rate: [RATE] per use / flat fee of [AMOUNT].',
    'Licensee may not sublicense without written consent.',
    'All other rights reserved by the Artist/Rights Holder.',
  ]},
];

const ContractsTab: React.FC = () => {
  const [contracts, setContracts] = useState<Contract[]>(() => contractStore.get());
  const [adding, setAdding] = useState(false);
  const [viewingTemplate, setViewingTemplate] = useState<typeof CONTRACT_TEMPLATES[0] | null>(null);
  const [form, setForm] = useState({ type: 'PERFORMANCE' as ContractType, title: '', counterparty: '', value: '', notes: '' });

  const save = (c: Contract[]) => { contractStore.set(c); setContracts(c); };

  const addContract = () => {
    if (!form.title.trim()) return;
    save([...contracts, {
      id: uuid(), type: form.type, title: form.title, counterparty: form.counterparty,
      value: parseFloat(form.value) || 0, startDate: Date.now(), status: 'DRAFT',
      notes: form.notes, createdAt: Date.now(),
    }]);
    setForm({ type: 'PERFORMANCE', title: '', counterparty: '', value: '', notes: '' });
    setAdding(false);
  };

  const cycleStatus = (id: string) => {
    const ORDER: ContractStatus[] = ['DRAFT','SENT','SIGNED','EXPIRED'];
    save(contracts.map(c => c.id === id ? { ...c, status: ORDER[(ORDER.indexOf(c.status) + 1) % ORDER.length] } : c));
  };

  const remove = (id: string) => save(contracts.filter(c => c.id !== id));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black uppercase tracking-widest text-white">Contracts</h3>
          <p className="text-xs text-white/35 mt-0.5">Performance agreements, licensing deals, and business contracts</p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 text-xs font-black uppercase tracking-widest hover:bg-purple-500/25 transition-all">
          <Plus size={13} /> New Contract
        </button>
      </div>

      {/* Template library */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-3">Contract Templates</p>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {CONTRACT_TEMPLATES.map(t => (
            <button key={t.type} onClick={() => setViewingTemplate(t)}
              className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.03] border border-white/[0.06] hover:border-purple-500/30 hover:bg-purple-500/5 text-xs font-black uppercase tracking-widest text-white/50 hover:text-purple-400 transition-all">
              <FileText size={11} /> {CONTRACT_TYPE_LABELS[t.type]}
            </button>
          ))}
        </div>
      </div>

      {/* Template viewer */}
      <AnimatePresence>
        {viewingTemplate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden">
            <div className="p-5 bg-purple-500/5 border border-purple-500/20 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-purple-300">{CONTRACT_TYPE_LABELS[viewingTemplate.type]} Template</p>
                <button onClick={() => setViewingTemplate(null)} className="p-1 text-white/30 hover:text-white transition-colors"><X size={14} /></button>
              </div>
              <div className="space-y-2">
                {viewingTemplate.clauses.map((clause, i) => (
                  <div key={i} className="flex gap-2.5">
                    <span className="text-[10px] font-black text-purple-400/60 mt-0.5 shrink-0">{i + 1}.</span>
                    <p className="text-xs text-white/60 leading-relaxed">{clause}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setForm(f => ({ ...f, type: viewingTemplate.type, title: `${CONTRACT_TYPE_LABELS[viewingTemplate.type]} Agreement`, notes: viewingTemplate.clauses.join('\n') }));
                    setViewingTemplate(null);
                    setAdding(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-400 text-xs font-black uppercase tracking-widest hover:bg-purple-500/30 transition-all">
                  <Copy size={11} /> Use This Template
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contract list */}
      {contracts.length === 0 && !adding
        ? <EmptyState icon={<FileText size={28} />} title="No contracts yet" body="Create performance agreements, licensing deals, or use a template to get started." cta="Create Contract" onCta={() => setAdding(true)} />
        : (
          <div className="space-y-3">
            {contracts.map(c => (
              <div key={c.id} className="flex items-center gap-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl group hover:border-white/10 transition-all">
                <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
                  <FileText size={15} className="text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white truncate">{c.title}</p>
                  <p className="text-xs text-white/40">{c.counterparty} · {CONTRACT_TYPE_LABELS[c.type]} · {fmtDate(c.createdAt)}</p>
                </div>
                {c.value > 0 && <p className="text-sm font-black text-white/70 shrink-0">{fmtCurrency(c.value)}</p>}
                <button onClick={() => cycleStatus(c.id)}><StatusBadge status={c.status} /></button>
                <button onClick={() => remove(c.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/15 text-white/30 hover:text-red-400 transition-all">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )
      }

      {/* Add form */}
      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-5 bg-white/[0.04] border border-white/10 rounded-2xl space-y-4">
            <p className="text-sm font-black text-white">New Contract</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">Contract Type</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as ContractType }))}
                  className="w-full px-3 py-2.5 bg-black/20 border border-white/10 focus:border-purple-500/50 rounded-xl text-sm text-white outline-none font-bold transition-all">
                  {Object.entries(CONTRACT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {[
                { key: 'title', label: 'Contract Title', placeholder: 'e.g. Detroit Jazz Fest Performance 2026', span: 2 },
                { key: 'counterparty', label: 'Other Party', placeholder: 'Venue / Label / Brand name' },
                { key: 'value', label: 'Contract Value ($)', placeholder: '2500' },
              ].map(f => (
                <div key={f.key} className={f.span ? `col-span-${f.span}` : ''}>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">{f.label}</label>
                  <input value={form[f.key as keyof typeof form]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2.5 bg-black/20 border border-white/10 focus:border-purple-500/50 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold transition-all" />
                </div>
              ))}
              <div className="col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">Notes / Clauses</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={4} placeholder="Key terms, clauses, and conditions..."
                  className="w-full px-3 py-2.5 bg-black/20 border border-white/10 focus:border-purple-500/50 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold transition-all resize-none" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addContract} className="px-5 py-2.5 rounded-xl bg-purple-500 text-white text-xs font-black uppercase tracking-widest hover:bg-purple-400 transition-all">Create</button>
              <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl bg-white/5 text-white/50 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ─── Tab: Invoices ─────────────────────────────────────────────────────────────

const InvoicesTab: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>(() => invoiceStore.get());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ client: '', clientEmail: '', dueDate: '', notes: '', lineItems: [{ description: '', qty: '1', rate: '' }] });

  const save = (inv: Invoice[]) => { invoiceStore.set(inv); setInvoices(inv); };
  const nextNum = () => `INV-${String(invoices.length + 1).padStart(4, '0')}`;

  const addLine = () => setForm(f => ({ ...f, lineItems: [...f.lineItems, { description: '', qty: '1', rate: '' }] }));
  const updateLine = (i: number, key: string, val: string) => setForm(f => ({ ...f, lineItems: f.lineItems.map((l, idx) => idx === i ? { ...l, [key]: val } : l) }));
  const removeLine = (i: number) => setForm(f => ({ ...f, lineItems: f.lineItems.filter((_, idx) => idx !== i) }));

  const total = form.lineItems.reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0), 0);

  const addInvoice = () => {
    if (!form.client.trim()) return;
    save([...invoices, {
      id: uuid(), invoiceNumber: nextNum(), client: form.client, clientEmail: form.clientEmail,
      lineItems: form.lineItems.map(l => ({ description: l.description, qty: parseFloat(l.qty) || 1, rate: parseFloat(l.rate) || 0 })),
      dueDate: form.dueDate ? new Date(form.dueDate).getTime() : Date.now() + 30 * 86400000,
      status: 'DRAFT', notes: form.notes, createdAt: Date.now(),
    }]);
    setForm({ client: '', clientEmail: '', dueDate: '', notes: '', lineItems: [{ description: '', qty: '1', rate: '' }] });
    setAdding(false);
  };

  const cycleStatus = (id: string) => {
    const ORDER: InvoiceStatus[] = ['DRAFT','SENT','PAID'];
    save(invoices.map(i => i.id === id ? { ...i, status: ORDER[(ORDER.indexOf(i.status) + 1) % ORDER.length], paidAt: ORDER[(ORDER.indexOf(i.status) + 1) % ORDER.length] === 'PAID' ? Date.now() : undefined } : i));
  };

  const remove = (id: string) => save(invoices.filter(i => i.id !== id));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black uppercase tracking-widest text-white">Invoices</h3>
          <p className="text-xs text-white/35 mt-0.5">Bill venues, brands, and clients for your services</p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-black uppercase tracking-widest hover:bg-emerald-500/25 transition-all">
          <Plus size={13} /> New Invoice
        </button>
      </div>

      {invoices.length === 0 && !adding
        ? <EmptyState icon={<Receipt size={28} />} title="No invoices yet" body="Create invoices for performances, sessions, sync licenses, or any service." cta="Create Invoice" onCta={() => setAdding(true)} />
        : (
          <div className="space-y-3">
            {invoices.map(inv => {
              const total = inv.lineItems.reduce((s, l) => s + l.qty * l.rate, 0);
              const isOverdue = inv.status === 'SENT' && inv.dueDate < Date.now();
              return (
                <div key={inv.id} className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl hover:border-white/10 transition-all group">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-black text-white/30">{inv.invoiceNumber}</p>
                        <button onClick={() => cycleStatus(inv.id)}>
                          <StatusBadge status={isOverdue ? 'OVERDUE' : inv.status} />
                        </button>
                      </div>
                      <p className="text-sm font-black text-white mt-0.5">{inv.client}</p>
                      <p className="text-xs text-white/40">Due {fmtDate(inv.dueDate)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-white">{fmtCurrency(total)}</p>
                      <p className="text-[10px] text-white/30">{inv.lineItems.length} line item{inv.lineItems.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-3 border-t border-white/5">
                    <button onClick={() => cycleStatus(inv.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-black text-white/50 hover:text-white transition-all">
                      <Send size={10} /> {inv.status === 'DRAFT' ? 'Mark Sent' : inv.status === 'SENT' ? 'Mark Paid' : 'Reopen'}
                    </button>
                    <button onClick={() => remove(inv.id)} className="ml-auto opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/15 text-white/30 hover:text-red-400 transition-all">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      }

      {/* Add invoice form */}
      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-5 bg-white/[0.04] border border-white/10 rounded-2xl space-y-4">
            <p className="text-sm font-black text-white">New Invoice · {nextNum()}</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'client', label: 'Client / Venue', placeholder: 'Detroit Music Hall', span: 2 },
                { key: 'clientEmail', label: 'Client Email', placeholder: 'billing@venue.com' },
                { key: 'dueDate', label: 'Due Date', placeholder: '', type: 'date' },
              ].map(f => (
                <div key={f.key} className={f.span ? `col-span-${f.span}` : ''}>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">{f.label}</label>
                  <input type={f.type ?? 'text'} value={form[f.key as keyof typeof form] as string} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2.5 bg-black/20 border border-white/10 focus:border-emerald-500/50 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold transition-all" />
                </div>
              ))}
            </div>

            {/* Line items */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Line Items</p>
              <div className="space-y-2">
                {form.lineItems.map((line, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input value={line.description} onChange={e => updateLine(i, 'description', e.target.value)}
                      placeholder="Service description" className="flex-1 px-3 py-2 bg-black/20 border border-white/10 focus:border-emerald-500/40 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold transition-all" />
                    <input value={line.qty} onChange={e => updateLine(i, 'qty', e.target.value)}
                      placeholder="Qty" type="number" className="w-16 px-2 py-2 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none font-bold text-center" />
                    <input value={line.rate} onChange={e => updateLine(i, 'rate', e.target.value)}
                      placeholder="Rate" type="number" className="w-24 px-2 py-2 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none font-bold" />
                    {form.lineItems.length > 1 && (
                      <button onClick={() => removeLine(i)} className="p-1.5 text-white/30 hover:text-red-400 transition-colors"><X size={13} /></button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={addLine} className="mt-2 flex items-center gap-1.5 text-[10px] font-black text-white/30 hover:text-emerald-400 transition-colors uppercase tracking-widest">
                <Plus size={10} /> Add Line
              </button>
              <div className="mt-3 pt-3 border-t border-white/8 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Total</p>
                <p className="text-base font-black text-white">{fmtCurrency(total)}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={addInvoice} className="px-5 py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-400 transition-all">Create Invoice</button>
              <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl bg-white/5 text-white/50 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ─── Tab: Tasks ────────────────────────────────────────────────────────────────

const TASK_CATEGORIES = ['Pre-Show', 'Day Of Show', 'Post-Show', 'Admin', 'Creative', 'Press', 'Legal', 'Finance', 'Other'];

const TasksTab: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>(() => taskStore.get());
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<TaskStatus | 'ALL'>('ALL');
  const [form, setForm] = useState({ title: '', description: '', assignee: '', dueDate: '', priority: 'MEDIUM' as TaskPriority, category: 'Admin' });

  const save = (t: Task[]) => { taskStore.set(t); setTasks(t); };
  const addTask = () => {
    if (!form.title.trim()) return;
    save([...tasks, { id: uuid(), ...form, dueDate: form.dueDate ? new Date(form.dueDate).getTime() : undefined, status: 'TODO', createdAt: Date.now() }]);
    setForm({ title: '', description: '', assignee: '', dueDate: '', priority: 'MEDIUM', category: 'Admin' });
    setAdding(false);
  };
  const toggleStatus = (id: string) => {
    const ORDER: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];
    save(tasks.map(t => t.id === id ? { ...t, status: ORDER[(ORDER.indexOf(t.status) + 1) % ORDER.length] } : t));
  };
  const remove = (id: string) => save(tasks.filter(t => t.id !== id));

  const visible = filter === 'ALL' ? tasks : tasks.filter(t => t.status === filter);
  const counts = { TODO: tasks.filter(t => t.status === 'TODO').length, IN_PROGRESS: tasks.filter(t => t.status === 'IN_PROGRESS').length, DONE: tasks.filter(t => t.status === 'DONE').length };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black uppercase tracking-widest text-white">Tasks</h3>
          <p className="text-xs text-white/35 mt-0.5">Track everything the band needs to get done</p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 text-xs font-black uppercase tracking-widest hover:bg-blue-500/25 transition-all">
          <Plus size={13} /> Add Task
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {([['ALL', 'All', tasks.length], ['TODO', 'To Do', counts.TODO], ['IN_PROGRESS', 'In Progress', counts.IN_PROGRESS], ['DONE', 'Done', counts.DONE]] as const).map(([v, l, c]) => (
          <button key={v} onClick={() => setFilter(v as any)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all border ${filter === v ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' : 'bg-white/[0.03] border-white/[0.06] text-white/40 hover:text-white/70'}`}>
            {l} <span className="text-[10px]">{c}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 && !adding
        ? <EmptyState icon={<CheckSquare size={28} />} title="No tasks" body="Break down your shows, sessions, and admin work into manageable tasks for the whole team." cta="Add First Task" onCta={() => setAdding(true)} />
        : (
          <div className="space-y-2">
            {visible.map(task => (
              <motion.div key={task.id} layout
                className={`flex items-start gap-3 p-4 rounded-2xl border transition-all group ${task.status === 'DONE' ? 'opacity-50 bg-white/[0.02] border-white/[0.04]' : 'bg-white/[0.03] border-white/[0.06] hover:border-white/10'}`}>
                <button onClick={() => toggleStatus(task.id)} className="mt-0.5 shrink-0">
                  {task.status === 'DONE'
                    ? <CheckCircle2 size={18} className="text-emerald-400" />
                    : task.status === 'IN_PROGRESS'
                    ? <div className="w-[18px] h-[18px] rounded-full border-2 border-orange-400 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-orange-400" /></div>
                    : <div className="w-[18px] h-[18px] rounded-full border-2 border-white/25 hover:border-blue-400 transition-colors" />
                  }
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <p className={`text-sm font-black ${task.status === 'DONE' ? 'line-through text-white/40' : 'text-white'}`}>{task.title}</p>
                    <StatusBadge status={task.priority} />
                  </div>
                  {task.description && <p className="text-xs text-white/40 leading-relaxed">{task.description}</p>}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {task.category && <span className="text-[10px] font-black text-white/25 uppercase tracking-wider">{task.category}</span>}
                    {task.assignee && <span className="text-[10px] text-white/35">→ {task.assignee}</span>}
                    {task.dueDate && <span className={`text-[10px] font-bold flex items-center gap-1 ${task.dueDate < Date.now() && task.status !== 'DONE' ? 'text-red-400' : 'text-white/30'}`}><Clock size={8} /> {fmtDate(task.dueDate)}</span>}
                  </div>
                </div>
                <button onClick={() => remove(task.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/15 text-white/30 hover:text-red-400 transition-all shrink-0">
                  <Trash2 size={13} />
                </button>
              </motion.div>
            ))}
          </div>
        )
      }

      {/* Add form */}
      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-5 bg-white/[0.04] border border-white/10 rounded-2xl space-y-4">
            <p className="text-sm font-black text-white">New Task</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">Task Title</label>
                <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Confirm sound check time with venue"
                  className="w-full px-3 py-2.5 bg-black/20 border border-white/10 focus:border-blue-500/50 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold transition-all" />
              </div>
              {[
                { key: 'assignee', label: 'Assign To', placeholder: 'Band member name' },
                { key: 'dueDate', label: 'Due Date', type: 'date', placeholder: '' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">{f.label}</label>
                  <input type={f.type ?? 'text'} value={form[f.key as keyof typeof form] as string} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                    className="w-full px-3 py-2.5 bg-black/20 border border-white/10 focus:border-blue-500/50 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold transition-all" />
                </div>
              ))}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">Priority</label>
                <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value as TaskPriority }))}
                  className="w-full px-3 py-2.5 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none font-bold">
                  {(['LOW','MEDIUM','HIGH','URGENT'] as TaskPriority[]).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">Category</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none font-bold">
                  {TASK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">Notes</label>
                <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Additional context..."
                  className="w-full px-3 py-2.5 bg-black/20 border border-white/10 focus:border-blue-500/50 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold transition-all" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addTask} className="px-5 py-2.5 rounded-xl bg-blue-500 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-400 transition-all">Add Task</button>
              <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl bg-white/5 text-white/50 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ─── Tab: Vendors ──────────────────────────────────────────────────────────────

const VendorsTab: React.FC = () => {
  const [vendors, setVendors] = useState<Vendor[]>(() => vendorStore.get());
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', category: 'SOUND' as VendorCategory, contact: '', phone: '', email: '', rate: '', notes: '' });

  const save = (v: Vendor[]) => { vendorStore.set(v); setVendors(v); };
  const addVendor = () => {
    if (!form.name.trim()) return;
    save([...vendors, { id: uuid(), ...form, rating: 5, timesUsed: 0, createdAt: Date.now() }]);
    setForm({ name: '', category: 'SOUND', contact: '', phone: '', email: '', rate: '', notes: '' });
    setAdding(false);
  };
  const remove = (id: string) => save(vendors.filter(v => v.id !== id));
  const incrementUsed = (id: string) => save(vendors.map(v => v.id === id ? { ...v, timesUsed: v.timesUsed + 1 } : v));

  const visible = search ? vendors.filter(v => `${v.name} ${v.category} ${v.contact}`.toLowerCase().includes(search.toLowerCase())) : vendors;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black uppercase tracking-widest text-white">Vendors</h3>
          <p className="text-xs text-white/35 mt-0.5">Sound engineers, lighting crews, caterers, and all service providers</p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-xs font-black uppercase tracking-widest hover:bg-yellow-500/25 transition-all">
          <Plus size={13} /> Add Vendor
        </button>
      </div>

      {vendors.length > 0 && (
        <div className="relative">
          <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendors..."
            className="w-full pl-9 pr-4 py-2.5 bg-white/[0.03] border border-white/[0.06] focus:border-yellow-500/40 rounded-xl text-sm text-white outline-none placeholder-white/25 font-bold transition-all" />
        </div>
      )}

      {visible.length === 0 && !adding
        ? <EmptyState icon={<Truck size={28} />} title="No vendors yet" body="Build your go-to list of sound engineers, lighting crews, and other service providers." cta="Add First Vendor" onCta={() => setAdding(true)} />
        : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visible.map(v => (
              <div key={v.id} className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl hover:border-white/10 transition-all group">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center shrink-0 text-xl">
                    {VENDOR_ICONS[v.category]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-white">{v.name}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-yellow-400/70">{v.category.replace('_',' ')}</p>
                  </div>
                  <button onClick={() => remove(v.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/15 text-white/30 hover:text-red-400 transition-all shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="space-y-1 mb-3">
                  {v.contact && <p className="text-xs text-white/50 flex items-center gap-1.5"><span className="text-white/20">Contact:</span>{v.contact}</p>}
                  {v.phone && <p className="text-xs text-white/50 flex items-center gap-1.5"><Phone size={10} className="text-white/20 shrink-0" />{v.phone}</p>}
                  {v.email && <p className="text-xs text-white/50 flex items-center gap-1.5"><Mail size={10} className="text-white/20 shrink-0" />{v.email}</p>}
                  {v.rate && <p className="text-xs text-white/50"><span className="text-white/20">Rate:</span> {v.rate}</p>}
                </div>
                <div className="flex items-center justify-between pt-2.5 border-t border-white/5">
                  <p className="text-[10px] text-white/25">Used {v.timesUsed}×</p>
                  <button onClick={() => incrementUsed(v.id)} className="text-[10px] font-black text-white/30 hover:text-yellow-400 transition-colors uppercase tracking-widest">+ Mark Used</button>
                </div>
              </div>
            ))}
          </div>
        )
      }

      {/* Add form */}
      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-5 bg-white/[0.04] border border-white/10 rounded-2xl space-y-4">
            <p className="text-sm font-black text-white">New Vendor</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">Category</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value as VendorCategory }))}
                  className="w-full px-3 py-2.5 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none font-bold">
                  {(Object.keys(VENDOR_ICONS) as VendorCategory[]).map(c => <option key={c} value={c}>{VENDOR_ICONS[c]} {c.replace('_',' ')}</option>)}
                </select>
              </div>
              {[
                { key: 'name', label: 'Business Name', placeholder: 'Detroit Sound Co.', span: 1 },
                { key: 'contact', label: 'Contact Person', placeholder: 'Marcus Williams' },
                { key: 'phone', label: 'Phone', placeholder: '(313) 555-0100' },
                { key: 'email', label: 'Email', placeholder: 'hello@vendor.com' },
                { key: 'rate', label: 'Rate / Price', placeholder: '$500 flat / $75/hr' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">{f.label}</label>
                  <input value={form[f.key as keyof typeof form]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                    className="w-full px-3 py-2.5 bg-black/20 border border-white/10 focus:border-yellow-500/50 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold transition-all" />
                </div>
              ))}
              <div className="col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">Notes</label>
                <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Specialties, gear, availability notes..."
                  className="w-full px-3 py-2.5 bg-black/20 border border-white/10 focus:border-yellow-500/50 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold transition-all" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addVendor} className="px-5 py-2.5 rounded-xl bg-yellow-500 text-black text-xs font-black uppercase tracking-widest hover:bg-yellow-400 transition-all">Add Vendor</button>
              <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl bg-white/5 text-white/50 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ─── Tab: Venues ───────────────────────────────────────────────────────────────

const VenuesTab: React.FC = () => {
  const [venues, setVenues] = useState<Venue[]>(() => venueStore.get());
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', city: '', state: '', capacity: '', contact: '', phone: '', email: '', website: '', notes: '' });

  const save = (v: Venue[]) => { venueStore.set(v); setVenues(v); };
  const addVenue = () => {
    if (!form.name.trim()) return;
    save([...venues, { id: uuid(), ...form, capacity: parseInt(form.capacity) || 0, rating: 5, timesBooked: 0, createdAt: Date.now() }]);
    setForm({ name: '', city: '', state: '', capacity: '', contact: '', phone: '', email: '', website: '', notes: '' });
    setAdding(false);
  };
  const remove = (id: string) => save(venues.filter(v => v.id !== id));
  const markBooked = (id: string) => save(venues.map(v => v.id === id ? { ...v, timesBooked: v.timesBooked + 1, lastBooked: Date.now() } : v));

  const visible = search ? venues.filter(v => `${v.name} ${v.city} ${v.state}`.toLowerCase().includes(search.toLowerCase())) : venues;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black uppercase tracking-widest text-white">Venues</h3>
          <p className="text-xs text-white/35 mt-0.5">Your venue rolodex — contacts, capacity, booking history</p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-black uppercase tracking-widest hover:bg-red-500/25 transition-all">
          <Plus size={13} /> Add Venue
        </button>
      </div>

      {venues.length > 0 && (
        <div className="relative">
          <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search venues..."
            className="w-full pl-9 pr-4 py-2.5 bg-white/[0.03] border border-white/[0.06] focus:border-red-500/40 rounded-xl text-sm text-white outline-none placeholder-white/25 font-bold transition-all" />
        </div>
      )}

      {visible.length === 0 && !adding
        ? <EmptyState icon={<MapPin size={28} />} title="No venues yet" body="Build your venue database with contacts, capacity, and performance history for every room you play." cta="Add First Venue" onCta={() => setAdding(true)} />
        : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visible.map(v => (
              <div key={v.id} className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl hover:border-white/10 transition-all group">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="text-sm font-black text-white">{v.name}</p>
                    <p className="text-xs text-white/40 flex items-center gap-1"><MapPin size={10} />{[v.city, v.state].filter(Boolean).join(', ')}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {v.capacity > 0 && (
                      <span className="px-2.5 py-1 rounded-full bg-white/5 text-[10px] font-black text-white/40">{v.capacity.toLocaleString()} cap.</span>
                    )}
                    <button onClick={() => remove(v.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/15 text-white/30 hover:text-red-400 transition-all">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="space-y-1 mb-3">
                  {v.contact && <p className="text-xs text-white/50"><span className="text-white/20">Contact:</span> {v.contact}</p>}
                  {v.phone && <p className="text-xs text-white/50 flex items-center gap-1"><Phone size={10} className="text-white/20 shrink-0" />{v.phone}</p>}
                  {v.email && <p className="text-xs text-white/50 flex items-center gap-1"><Mail size={10} className="text-white/20 shrink-0" />{v.email}</p>}
                  {v.website && <a href={v.website} target="_blank" rel="noopener noreferrer" className="text-xs text-white/30 hover:text-red-400 flex items-center gap-1 transition-colors"><Globe size={10} className="shrink-0" />{v.website}</a>}
                  {v.notes && <p className="text-xs text-white/35 leading-relaxed mt-1">{v.notes}</p>}
                </div>
                <div className="flex items-center justify-between pt-2.5 border-t border-white/5">
                  <p className="text-[10px] text-white/25">Booked {v.timesBooked}× {v.lastBooked ? `· Last: ${fmtDate(v.lastBooked)}` : ''}</p>
                  <button onClick={() => markBooked(v.id)} className="text-[10px] font-black text-white/30 hover:text-red-400 transition-colors uppercase tracking-widest">+ Mark Booked</button>
                </div>
              </div>
            ))}
          </div>
        )
      }

      {/* Add form */}
      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-5 bg-white/[0.04] border border-white/10 rounded-2xl space-y-4">
            <p className="text-sm font-black text-white">New Venue</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">Venue Name</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. The Shelter, Detroit"
                  className="w-full px-3 py-2.5 bg-black/20 border border-white/10 focus:border-red-500/50 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold transition-all" />
              </div>
              {[
                { key: 'city', label: 'City', placeholder: 'Detroit' },
                { key: 'state', label: 'State', placeholder: 'MI' },
                { key: 'capacity', label: 'Capacity', placeholder: '500' },
                { key: 'contact', label: 'Booking Contact', placeholder: 'Jane Smith' },
                { key: 'phone', label: 'Phone', placeholder: '(313) 555-0199' },
                { key: 'email', label: 'Booking Email', placeholder: 'booking@venue.com' },
                { key: 'website', label: 'Website', placeholder: 'https://venue.com' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">{f.label}</label>
                  <input value={form[f.key as keyof typeof form]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                    className="w-full px-3 py-2.5 bg-black/20 border border-white/10 focus:border-red-500/50 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold transition-all" />
                </div>
              ))}
              <div className="col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">Notes</label>
                <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Stage size, load-in time, parking, tech rider notes..."
                  className="w-full px-3 py-2.5 bg-black/20 border border-white/10 focus:border-red-500/50 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold transition-all" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addVenue} className="px-5 py-2.5 rounded-xl bg-red-500 text-white text-xs font-black uppercase tracking-widest hover:bg-red-400 transition-all">Add Venue</button>
              <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl bg-white/5 text-white/50 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ─── Tab: Ad Hub ───────────────────────────────────────────────────────────────

const AdHubTab: React.FC = () => {
  const adChannels = [
    { name: 'Plajah Boost', description: 'Algorithmic content boost within the Plajah platform. Increases reach across feeds, search, and discovery.', action: 'Manage Packages', route: 'AD_PACKAGES', color: '#FF8C00', icon: <Zap size={16} /> },
    { name: 'TikTok Creator', description: 'Promote your content to TikTok audiences. Use Plajah content links as your destination.', action: 'Go to TikTok Ads', url: 'https://ads.tiktok.com', color: '#00f2ea', icon: <TrendingUp size={16} /> },
    { name: 'Instagram / Meta', description: 'Run story and feed ads on Instagram and Facebook. Link directly to your Plajah profile or Sanctuary.', action: 'Go to Meta Ads', url: 'https://business.facebook.com/adsmanager', color: '#e1306c', icon: <Star size={16} /> },
    { name: 'Google / YouTube', description: 'YouTube pre-roll ads and Google Display ads targeted to music fans and your genre audience.', action: 'Go to Google Ads', url: 'https://ads.google.com', color: '#4285f4', icon: <BarChart2 size={16} /> },
    { name: 'Spotify for Artists', description: 'Promote new releases on Spotify with Marquee and Showcase. Drive streams to build chart momentum.', action: 'Go to Spotify', url: 'https://artists.spotify.com', color: '#1db954', icon: <Music2 size={16} /> },
    { name: 'SubmitHub', description: 'Submit tracks to blogs, playlists, and YouTube channels. Curated placements for independent artists.', action: 'Go to SubmitHub', url: 'https://www.submithub.com', color: '#ff6b35', icon: <Send size={16} /> },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h3 className="text-base font-black uppercase tracking-widest text-white">Ad Hub</h3>
        <p className="text-xs text-white/35 mt-0.5">Manage all your promotion and advertising from one place — every platform, one view</p>
      </div>

      {/* Platform cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {adChannels.map(ch => (
          <div key={ch.name} className="p-5 bg-white/[0.03] border border-white/[0.06] rounded-2xl hover:border-white/10 transition-all group">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${ch.color}25`, color: ch.color }}>
                {ch.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-white">{ch.name}</p>
                <p className="text-xs text-white/40 leading-relaxed mt-0.5">{ch.description}</p>
              </div>
            </div>
            {'route' in ch && ch.route ? (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: ch.route } }))}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                style={{ background: `${ch.color}20`, color: ch.color, border: `1px solid ${ch.color}40` }}
              >
                {ch.action} <ArrowRight size={11} />
              </button>
            ) : (
              <a
                href={(ch as any).url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:opacity-80"
                style={{ background: `${ch.color}20`, color: ch.color, border: `1px solid ${ch.color}40` }}
              >
                {ch.action} <ArrowRight size={11} />
              </a>
            )}
          </div>
        ))}
      </div>

      {/* Tips */}
      <div className="p-5 bg-[#FF8C00]/5 border border-[#FF8C00]/20 rounded-2xl">
        <p className="text-sm font-black text-[#FF8C00] mb-3">Promotion Strategy</p>
        <div className="space-y-2">
          {[
            'Start with Plajah Boost to build organic momentum before spending on external ads.',
            'TikTok → Plajah is the highest-converting funnel: clip gets views, link in bio converts to subscribers.',
            'Run Instagram Story ads with a 15-sec preview clip. Destination: your Plajah Sanctuary page.',
            'SubmitHub playlist placements cost $1–3 per submission. 10 placements = potential 50K+ new listeners.',
          ].map((tip, i) => (
            <div key={i} className="flex gap-2.5">
              <span className="text-[#FF8C00]/50 text-[10px] font-black mt-0.5 shrink-0">{i + 1}.</span>
              <p className="text-xs text-white/50 leading-relaxed">{tip}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

// ─── Tab: Events (launch pad for Event Production Studio) ─────────────────────

const EventsLaunchTab: React.FC = () => {
  const navigate = (target: string) => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target } }));

  const tools = [
    { title: 'Event Production Studio', description: 'Full production hub — setlist, team, tickets, check-in, merch, PPV stream, and Aria as executive producer.', target: 'EVENT_PRODUCTION_STUDIO', icon: <Mic size={18} />, color: '#FF8C00', cta: 'Open Studio' },
    { title: 'Ticket Designer', description: '6 artist-style templates. Digital animated tickets with music and QR. Printable static layout. Plajah branding on every ticket.', target: 'TICKET_DESIGNER', icon: <Ticket size={18} />, color: '#10b981', cta: 'Design Tickets' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div>
        <h3 className="text-base font-black uppercase tracking-widest text-white">Event Tools</h3>
        <p className="text-xs text-white/35 mt-0.5">Everything you need to plan, produce, sell, and run a live event</p>
      </div>

      {/* Aria pitch */}
      <div className="p-5 rounded-3xl border border-amber-500/25 bg-amber-500/5 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ background: 'radial-gradient(ellipse at top right, rgba(245,158,11,0.2) 0%, transparent 60%)' }} />
        <div className="relative flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
            <Sparkles size={15} className="text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black text-amber-300">Aria is your Executive Producer</p>
            <p className="text-xs text-white/50 mt-1 leading-relaxed">She'll research local vendors, build your marketing strategy with any budget (including $0), plan your setlist energy arc, brief your team, project your P&L, and find blindspots before the show.</p>
            <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt: 'Act as Aria, my executive producer. I want to plan a new live event. Ask me what type of event, venue, and budget — then give me a complete step-by-step production plan.' } }))}
              className="mt-3 flex items-center gap-2 text-amber-400 text-xs font-black uppercase tracking-widest hover:text-amber-300 transition-colors">
              <Sparkles size={11} /> Start planning a new event with Aria →
            </button>
          </div>
        </div>
      </div>

      {/* Tool cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {tools.map(t => (
          <button key={t.title} onClick={() => navigate(t.target)}
            className="group flex flex-col items-start gap-4 p-6 bg-white/[0.03] border border-white/[0.06] rounded-2xl hover:border-white/15 hover:bg-white/[0.06] transition-all text-left">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `${t.color}20`, color: t.color }}>
              {t.icon}
            </div>
            <div className="flex-1">
              <p className="text-base font-black text-white mb-1">{t.title}</p>
              <p className="text-xs text-white/45 leading-relaxed">{t.description}</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest transition-colors" style={{ color: t.color }}>
              {t.cta} <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        ))}
      </div>

      {/* What Aria can do in the studio */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30 mb-4">What Aria handles inside the Event Studio</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {[
            ['Setlist energy arc analysis','#a855f7'],
            ['Local vendor research','#10b981'],
            ['Marketing strategy ($0–$∞)','#FF8C00'],
            ['Team day-of production brief','#3b82f6'],
            ['Budget & P&L projection','#f59e0b'],
            ['Ticket pricing strategy','#ec4899'],
            ['PPV revenue projection','#ef4444'],
            ['Stage + lighting direction','#6366f1'],
          ].map(([label, color]) => (
            <div key={label as string} className="flex items-center gap-2 p-2.5 bg-white/[0.02] border border-white/[0.05] rounded-xl">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color as string }} />
              <p className="text-[10px] font-black text-white/50 leading-tight">{label as string}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

// ─── Tab: Boards (launch pad for Artist Boards) ───────────────────────────────

/**
 * Artist Manager › Music › Productions — the business-side door into Melos.
 *
 * A production is the album BEFORE it's a release; once it publishes it shows up
 * next door in Releases as a campaign. This tab is the bridge between the two.
 */
/**
 * Artist Manager › Import Work — the door into Career Import.
 *
 * Deliberately a launch card rather than the flow itself: the studio is a full-screen,
 * multi-step surface, and running it inside a tab's scroll container fights it.
 */
const CareerImportLaunchTab: React.FC = () => {
  const navigate = () => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'CAREER_IMPORT' } }));
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h3 className="text-base font-black uppercase tracking-widest text-white">Import Work</h3>
        <p className="text-xs text-white/35 mt-0.5">
          Bring what you have already released into Plajah, instead of starting from an empty account
        </p>
      </div>

      <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
            <Download size={16} className="text-purple-300" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black text-white">Point us at your work</p>
            <p className="text-xs text-white/40 leading-relaxed mt-1.5 max-w-xl">
              Paste an Audius profile, a podcast feed, or just your name. We read what is publicly
              published — nothing behind a login — and you confirm what is actually yours before any
              of it is added.
            </p>
            <button
              onClick={navigate}
              className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(120deg,#6B0099,#D40055)', color: '#fff', border: 0 }}
            >
              <Download size={13} /> Find my work
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// ─── Music demo production (self-contained, always explorable) ───────────────
// Mirrors how Film ships the "Afterlight" showcase and Writer seeds a demo book:
// a fully-populated, interactive record you can open and poke at before you've
// made anything of your own. Read-only, no Firestore — always works, even signed out.

interface DemoSong {
  order: number; title: string; state: SongState; commitment: Commitment;
  love: number; lengthSec: number; note?: string;
  lyricPeek?: string; feel?: string; credits?: string;
}

const DEMO_MUSIC_PRODUCTION = {
  id: 'demo-music-neon-cathedral',
  title: 'Neon Cathedral',
  workingTitle: 'the Detroit record',
  artistName: 'Vela',
  status: 'TRACKING' as ProductionStatus,
  intent: 'The record I needed at 3AM on Woodward — gospel bones under machine skin. Ten songs, no filler. It should sound like the city looks after the rain: rusted and holy at the same time.',
};

const DEMO_MUSIC_SONGS: DemoSong[] = [
  { order: 1, title: 'Cathedral of Neon',   state: 'FINISHED', commitment: 'VERIFIED',      love: 5, lengthSec: 224, note: 'The opener. Locked.', lyricPeek: 'Stained glass made of billboard light / I found my faith on a Tuesday night', feel: 'Slow build · 72 BPM · Bb minor', credits: 'Vela — vox, keys · M. Okafor — bass' },
  { order: 2, title: 'Woodward at 3AM',      state: 'MIXING',   commitment: 'VERIFIED',      love: 5, lengthSec: 198, note: 'Third mix — almost there', feel: 'Head-nod · 88 BPM', credits: 'Vela — vox · D. Reyes — drums' },
  { order: 3, title: 'Ghost in the Rustbelt', state: 'TRACKING', commitment: 'VERIFIED',     love: 4, lengthSec: 241, lyricPeek: 'They shuttered every plant but the ghosts still clock in', feel: 'Driving · 104 BPM' },
  { order: 4, title: 'Copper & Gold',        state: 'TRACKING', commitment: 'WORKING_ON_IT', love: 3, lengthSec: 187, note: 'Second verse still fighting me' },
  { order: 5, title: 'Sister Motor',         state: 'DEMO',     commitment: 'WORKING_ON_IT', love: 4, lengthSec: 205, feel: 'Uptempo · 120 BPM', note: 'Could be the single' },
  { order: 6, title: 'Eastside Gospel',      state: 'MIXING',   commitment: 'VERIFIED',      love: 5, lengthSec: 262, lyricPeek: 'Choir robes and a broken hallelujah', credits: 'Vela — vox · Greater Grace choir' },
  { order: 7, title: 'Paper Crown',          state: 'WRITING',  commitment: 'WORKING_ON_IT', love: 2, lengthSec: 176, note: 'Have the hook, need the bridge' },
  { order: 8, title: 'Half-Light',           state: 'DEMO',     commitment: 'TENTATIVE',     love: 3, lengthSec: 214, note: 'On the bubble' },
  { order: 9, title: 'The Long Way Home',    state: 'FINISHED', commitment: 'VERIFIED',      love: 5, lengthSec: 288, note: 'The closer. Do not touch.', feel: 'Ballad · 60 BPM' },
  // Set aside — not this record
  { order: 10, title: 'Static Prayer',       state: 'SPARK',    commitment: 'SHELVED',       love: 2, lengthSec: 0, note: 'Save for the next one' },
  { order: 11, title: 'Overpass',            state: 'WRITING',  commitment: 'CUT',           love: 1, lengthSec: 0, note: 'Doesn\'t fit — cut' },
];

const DEMO_MUSIC_BOARD: { emoji: string; label: string; note: string }[] = [
  { emoji: '🎚️', label: 'Tape saturation on the drum bus', note: 'That warm crunch from the reference track' },
  { emoji: '🎹', label: 'Wurlitzer, not Rhodes', note: 'Grittier — matches the rust theme' },
  { emoji: '🎤', label: 'Choir for Eastside Gospel', note: 'Booked Greater Grace — 6 voices' },
  { emoji: '🌆', label: 'Cover: neon on wet asphalt', note: 'Shot list started in Boards' },
];

const fmtSongLen = (s: number) => s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '—';

const MusicDemoDetail: React.FC<{ onOpenMelos: () => void }> = ({ onOpenMelos }) => {
  const [view, setView] = React.useState<'ORDER' | 'STATE'>('ORDER');
  const [expanded, setExpanded] = React.useState<number | null>(null);
  const [loved, setLoved] = React.useState<Record<number, boolean>>({});

  const onRecord = DEMO_MUSIC_SONGS.filter(s => IS_ON_RECORD.includes(s.commitment));
  const finished = onRecord.filter(s => s.state === 'FINISHED');
  const setAside = DEMO_MUSIC_SONGS.filter(s => !IS_ON_RECORD.includes(s.commitment));
  const runtime = onRecord.reduce((a, s) => a + s.lengthSec, 0);
  const status = MELOS_STATUSES.find(x => x.key === DEMO_MUSIC_PRODUCTION.status);

  const rows = view === 'ORDER'
    ? [...DEMO_MUSIC_SONGS].sort((a, b) => a.order - b.order)
    : [...DEMO_MUSIC_SONGS].sort((a, b) => stateMeta(b.state).order - stateMeta(a.state).order);

  const SongRow: React.FC<{ s: DemoSong }> = ({ s }) => {
    const sm = stateMeta(s.state); const cm = commitmentMeta(s.commitment);
    const isOpen = expanded === s.order;
    const isLoved = loved[s.order] ?? false;
    const loveCount = s.love + (isLoved ? 1 : 0);
    const dimmed = !IS_ON_RECORD.includes(s.commitment);
    return (
      <div className={`rounded-xl border transition-all ${isOpen ? 'border-white/15 bg-white/[0.05]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/12'} ${dimmed ? 'opacity-55' : ''}`}>
        <div role="button" tabIndex={0} onClick={() => setExpanded(isOpen ? null : s.order)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(isOpen ? null : s.order); } }}
          className="w-full flex items-center gap-3 p-3 text-left cursor-pointer select-none">
          <span className="w-5 text-[11px] font-black text-white/25 tabular-nums shrink-0">{view === 'ORDER' ? s.order : '·'}</span>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sm.color }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white truncate">{s.title}</p>
            <p className="text-[10px] text-white/35">{sm.label} · {fmtSongLen(s.lengthSec)}</p>
          </div>
          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0 hidden sm:inline" style={{ background: `${cm.color}22`, color: cm.color }}>{cm.label}</span>
          <button
            onClick={e => { e.stopPropagation(); setLoved(p => ({ ...p, [s.order]: !isLoved })); }}
            className="flex items-center gap-1 shrink-0 text-[10px] font-black transition-colors"
            style={{ color: isLoved ? '#D40055' : 'rgba(255,255,255,0.3)' }}
            aria-label="Love this track"
          >
            <Star size={12} fill={isLoved ? '#D40055' : 'none'} /> {loveCount}
          </button>
          <ChevronRight size={13} className={`text-white/20 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        </div>
        <AnimatePresence>
          {isOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="px-3 pb-3 pl-11 space-y-2">
                {s.lyricPeek && <p className="text-[11px] text-white/55 italic leading-relaxed">"{s.lyricPeek}…"</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {s.feel && <span className="text-[10px] text-white/40"><span className="text-white/25">Feel:</span> {s.feel}</span>}
                  {s.credits && <span className="text-[10px] text-white/40"><span className="text-white/25">Credits:</span> {s.credits}</span>}
                </div>
                {s.note && <p className="text-[10px] text-white/30">📌 {s.note}</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-white/[0.06]">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-400">Demo</span>
              {status && <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: `${status.color}22`, color: status.color }}>{status.label}</span>}
            </div>
            <h4 className="text-lg font-black text-white mt-2">{DEMO_MUSIC_PRODUCTION.title}</h4>
            <p className="text-[11px] text-white/35">by {DEMO_MUSIC_PRODUCTION.artistName} · {DEMO_MUSIC_PRODUCTION.workingTitle}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-black text-white leading-none">{onRecord.length}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mt-1">on the record</p>
            <p className="text-[10px] text-white/30 mt-1">{finished.length} finished · {fmtSongLen(runtime)}</p>
          </div>
        </div>
        <p className="text-[11px] text-white/45 italic leading-relaxed mt-3 max-w-2xl">"{DEMO_MUSIC_PRODUCTION.intent}"</p>
      </div>

      {/* Tracklist */}
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Tracklist</p>
          <div className="flex gap-1 p-0.5 rounded-lg bg-white/5">
            {(['ORDER', 'STATE'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${view === v ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'}`}>
                {v === 'ORDER' ? 'Running order' : 'By state'}
              </button>
            ))}
          </div>
        </div>

        {view === 'STATE' ? (
          <div className="space-y-1.5">{rows.map(s => <SongRow key={s.order} s={s} />)}</div>
        ) : (
          <div className="space-y-1.5">
            {rows.filter(s => IS_ON_RECORD.includes(s.commitment)).map(s => <SongRow key={s.order} s={s} />)}
            {setAside.length > 0 && (
              <>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/20 pt-3 pb-1">Set aside — not this record</p>
                {setAside.map(s => <SongRow key={s.order} s={s} />)}
              </>
            )}
          </div>
        )}
      </div>

      {/* Board */}
      <div className="px-5 pb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-2">Caught my ear</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {DEMO_MUSIC_BOARD.map((b, i) => (
            <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <span className="text-base shrink-0">{b.emoji}</span>
              <div className="min-w-0"><p className="text-[11px] font-black text-white/80">{b.label}</p><p className="text-[10px] text-white/35 leading-tight mt-0.5">{b.note}</p></div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="px-5 py-4 border-t border-white/[0.06] bg-white/[0.02] flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[10px] text-white/35">This is a sample record. Your own productions live in Melos.</p>
        <button onClick={onOpenMelos}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:opacity-90"
          style={{ background: 'linear-gradient(120deg,#6B0099,#D40055)', color: '#fff', border: 0 }}>
          <Disc3 size={13} /> Start your own in Melos
        </button>
      </div>
    </motion.div>
  );
};

const MelosLaunchTab: React.FC<{ currentUser?: UserProfile | null }> = ({ currentUser }) => {
  const navigate = (target: string, extra: object = {}) =>
    window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target, ...extra } }));

  const [showDemo, setShowDemo] = React.useState(false);
  const [productions, setProductions] = React.useState<MelosProduction[]>([]);
  const [counts, setCounts] = React.useState<Record<string, { songs: number; onRecord: number; finished: number }>>({});
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    const uid = currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    (async () => {
      const rows = await fetchMyProductions(uid);
      if (!alive) return;
      setProductions(rows);
      setLoading(false);
      // Per-production song counts, so the card says something true rather than "0".
      const entries = await Promise.all(rows.map(async p => {
        const songs = await fetchSongs(p.id);
        const onRecord = songs.filter(s => IS_ON_RECORD.includes(s.commitment));
        return [p.id, {
          songs: songs.length,
          onRecord: onRecord.length,
          finished: onRecord.filter(s => s.state === 'FINISHED').length,
        }] as const;
      }));
      if (alive) setCounts(Object.fromEntries(entries));
    })();
    return () => { alive = false; };
  }, [currentUser?.uid]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-black uppercase tracking-widest text-white">Productions</h3>
          <p className="text-xs text-white/35 mt-0.5">
            Albums in progress — writing, sequencing, samples and sessions, before there's anything to release
          </p>
        </div>
        <button
          onClick={() => navigate('MELOS')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:opacity-90"
          style={{ background: 'linear-gradient(120deg,#6B0099,#D40055)', color: '#fff', border: 0 }}
        >
          <Disc3 size={13} /> Open Melos
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-white/30 uppercase tracking-widest py-8">Loading…</p>
      ) : (
        <>
          {productions.length === 0 && (
            <p className="text-xs text-white/35 max-w-md leading-relaxed">
              You haven't started a record yet. Open the sample production below to see how Melos
              tracks it — lyrics as blocks, honest song states, a running order, and a board for
              everything that caught your ear.
            </p>
          )}

          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {productions.map(p => {
              const c = counts[p.id];
              const status = MELOS_STATUSES.find(x => x.key === p.status);
              return (
                <button
                  key={p.id}
                  onClick={() => navigate('MELOS', { productionId: p.id })}
                  className="text-left p-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-white truncate">{p.title}</p>
                      {p.workingTitle && <p className="text-[11px] text-white/30 truncate">— {p.workingTitle}</p>}
                    </div>
                    {status && (
                      <span
                        className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full shrink-0"
                        style={{ background: `${status.color}22`, color: status.color }}
                      >{status.label}</span>
                    )}
                  </div>

                  {c && (
                    <p className="text-[11px] text-white/40 mt-3">
                      {c.onRecord} on the record · {c.finished} finished
                      {c.songs > c.onRecord && <span className="text-white/25"> · {c.songs - c.onRecord} set aside</span>}
                    </p>
                  )}

                  {p.albumId && (
                    <p className="text-[10px] uppercase tracking-widest mt-2 text-emerald-400">Released</p>
                  )}
                </button>
              );
            })}

            {/* Demo production — only when demo mode is on */}
            {isDemoMode() && (
            <button
              onClick={() => setShowDemo(v => !v)}
              className={`text-left p-4 rounded-2xl border transition-colors ${showDemo ? 'border-pink-500/40 bg-pink-500/[0.06]' : 'border-dashed border-white/15 bg-white/[0.02] hover:bg-white/[0.05]'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-black text-white truncate">{DEMO_MUSIC_PRODUCTION.title}</p>
                  <p className="text-[11px] text-white/30 truncate">— {DEMO_MUSIC_PRODUCTION.workingTitle}</p>
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full shrink-0 bg-pink-500/15 text-pink-400">Demo</span>
              </div>
              <p className="text-[11px] text-white/40 mt-3">
                {DEMO_MUSIC_SONGS.filter(s => IS_ON_RECORD.includes(s.commitment)).length} on the record ·{' '}
                {DEMO_MUSIC_SONGS.filter(s => s.state === 'FINISHED' && IS_ON_RECORD.includes(s.commitment)).length} finished
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest mt-2 text-pink-400 flex items-center gap-1">
                {showDemo ? 'Hide' : 'Explore'} <ArrowRight size={11} />
              </p>
            </button>
            )}
          </div>

          <AnimatePresence>
            {isDemoMode() && showDemo && <MusicDemoDetail onOpenMelos={() => navigate('MELOS')} />}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
};

const BoardsLaunchTab: React.FC = () => {
  const navigate = (target: string) => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target } }));
  const BOARDS_KEY = 'plajah_artist_boards_v1';
  const boards: any[] = React.useMemo(() => { try { return JSON.parse(localStorage.getItem(BOARDS_KEY) || '[]'); } catch { return []; } }, []);

  const boardTypes = [
    { emoji: '📣', title: 'Marketing Campaign', color: '#FF8C00', desc: 'Poster concepts, social assets, promo imagery' },
    { emoji: '🎭', title: 'Stage Design', color: '#a855f7', desc: 'Stage layout, backdrop, visual references' },
    { emoji: '💡', title: 'Lighting Mood', color: '#3b82f6', desc: 'Color palettes, atmosphere, cue references' },
    { emoji: '🎟️', title: 'Ticket & Poster Concepts', color: '#10b981', desc: 'Layout ideas, typography, visual direction' },
    { emoji: '✨', title: 'Brand & Identity', color: '#ef4444', desc: 'Logos, color systems, artist identity' },
    { emoji: '🗺️', title: 'Venue Layout', color: '#f59e0b', desc: 'Floor plan, stage position, audience flow' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black uppercase tracking-widest text-white">Artist Boards</h3>
          <p className="text-xs text-white/35 mt-0.5">Visual planning canvas for marketing art, stage design, and creative direction</p>
        </div>
        <button onClick={() => navigate('ARTIST_BOARDS')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 text-xs font-black uppercase tracking-widest hover:bg-purple-500/25 transition-all">
          <Layers size={13} /> Open Boards
        </button>
      </div>

      {/* Boards count */}
      {boards.length > 0 ? (
        <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-2xl flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
            <Layers size={16} className="text-purple-400" />
          </div>
          <div>
            <p className="text-sm font-black text-white">You have {boards.length} board{boards.length !== 1 ? 's' : ''}</p>
            <p className="text-xs text-white/40">{boards.map((b: any) => b.title).join(' · ')}</p>
          </div>
          <button onClick={() => navigate('ARTIST_BOARDS')} className="ml-auto flex items-center gap-1.5 text-xs font-black text-purple-400 hover:text-purple-300 uppercase tracking-widest transition-colors">
            Open <ArrowRight size={11} />
          </button>
        </div>
      ) : (
        <div className="p-4 bg-white/[0.03] border border-dashed border-white/10 rounded-2xl text-center py-8">
          <p className="text-2xl mb-2">🎨</p>
          <p className="text-sm font-black text-white/40">No boards yet</p>
          <p className="text-xs text-white/25 mt-1">Open Artist Boards to create your first visual planning board</p>
        </div>
      )}

      {/* Template types */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30 mb-4">Board Templates Available</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {boardTypes.map(b => (
            <button key={b.title} onClick={() => navigate('ARTIST_BOARDS')}
              className="flex items-start gap-3 p-3.5 bg-white/[0.03] border border-white/[0.05] rounded-xl hover:border-white/15 hover:bg-white/[0.06] transition-all text-left group">
              <span className="text-xl shrink-0">{b.emoji}</span>
              <div>
                <p className="text-xs font-black text-white">{b.title}</p>
                <p className="text-[10px] text-white/35 leading-tight mt-0.5">{b.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Aria art director */}
      <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
        <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt: 'Act as Aria, my AI Art Director. I need creative direction for my artist visual identity. Ask me about my music genre, aesthetic references, event type, and audience — then give me a complete visual direction: mood, color palette with hex codes, typography pairing, and specific references to look up.' } }))}
          className="flex items-center gap-2 text-amber-400 text-xs font-black uppercase tracking-widest hover:text-amber-300 transition-colors">
          <Sparkles size={11} /> Ask Aria to be your Art Director →
        </button>
      </div>
    </motion.div>
  );
};

// ─── Film: Types & Storage ─────────────────────────────────────────────────────

interface FilmScene {
  id: string; sceneNum: string; setting: 'INT' | 'EXT' | 'INT/EXT';
  location: string; timeOfDay: 'DAY' | 'NIGHT' | 'DUSK' | 'DAWN' | 'CONTINUOUS';
  synopsis: string; characters: string; pages: number;
  status: 'NOT_SHOT' | 'SHOT' | 'PARTIAL' | 'OMIT'; shootDay: number; notes: string; createdAt: number;
}
interface FilmBudgetLine {
  id: string; department: string; lineItem: string;
  estimated: number; actual: number; notes: string; createdAt: number;
}
interface FilmCrewMember {
  id: string; name: string; role: string; department: string;
  email: string; phone: string; status: 'ACTIVE' | 'ON_HOLD' | 'WRAPPED' | 'PENDING';
  rate: string; notes: string; createdAt: number;
}
interface FilmLocation {
  id: string; name: string; type: 'INT' | 'EXT' | 'BOTH';
  address: string; city: string; contactName: string; contactPhone: string;
  permitStatus: 'SCOUTED' | 'PENDING' | 'APPROVED' | 'DENIED' | 'WRAPPED';
  rentalFee: number; notes: string; createdAt: number;
}
interface FilmFestivalSub {
  id: string; festival: string; tier: 'A' | 'B' | 'C' | 'D';
  deadline: number; fee: number;
  status: 'PLANNING' | 'SUBMITTED' | 'OFFICIAL_SELECTION' | 'REJECTED' | 'WINNER' | 'WITHDRAWN';
  category: string; notes: string; createdAt: number;
}

const filmSceneStore    = pmStore<FilmScene>('film_scenes');
const filmBudgetStore   = pmStore<FilmBudgetLine>('film_budget');
const filmCrewStore     = pmStore<FilmCrewMember>('film_crew');
const filmLocationStore = pmStore<FilmLocation>('film_locations');
const filmFestivalStore = pmStore<FilmFestivalSub>('film_festivals');

const FILM_CREW_DEPTS = ['Direction', 'Production', 'Camera', 'Lighting/Grip', 'Sound', 'Art/Design', 'Wardrobe', 'Makeup/Hair', 'VFX', 'Cast', 'Transport', 'Post-Production', 'Other'];

function ensureFilmDemo() {
  if (filmSceneStore.get().length > 0) return;
  filmSceneStore.set([
    { id: uuid(), sceneNum: '1', setting: 'INT', location: "MAYA'S APARTMENT", timeOfDay: 'DAY', synopsis: 'Maya reviews evidence. Unknown caller. She hesitates.', characters: 'MAYA', pages: 1.0, status: 'SHOT', shootDay: 1, notes: 'Practical light only', createdAt: Date.now() },
    { id: uuid(), sceneNum: '2', setting: 'EXT', location: 'DOWNTOWN PARKING GARAGE', timeOfDay: 'NIGHT', synopsis: 'Maya tails the suspect into the building.', characters: 'MAYA, SUSPECT', pages: 1.5, status: 'NOT_SHOT', shootDay: 2, notes: 'Need rooftop camera car', createdAt: Date.now() },
    { id: uuid(), sceneNum: '3', setting: 'INT', location: 'POLICE PRECINCT – BULLPEN', timeOfDay: 'DAY', synopsis: 'Det. Ramos confronts Maya about going off-book.', characters: 'MAYA, DET. RAMOS, SERGEANT', pages: 2.0, status: 'NOT_SHOT', shootDay: 3, notes: 'Day player for Sergeant', createdAt: Date.now() },
    { id: uuid(), sceneNum: '4', setting: 'EXT', location: 'RIVERSIDE PARK', timeOfDay: 'DUSK', synopsis: 'Maya meets CI. Whispered exchange of intel.', characters: 'MAYA, CARLOS (CI)', pages: 1.5, status: 'PARTIAL', shootDay: 2, notes: 'Golden hour — 30 min window only', createdAt: Date.now() },
    { id: uuid(), sceneNum: '5', setting: 'INT', location: 'ABANDONED WAREHOUSE', timeOfDay: 'NIGHT', synopsis: 'Climax. Maya corners suspect. A shot rings out.', characters: 'MAYA, SUSPECT, DET. RAMOS', pages: 3.0, status: 'NOT_SHOT', shootDay: 7, notes: 'Stunt coord required. SFX blank guns.', createdAt: Date.now() },
  ]);
  filmBudgetStore.set([
    { id: uuid(), department: 'Development', lineItem: 'Script Rights', estimated: 5000, actual: 4200, notes: '', createdAt: Date.now() },
    { id: uuid(), department: 'Camera', lineItem: 'ARRI ALEXA Mini LF (7 days)', estimated: 12000, actual: 11000, notes: '', createdAt: Date.now() },
    { id: uuid(), department: 'Camera', lineItem: 'Lens Package – Cooke S4/i', estimated: 4500, actual: 4500, notes: '', createdAt: Date.now() },
    { id: uuid(), department: 'Lighting/Grip', lineItem: 'Lighting Package (7 days)', estimated: 8500, actual: 7800, notes: '', createdAt: Date.now() },
    { id: uuid(), department: 'Sound', lineItem: 'Sound Package (7 days)', estimated: 4000, actual: 4000, notes: '', createdAt: Date.now() },
    { id: uuid(), department: 'Art/Design', lineItem: 'Set Dressing & Props', estimated: 7000, actual: 5200, notes: '', createdAt: Date.now() },
    { id: uuid(), department: 'Post-Production', lineItem: 'Color Grading', estimated: 8000, actual: 0, notes: 'Not started', createdAt: Date.now() },
    { id: uuid(), department: 'Post-Production', lineItem: 'Sound Design & Mix', estimated: 6000, actual: 0, notes: '', createdAt: Date.now() },
    { id: uuid(), department: 'Post-Production', lineItem: 'VFX – 7 shots', estimated: 12000, actual: 3000, notes: 'In progress', createdAt: Date.now() },
    { id: uuid(), department: 'Distribution', lineItem: 'Festival Entry Fees', estimated: 3000, actual: 400, notes: '', createdAt: Date.now() },
    { id: uuid(), department: 'Distribution', lineItem: 'DCP & Deliverables', estimated: 2500, actual: 0, notes: '', createdAt: Date.now() },
  ]);
  filmCrewStore.set([
    { id: uuid(), name: 'Aria Chen', role: 'Director', department: 'Direction', email: 'aria@example.com', phone: '555-0101', status: 'ACTIVE', rate: 'Deferred', notes: 'Also co-wrote script', createdAt: Date.now() },
    { id: uuid(), name: 'Marcus Webb', role: 'Executive Producer', department: 'Production', email: 'marcus@example.com', phone: '555-0102', status: 'ACTIVE', rate: '15% back-end', notes: '', createdAt: Date.now() },
    { id: uuid(), name: 'Sofia Reyes', role: 'Line Producer', department: 'Production', email: 'sofia@example.com', phone: '555-0103', status: 'ACTIVE', rate: '$1,200/day', notes: '', createdAt: Date.now() },
    { id: uuid(), name: 'James Liu', role: 'Director of Photography', department: 'Camera', email: 'jliu@example.com', phone: '555-0104', status: 'ACTIVE', rate: '$1,500/day', notes: '', createdAt: Date.now() },
    { id: uuid(), name: 'Derek Holmes', role: 'Gaffer', department: 'Lighting/Grip', email: 'derek@example.com', phone: '555-0106', status: 'ACTIVE', rate: '$700/day', notes: '', createdAt: Date.now() },
    { id: uuid(), name: 'Amara Diallo', role: 'Production Sound Mixer', department: 'Sound', email: 'amara@example.com', phone: '555-0107', status: 'ACTIVE', rate: '$800/day', notes: '', createdAt: Date.now() },
    { id: uuid(), name: 'Carlos Vega', role: 'Maya (Lead)', department: 'Cast', email: 'carlos@example.com', phone: '555-0201', status: 'ACTIVE', rate: 'SAG scale', notes: 'SAG-AFTRA principal', createdAt: Date.now() },
    { id: uuid(), name: 'Nina Torres', role: 'Det. Ramos', department: 'Cast', email: 'nina@example.com', phone: '555-0202', status: 'ACTIVE', rate: 'SAG scale', notes: '', createdAt: Date.now() },
  ]);
  filmLocationStore.set([
    { id: uuid(), name: "Maya's Apartment", type: 'INT', address: '2312 Woodward Ave', city: 'Detroit, MI', contactName: 'David (owner)', contactPhone: '555-3002', permitStatus: 'APPROVED', rentalFee: 500, notes: 'Private residence — 2 shoot days', createdAt: Date.now() },
    { id: uuid(), name: 'Downtown Parking Garage', type: 'EXT', address: '450 Main St', city: 'Detroit, MI', contactName: 'Building Mgmt', contactPhone: '555-3001', permitStatus: 'APPROVED', rentalFee: 1200, notes: 'Night shoot only — 10PM–5AM', createdAt: Date.now() },
    { id: uuid(), name: 'Police Precinct Stand-In', type: 'INT', address: 'City Hall Annex, 1F', city: 'Detroit, MI', contactName: 'City Film Office', contactPhone: '555-3003', permitStatus: 'PENDING', rentalFee: 800, notes: 'Awaiting city permit', createdAt: Date.now() },
    { id: uuid(), name: 'Abandoned Warehouse', type: 'BOTH', address: '8801 E Jefferson Ave', city: 'Detroit, MI', contactName: 'Leo (owner)', contactPhone: '555-3005', permitStatus: 'SCOUTED', rentalFee: 2000, notes: 'May need structural inspection', createdAt: Date.now() },
  ]);
  filmFestivalStore.set([
    { id: uuid(), festival: 'Sundance Film Festival', tier: 'A', deadline: new Date('2026-09-01').getTime(), fee: 95, status: 'PLANNING', category: 'U.S. Dramatic Competition', notes: '', createdAt: Date.now() },
    { id: uuid(), festival: 'SXSW Film & TV', tier: 'A', deadline: new Date('2025-10-15').getTime(), fee: 75, status: 'PLANNING', category: 'Narrative Feature', notes: '', createdAt: Date.now() },
    { id: uuid(), festival: 'Tribeca Film Festival', tier: 'A', deadline: new Date('2026-01-10').getTime(), fee: 85, status: 'PLANNING', category: 'U.S. Narrative', notes: '', createdAt: Date.now() },
    { id: uuid(), festival: 'AFI Fest', tier: 'B', deadline: new Date('2025-08-15').getTime(), fee: 65, status: 'SUBMITTED', category: 'American Independents', notes: '', createdAt: Date.now() },
    { id: uuid(), festival: 'Detroit Film Theatre', tier: 'C', deadline: new Date('2025-07-01').getTime(), fee: 25, status: 'OFFICIAL_SELECTION', category: 'Local Spotlight', notes: 'Local premiere confirmed!', createdAt: Date.now() },
  ]);
}

// ─── Film Tab: Overview ─────────────────────────────────────────────────────

const FilmOverviewTab: React.FC = () => {
  const { scenes, budgetLines: budget, members: crew, locations, festivals } = useProd();
  const totalEst  = budget.reduce((s, b) => s + b.estimated, 0);
  const totalAct  = budget.reduce((s, b) => s + b.actual, 0);
  const pct       = totalEst > 0 ? Math.min(100, (totalAct / totalEst) * 100) : 0;
  const scenesShot = scenes.filter(s => s.status === 'SHOT').length;
  const shootDays  = scenes.length > 0 ? Math.max(...scenes.map(s => s.shootDay)) : 0;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="p-5 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <div><p className="text-[10px] font-black uppercase tracking-widest text-white/30">Production Budget</p><p className="text-2xl font-black text-white">{fmtCurrency(totalEst)}</p></div>
          <div className="text-right"><p className="text-[10px] font-black uppercase tracking-widest text-white/30">Spent</p><p className={`text-xl font-black ${pct > 80 ? 'text-red-400' : pct > 60 ? 'text-yellow-400' : 'text-emerald-400'}`}>{fmtCurrency(totalAct)}</p></div>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden"><div className={`h-full rounded-full ${pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-yellow-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} /></div>
        <p className="text-[10px] text-white/30 mt-2">{pct.toFixed(1)}% spent · {fmtCurrency(totalEst - totalAct)} remaining</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Film size={16} />} label="Scenes" value={scenes.length} sub={`${scenesShot} shot`} color="#a855f7" />
        <StatCard icon={<Calendar size={16} />} label="Shoot Days" value={shootDays} sub={`${Math.max(...(scenes.filter(s => s.status === 'SHOT').map(s => s.shootDay).concat([0])))} done`} color="#3b82f6" />
        <StatCard icon={<Users size={16} />} label="Crew" value={crew.length} sub={`${crew.filter(c => c.dept === 'CAST').length} cast`} color="#FF8C00" />
        <StatCard icon={<MapPin size={16} />} label="Locations" value={locations.length} sub={`${locations.filter(l => l.permitStatus === 'APPROVED').length} permitted`} color="#ef4444" />
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30 mb-4">Scene Status</p>
        <div className="grid grid-cols-4 gap-3">
          {(['NOT_SHOT', 'SHOT', 'PARTIAL', 'OMIT'] as const).map(st => {
            const cnt = scenes.filter(s => s.status === st).length;
            const style = { NOT_SHOT: 'text-white/60 bg-white/5 border-white/[0.06]', SHOT: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', PARTIAL: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', OMIT: 'text-white/25 bg-white/5 border-white/[0.04]' };
            const lbl   = { NOT_SHOT: 'Not Shot', SHOT: 'Shot', PARTIAL: 'Partial', OMIT: 'Omitted' };
            return <div key={st} className={`p-3 rounded-xl border ${style[st]}`}><p className="text-xl font-black">{cnt}</p><p className="text-[9px] font-black uppercase tracking-widest mt-0.5 opacity-70">{lbl[st]}</p></div>;
          })}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30 mb-3">Festivals Targeted</p>
        <div className="flex flex-wrap gap-2">
          {festivals.map(f => {
            const c = { PLANNING: 'bg-white/5 text-white/40', SUBMITTED: 'bg-blue-500/15 text-blue-400', OFFICIAL_SELECTION: 'bg-emerald-500/15 text-emerald-400', REJECTED: 'bg-red-500/10 text-red-400/60', WINNER: 'bg-amber-500/20 text-amber-400', WITHDRAWN: 'bg-white/5 text-white/20' };
            return <span key={f.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black border border-white/[0.05] ${c[f.status] ?? 'bg-white/5 text-white/40'}`}><Award size={10} />{f.festival}</span>;
          })}
        </div>
      </div>
      <div className="p-4 bg-violet-500/5 border border-violet-500/20 rounded-2xl">
        <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt: `Act as Aria, my AI Executive Producer. Production stats: ${scenes.length} scenes total (${scenesShot} shot), budget ${fmtCurrency(totalEst)} (${pct.toFixed(0)}% spent), ${crew.length} crew, ${festivals.length} festival targets. Give me a complete EP assessment: production health, budget burn rate, festival strategy, and my 3 highest priorities this week.` } }))}
          className="flex items-center gap-2 text-violet-400 text-xs font-black uppercase tracking-widest hover:text-violet-300 transition-colors">
          <Sparkles size={11} /> Ask Aria — Executive Producer Mode →
        </button>
        <p className="text-[10px] text-white/25 mt-1.5">Full production health check, budget analysis, and weekly action plan.</p>
      </div>
    </motion.div>
  );
};

// ─── Film Tab: Script & Breakdown ──────────────────────────────────────────

const REVISION_HEX: Record<string, string> = { WHITE: '#e5e5e5', BLUE: '#60a5fa', PINK: '#f9a8d4', YELLOW: '#fde047', GREEN: '#4ade80', GOLDENROD: '#eab308', BUFF: '#f0d9a8', SALMON: '#fca5a5', CHERRY: '#e11d48', TAN: '#d2b48c', GRAY: '#9ca3af' };

const FilmScriptTab: React.FC = () => {
  const { prod, scenes, me } = useProd();
  const [filter, setFilter] = useState<string>('ALL');
  const [drafts, setDrafts] = useState<Awaited<ReturnType<typeof FilmProduction.fetchScriptDrafts>>>([]);
  useEffect(() => { if (prod?.id && !prod.isShowcase) FilmProduction.fetchScriptDrafts(prod.id).then(setDrafts).catch(() => {}); }, [prod?.id, prod?.currentDraftId]);
  const currentRev = drafts.find(d => d.id === prod?.currentDraftId) || drafts[0];
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ sceneNum: '', setting: 'INT' as FilmScene['setting'], location: '', timeOfDay: 'DAY' as FilmScene['timeOfDay'], synopsis: '', characters: '', pages: '1.0', shootDay: '1', notes: '' });
  const save = () => {
    if (!prod) return;
    FilmProduction.putScene(prod.id, {
      id: uuid(), sceneNum: form.sceneNum, intExt: form.setting, set: form.location,
      dayNight: form.timeOfDay, synopsis: form.synopsis,
      characters: form.characters.split(',').map(x => x.trim().toUpperCase()).filter(Boolean),
      pages: parseFloat(form.pages) || 1, shootDay: parseInt(form.shootDay) || 1,
      status: 'NOT_SHOT', notes: form.notes,
    });
    setAdding(false);
    setForm({ sceneNum: '', setting: 'INT', location: '', timeOfDay: 'DAY', synopsis: '', characters: '', pages: '1.0', shootDay: '1', notes: '' });
  };
  const toggle = (id: string, status: FilmScene['status']) => {
    if (prod) patchSceneWithAction(prod.id, id, { status }, FilmProduction.currentUid() || '', me?.name || prod.title);
  };
  const filtered = filter === 'ALL' ? scenes : scenes.filter(s => s.status === filter);
  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50';
  const statusColors: Record<string, string> = { NOT_SHOT: 'text-white/50 bg-white/5', SHOT: 'text-emerald-400 bg-emerald-500/10', PARTIAL: 'text-yellow-400 bg-yellow-500/10', OMIT: 'text-white/25 bg-white/5' };
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {drafts.length > 0 && (
        <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Shooting Script Revisions</p>
            {currentRev && <span className="flex items-center gap-1.5 text-[10px] font-black text-white/70"><span className="w-3 h-3 rounded-full border border-white/20" style={{ background: REVISION_HEX[currentRev.revisionLabel] || '#888' }} /> {currentRev.revisionLabel} (current)</span>}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {drafts.map(d => <span key={d.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold ${d.id === prod?.currentDraftId ? 'bg-white/10 text-white' : 'bg-white/5 text-white/40'}`}><span className="w-2.5 h-2.5 rounded-full" style={{ background: REVISION_HEX[d.revisionLabel] || '#888' }} /> {d.revisionLabel}</span>)}
          </div>
          <p className="text-[10px] text-white/25 mt-2">Revisions publish from Script Studio's <span className="text-white/40 font-bold">Greenlight</span> action — each advances the colour ladder. Changed scenes carry a <span className="text-amber-400 font-black">*</span> mark; sides print from the locked current revision.</p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {['ALL', 'NOT_SHOT', 'SHOT', 'PARTIAL'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === f ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' : 'bg-white/5 text-white/30 hover:text-white/60'}`}>{f === 'ALL' ? 'All' : f.replace('_', ' ')}</button>
          ))}
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-400 text-xs font-black uppercase tracking-widest hover:bg-violet-500/25 transition-all"><Plus size={12} /> Add Scene</button>
      </div>
      {adding && (
        <div className="p-5 bg-white/[0.03] border border-violet-500/20 rounded-2xl space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-violet-400 mb-4">New Scene</p>
          <div className="grid grid-cols-3 gap-3">
            <input className={inputCls} placeholder="Scene #" value={form.sceneNum} onChange={e => setForm(f => ({ ...f, sceneNum: e.target.value }))} />
            <select className={inputCls} value={form.setting} onChange={e => setForm(f => ({ ...f, setting: e.target.value as any }))}>
              {['INT', 'EXT', 'INT/EXT'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className={inputCls} value={form.timeOfDay} onChange={e => setForm(f => ({ ...f, timeOfDay: e.target.value as any }))}>
              {['DAY', 'NIGHT', 'DUSK', 'DAWN', 'CONTINUOUS'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <input className={inputCls} placeholder="Location name (e.g. MAYA'S APARTMENT)" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
          <input className={inputCls} placeholder="Synopsis" value={form.synopsis} onChange={e => setForm(f => ({ ...f, synopsis: e.target.value }))} />
          <div className="grid grid-cols-3 gap-3">
            <input className={inputCls} placeholder="Characters (comma sep.)" value={form.characters} onChange={e => setForm(f => ({ ...f, characters: e.target.value }))} />
            <input className={inputCls} placeholder="Pages (e.g. 1.5)" type="number" step="0.25" value={form.pages} onChange={e => setForm(f => ({ ...f, pages: e.target.value }))} />
            <input className={inputCls} placeholder="Shoot Day #" type="number" value={form.shootDay} onChange={e => setForm(f => ({ ...f, shootDay: e.target.value }))} />
          </div>
          <div className="flex gap-3">
            <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-violet-500 text-white text-xs font-black uppercase tracking-widest hover:bg-violet-400 transition-all">Add Scene</button>
            <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl bg-white/5 text-white/40 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
          </div>
        </div>
      )}
      {filtered.length === 0 ? (
        <EmptyState icon={<Clapperboard size={22} />} title="No Scenes Yet" body="Add your first scene breakdown entry to start organizing your shooting script." cta="Add Scene" onCta={() => setAdding(true)} />
      ) : (
        <div className="space-y-2">
          {filtered.map(s => (
            <div key={s.id} className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl flex items-start gap-4 hover:border-white/15 transition-all">
              <div className="shrink-0 text-center min-w-[40px]">
                <p className="text-lg font-black text-white">{s.sceneNum}</p>
                <p className="text-[9px] font-black text-white/30 uppercase">{s.intExt}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-white uppercase tracking-wide mb-0.5">
                  {s.changedInRevision && <span title={`${s.isNewInRevision ? 'New' : 'Changed'} in ${s.changedInRevision} revision`} className="text-amber-400 mr-1">{s.isNewInRevision ? '★' : '*'}</span>}
                  {s.set} — {s.dayNight}
                  {s.changedInRevision && <span className="ml-2 inline-flex items-center gap-1 align-middle text-[8px] font-black px-1.5 py-0.5 rounded" style={{ background: `${REVISION_HEX[s.changedInRevision] || '#888'}22`, color: REVISION_HEX[s.changedInRevision] || '#aaa' }}>{s.changedInRevision}</span>}
                </p>
                <p className="text-[11px] text-white/50 leading-relaxed">{s.synopsis}</p>
                {s.characters.length > 0 && <p className="text-[10px] text-violet-400/70 mt-1 font-bold">{s.characters.join(', ')}</p>}
              </div>
              <div className="shrink-0 flex flex-col items-end gap-2">
                <span className="text-[9px] font-black text-white/30">{s.pages}p · Day {s.shootDay}</span>
                <select value={s.status} onChange={e => toggle(s.id, e.target.value as FilmScene['status'])}
                  className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg border-0 cursor-pointer ${statusColors[s.status] ?? 'text-white/40 bg-white/5'}`}>
                  {['NOT_SHOT', 'SHOT', 'PARTIAL', 'OMIT'].map(st => <option key={st} value={st}>{st.replace('_', ' ')}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

// ─── Film Tab: Budget ───────────────────────────────────────────────────────

type BudgetSeg = 'lines' | 'po' | 'petty' | 'time' | 'report';
const PO_STATUSES: FilmProduction.POStatus[] = ['DRAFT', 'ISSUED', 'PARTIAL', 'PAID', 'VOID'];
const poStatusColor: Record<string, string> = { DRAFT: 'text-white/40 bg-white/5', ISSUED: 'text-blue-400 bg-blue-500/10', PARTIAL: 'text-yellow-400 bg-yellow-500/10', PAID: 'text-emerald-400 bg-emerald-500/10', VOID: 'text-red-400 bg-red-500/10' };

const FilmBudgetTab: React.FC = () => {
  const { prod, budgetLines: lines, purchaseOrders, pettyCash, timecards, members, dprs, isOwner, readOnly, can } = useProd();
  const canManage = !readOnly && (isOwner || can('MANAGE_BUDGET'));
  const [seg, setSeg] = useState<BudgetSeg>('lines');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ department: FILM_CREW_DEPTS[0], lineItem: '', estimated: '', actual: '', fringePct: '', notes: '' });
  const [poForm, setPoForm] = useState({ poNumber: '', vendor: '', department: FILM_CREW_DEPTS[0], amount: '', status: 'ISSUED' as FilmProduction.POStatus, date: '' });
  const [pettyForm, setPettyForm] = useState({ date: '', department: FILM_CREW_DEPTS[0], spentByName: '', amount: '', category: '' });
  const [scan, setScan] = useState<ProductionBrainAnswer | null>(null);
  const [scanning, setScanning] = useState(false);
  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50';

  const report = FilmProduction.buildCostReport(lines, purchaseOrders, pettyCash, timecards);
  const totalEst = report.totals.estimated + report.totals.fringe;
  const totalAct = report.totals.actual;
  const totalCommitted = report.totals.committed;
  const pct = totalEst > 0 ? Math.min(100, (totalAct / totalEst) * 100) : 0;
  const depts = [...new Set(lines.map(l => l.department))].sort();

  const saveLine = () => {
    if (!prod || !form.lineItem.trim()) return;
    const n: FilmProduction.ProductionBudgetLine = { id: uuid(), department: form.department, lineItem: form.lineItem.trim(), estimated: parseFloat(form.estimated) || 0, actual: parseFloat(form.actual) || 0, fringePct: parseFloat(form.fringePct) || undefined, notes: form.notes, createdAt: Date.now() };
    FilmProduction.putBudgetLine(prod.id, n);
    setAdding(false); setForm({ department: FILM_CREW_DEPTS[0], lineItem: '', estimated: '', actual: '', fringePct: '', notes: '' });
  };
  const savePo = () => {
    if (!prod || !poForm.vendor.trim()) return;
    const po: FilmProduction.PurchaseOrder = { id: uuid(), poNumber: poForm.poNumber.trim() || `PO-${purchaseOrders.length + 1}`, vendor: poForm.vendor.trim(), department: poForm.department, amount: parseFloat(poForm.amount) || 0, status: poForm.status, date: poForm.date, createdAt: Date.now() };
    FilmProduction.putPurchaseOrder(prod.id, po);
    setAdding(false); setPoForm({ poNumber: '', vendor: '', department: FILM_CREW_DEPTS[0], amount: '', status: 'ISSUED', date: '' });
  };
  const savePetty = () => {
    if (!prod || !pettyForm.category.trim()) return;
    const entry: FilmProduction.PettyCashEntry = { id: uuid(), date: pettyForm.date, department: pettyForm.department, spentByName: pettyForm.spentByName.trim() || undefined, amount: parseFloat(pettyForm.amount) || 0, category: pettyForm.category.trim(), reconciled: false, createdAt: Date.now() };
    FilmProduction.putPettyCash(prod.id, entry);
    setAdding(false); setPettyForm({ date: '', department: FILM_CREW_DEPTS[0], spentByName: '', amount: '', category: '' });
  };
  const seedDay = async (dprId: string) => {
    const dpr = dprs.find(d => d.id === dprId);
    if (prod && dpr) await FilmProduction.seedTimecardsFromDpr(prod.id, dpr, members);
  };
  const runScan = async () => {
    if (!prod) return;
    setScanning(true);
    try { setScan(await askProductionBrain(prod.id, '', 'BUDGET_BENCHMARK')); }
    catch { /* surfaced by empty panel */ }
    finally { setScanning(false); }
  };

  const SEGMENTS: { id: BudgetSeg; label: string }[] = [
    { id: 'lines', label: 'Budget' }, { id: 'po', label: 'Purchase Orders' }, { id: 'petty', label: 'Petty Cash' }, { id: 'time', label: 'Timecards' }, { id: 'report', label: 'Cost Report' },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="p-5 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-widest text-white/30">Total Budget (incl. fringe)</p><p className="text-2xl font-black text-white">{fmtCurrency(totalEst)}</p></div>
          <div className="text-right"><p className="text-[10px] font-black uppercase tracking-widest text-white/30">Committed</p><p className="text-lg font-black text-blue-400">{fmtCurrency(totalCommitted)}</p></div>
          <div className="text-right"><p className="text-[10px] font-black uppercase tracking-widest text-white/30">Actual</p><p className={`text-xl font-black ${pct > 85 ? 'text-red-400' : pct > 65 ? 'text-yellow-400' : 'text-emerald-400'}`}>{fmtCurrency(totalAct)}</p></div>
        </div>
        <div className="h-2.5 bg-white/10 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-yellow-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} /></div>
        <div className="flex justify-between mt-2"><p className="text-[10px] text-white/30">{pct.toFixed(1)}% actualized</p><p className="text-[10px] text-emerald-400">{fmtCurrency(totalEst - totalAct)} remaining</p></div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {SEGMENTS.map(s => <button key={s.id} onClick={() => { setSeg(s.id); setAdding(false); }} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${seg === s.id ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40' : 'bg-white/5 text-white/40 border border-transparent hover:text-white/60'}`}>{s.label}</button>)}
      </div>

      {canManage && seg !== 'time' && seg !== 'report' && (
        <div className="flex justify-end">
          <button onClick={() => setAdding(a => !a)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-400 text-xs font-black uppercase tracking-widest hover:bg-violet-500/25 transition-all"><Plus size={12} /> {adding ? 'Close' : seg === 'lines' ? 'Add Line' : seg === 'po' ? 'Add PO' : 'Add Petty Cash'}</button>
        </div>
      )}

      {/* ── Budget lines ── */}
      {seg === 'lines' && <>
        {adding && canManage && (
          <div className="p-5 bg-white/[0.03] border border-violet-500/20 rounded-2xl space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <select className={inputCls} value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>{FILM_CREW_DEPTS.map(d => <option key={d} value={d}>{d}</option>)}</select>
              <input className={inputCls} placeholder="Line item" value={form.lineItem} onChange={e => setForm(f => ({ ...f, lineItem: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <input className={inputCls} type="number" placeholder="Estimated ($)" value={form.estimated} onChange={e => setForm(f => ({ ...f, estimated: e.target.value }))} />
              <input className={inputCls} type="number" placeholder="Actual ($)" value={form.actual} onChange={e => setForm(f => ({ ...f, actual: e.target.value }))} />
              <input className={inputCls} type="number" placeholder="Fringe %" value={form.fringePct} onChange={e => setForm(f => ({ ...f, fringePct: e.target.value }))} />
            </div>
            <button onClick={saveLine} className="w-full py-2.5 rounded-xl bg-violet-500 text-white text-xs font-black uppercase tracking-widest hover:bg-violet-400 transition-all">Add Line</button>
          </div>
        )}
        <div className="space-y-6">
          {depts.map(dept => {
            const dLines = lines.filter(l => l.department === dept);
            const dEst = dLines.reduce((s, l) => s + l.estimated, 0);
            const dAct = dLines.reduce((s, l) => s + l.actual, 0);
            return (
              <div key={dept}>
                <div className="flex items-center justify-between mb-2"><p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">{dept}</p><div className="flex gap-4 text-[10px] font-black"><span className="text-white/30">Est {fmtCurrency(dEst)}</span><span className={dAct > dEst ? 'text-red-400' : 'text-emerald-400'}>Act {fmtCurrency(dAct)}</span></div></div>
                <div className="space-y-1.5">{dLines.map(l => (
                  <div key={l.id} className="flex items-center gap-4 px-4 py-2.5 bg-white/[0.02] border border-white/[0.04] rounded-xl hover:border-white/10 transition-all">
                    <p className="flex-1 text-xs text-white/70">{l.lineItem}{l.fringePct ? <span className="text-white/25"> · +{l.fringePct}% fringe</span> : null}</p>
                    <p className="text-xs text-white/40 w-24 text-right">{fmtCurrency(l.estimated)}</p>
                    <p className={`text-xs w-24 text-right font-bold ${l.actual > l.estimated ? 'text-red-400' : l.actual === 0 ? 'text-white/20' : 'text-emerald-400'}`}>{l.actual > 0 ? fmtCurrency(l.actual) : '—'}</p>
                    {canManage && <button onClick={() => prod && FilmProduction.removeBudgetLine(prod.id, l.id)} className="text-white/20 hover:text-red-400"><Trash2 size={12} /></button>}
                  </div>))}
                </div>
              </div>
            );
          })}
          {!lines.length && <EmptyState icon={<DollarSign size={22} />} title="No Budget Yet" body="Add line items with estimates, actuals, and fringes. POs, petty cash, and timecards roll up into the cost report." />}
        </div>
      </>}

      {/* ── Purchase Orders ── */}
      {seg === 'po' && <>
        {adding && canManage && (
          <div className="p-5 bg-white/[0.03] border border-violet-500/20 rounded-2xl space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input className={inputCls} placeholder="PO # (auto if blank)" value={poForm.poNumber} onChange={e => setPoForm(f => ({ ...f, poNumber: e.target.value }))} />
              <input className={inputCls} placeholder="Vendor" value={poForm.vendor} onChange={e => setPoForm(f => ({ ...f, vendor: e.target.value }))} />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <select className={inputCls} value={poForm.department} onChange={e => setPoForm(f => ({ ...f, department: e.target.value }))}>{FILM_CREW_DEPTS.map(d => <option key={d} value={d}>{d}</option>)}</select>
              <input className={inputCls} type="number" placeholder="Amount ($)" value={poForm.amount} onChange={e => setPoForm(f => ({ ...f, amount: e.target.value }))} />
              <select className={inputCls} value={poForm.status} onChange={e => setPoForm(f => ({ ...f, status: e.target.value as FilmProduction.POStatus }))}>{PO_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>
              <input className={inputCls} type="date" value={poForm.date} onChange={e => setPoForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <button onClick={savePo} className="w-full py-2.5 rounded-xl bg-violet-500 text-white text-xs font-black uppercase tracking-widest hover:bg-violet-400 transition-all">Issue PO</button>
          </div>
        )}
        {purchaseOrders.length ? <div className="space-y-1.5">{purchaseOrders.map(po => (
          <div key={po.id} className="flex items-center gap-4 px-4 py-2.5 bg-white/[0.02] border border-white/[0.04] rounded-xl">
            <span className="text-[10px] font-black text-white/40 w-20">{po.poNumber}</span>
            <p className="flex-1 text-xs text-white/70 truncate">{po.vendor} <span className="text-white/25">· {po.department}</span></p>
            {canManage ? <select value={po.status} onChange={e => prod && FilmProduction.patchPurchaseOrder(prod.id, po.id, { status: e.target.value as FilmProduction.POStatus })} className={`text-[9px] font-black uppercase rounded-full px-2 py-1 border-0 cursor-pointer ${poStatusColor[po.status]}`}>{PO_STATUSES.map(s => <option key={s} value={s} className="bg-neutral-900 text-white">{s}</option>)}</select> : <span className={`text-[9px] font-black uppercase rounded-full px-2 py-1 ${poStatusColor[po.status]}`}>{po.status}</span>}
            <p className="text-xs font-bold text-white w-24 text-right">{fmtCurrency(po.amount)}</p>
            {canManage && <button onClick={() => prod && FilmProduction.removePurchaseOrder(prod.id, po.id)} className="text-white/20 hover:text-red-400"><Trash2 size={12} /></button>}
          </div>))}</div> : <EmptyState icon={<Receipt size={22} />} title="No Purchase Orders" body="Commit budget to vendors. Committed totals feed the cost report." />}
      </>}

      {/* ── Petty Cash ── */}
      {seg === 'petty' && <>
        {adding && canManage && (
          <div className="p-5 bg-white/[0.03] border border-violet-500/20 rounded-2xl space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <input className={inputCls} type="date" value={pettyForm.date} onChange={e => setPettyForm(f => ({ ...f, date: e.target.value }))} />
              <select className={inputCls} value={pettyForm.department} onChange={e => setPettyForm(f => ({ ...f, department: e.target.value }))}>{FILM_CREW_DEPTS.map(d => <option key={d} value={d}>{d}</option>)}</select>
              <input className={inputCls} type="number" placeholder="Amount ($)" value={pettyForm.amount} onChange={e => setPettyForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input className={inputCls} placeholder="Category (e.g. expendables)" value={pettyForm.category} onChange={e => setPettyForm(f => ({ ...f, category: e.target.value }))} />
              <input className={inputCls} placeholder="Spent by" value={pettyForm.spentByName} onChange={e => setPettyForm(f => ({ ...f, spentByName: e.target.value }))} />
            </div>
            <button onClick={savePetty} className="w-full py-2.5 rounded-xl bg-violet-500 text-white text-xs font-black uppercase tracking-widest hover:bg-violet-400 transition-all">Log Expense</button>
          </div>
        )}
        {pettyCash.length ? <div className="space-y-1.5">{pettyCash.map(p => (
          <div key={p.id} className="flex items-center gap-4 px-4 py-2.5 bg-white/[0.02] border border-white/[0.04] rounded-xl">
            <span className="text-[10px] text-white/30 w-20">{p.date || '—'}</span>
            <p className="flex-1 text-xs text-white/70 truncate">{p.category} <span className="text-white/25">· {p.department}{p.spentByName ? ` · ${p.spentByName}` : ''}</span></p>
            {canManage && <button onClick={() => prod && FilmProduction.patchPettyCash(prod.id, p.id, { reconciled: !p.reconciled })} className={`text-[9px] font-black uppercase rounded-full px-2 py-1 ${p.reconciled ? 'text-emerald-400 bg-emerald-500/10' : 'text-yellow-400 bg-yellow-500/10'}`}>{p.reconciled ? 'Reconciled' : 'Open'}</button>}
            <p className="text-xs font-bold text-white w-24 text-right">{fmtCurrency(p.amount)}</p>
            {canManage && <button onClick={() => prod && FilmProduction.removePettyCash(prod.id, p.id)} className="text-white/20 hover:text-red-400"><Trash2 size={12} /></button>}
          </div>))}</div> : <EmptyState icon={<DollarSign size={22} />} title="No Petty Cash" body="Log field spending with receipts. Totals roll into the department actuals." />}
      </>}

      {/* ── Timecards ── */}
      {seg === 'time' && <>
        {canManage && (
          <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl flex flex-wrap items-center gap-3">
            <p className="text-[11px] text-white/40 flex-1">Auto-seed a day's timecards from a finalized Daily Production Report's actual call/wrap times.</p>
            <select className={`${inputCls} max-w-xs`} defaultValue="" onChange={e => { if (e.target.value) { seedDay(e.target.value); e.target.value = ''; } }}>
              <option value="">Seed from DPR…</option>
              {dprs.map(d => <option key={d.id} value={d.id}>Day {d.shootDay}{d.date ? ` · ${d.date}` : ''}</option>)}
            </select>
          </div>
        )}
        {timecards.length ? <div className="space-y-1.5">{[...timecards].sort((a, b) => a.shootDay - b.shootDay).map(t => (
          <div key={t.id} className="flex items-center gap-4 px-4 py-2.5 bg-white/[0.02] border border-white/[0.04] rounded-xl">
            <span className="text-[10px] font-black text-violet-400 w-12">Day {t.shootDay}</span>
            <p className="flex-1 text-xs text-white/70 truncate">{t.memberName} <span className="text-white/25">· {t.department}</span></p>
            <span className="text-[10px] text-white/40 w-28 text-right">{t.hoursStraight}h {t.hoursOT > 0 ? <span className="text-yellow-400">+{t.hoursOT} OT</span> : null}</span>
            <p className="text-xs font-bold text-white w-24 text-right">{t.ratePreview != null ? fmtCurrency(t.ratePreview) : '—'}</p>
            {canManage && <button onClick={() => prod && FilmProduction.removeTimecard(prod.id, t.id)} className="text-white/20 hover:text-red-400"><Trash2 size={12} /></button>}
          </div>))}</div> : <EmptyState icon={<Clock size={22} />} title="No Timecards" body="Seed a day from its DPR, or add manually. Labor cost rolls into the cost report." />}
      </>}

      {/* ── Cost Report ── */}
      {seg === 'report' && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="grid grid-cols-6 gap-2 px-4 py-2.5 bg-white/[0.03] text-[9px] font-black uppercase tracking-widest text-white/40">
            <span className="col-span-2">Department</span><span className="text-right">Est</span><span className="text-right">Fringe</span><span className="text-right">Committed</span><span className="text-right">Actual</span>
          </div>
          {report.rows.map(r => (
            <div key={r.department} className="grid grid-cols-6 gap-2 px-4 py-2.5 border-t border-white/[0.04] text-xs">
              <span className="col-span-2 text-white/70 truncate">{r.department}</span>
              <span className="text-right text-white/40">{fmtCurrency(r.estimated)}</span>
              <span className="text-right text-white/30">{fmtCurrency(r.fringe)}</span>
              <span className="text-right text-blue-400">{fmtCurrency(r.committed)}</span>
              <span className={`text-right font-bold ${r.actual > r.estimated + r.fringe ? 'text-red-400' : 'text-emerald-400'}`}>{fmtCurrency(r.actual)}</span>
            </div>
          ))}
          <div className="grid grid-cols-6 gap-2 px-4 py-3 border-t-2 border-white/10 text-xs font-black">
            <span className="col-span-2 text-white uppercase tracking-widest">Total</span>
            <span className="text-right text-white/60">{fmtCurrency(report.totals.estimated)}</span>
            <span className="text-right text-white/40">{fmtCurrency(report.totals.fringe)}</span>
            <span className="text-right text-blue-400">{fmtCurrency(report.totals.committed)}</span>
            <span className="text-right text-emerald-400">{fmtCurrency(report.totals.actual)}</span>
          </div>
          {!report.rows.length && <p className="p-8 text-center text-[11px] text-white/30">Add budget lines, POs, petty cash, or timecards to build the cost report.</p>}
        </div>
      )}

      {scan && (
        <div className="p-5 bg-emerald-500/[0.06] border border-emerald-500/20 rounded-2xl space-y-3">
          <div className="flex items-center gap-2"><Zap size={14} className="text-emerald-300" /><p className="text-xs font-black text-emerald-200 uppercase tracking-widest">Production Brain — Budget Benchmark</p></div>
          {scan.answer && <p className="text-[12px] text-white/70 leading-relaxed">{scan.answer}</p>}
          {scan.risks.map((r, i) => <div key={i} className="flex gap-2 border-t border-white/5 pt-2"><AlertCircle size={13} className={r.severity === 'high' ? 'text-red-400 mt-0.5 shrink-0' : 'text-amber-400 mt-0.5 shrink-0'} /><div><p className="text-[11px] font-black text-white">{r.title}</p><p className="text-[10px] text-white/40">{r.detail}</p></div></div>)}
        </div>
      )}

      <div className="p-4 bg-violet-500/5 border border-violet-500/20 rounded-2xl flex flex-wrap gap-4">
        <button onClick={runScan} disabled={scanning || !lines.length} className="flex items-center gap-2 text-emerald-400 text-xs font-black uppercase tracking-widest hover:text-emerald-300 transition-colors disabled:opacity-40"><Zap size={11} /> {scanning ? 'Benchmarking…' : 'Budget Benchmark Scan'}</button>
        <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt: `Act as Aria, my AI Film Budget Supervisor. My production budget is ${fmtCurrency(totalEst)} with ${fmtCurrency(totalAct)} actual and ${fmtCurrency(totalCommitted)} committed. Departments: ${depts.join(', ')}. Where am I overspending? What contingency should I set? Give me 3 cost-saving strategies without compromising quality.` } }))}
          className="flex items-center gap-2 text-violet-400 text-xs font-black uppercase tracking-widest hover:text-violet-300 transition-colors"><Sparkles size={11} /> Ask Aria — Budget Supervisor →</button>
      </div>
    </motion.div>
  );
};

// ─── Film Tab: Crew ─────────────────────────────────────────────────────────

const FilmCrewTab: React.FC = () => {
  const { prod, members } = useProd();
  const crew: FilmCrewMember[] = useMemo(() => members.map(member => ({
    id: member.id, name: member.name, role: member.role,
    department: member.dept === 'CAST' ? 'Cast' : member.dept.replace(/_/g, ' '),
    email: member.email || '', phone: member.phone || '', status: member.status,
    rate: member.rate || '', notes: member.notes || '', createdAt: member.createdAt,
  })), [members]);
  const [adding, setAdding] = useState(false);
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [form, setForm] = useState({ name: '', role: '', department: FILM_CREW_DEPTS[0], email: '', phone: '', status: 'ACTIVE' as FilmCrewMember['status'], rate: '', notes: '' });
  const save = () => {
    const n: FilmCrewMember = { id: uuid(), ...form, createdAt: Date.now() };
    const deptMap: Record<string, FilmProduction.DeptKey> = {
      Direction: 'DIRECTION', Production: 'PRODUCTION', Camera: 'CAMERA', 'Lighting/Grip': 'GRIP_ELECTRIC',
      Sound: 'SOUND', 'Art/Design': 'ART', Wardrobe: 'WARDROBE', 'Makeup/Hair': 'HAIR_MAKEUP',
      VFX: 'STUNTS_SFX', Cast: 'CAST', Transport: 'TRANSPORT', 'Post-Production': 'POST', Other: 'OTHER',
    };
    if (prod) FilmProduction.putMember(prod.id, {
      id: n.id, name: n.name, role: n.role, dept: deptMap[n.department] || 'OTHER',
      email: n.email, phone: n.phone, status: n.status, rate: n.rate, notes: n.notes,
      isCast: n.department === 'Cast', createdAt: n.createdAt,
    });
    setAdding(false);
    setForm({ name: '', role: '', department: FILM_CREW_DEPTS[0], email: '', phone: '', status: 'ACTIVE', rate: '', notes: '' });
  };
  const depts = ['ALL', ...new Set(crew.map(c => c.department))].sort((a, b) => a === 'ALL' ? -1 : b === 'ALL' ? 1 : a.localeCompare(b));
  const visible = deptFilter === 'ALL' ? crew : crew.filter(c => c.department === deptFilter);
  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50';
  const statusColor: Record<string, string> = { ACTIVE: 'text-emerald-400 bg-emerald-500/10', ON_HOLD: 'text-yellow-400 bg-yellow-500/10', WRAPPED: 'text-white/30 bg-white/5', PENDING: 'text-blue-400 bg-blue-500/10' };
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {depts.map(d => (
            <button key={d} onClick={() => setDeptFilter(d)} className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${deptFilter === d ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' : 'bg-white/5 text-white/30 hover:text-white/60'}`}>{d}</button>
          ))}
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-400 text-xs font-black uppercase tracking-widest hover:bg-violet-500/25 transition-all shrink-0"><Plus size={12} /> Add</button>
      </div>
      {adding && (
        <div className="p-5 bg-white/[0.03] border border-violet-500/20 rounded-2xl space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Full Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <input className={inputCls} placeholder="Role / Job Title" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select className={inputCls} value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
              {FILM_CREW_DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className={inputCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}>
              {['ACTIVE', 'PENDING', 'ON_HOLD', 'WRAPPED'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input className={inputCls} placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <input className={inputCls} placeholder="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            <input className={inputCls} placeholder="Rate (e.g. $800/day)" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} />
          </div>
          <div className="flex gap-3">
            <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-violet-500 text-white text-xs font-black uppercase tracking-widest hover:bg-violet-400 transition-all">Add Crew Member</button>
            <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl bg-white/5 text-white/40 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
          </div>
        </div>
      )}
      {visible.length === 0 ? (
        <EmptyState icon={<Users size={22} />} title="No Crew Members" body="Add your director, DP, crew, and cast." cta="Add First" onCta={() => setAdding(true)} />
      ) : (
        <div className="space-y-2">
          {visible.map(c => (
            <div key={c.id} className="flex items-center gap-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:border-white/15 transition-all">
              <div className="w-9 h-9 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0 text-violet-400 font-black text-sm">{c.name[0]}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-white">{c.name}</p>
                <p className="text-[10px] text-white/40">{c.role} · {c.department}</p>
              </div>
              <div className="text-right shrink-0">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${statusColor[c.status] ?? 'text-white/40 bg-white/5'}`}>{c.status.replace('_', ' ')}</span>
                {c.rate && <p className="text-[10px] text-white/30 mt-1">{c.rate}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

// ─── Film Tab: Locations ────────────────────────────────────────────────────

const FilmLocationsTab: React.FC = () => {
  const { prod, locations: locs, me } = useProd();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'INT' as FilmLocation['type'], address: '', city: '', contactName: '', contactPhone: '', permitStatus: 'SCOUTED' as FilmLocation['permitStatus'], rentalFee: '', notes: '' });
  const save = async () => {
    const n: FilmLocation = { id: uuid(), ...form, rentalFee: parseFloat(form.rentalFee) || 0, createdAt: Date.now() };
    if (prod) await putLocationWithAction(prod.id, n, FilmProduction.currentUid() || '', me?.name || prod.title);
    setAdding(false);
    setForm({ name: '', type: 'INT', address: '', city: '', contactName: '', contactPhone: '', permitStatus: 'SCOUTED', rentalFee: '', notes: '' });
  };
  const permitColor: Record<string, string> = { SCOUTED: 'text-blue-400 bg-blue-500/10', PENDING: 'text-yellow-400 bg-yellow-500/10', APPROVED: 'text-emerald-400 bg-emerald-500/10', DENIED: 'text-red-400 bg-red-500/10', WRAPPED: 'text-white/30 bg-white/5' };
  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50';
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex justify-end">
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-400 text-xs font-black uppercase tracking-widest hover:bg-violet-500/25 transition-all"><Plus size={12} /> Add Location</button>
      </div>
      {adding && (
        <div className="p-5 bg-white/[0.03] border border-violet-500/20 rounded-2xl space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input className={inputCls} placeholder="Location Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <select className={inputCls} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}>
              {['INT', 'EXT', 'BOTH'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className={inputCls} value={form.permitStatus} onChange={e => setForm(f => ({ ...f, permitStatus: e.target.value as any }))}>
              {['SCOUTED', 'PENDING', 'APPROVED', 'DENIED', 'WRAPPED'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            <input className={inputCls} placeholder="City, State" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input className={inputCls} placeholder="Contact Name" value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} />
            <input className={inputCls} placeholder="Contact Phone" value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} />
            <input className={inputCls} placeholder="Rental Fee ($)" type="number" value={form.rentalFee} onChange={e => setForm(f => ({ ...f, rentalFee: e.target.value }))} />
          </div>
          <div className="flex gap-3">
            <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-violet-500 text-white text-xs font-black uppercase tracking-widest hover:bg-violet-400 transition-all">Save Location</button>
            <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl bg-white/5 text-white/40 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
          </div>
        </div>
      )}
      {locs.length === 0 ? (
        <EmptyState icon={<MapPin size={22} />} title="No Locations" body="Log your scouted locations, track permits, and manage rental agreements." cta="Add Location" onCta={() => setAdding(true)} />
      ) : (
        <div className="space-y-3">
          {locs.map(l => (
            <div key={l.id} className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:border-white/15 transition-all">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-black text-white/30 bg-white/5 px-2 py-0.5 rounded">{l.type}</span>
                    <p className="text-sm font-black text-white">{l.name}</p>
                  </div>
                  <p className="text-[11px] text-white/40">{l.address}{l.city ? ` · ${l.city}` : ''}</p>
                  {l.contactName && <p className="text-[10px] text-white/30 mt-1">{l.contactName} {l.contactPhone ? `· ${l.contactPhone}` : ''}</p>}
                </div>
                <div className="text-right shrink-0">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${permitColor[l.permitStatus] ?? 'text-white/40 bg-white/5'}`}>{l.permitStatus}</span>
                  {l.rentalFee > 0 && <p className="text-[10px] text-white/30 mt-1">{fmtCurrency(l.rentalFee)}</p>}
                </div>
              </div>
              {l.notes && <p className="text-[10px] text-white/25 mt-2 border-t border-white/5 pt-2">{l.notes}</p>}
            </div>
          ))}
        </div>
      )}
      <div className="p-4 bg-violet-500/5 border border-violet-500/20 rounded-2xl">
        <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt: 'Act as Aria, my AI Location Manager. Search the web for information about film permit requirements in my area, typical location rental rates, and best practices for negotiating with location owners. Then give me a location management checklist for an indie film production.' } }))}
          className="flex items-center gap-2 text-violet-400 text-xs font-black uppercase tracking-widest hover:text-violet-300 transition-colors">
          <Sparkles size={11} /> Ask Aria — Location Manager Mode →
        </button>
      </div>
    </motion.div>
  );
};

// ─── Film Tab: Clearances / Releases / Chain-of-Title ────────────────────────

const CLEARANCE_TYPE_META: { id: FilmProduction.ClearanceType; label: string; link: 'member' | 'location' | 'scene' | 'none' }[] = [
  { id: 'TALENT_RELEASE', label: 'Talent Release', link: 'member' },
  { id: 'MINOR', label: 'Minor / Work Permit', link: 'member' },
  { id: 'LOCATION_RELEASE', label: 'Location Release', link: 'location' },
  { id: 'PERMIT', label: 'Film Permit', link: 'location' },
  { id: 'INSURANCE_COI', label: 'Insurance / COI', link: 'location' },
  { id: 'MUSIC_SYNC', label: 'Music Sync License', link: 'scene' },
  { id: 'CLIP', label: 'Clip / Footage License', link: 'scene' },
  { id: 'CHAIN_OF_TITLE', label: 'Chain of Title', link: 'none' },
  { id: 'OTHER', label: 'Other', link: 'none' },
];
const CLEARANCE_STATUSES: FilmProduction.ClearanceStatus[] = ['NEEDED', 'REQUESTED', 'RECEIVED', 'APPROVED', 'EXPIRED', 'NA'];
const clearanceStatusColor: Record<string, string> = {
  NEEDED: 'text-red-400 bg-red-500/10', REQUESTED: 'text-yellow-400 bg-yellow-500/10',
  RECEIVED: 'text-blue-400 bg-blue-500/10', APPROVED: 'text-emerald-400 bg-emerald-500/10',
  EXPIRED: 'text-red-400 bg-red-500/10', NA: 'text-white/30 bg-white/5',
};

const FilmClearancesTab: React.FC = () => {
  const { prod, clearances, members, locations, scenes, isOwner, readOnly, can } = useProd();
  const canManage = !readOnly && (isOwner || can('MANAGE_LOCATIONS') || can('MANAGE_REPORTS'));
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [form, setForm] = useState({ type: 'TALENT_RELEASE' as FilmProduction.ClearanceType, title: '', status: 'NEEDED' as FilmProduction.ClearanceStatus, memberId: '', locationId: '', sceneId: '', expires: '', notes: '' });
  const [scan, setScan] = useState<ProductionBrainAnswer | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState('');
  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50';

  const meta = CLEARANCE_TYPE_META.find(m => m.id === form.type)!;
  const openCount = clearances.filter(c => !FilmProduction.isClearanceCleared(c)).length;
  const linkedLabel = (c: FilmProduction.ProductionClearance) =>
    c.memberId ? members.find(m => m.id === c.memberId)?.name :
    c.locationId ? locations.find(l => l.id === c.locationId)?.name :
    c.sceneId ? `Scene ${scenes.find(s => s.id === c.sceneId)?.sceneNum || '?'}` : '';

  const save = async () => {
    if (!prod || !form.title.trim()) return;
    setBusy(true);
    try {
      let docUrl: string | undefined, docAssetId: string | undefined, docName: string | undefined;
      if (pendingFile) {
        const asset = await addHqAsset({ kind: 'user', id: prod.ownerUid }, pendingFile, 'Clearances');
        docUrl = asset.url; docAssetId = asset.id; docName = pendingFile.name;
      }
      const clearance: FilmProduction.ProductionClearance = {
        id: uuid(), type: form.type, title: form.title.trim(), status: form.status,
        memberId: meta.link === 'member' && form.memberId ? form.memberId : undefined,
        locationId: meta.link === 'location' && form.locationId ? form.locationId : undefined,
        sceneId: meta.link === 'scene' && form.sceneId ? form.sceneId : undefined,
        docUrl, docAssetId, docName,
        expiresAt: form.expires ? Date.parse(form.expires) : undefined,
        notes: form.notes.trim() || undefined,
        createdAt: Date.now(),
      };
      await FilmProduction.putClearanceWithEvent(prod.id, clearance, FilmProduction.currentUid() || '', `${meta.label} logged: ${clearance.title}`);
      setAdding(false); setPendingFile(null);
      setForm({ type: 'TALENT_RELEASE', title: '', status: 'NEEDED', memberId: '', locationId: '', sceneId: '', expires: '', notes: '' });
    } finally { setBusy(false); }
  };
  const setStatus = (c: FilmProduction.ProductionClearance, status: FilmProduction.ClearanceStatus) => { if (prod) FilmProduction.patchClearance(prod.id, c.id, { status }); };
  const del = (c: FilmProduction.ProductionClearance) => { if (prod) FilmProduction.removeClearance(prod.id, c.id); };
  const runScan = async () => {
    if (!prod) return;
    setScanning(true); setScanErr('');
    try { setScan(await askProductionBrain(prod.id, '', 'CLEARANCE_SCAN')); }
    catch (e) { setScanErr(e instanceof Error ? e.message : 'Scan failed.'); }
    finally { setScanning(false); }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-white/40">{clearances.length} clearance{clearances.length !== 1 ? 's' : ''} · <span className={openCount ? 'text-amber-400 font-black' : 'text-emerald-400'}>{openCount} open</span>. Documents are stored privately in Content HQ.</p>
        <div className="flex gap-2">
          <button onClick={runScan} disabled={scanning || !clearances.length} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-black uppercase tracking-widest hover:bg-amber-500/25 transition-all disabled:opacity-40"><Sparkles size={12} /> {scanning ? 'Scanning…' : 'Legal Readiness Scan'}</button>
          {canManage && <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-400 text-xs font-black uppercase tracking-widest hover:bg-violet-500/25 transition-all"><Plus size={12} /> Add Clearance</button>}
        </div>
      </div>

      {scanErr && <p className="text-[11px] text-red-400">{scanErr}</p>}
      {scan && (
        <div className="p-5 bg-amber-500/[0.06] border border-amber-500/20 rounded-2xl space-y-3">
          <div className="flex items-center gap-2"><Shield size={14} className="text-amber-300" /><p className="text-xs font-black text-amber-200 uppercase tracking-widest">Production Brain — Legal Readiness</p></div>
          {scan.answer && <p className="text-[12px] text-white/70 leading-relaxed">{scan.answer}</p>}
          {scan.risks.map((r, i) => (
            <div key={i} className="flex gap-2 border-t border-white/5 pt-2">
              <AlertCircle size={13} className={r.severity === 'high' ? 'text-red-400 mt-0.5 shrink-0' : r.severity === 'medium' ? 'text-amber-400 mt-0.5 shrink-0' : 'text-white/40 mt-0.5 shrink-0'} />
              <div><p className="text-[11px] font-black text-white">{r.title}</p><p className="text-[10px] text-white/40">{r.detail}</p></div>
            </div>
          ))}
          {!scan.risks.length && <p className="text-[11px] text-emerald-300">No clearance risks flagged.</p>}
        </div>
      )}

      {adding && canManage && (
        <div className="p-5 bg-white/[0.03] border border-violet-500/20 rounded-2xl space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <select className={inputCls} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as FilmProduction.ClearanceType }))}>
              {CLEARANCE_TYPE_META.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <input className={inputCls} placeholder="Title (e.g. Warehouse location release)" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <select className={inputCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as FilmProduction.ClearanceStatus }))}>
              {CLEARANCE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {meta.link === 'member' && (
              <select className={inputCls} value={form.memberId} onChange={e => setForm(f => ({ ...f, memberId: e.target.value }))}>
                <option value="">Link a cast / crew member…</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name} — {m.character || m.role}</option>)}
              </select>
            )}
            {meta.link === 'location' && (
              <select className={inputCls} value={form.locationId} onChange={e => setForm(f => ({ ...f, locationId: e.target.value }))}>
                <option value="">Link a location…</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
            {meta.link === 'scene' && (
              <select className={inputCls} value={form.sceneId} onChange={e => setForm(f => ({ ...f, sceneId: e.target.value }))}>
                <option value="">Link a scene…</option>
                {scenes.map(s => <option key={s.id} value={s.id}>Scene {s.sceneNum} — {s.set}</option>)}
              </select>
            )}
            <input className={inputCls} type="date" title="Expires" value={form.expires} onChange={e => setForm(f => ({ ...f, expires: e.target.value }))} />
          </div>
          <input className={inputCls} placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 text-[11px] font-bold cursor-pointer hover:bg-white/10 transition-all">
              <FileText size={12} /> {pendingFile ? pendingFile.name.slice(0, 28) : 'Attach document (private)'}
              <input type="file" accept=".pdf,.doc,.docx,.txt,image/*" className="sr-only" onChange={e => setPendingFile(e.target.files?.[0] || null)} />
            </label>
          </div>
          <div className="flex gap-3">
            <button onClick={save} disabled={busy || !form.title.trim()} className="flex-1 py-2.5 rounded-xl bg-violet-500 text-white text-xs font-black uppercase tracking-widest hover:bg-violet-400 transition-all disabled:opacity-40">{busy ? 'Saving…' : 'Save Clearance'}</button>
            <button onClick={() => { setAdding(false); setPendingFile(null); }} className="px-5 py-2.5 rounded-xl bg-white/5 text-white/40 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
          </div>
        </div>
      )}

      {clearances.length === 0 ? (
        <EmptyState icon={<Shield size={22} />} title="No Clearances Yet" body="Track releases, permits, insurance, music/clip licenses, and chain-of-title. Scheduling a scene whose clearances aren't in hand flags a conflict on the stripboard." cta={canManage ? 'Add Clearance' : undefined} onCta={canManage ? () => setAdding(true) : undefined} />
      ) : (
        <div className="space-y-3">
          {clearances.map(c => {
            const expired = c.expiresAt != null && c.expiresAt < Date.now();
            const cleared = FilmProduction.isClearanceCleared(c) && !expired;
            return (
              <div key={c.id} className={`p-4 bg-white/[0.03] border rounded-xl transition-all ${cleared ? 'border-white/[0.06]' : 'border-amber-500/25'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[9px] font-black text-white/30 bg-white/5 px-2 py-0.5 rounded">{CLEARANCE_TYPE_META.find(t => t.id === c.type)?.label || c.type}</span>
                      <p className="text-sm font-black text-white truncate">{c.title}</p>
                    </div>
                    {linkedLabel(c) && <p className="text-[11px] text-white/40">{linkedLabel(c)}</p>}
                    {c.docName && <p className="text-[10px] text-white/30 mt-1 flex items-center gap-1"><FileText size={10} /> {c.docName} · private</p>}
                    {c.expiresAt != null && <p className={`text-[10px] mt-1 ${expired ? 'text-red-400 font-black' : 'text-white/30'}`}>{expired ? 'Expired' : 'Expires'} {new Date(c.expiresAt).toLocaleDateString()}</p>}
                    {c.notes && <p className="text-[10px] text-white/25 mt-1">{c.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canManage ? (
                      <select value={c.status} onChange={e => setStatus(c, e.target.value as FilmProduction.ClearanceStatus)} className={`text-[9px] font-black uppercase rounded-full px-2 py-1 border-0 focus:outline-none cursor-pointer ${clearanceStatusColor[expired ? 'EXPIRED' : c.status] ?? 'text-white/40 bg-white/5'}`}>
                        {CLEARANCE_STATUSES.map(s => <option key={s} value={s} className="bg-neutral-900 text-white">{s}</option>)}
                      </select>
                    ) : (
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${clearanceStatusColor[expired ? 'EXPIRED' : c.status] ?? 'text-white/40 bg-white/5'}`}>{expired ? 'EXPIRED' : c.status}</span>
                    )}
                    {canManage && <button onClick={() => del(c)} className="text-white/20 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="p-4 bg-violet-500/5 border border-violet-500/20 rounded-2xl">
        <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt: 'Act as Aria, my production legal coordinator. Based on my production, give me a complete clearances checklist for an indie film: talent releases, minor work permits, location agreements, film permits, insurance/COI, music sync and clip licenses, and chain-of-title. Explain which are non-negotiable before distribution and common mistakes indie productions make.' } }))}
          className="flex items-center gap-2 text-violet-400 text-xs font-black uppercase tracking-widest hover:text-violet-300 transition-colors">
          <Sparkles size={11} /> Ask Aria — Clearances Checklist →
        </button>
      </div>
    </motion.div>
  );
};

// ─── Film Tab: Live Edit (Set-to-Cut) ───────────────────────────────────────

const TAKE_STATUSES: FilmProduction.TakeStatus[] = ['GOOD', 'SELECT', 'HOLD', 'NG'];
const takeStatusColor: Record<string, string> = {
  GOOD: 'text-white/50 bg-white/5', SELECT: 'text-emerald-400 bg-emerald-500/10',
  HOLD: 'text-yellow-400 bg-yellow-500/10', NG: 'text-red-400 bg-red-500/10',
};
const readVideoDuration = (file: File): Promise<number> => new Promise(resolve => {
  try {
    const v = document.createElement('video'); v.preload = 'metadata';
    v.onloadedmetadata = () => { const d = v.duration; URL.revokeObjectURL(v.src); resolve(Number.isFinite(d) && d > 0 ? d : 5); };
    v.onerror = () => resolve(5);
    v.src = URL.createObjectURL(file);
  } catch { resolve(5); }
});

// ─── Film Tab: Continuity Eye (still-vs-still CV check) ──────────────────────

const CONTINUITY_PROP_CATS = ['PROPS', 'SET_DRESSING', 'WARDROBE', 'MAKEUP_HAIR', 'VEHICLES'];

const CaptureSlot: React.FC<{ label: string; hint: string; src: { url: string } | null; busy: boolean; canEdit: boolean; onFile: (f: File) => void; onCamera: () => void }> = ({ label, hint, src, busy, canEdit, onFile, onCamera }) => (
  <div className="flex-1 min-w-0">
    <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">{label}</p>
    <div className="relative aspect-video rounded-xl overflow-hidden border border-white/10 bg-black grid place-items-center">
      {src ? <img src={src.url} alt={label} className="w-full h-full object-contain" /> : <span className="text-[11px] text-white/25">{hint}</span>}
    </div>
    {canEdit && (
      <div className="flex gap-2 mt-2">
        <label className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-white/10 transition-all">
          <Download size={11} className="rotate-180" /> Upload<input type="file" accept="image/*" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ''; }} />
        </label>
        <button onClick={onCamera} disabled={busy} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-[10px] font-black uppercase tracking-widest hover:bg-cyan-500/20 transition-all disabled:opacity-40"><Camera size={11} /> {busy ? '…' : 'Camera'}</button>
      </div>
    )}
  </div>
);

const FilmContinuityTab: React.FC = () => {
  const { prod, scenes, continuityChecks, me, isOwner, readOnly, can } = useProd();
  const canManage = !readOnly && (isOwner || can('MANAGE_REPORTS') || can('EDIT_SCRIPT_BREAKDOWN'));
  const [sceneId, setSceneId] = useState('');
  const [ref, setRef] = useState<{ blob: Blob; url: string } | null>(null);
  const [cur, setCur] = useState<{ blob: Blob; url: string } | null>(null);
  const [result, setResult] = useState<ContinuityResult | null>(null);
  const [busy, setBusy] = useState<'' | 'compare' | 'ref' | 'cur' | 'save'>('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [breakdown, setBreakdown] = useState<BreakdownElement[]>([]);

  useEffect(() => { if (!sceneId && scenes[0]) setSceneId(scenes[0].id); }, [scenes, sceneId]);
  useEffect(() => { if (prod && !prod.isShowcase) return subscribeBreakdownElements(prod.id, setBreakdown); }, [prod?.id, prod?.isShowcase]);

  const scene = scenes.find(s => s.id === sceneId) || null;
  const sceneChecks = continuityChecks.filter(c => c.sceneId === sceneId).sort((a, b) => b.createdAt - a.createdAt);
  const sceneProps = breakdown.filter(el => el.occurrences?.some(o => o.sceneId === sceneId) && CONTINUITY_PROP_CATS.includes(el.category));

  const setSlot = (slot: 'ref' | 'cur', v: { blob: Blob; url: string } | null) => { (slot === 'ref' ? setRef : setCur)(v); setResult(null); };
  const pickFile = (slot: 'ref' | 'cur', file: File) => setSlot(slot, { blob: file, url: URL.createObjectURL(file) });
  const captureCam = async (slot: 'ref' | 'cur') => {
    setBusy(slot); setMessage('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      const blob = await grabFrame(stream);
      stream.getTracks().forEach(t => t.stop());
      setSlot(slot, { blob, url: URL.createObjectURL(blob) });
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Camera unavailable — check permissions.'); }
    finally { setBusy(''); }
  };
  const compare = async () => {
    if (!ref || !cur) return;
    setBusy('compare'); setMessage('');
    try { setResult(await compareFrames(ref.blob, cur.blob)); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Comparison failed.'); }
    finally { setBusy(''); }
  };
  const save = async () => {
    if (!prod || !scene || !result) return;
    setBusy('save');
    try {
      await FilmProduction.putContinuityCheck(prod.id, {
        id: uuid(), sceneId: scene.id, sceneNum: scene.sceneNum, label: note.trim() || `Sc ${scene.sceneNum} check`,
        score: result.score, propsScore: result.propsScore, lightingScore: result.lightingScore,
        lumaDelta: result.lumaDelta, colorTempNote: result.colorTempNote, flagCount: result.flags.length,
        note: note.trim() || undefined, byMemberId: me?.id, byName: me?.name, createdAt: Date.now(),
      });
      setMessage('Continuity check saved to the scene.'); setNote('');
    } finally { setBusy(''); }
  };
  const scoreColor = (s: number) => s >= 80 ? 'text-emerald-400' : s >= 60 ? 'text-yellow-400' : 'text-red-400';
  const barColor = (s: number) => s >= 80 ? 'bg-emerald-500' : s >= 60 ? 'bg-yellow-500' : 'bg-red-500';

  if (!scenes.length) return <div className="py-16"><EmptyState icon={<Eye size={22} />} title="No scenes yet" body="Greenlight a script or add scenes — continuity checks attach to a scene." /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-black text-white">Continuity Eye</p>
          <p className="text-[11px] text-white/40">Capture a reference frame, then compare after a reset. On-device — frames never leave this device.</p>
        </div>
        <select value={sceneId} onChange={e => { setSceneId(e.target.value); setRef(null); setCur(null); setResult(null); }} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500/50">
          {scenes.map(s => <option key={s.id} value={s.id}>Scene {s.sceneNum} · {s.set}</option>)}
        </select>
      </div>

      {sceneProps.length > 0 && (
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5">Should be here (from breakdown)</p>
          <div className="flex flex-wrap gap-1.5">{sceneProps.map(el => <span key={el.id} className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">{el.name}</span>)}</div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4">
        <CaptureSlot label="Reference · printed take" hint="Upload or capture the correct frame" src={ref} busy={busy === 'ref'} canEdit={canManage} onFile={f => pickFile('ref', f)} onCamera={() => captureCam('ref')} />
        <CaptureSlot label="Current · after reset" hint="Upload or capture the current setup" src={cur} busy={busy === 'cur'} canEdit={canManage} onFile={f => pickFile('cur', f)} onCamera={() => captureCam('cur')} />
      </div>

      <button onClick={compare} disabled={!ref || !cur || busy === 'compare'} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-500 text-black text-sm font-black uppercase tracking-widest hover:bg-cyan-400 transition-all disabled:opacity-40"><Eye size={15} /> {busy === 'compare' ? 'Comparing…' : 'Compare'}</button>
      {message && <p className="text-[11px] text-cyan-200">{message}</p>}

      {result && cur && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-[1fr_auto] gap-4 items-start">
            <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black">
              <img src={cur.url} alt="current" className="w-full block" />
              {result.flags.filter(f => f.kind === 'CHANGE').map((f, i) => (
                <div key={i} className="absolute border-2 border-dashed rounded" style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%`, borderColor: f.severity === 'break' ? '#ff5a6a' : '#f5b544' }}>
                  <span className="absolute -top-4 left-0 whitespace-nowrap text-[8px] font-black font-mono px-1 rounded" style={{ background: f.severity === 'break' ? '#ff5a6a' : '#f5b544', color: '#000' }}>{f.label}</span>
                </div>
              ))}
              {result.flags.filter(f => f.kind === 'LIGHT').map((f, i) => (
                <span key={i} className="absolute top-2 right-2 text-[9px] font-black font-mono px-2 py-1 rounded bg-amber-400/90 text-black">{f.label}</span>
              ))}
            </div>
            <div className="w-full md:w-48 space-y-3">
              <div className="text-center p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <p className={`text-4xl font-black tabular-nums ${scoreColor(result.score)}`}>{result.score}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mt-1">{result.score >= 80 ? 'Match' : result.score >= 60 ? 'Review' : 'Break'}</p>
              </div>
              {[['Props / set', result.propsScore], ['Lighting', result.lightingScore]].map(([label, val]) => (
                <div key={label as string}>
                  <div className="flex justify-between text-[10px] mb-1"><span className="text-white/40 font-bold">{label}</span><span className={`font-black tabular-nums ${scoreColor(val as number)}`}>{val}</span></div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden"><div className={`h-full ${barColor(val as number)}`} style={{ width: `${val}%` }} /></div>
                </div>
              ))}
              <p className="text-[10px] font-mono text-white/40 text-center">{result.colorTempNote} · {result.lumaDelta > 0 ? '+' : ''}{result.lumaDelta} luma</p>
            </div>
          </div>

          {canManage && (
            <div className="flex gap-2">
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Label / note (e.g. Take 5 reset)" className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-cyan-500/50" />
              <button onClick={save} disabled={busy === 'save'} className="px-4 py-2 rounded-xl bg-white/5 border border-cyan-500/30 text-cyan-300 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-40">{busy === 'save' ? 'Saving…' : 'Save check'}</button>
            </div>
          )}
          <p className="text-[10px] text-white/25">Advisory only — the Script Supervisor decides. Naming a flag to a specific prop is the next step (object memory).</p>
        </div>
      )}

      {sceneChecks.length > 0 && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Checks · Scene {scene?.sceneNum}</p>
          <div className="space-y-1.5">
            {sceneChecks.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <span className={`text-sm font-black tabular-nums w-8 ${scoreColor(c.score)}`}>{c.score}</span>
                <span className="flex-1 text-[11px] text-white/50 truncate">{c.label || 'Check'} · {c.flagCount} flag{c.flagCount === 1 ? '' : 's'} · {c.colorTempNote}</span>
                <span className="text-[10px] text-white/25">{new Date(c.createdAt).toLocaleDateString()}</span>
                {canManage && <button onClick={() => prod && FilmProduction.removeContinuityCheck(prod.id, c.id)} className="text-white/20 hover:text-red-400"><Trash2 size={12} /></button>}
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};

const TakeRecorderModal: React.FC<{ sceneNum: string; nextTake: number; onFile: (f: File) => void; onClose: () => void }> = ({ sceneNum, nextTake, onFile, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handleRef = useRef<TakeRecorderHandle | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let alive = true;
    startTakeRecorder().then(h => {
      if (!alive) { h.cancel(); return; }
      handleRef.current = h;
      if (videoRef.current) { videoRef.current.srcObject = h.stream; videoRef.current.muted = true; videoRef.current.play().catch(() => {}); }
    }).catch(e => setErr(e instanceof Error ? e.message : 'Camera unavailable — check permissions.'));
    const t = window.setInterval(() => setElapsed(e => e + 1), 1000);
    return () => { alive = false; window.clearInterval(t); handleRef.current?.cancel(); };
  }, []);
  const stop = async () => {
    const h = handleRef.current;
    if (!h) { onClose(); return; }
    setSaving(true);
    try { const rec = await h.stop(); onFile(recordingToFile(rec, sceneNum, nextTake)); } finally { onClose(); }
  };
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return (
    <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0e0d13] border border-white/10 rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-widest text-white">Record · Sc {sceneNum} · Take {nextTake}</p>
          <span className="flex items-center gap-1.5 text-[11px] font-black text-red-400 tabular-nums"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> {fmt(elapsed)}</span>
        </div>
        <div className="relative bg-black aspect-video">
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          {err && <div className="absolute inset-0 grid place-items-center text-center p-6"><p className="text-sm text-red-300">{err}</p></div>}
        </div>
        <div className="p-4 flex gap-3">
          <button onClick={onClose} className="px-4 py-3 rounded-xl bg-white/5 text-white/50 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
          <button onClick={stop} disabled={!!err || saving} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500 text-white text-sm font-black uppercase tracking-widest hover:bg-red-400 transition-all disabled:opacity-40"><Square size={14} /> {saving ? 'Saving…' : 'Stop & save take'}</button>
        </div>
      </div>
    </div>
  );
};

const FilmEditTab: React.FC = () => {
  const { prod, scenes, takes, members, me, isOwner, readOnly, can } = useProd();
  const canManage = !readOnly && (isOwner || can('MANAGE_REPORTS') || can('EDIT_SCRIPT_BREAKDOWN'));
  const [busyScene, setBusyScene] = useState<string | null>(null);
  const [assembling, setAssembling] = useState(false);
  const [scoring, setScoring] = useState<{ done: number; total: number } | null>(null);
  const [recordScene, setRecordScene] = useState<FilmProduction.ProductionScene | null>(null);
  const [message, setMessage] = useState('');
  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white';

  const ordered = [...scenes].sort((a, b) => (a.shootDay - b.shootDay) || (a.order ?? 0) - (b.order ?? 0) || a.sceneNum.localeCompare(b.sceneNum, undefined, { numeric: true }));
  const takesByScene = (sceneId: string) => takes.filter(t => t.sceneId === sceneId).sort((a, b) => a.takeNumber - b.takeNumber);
  const scenesCovered = ordered.filter(s => takes.some(t => t.sceneId === s.id && (t.proxyUrl || t.proxyAssetId))).length;
  const selectFor = (sceneId: string) => {
    const c = takes.filter(t => t.sceneId === sceneId && t.status !== 'NG' && (t.proxyUrl || t.proxyAssetId));
    return c.find(t => t.circled) || [...c].sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.takeNumber - b.takeNumber)[0];
  };

  const addTake = async (scene: FilmProduction.ProductionScene, file?: File | null) => {
    if (!prod || !file) return;
    setBusyScene(scene.id); setMessage('');
    try {
      const id = uuid();
      const uid = FilmProduction.currentUid() || 'anon';
      const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
      const [proxyUrl, duration] = await Promise.all([
        uploadFile(`users/${uid}/productions/${prod.id}/takes/${id}.${ext}`, file),
        readVideoDuration(file),
      ]);
      const existing = takesByScene(scene.id);
      const takeNumber = Math.max(0, ...existing.map(t => t.takeNumber)) + 1;
      await FilmProduction.putTake(prod.id, {
        id, sceneId: scene.id, sceneNum: scene.sceneNum, takeNumber,
        proxyUrl, duration, status: 'GOOD', byMemberId: me?.id, byName: me?.name, createdAt: Date.now(),
      });
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Proxy upload failed.'); }
    finally { setBusyScene(null); }
  };
  const toggleCircle = (t: FilmProduction.ProductionTake) => { if (prod) FilmProduction.patchTake(prod.id, t.id, { circled: !t.circled }); };
  const setStatus = (t: FilmProduction.ProductionTake, status: FilmProduction.TakeStatus) => { if (prod) FilmProduction.patchTake(prod.id, t.id, { status }); };
  const del = (t: FilmProduction.ProductionTake) => { if (prod) FilmProduction.removeTake(prod.id, t.id); };

  const castNames = members.filter(m => m.isCast || m.dept === 'CAST').map(m => m.character || m.name).filter(Boolean);
  const gaps = coverageGaps(scenes, takes);
  const scoreAll = async () => {
    if (!prod) return;
    if (!prod.currentDraftId) { setMessage('Greenlight a script first — scoring matches each take against the scripted dialogue.'); return; }
    const targets = takes.filter(t => t.proxyUrl || t.proxyAssetId);
    if (!targets.length) { setMessage('Add takes with proxies first.'); return; }
    setScoring({ done: 0, total: targets.length }); setMessage('');
    try {
      const elements = await FilmProduction.fetchDraftElements(prod.id, prod.currentDraftId);
      let done = 0;
      for (const t of targets) {
        const scene = scenes.find(s => s.id === t.sceneId);
        if (scene) {
          try {
            const r = await transcribeAndScoreTake(t, scene, elements, castNames);
            if (r) await FilmProduction.patchTake(prod.id, t.id, { transcript: r.transcript, matchScore: r.matchScore ?? undefined });
          } catch (e) { setMessage(e instanceof Error ? e.message : 'A take failed to score.'); }
        }
        done += 1; setScoring({ done, total: targets.length });
      }
      setMessage(`Scored ${done} take${done === 1 ? '' : 's'} against the script — the % is how much scripted dialogue each reading contains.`);
    } finally { setScoring(null); }
  };
  const bestReading = (sceneId: string) => {
    if (!prod) return;
    const scored = takes.filter(t => t.sceneId === sceneId && typeof t.matchScore === 'number' && t.status !== 'NG');
    if (!scored.length) return;
    const best = [...scored].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))[0];
    takes.filter(t => t.sceneId === sceneId && t.circled && t.id !== best.id).forEach(t => FilmProduction.patchTake(prod.id, t.id, { circled: false }));
    FilmProduction.patchTake(prod.id, best.id, { circled: true });
  };

  const assemble = async () => {
    if (!prod) return;
    setAssembling(true); setMessage('');
    try {
      const r = await buildFabulaProjectFromTakes(prod, scenes, takes);
      setMessage(r ? `Assembled ${r.clipCount} scene${r.clipCount === 1 ? '' : 's'} from ${r.takeCount} takes — opening Fabula…` : 'Add at least one take with a proxy first.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Assembly failed.'); }
    finally { setAssembling(false); }
  };

  const shotTakes = takes.filter(t => t.proxyUrl || t.proxyAssetId);
  const circledCount = takes.filter(t => t.circled).length;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="p-5 bg-gradient-to-br from-cyan-500/[0.08] to-white/[0.02] border border-cyan-500/20 rounded-2xl">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300/80">Set to Cut · Live Edit</p>
            <p className="text-sm text-white/60 mt-1 max-w-lg">Log takes as you shoot — circle the keepers — then assemble a rough cut straight into Fabula: a bin per scene, selects laid in order.</p>
            <p className="text-[11px] text-white/40 mt-2 font-mono">{scenesCovered}/{ordered.length} scenes covered · {shotTakes.length} takes · {circledCount} circled</p>
          </div>
          <div className="flex gap-2">
            {canManage && (
              <button onClick={scoreAll} disabled={!!scoring || !shotTakes.length} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-cyan-500/30 text-cyan-300 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-40">
                <Sparkles size={13} /> {scoring ? `Scoring ${scoring.done}/${scoring.total}` : 'Score takes'}
              </button>
            )}
            <button onClick={assemble} disabled={assembling || !shotTakes.length} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 text-black text-xs font-black uppercase tracking-widest hover:bg-cyan-400 transition-all disabled:opacity-40">
              <Scissors size={13} /> {assembling ? 'Assembling…' : 'Assemble in Fabula'}
            </button>
          </div>
        </div>
        {message && <p className="text-[11px] text-cyan-200 mt-3">{message}</p>}
        {gaps.length > 0 && (
          <div className="mt-3 flex items-start gap-2 text-[11px] text-yellow-300/90">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span><b className="text-yellow-300">{gaps.length} scene{gaps.length === 1 ? '' : 's'} with no coverage:</b> {gaps.slice(0, 10).map(s => s.sceneNum).join(', ')}{gaps.length > 10 ? '…' : ''} — resolve before the company moves.</span>
          </div>
        )}
        <p className="text-[10px] text-white/25 mt-2">Capture sources: <b className="text-white/50">This device · Manual upload</b> — {pendingCameraTiers().map(t => t.label).join(' · ')} on the desktop / native build.</p>
      </div>
      {recordScene && <TakeRecorderModal sceneNum={recordScene.sceneNum} nextTake={Math.max(0, ...takesByScene(recordScene.id).map(t => t.takeNumber)) + 1} onFile={f => addTake(recordScene, f)} onClose={() => setRecordScene(null)} />}

      {ordered.length === 0 ? (
        <EmptyState icon={<Film size={22} />} title="No scenes yet" body="Greenlight a script or add scenes first — takes attach to scenes, and the assembly reads them in scene order." />
      ) : (
        <div className="space-y-2.5">
          {ordered.map(scene => {
            const st = takesByScene(scene.id);
            const sel = selectFor(scene.id);
            return (
              <div key={scene.id} className="p-3.5 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-black text-white shrink-0">{scene.sceneNum}</span>
                    <span className="text-[9px] font-black text-white/30 uppercase shrink-0">{scene.intExt}/{scene.dayNight.slice(0, 3)}</span>
                    <span className="text-[11px] text-white/50 truncate">{scene.set}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {sel ? <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">◎ Select · T{sel.takeNumber}</span>
                      : st.length ? <span className="text-[9px] font-black uppercase tracking-widest text-yellow-400/70">No select</span>
                      : <span className="text-[9px] font-black uppercase tracking-widest text-white/20">No coverage</span>}
                    {canManage && st.filter(t => typeof t.matchScore === 'number').length >= 2 && (
                      <button onClick={() => bestReading(scene.id)} title="Circle the best-matching reading" className="flex items-center gap-1 px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-[9px] font-black uppercase tracking-widest hover:bg-cyan-500/20 transition-all"><Sparkles size={10} /> Best</button>
                    )}
                    {canManage && (
                      <button onClick={() => setRecordScene(scene)} title="Record a take from this device" className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all"><Camera size={11} /> Record</button>
                    )}
                    {canManage && (
                      <label className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-white/10 transition-all ${busyScene === scene.id ? 'opacity-50 pointer-events-none' : ''}`}>
                        <Plus size={11} /> {busyScene === scene.id ? 'Uploading…' : 'Take'}
                        <input type="file" accept="video/*" className="sr-only" onChange={e => { addTake(scene, e.target.files?.[0]); e.currentTarget.value = ''; }} />
                      </label>
                    )}
                  </div>
                </div>
                {st.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {st.map(t => (
                      <div key={t.id} className={`flex items-center gap-1.5 pl-1.5 pr-1 py-1 rounded-lg border ${t.circled ? 'border-emerald-500/40 bg-emerald-500/[0.08]' : 'border-white/10 bg-white/[0.02]'}`}>
                        <button onClick={() => toggleCircle(t)} disabled={!canManage} title="Circle take" className={`text-sm leading-none ${t.circled ? 'text-emerald-400' : 'text-white/25 hover:text-white/50'}`}>◎</button>
                        <span className="text-[11px] font-black text-white/70 font-mono">T{t.takeNumber}</span>
                        {t.duration ? <span className="text-[9px] text-white/25 font-mono">{Math.round(t.duration)}s</span> : null}
                        {canManage ? (
                          <select value={t.status} onChange={e => setStatus(t, e.target.value as FilmProduction.TakeStatus)} className={`text-[8px] font-black uppercase rounded px-1 py-0.5 border-0 cursor-pointer ${takeStatusColor[t.status]}`}>
                            {TAKE_STATUSES.map(s => <option key={s} value={s} className="bg-neutral-900 text-white">{s}</option>)}
                          </select>
                        ) : <span className={`text-[8px] font-black uppercase rounded px-1 py-0.5 ${takeStatusColor[t.status]}`}>{t.status}</span>}
                        {typeof t.matchScore === 'number' && <span className={`text-[8px] font-black font-mono px-1 py-0.5 rounded ${t.matchScore >= 70 ? 'text-emerald-400 bg-emerald-500/10' : t.matchScore >= 40 ? 'text-yellow-400 bg-yellow-500/10' : 'text-red-400 bg-red-500/10'}`} title="How much of the scripted dialogue this reading contains">{t.matchScore}%</span>}
                        {t.proxyUrl && <a href={t.proxyUrl} target="_blank" rel="noreferrer" className="text-white/25 hover:text-cyan-400" title="View proxy"><Eye size={12} /></a>}
                        {canManage && <button onClick={() => del(t)} className="text-white/20 hover:text-red-400"><Trash2 size={11} /></button>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl">
        <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt: 'Act as Aria, my post-production supervisor. Explain the "Set to Cut" workflow: how logging circle-takes on set and assembling proxies into an editor as we shoot speeds up post, what a good selects/coverage discipline looks like, and how an assistant editor should refine the auto-assembled rough cut.' } }))}
          className="flex items-center gap-2 text-cyan-300 text-xs font-black uppercase tracking-widest hover:text-cyan-200 transition-colors">
          <Sparkles size={11} /> Ask Aria — Post Supervisor →
        </button>
      </div>
    </motion.div>
  );
};

// ─── Film Tab: Schedule ─────────────────────────────────────────────────────

const FilmScheduleTab: React.FC = () => {
  const { scenes } = useProd();
  const days = [...new Set(scenes.map(s => s.shootDay))].sort((a, b) => a - b);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <p className="text-[10px] text-white/30 font-bold">Scenes are grouped by shoot day. Assign days in the Script tab.</p>
      {days.length === 0 ? (
        <EmptyState icon={<Calendar size={22} />} title="No Schedule" body="Add scenes with shoot day assignments in the Script tab to build your shooting schedule." />
      ) : (
        days.map(day => {
          const dayScenes = scenes.filter(s => s.shootDay === day);
          const totalPages = dayScenes.reduce((s, sc) => s + sc.pages, 0);
          const locations = [...new Set(dayScenes.map(s => s.set))];
          return (
            <div key={day} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
              <div className="px-5 py-3 bg-violet-500/10 border-b border-white/[0.06] flex items-center justify-between">
                <div><p className="text-sm font-black text-white">Day {day}</p><p className="text-[10px] text-white/40">{locations.join(' · ')}</p></div>
                <div className="text-right"><p className="text-xs font-black text-violet-400">{dayScenes.length} scene{dayScenes.length !== 1 ? 's' : ''}</p><p className="text-[10px] text-white/30">{totalPages.toFixed(1)} pages</p></div>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {dayScenes.map(s => (
                  <div key={s.id} className="flex items-center gap-4 px-5 py-3">
                    <span className="text-xs font-black text-violet-400 w-8">#{s.sceneNum}</span>
                    <span className="text-[9px] text-white/30 font-black w-16">{s.intExt} · {s.dayNight}</span>
                    <span className="flex-1 text-[11px] text-white/60 truncate">{s.synopsis}</span>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${s.status === 'SHOT' ? 'text-emerald-400 bg-emerald-500/10' : s.status === 'PARTIAL' ? 'text-yellow-400 bg-yellow-500/10' : 'text-white/30 bg-white/5'}`}>{s.status.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
      <div className="p-4 bg-violet-500/5 border border-violet-500/20 rounded-2xl">
        <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt: 'Act as Aria, my AI 1st Assistant Director. Based on standard indie film production practices, help me optimize my shooting schedule for maximum efficiency. Consider: company moves between locations, cast availability, natural light requirements, stunt/effects days, and coverage strategy. Give me pro tips for scheduling an indie feature with a 7–14 day schedule.' } }))}
          className="flex items-center gap-2 text-violet-400 text-xs font-black uppercase tracking-widest hover:text-violet-300 transition-colors">
          <Sparkles size={11} /> Ask Aria — 1st AD Scheduling Mode →
        </button>
      </div>
    </motion.div>
  );
};

// ─── Film Tab: Distribution ─────────────────────────────────────────────────

const FilmDistroTab: React.FC = () => {
  const { prod, festivals: subs } = useProd();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ festival: '', tier: 'B' as FilmFestivalSub['tier'], deadline: '', fee: '', status: 'PLANNING' as FilmFestivalSub['status'], category: '', notes: '' });
  const save = () => {
    const n: FilmFestivalSub = { id: uuid(), ...form, deadline: form.deadline ? new Date(form.deadline).getTime() : Date.now(), fee: parseFloat(form.fee) || 0, createdAt: Date.now() };
    if (prod) FilmProduction.putFestival(prod.id, n);
    setAdding(false);
    setForm({ festival: '', tier: 'B', deadline: '', fee: '', status: 'PLANNING', category: '', notes: '' });
  };
  const statusColor: Record<string, string> = { PLANNING: 'text-white/40 bg-white/5', SUBMITTED: 'text-blue-400 bg-blue-500/15', OFFICIAL_SELECTION: 'text-emerald-400 bg-emerald-500/15', REJECTED: 'text-red-400/70 bg-red-500/10', WINNER: 'text-amber-400 bg-amber-500/20', WITHDRAWN: 'text-white/20 bg-white/5' };
  const tierColors: Record<string, string> = { A: 'text-amber-400', B: 'text-blue-400', C: 'text-white/50', D: 'text-white/30' };
  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50';
  const totalFees = subs.filter(s => s.status !== 'PLANNING').reduce((a, s) => a + s.fee, 0);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {(['PLANNING', 'SUBMITTED', 'OFFICIAL_SELECTION', 'WINNER'] as const).map(s => {
          const cnt = subs.filter(f => f.status === s).length;
          const labels = { PLANNING: 'Planned', SUBMITTED: 'Submitted', OFFICIAL_SELECTION: 'Official', WINNER: 'Winner' };
          return <div key={s} className={`p-3 rounded-xl border border-white/[0.06] ${statusColor[s] ?? 'bg-white/5 text-white/40'}`}><p className="text-2xl font-black">{cnt}</p><p className="text-[9px] font-black uppercase tracking-widest mt-0.5 opacity-70">{labels[s]}</p></div>;
        })}
      </div>
      <div className="flex justify-between items-center">
        <p className="text-[10px] text-white/30 font-bold">Total fees paid: {fmtCurrency(totalFees)}</p>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-400 text-xs font-black uppercase tracking-widest hover:bg-violet-500/25 transition-all"><Plus size={12} /> Add Festival</button>
      </div>
      {adding && (
        <div className="p-5 bg-white/[0.03] border border-violet-500/20 rounded-2xl space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input className={inputCls} placeholder="Festival Name" value={form.festival} onChange={e => setForm(f => ({ ...f, festival: e.target.value }))} />
            <select className={inputCls} value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value as any }))}>
              {['A', 'B', 'C', 'D'].map(t => <option key={t} value={t}>Tier {t}</option>)}
            </select>
            <select className={inputCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}>
              {['PLANNING', 'SUBMITTED', 'OFFICIAL_SELECTION', 'REJECTED', 'WINNER', 'WITHDRAWN'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input className={inputCls} type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
            <input className={inputCls} type="number" placeholder="Entry Fee ($)" value={form.fee} onChange={e => setForm(f => ({ ...f, fee: e.target.value }))} />
            <input className={inputCls} placeholder="Category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
          </div>
          <div className="flex gap-3">
            <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-violet-500 text-white text-xs font-black uppercase tracking-widest hover:bg-violet-400 transition-all">Add</button>
            <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl bg-white/5 text-white/40 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {subs.sort((a, b) => a.deadline - b.deadline).map(s => (
          <div key={s.id} className="flex items-center gap-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:border-white/15 transition-all">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2"><span className={`text-[9px] font-black ${tierColors[s.tier]}`}>TIER {s.tier}</span><p className="text-sm font-black text-white">{s.festival}</p></div>
              {s.category && <p className="text-[10px] text-white/30">{s.category}</p>}
            </div>
            <div className="text-right shrink-0">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${statusColor[s.status] ?? 'text-white/40 bg-white/5'}`}>{s.status.replace(/_/g, ' ')}</span>
              <p className="text-[10px] text-white/30 mt-1">Due {fmtDate(s.deadline)} · ${s.fee}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="p-4 bg-violet-500/5 border border-violet-500/20 rounded-2xl space-y-3">
        <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt: 'Act as Aria, my AI Distribution Strategist. Research the current film festival circuit and streaming landscape for indie films. Give me: (1) The optimal festival strategy for a debut indie feature — which Tier A/B festivals to target first, (2) How to approach streaming platforms (A24, MUBI, Netflix, Amazon, Apple) after festivals, (3) Day-and-date vs festival-exclusive strategy pros/cons, (4) What makes a film attractive for acquisition in 2026.' } }))}
          className="flex items-center gap-2 text-violet-400 text-xs font-black uppercase tracking-widest hover:text-violet-300 transition-colors">
          <Sparkles size={11} /> Ask Aria — Distribution Strategist Mode →
        </button>
        <button onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'EVENT_PRODUCTION_STUDIO' } }))}
          className="flex items-center gap-2 text-white/40 text-xs font-black uppercase tracking-widest hover:text-white/70 transition-colors">
          <Mic size={11} /> Plan Film Premiere Event →
        </button>
      </div>
    </motion.div>
  );
};

// ─── Writer: Types & Storage ────────────────────────────────────────────────

interface WriterProject {
  id: string; title: string; type: 'BOOK' | 'ARTICLE' | 'COLUMN' | 'ESSAY' | 'NEWSLETTER' | 'SCRIPT' | 'PODCAST';
  status: 'ACTIVE' | 'DRAFTING' | 'EDITING' | 'SUBMITTED' | 'PUBLISHED' | 'ON_HOLD';
  wordCountTarget: number; wordCountCurrent: number; deadline?: number;
  genre: string; logline: string; notes: string; createdAt: number;
}
interface WriterChapter {
  id: string; projectId: string; order: number; title: string;
  wordCount: number; status: 'OUTLINE' | 'DRAFTING' | 'REVISION' | 'FINAL'; notes: string; createdAt: number;
}
interface WriterSubmission {
  id: string; publication: string; editorContact: string; editorEmail: string;
  type: 'QUERY' | 'FULL_MS' | 'PARTIAL_MS' | 'ARTICLE_PITCH' | 'PROPOSAL';
  submittedAt?: number; status: 'PLANNING' | 'SENT' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'REVISE_RESUBMIT';
  responseDeadline?: number; notes: string; createdAt: number;
}
interface WriterEvent {
  id: string; title: string; type: 'SIGNING' | 'LAUNCH' | 'PANEL' | 'KEYNOTE' | 'WORKSHOP' | 'READING' | 'VIRTUAL';
  venue: string; city: string; date?: number; rsvpCount: number; fee: number;
  status: 'PLANNING' | 'CONFIRMED' | 'DONE' | 'CANCELLED'; notes: string; createdAt: number;
}
interface WriterResearchNote {
  id: string; topic: string; content: string; sourceType: 'WEB' | 'BOOK' | 'INTERVIEW' | 'DOCUMENT' | 'OTHER';
  sourceUrl: string; tags: string; createdAt: number;
}

const writerProjectStore    = pmStore<WriterProject>('writer_projects');
const writerChapterStore    = pmStore<WriterChapter>('writer_chapters');
const writerSubmissionStore = pmStore<WriterSubmission>('writer_subs');
const writerEventStore      = pmStore<WriterEvent>('writer_events');
const writerResearchStore   = pmStore<WriterResearchNote>('writer_research');

const WRITER_PROJECT_TYPES = ['BOOK', 'ARTICLE', 'COLUMN', 'ESSAY', 'NEWSLETTER', 'SCRIPT', 'PODCAST'];

function ensureWriterDemo() {
  if (!isDemoMode()) return;           // demo off → never seed sample writer data
  if (writerProjectStore.get().length > 0) return;
  writerProjectStore.set([
    { id: 'proj1', title: 'The Weight of Small Things', type: 'BOOK', status: 'DRAFTING', wordCountTarget: 80000, wordCountCurrent: 34200, deadline: new Date('2026-09-01').getTime(), genre: 'Literary Fiction', logline: 'A Detroit family confronts three generations of silence after a mysterious death reopens old wounds.', notes: 'Agent expressed interest after seeing first 50 pages', createdAt: Date.now() },
    { id: 'proj2', title: 'The New Language of Protest Music', type: 'ARTICLE', status: 'SUBMITTED', wordCountTarget: 3500, wordCountCurrent: 3500, genre: 'Music Journalism', logline: 'How TikTok changed protest music from anthems to 60-second viral moments.', notes: 'Pitched to Rolling Stone, The Atlantic, and Pitchfork', createdAt: Date.now() },
    { id: 'proj3', title: 'Detroit Futures', type: 'NEWSLETTER', status: 'ACTIVE', wordCountTarget: 800, wordCountCurrent: 0, genre: 'Urban Affairs', logline: 'Weekly newsletter covering Detroit\'s arts, culture, and civic landscape.', notes: '2,400 subscribers as of last month', createdAt: Date.now() },
  ]);
  writerChapterStore.set([
    { id: uuid(), projectId: 'proj1', order: 1, title: 'Part One: Arrivals', wordCount: 8200, status: 'FINAL', notes: 'First chapter opens with grandmother\'s funeral', createdAt: Date.now() },
    { id: uuid(), projectId: 'proj1', order: 2, title: 'Part Two: The House on Livernois', wordCount: 12000, status: 'REVISION', notes: 'Needs tighter scene cuts in middle section', createdAt: Date.now() },
    { id: uuid(), projectId: 'proj1', order: 3, title: 'Part Three: What Marcus Knows', wordCount: 9000, status: 'DRAFTING', notes: 'Marcus POV — messy but alive', createdAt: Date.now() },
    { id: uuid(), projectId: 'proj1', order: 4, title: 'Part Four: The Letter', wordCount: 5000, status: 'DRAFTING', notes: 'Key reveal chapter', createdAt: Date.now() },
    { id: uuid(), projectId: 'proj1', order: 5, title: 'Part Five: After', wordCount: 0, status: 'OUTLINE', notes: 'Need to figure out the ending', createdAt: Date.now() },
  ]);
  writerSubmissionStore.set([
    { id: uuid(), publication: 'The Atlantic', editorContact: 'Fiction Editor', editorEmail: 'fiction@theatlantic.com', type: 'ARTICLE_PITCH', submittedAt: new Date('2026-05-01').getTime(), status: 'UNDER_REVIEW', responseDeadline: new Date('2026-07-01').getTime(), notes: 'Protest music piece', createdAt: Date.now() },
    { id: uuid(), publication: 'Pitchfork', editorContact: 'Features Desk', editorEmail: 'features@pitchfork.com', type: 'ARTICLE_PITCH', submittedAt: new Date('2026-05-10').getTime(), status: 'REJECTED', notes: 'Too similar to recent piece they ran', createdAt: Date.now() },
    { id: uuid(), publication: 'Riverhead Books', editorContact: 'Acquisitions', editorEmail: 'acquisitions@riverhead.com', type: 'QUERY', submittedAt: new Date('2026-04-15').getTime(), status: 'UNDER_REVIEW', responseDeadline: new Date('2026-08-01').getTime(), notes: 'Full manuscript request pending response', createdAt: Date.now() },
    { id: uuid(), publication: 'Graywolf Press', editorContact: 'Literary Fiction', editorEmail: 'submissions@graywolf.com', type: 'QUERY', status: 'PLANNING', notes: 'Perfect fit for their catalog', createdAt: Date.now() },
  ]);
  writerEventStore.set([
    { id: uuid(), title: 'Detroit Book Festival Author Panel', type: 'PANEL', venue: 'Detroit Public Library – Main Branch', city: 'Detroit, MI', date: new Date('2026-08-15').getTime(), rsvpCount: 0, fee: 0, status: 'CONFIRMED', notes: 'Moderated panel on Detroit literary voices', createdAt: Date.now() },
    { id: uuid(), title: 'Weight of Small Things Launch Night', type: 'LAUNCH', venue: 'Source Booksellers', city: 'Detroit, MI', date: new Date('2026-11-01').getTime(), rsvpCount: 0, fee: 0, status: 'PLANNING', notes: 'Targeting publication day +3 days', createdAt: Date.now() },
    { id: uuid(), title: 'Music Journalism Workshop', type: 'WORKSHOP', venue: 'Wayne State University – Hilberry Gateway', city: 'Detroit, MI', date: new Date('2026-09-20').getTime(), rsvpCount: 45, fee: 25, status: 'CONFIRMED', notes: '2-hour workshop for journalism students', createdAt: Date.now() },
  ]);
}

// ─── Writer Tab: Overview ───────────────────────────────────────────────────

const WriterOverviewTab: React.FC = () => {
  useEffect(() => { ensureWriterDemo(); }, []);
  const demoOn = isDemoMode();
  const projects = demoOn ? writerProjectStore.get() : writerProjectStore.get().filter(p => !WRITER_DEMO_IDS.has(p.id));
  const chapters = writerChapterStore.get();
  const subs     = (demoOn ? writerSubmissionStore.get() : writerSubmissionStore.get().filter(s => !WRITER_DEMO_IDS.has((s as any).projectId)));
  const events   = (demoOn ? writerEventStore.get() : writerEventStore.get().filter(e => !WRITER_DEMO_IDS.has((e as any).projectId)));
  const totalWords = projects.reduce((s, p) => s + p.wordCountCurrent, 0);
  const activeProjects = projects.filter(p => ['ACTIVE', 'DRAFTING', 'EDITING'].includes(p.status));
  const pendingSubs   = subs.filter(s => s.status === 'SENT' || s.status === 'UNDER_REVIEW');
  const upcomingEvts  = events.filter(e => e.status === 'CONFIRMED' || e.status === 'PLANNING');
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<BookMarked size={16} />} label="Active Projects" value={activeProjects.length} sub={`${projects.length} total`} color="#06b6d4" />
        <StatCard icon={<PenLine size={16} />} label="Words Written" value={totalWords.toLocaleString()} sub="across all drafts" color="#a855f7" />
        <StatCard icon={<Send size={16} />} label="In Review" value={pendingSubs.length} sub={`${subs.filter(s => s.status === 'ACCEPTED').length} accepted`} color="#10b981" />
        <StatCard icon={<Calendar size={16} />} label="Upcoming Events" value={upcomingEvts.length} color="#FF8C00" />
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30 mb-4">Active Projects</p>
        <div className="space-y-3">
          {activeProjects.map(p => {
            const pct = p.wordCountTarget > 0 ? Math.min(100, (p.wordCountCurrent / p.wordCountTarget) * 100) : 0;
            const statusColor: Record<string, string> = { ACTIVE: 'text-emerald-400 bg-emerald-500/10', DRAFTING: 'text-blue-400 bg-blue-500/10', EDITING: 'text-yellow-400 bg-yellow-500/10', SUBMITTED: 'text-violet-400 bg-violet-500/10', PUBLISHED: 'text-emerald-400 bg-emerald-500/15', ON_HOLD: 'text-white/30 bg-white/5' };
            return (
              <div key={p.id} className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                <div className="flex items-start justify-between mb-3">
                  <div><p className="text-sm font-black text-white">{p.title}</p><p className="text-[10px] text-white/40">{p.type} · {p.genre}</p></div>
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${statusColor[p.status] ?? 'text-white/40 bg-white/5'}`}>{p.status}</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-2"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${pct}%` }} /></div>
                <div className="flex justify-between"><p className="text-[10px] text-white/30">{p.wordCountCurrent.toLocaleString()} / {p.wordCountTarget.toLocaleString()} words</p><p className="text-[10px] text-cyan-400">{pct.toFixed(0)}%</p></div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl">
        <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt: `Act as Aria, my AI Editor and Writing Coach. I'm working on ${activeProjects.length} active writing projects with ${totalWords.toLocaleString()} words written. I have ${pendingSubs.length} submissions under review. Give me: a writing session plan for this week, strategies for beating writer's block, how to balance multiple projects, and professional advice on my submission strategy.` } }))}
          className="flex items-center gap-2 text-cyan-400 text-xs font-black uppercase tracking-widest hover:text-cyan-300 transition-colors">
          <Sparkles size={11} /> Ask Aria — Writing Coach & Editor Mode →
        </button>
      </div>
    </motion.div>
  );
};

// ─── Writer Tab: Projects ───────────────────────────────────────────────────

const WriterProjectsTab: React.FC<{ currentUser?: UserProfile | null }> = ({ currentUser }) => {
  const uid = currentUser?.uid;
  const [lorea, setLorea] = useState<WritingProject[]>([]);
  useEffect(() => {
    if (!uid) { ensureWriterDemo(); setProjects(writerProjectStore.get()); return; }
    listWritingProjects(uid).then(({ projects: p }) => {
      setLorea(p);
      if (p.length === 0) { ensureWriterDemo(); setProjects(writerProjectStore.get()); }
    }).catch(() => { ensureWriterDemo(); setProjects(writerProjectStore.get()); });
  }, [uid]);
  const [projects, setProjects] = useState<WriterProject[]>(() => writerProjectStore.get());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'BOOK' as WriterProject['type'], status: 'DRAFTING' as WriterProject['status'], wordCountTarget: '', wordCountCurrent: '', genre: '', logline: '', deadline: '', notes: '' });
  const save = () => {
    const n: WriterProject = { id: uuid(), ...form, wordCountTarget: parseInt(form.wordCountTarget) || 0, wordCountCurrent: parseInt(form.wordCountCurrent) || 0, deadline: form.deadline ? new Date(form.deadline).getTime() : undefined, createdAt: Date.now() };
    const next = [...projects, n]; writerProjectStore.set(next); setProjects(next); setAdding(false);
    setForm({ title: '', type: 'BOOK', status: 'DRAFTING', wordCountTarget: '', wordCountCurrent: '', genre: '', logline: '', deadline: '', notes: '' });
  };
  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-cyan-500/50';
  const statusColor: Record<string, string> = { ACTIVE: 'text-emerald-400 bg-emerald-500/10', DRAFTING: 'text-blue-400 bg-blue-500/10', EDITING: 'text-yellow-400 bg-yellow-500/10', SUBMITTED: 'text-violet-400 bg-violet-500/10', PUBLISHED: 'text-emerald-400 bg-emerald-500/15', ON_HOLD: 'text-white/30 bg-white/5' };
  // Real Lorea projects auto-populate at the top; local demo/manual projects follow.
  const loreaIds = new Set(lorea.map(l => l.id));
  const loreaAsWriter: WriterProject[] = lorea.map(l => ({ id: l.id, title: l.title, type: l.type, status: l.status, wordCountTarget: l.wordCountTarget, wordCountCurrent: l.wordCountCurrent, genre: l.genre, logline: l.logline, notes: '', createdAt: l.createdAt }));
  const demoIds = WRITER_DEMO_IDS;
  // Show demo rows only when demo mode is on AND there are no real Lorea projects.
  const showDemoRows = isDemoMode() && lorea.length === 0;
  const displayProjects = showDemoRows
    ? projects
    : [...loreaAsWriter, ...projects.filter(p => !demoIds.has(p.id))];
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        {lorea.length > 0 ? <p className="text-[10px] text-white/30 font-bold flex items-center gap-1.5"><BookOpen size={11} className="text-cyan-400" /> {lorea.length} live from your Lorea studio · auto-synced</p> : <span />}
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-xs font-black uppercase tracking-widest hover:bg-cyan-500/25 transition-all"><Plus size={12} /> New Project</button>
      </div>
      {adding && (
        <div className="p-5 bg-white/[0.03] border border-cyan-500/20 rounded-2xl space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input className={inputCls} placeholder="Project Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <select className={inputCls} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}>
              {WRITER_PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className={inputCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}>
              {['ACTIVE', 'DRAFTING', 'EDITING', 'SUBMITTED', 'PUBLISHED', 'ON_HOLD'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input className={inputCls} placeholder="Genre / Beat" value={form.genre} onChange={e => setForm(f => ({ ...f, genre: e.target.value }))} />
            <input className={inputCls} type="number" placeholder="Target Word Count" value={form.wordCountTarget} onChange={e => setForm(f => ({ ...f, wordCountTarget: e.target.value }))} />
            <input className={inputCls} type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
          </div>
          <input className={inputCls} placeholder="One-line description / logline" value={form.logline} onChange={e => setForm(f => ({ ...f, logline: e.target.value }))} />
          <div className="flex gap-3">
            <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-cyan-500 text-white text-xs font-black uppercase tracking-widest hover:bg-cyan-400 transition-all">Create Project</button>
            <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl bg-white/5 text-white/40 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
          </div>
        </div>
      )}
      {displayProjects.length === 0 ? (
        <EmptyState icon={<BookMarked size={22} />} title="No Projects" body="Create your first writing project — book, article, column, newsletter, or podcast." cta="New Project" onCta={() => setAdding(true)} />
      ) : (
        <div className="space-y-3">
          {displayProjects.map(p => {
            const pct = p.wordCountTarget > 0 ? Math.min(100, (p.wordCountCurrent / p.wordCountTarget) * 100) : 0;
            const isLorea = loreaIds.has(p.id);
            return (
              <div key={p.id} className="p-5 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:border-white/15 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div><p className="text-sm font-black text-white flex items-center gap-2">{p.title}{isLorea && <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400">Lorea</span>}</p><p className="text-[10px] text-white/40">{p.type} · {p.genre}{isLorea ? ` · ${p.wordCountCurrent.toLocaleString()} words` : ''}</p></div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${statusColor[p.status] ?? 'text-white/40 bg-white/5'}`}>{p.status}</span>
                    {p.deadline && <span className="text-[9px] text-white/25">Due {fmtDate(p.deadline)}</span>}
                  </div>
                </div>
                {p.logline && <p className="text-[11px] text-white/40 italic mb-3">"{p.logline}"</p>}
                {p.wordCountTarget > 0 && (
                  <>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-1.5"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${pct}%` }} /></div>
                    <p className="text-[10px] text-white/30">{p.wordCountCurrent.toLocaleString()} / {p.wordCountTarget.toLocaleString()} words · {pct.toFixed(0)}% complete</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};

// ─── Writer Tab: Manuscripts ────────────────────────────────────────────────

const WriterManuscriptsTab: React.FC<{ currentUser?: UserProfile | null }> = ({ currentUser }) => {
  const uid = currentUser?.uid;
  const [lorea, setLorea] = useState<{ projects: WritingProject[]; chapters: WritingChapter[] }>({ projects: [], chapters: [] });
  const [localProjects, setLocalProjects] = useState<WriterProject[]>([]);
  const [chapters, setChapters] = useState<WriterChapter[]>([]);
  useEffect(() => {
    const seedLocal = () => { ensureWriterDemo(); setLocalProjects(writerProjectStore.get()); setChapters(writerChapterStore.get()); };
    if (!uid) { seedLocal(); return; }
    listWritingProjects(uid).then(res => {
      setLorea({ projects: res.projects.filter(p => p.kind === 'BOOK' || p.kind === 'SCRIPT'), chapters: res.chapters });
      if (res.projects.length === 0) seedLocal();
    }).catch(seedLocal);
  }, [uid]);
  const loreaIds = new Set(lorea.projects.map(p => p.id));
  const projects: WriterProject[] = [
    ...lorea.projects.map(l => ({ id: l.id, title: l.title, type: l.type, status: l.status, wordCountTarget: l.wordCountTarget, wordCountCurrent: l.wordCountCurrent, genre: l.genre, logline: l.logline, notes: '', createdAt: l.createdAt } as WriterProject)),
    ...localProjects.filter(p => ['BOOK', 'SCRIPT', 'ESSAY'].includes(p.type) && !['proj1', 'proj2', 'proj3'].includes(p.id)),
  ];
  const [selProject, setSelProject] = useState<string>('');
  useEffect(() => { if (!selProject && projects[0]) setSelProject(projects[0].id); }, [projects.length]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', wordCount: '', status: 'OUTLINE' as WriterChapter['status'], notes: '' });
  const allChapters: WriterChapter[] = loreaIds.has(selProject)
    ? lorea.chapters.filter(c => c.projectId === selProject).map(c => ({ id: c.id, projectId: c.projectId, order: c.order, title: c.title, wordCount: c.wordCount, status: c.status, notes: '', createdAt: 0 }))
    : chapters;
  const visible = allChapters.filter(c => c.projectId === selProject).sort((a, b) => a.order - b.order);
  const project = projects.find(p => p.id === selProject);
  const totalWords = visible.reduce((s, c) => s + c.wordCount, 0);
  const save = () => {
    const n: WriterChapter = { id: uuid(), projectId: selProject, order: visible.length + 1, title: form.title, wordCount: parseInt(form.wordCount) || 0, status: form.status, notes: form.notes, createdAt: Date.now() };
    const next = [...chapters, n]; writerChapterStore.set(next); setChapters(next); setAdding(false);
    setForm({ title: '', wordCount: '', status: 'OUTLINE', notes: '' });
  };
  const statusColor: Record<string, string> = { OUTLINE: 'text-white/40 bg-white/5', DRAFTING: 'text-blue-400 bg-blue-500/10', REVISION: 'text-yellow-400 bg-yellow-500/10', FINAL: 'text-emerald-400 bg-emerald-500/10' };
  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-cyan-500/50';
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {projects.length === 0 ? (
        <EmptyState icon={<BookOpen size={22} />} title="No Book/Script Projects" body="Create a BOOK or SCRIPT project in the Projects tab to track chapters here." />
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            {projects.map(p => (
              <button key={p.id} onClick={() => setSelProject(p.id)} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${selProject === p.id ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-white/5 text-white/30 hover:text-white/60'}`}>{p.title}</button>
            ))}
          </div>
          {project && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-white/30 font-black uppercase tracking-widest">{totalWords.toLocaleString()} words · {visible.length} section{visible.length !== 1 ? 's' : ''}</p>
                {project.wordCountTarget > 0 && <p className="text-[10px] text-cyan-400">{((totalWords / project.wordCountTarget) * 100).toFixed(0)}% of {project.wordCountTarget.toLocaleString()} target</p>}
              </div>
              {loreaIds.has(selProject)
                ? <span className="text-[9px] text-cyan-400/70 font-black uppercase tracking-widest flex items-center gap-1.5"><BookOpen size={11} /> Synced from Lorea — edit in studio</span>
                : <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-xs font-black uppercase tracking-widest hover:bg-cyan-500/25 transition-all"><Plus size={12} /> Add Chapter</button>}
            </div>
          )}
          {adding && (
            <div className="p-5 bg-white/[0.03] border border-cyan-500/20 rounded-2xl space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <input className={inputCls} placeholder="Chapter / Section Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                <input className={inputCls} type="number" placeholder="Word Count" value={form.wordCount} onChange={e => setForm(f => ({ ...f, wordCount: e.target.value }))} />
                <select className={inputCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}>
                  {['OUTLINE', 'DRAFTING', 'REVISION', 'FINAL'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <input className={inputCls} placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              <div className="flex gap-3">
                <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-cyan-500 text-white text-xs font-black uppercase tracking-widest hover:bg-cyan-400 transition-all">Add Chapter</button>
                <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl bg-white/5 text-white/40 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {visible.map((c, i) => (
              <div key={c.id} className="flex items-center gap-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:border-white/15 transition-all">
                <span className="text-white/20 font-black text-xs w-6">{i + 1}</span>
                <div className="flex-1 min-w-0"><p className="text-sm font-black text-white">{c.title}</p>{c.notes && <p className="text-[10px] text-white/30 truncate">{c.notes}</p>}</div>
                <p className="text-[10px] text-white/30 shrink-0">{c.wordCount > 0 ? `${c.wordCount.toLocaleString()} words` : 'No words yet'}</p>
                <span className={`shrink-0 text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${statusColor[c.status]}`}>{c.status}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
};

// ─── Writer Tab: Submissions ────────────────────────────────────────────────

const WriterSubmissionsTab: React.FC = () => {
  useEffect(() => { ensureWriterDemo(); }, []);
  const [subs, setSubs] = useState<WriterSubmission[]>(() => {
    const all = writerSubmissionStore.get();
    return isDemoMode() ? all : all.filter(s => !WRITER_DEMO_IDS.has((s as any).projectId));
  });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ publication: '', editorContact: '', editorEmail: '', type: 'QUERY' as WriterSubmission['type'], status: 'PLANNING' as WriterSubmission['status'], submittedAt: '', responseDeadline: '', notes: '' });
  const save = () => {
    const n: WriterSubmission = { id: uuid(), ...form, submittedAt: form.submittedAt ? new Date(form.submittedAt).getTime() : undefined, responseDeadline: form.responseDeadline ? new Date(form.responseDeadline).getTime() : undefined, createdAt: Date.now() };
    const next = [...subs, n]; writerSubmissionStore.set(next); setSubs(next); setAdding(false);
    setForm({ publication: '', editorContact: '', editorEmail: '', type: 'QUERY', status: 'PLANNING', submittedAt: '', responseDeadline: '', notes: '' });
  };
  const statusColor: Record<string, string> = { PLANNING: 'text-white/40 bg-white/5', SENT: 'text-blue-400 bg-blue-500/15', UNDER_REVIEW: 'text-yellow-400 bg-yellow-500/15', ACCEPTED: 'text-emerald-400 bg-emerald-500/15', REJECTED: 'text-red-400/70 bg-red-500/10', REVISE_RESUBMIT: 'text-orange-400 bg-orange-500/15' };
  const accepted = subs.filter(s => s.status === 'ACCEPTED').length;
  const rejected = subs.filter(s => s.status === 'REJECTED').length;
  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-cyan-500/50';
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={<Send size={16} />} label="Active Submissions" value={subs.filter(s => s.status === 'UNDER_REVIEW' || s.status === 'SENT').length} color="#06b6d4" />
        <StatCard icon={<CheckCircle2 size={16} />} label="Accepted" value={accepted} sub={`${rejected} rejected`} color="#10b981" />
        <StatCard icon={<Target size={16} />} label="Acceptance Rate" value={subs.length > 0 ? `${Math.round((accepted / (accepted + rejected || 1)) * 100)}%` : '—'} color="#a855f7" />
      </div>
      <div className="flex justify-end">
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-xs font-black uppercase tracking-widest hover:bg-cyan-500/25 transition-all"><Plus size={12} /> Add Submission</button>
      </div>
      {adding && (
        <div className="p-5 bg-white/[0.03] border border-cyan-500/20 rounded-2xl space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Publication / Agent / Publisher" value={form.publication} onChange={e => setForm(f => ({ ...f, publication: e.target.value }))} />
            <select className={inputCls} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}>
              {['QUERY', 'FULL_MS', 'PARTIAL_MS', 'ARTICLE_PITCH', 'PROPOSAL'].map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input className={inputCls} placeholder="Editor / Agent Name" value={form.editorContact} onChange={e => setForm(f => ({ ...f, editorContact: e.target.value }))} />
            <input className={inputCls} placeholder="Email" value={form.editorEmail} onChange={e => setForm(f => ({ ...f, editorEmail: e.target.value }))} />
            <select className={inputCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}>
              {['PLANNING', 'SENT', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'REVISE_RESUBMIT'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} type="date" placeholder="Date Submitted" value={form.submittedAt} onChange={e => setForm(f => ({ ...f, submittedAt: e.target.value }))} />
            <input className={inputCls} type="date" placeholder="Response Deadline" value={form.responseDeadline} onChange={e => setForm(f => ({ ...f, responseDeadline: e.target.value }))} />
          </div>
          <textarea className={`${inputCls} resize-none`} rows={2} placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          <div className="flex gap-3">
            <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-cyan-500 text-white text-xs font-black uppercase tracking-widest hover:bg-cyan-400 transition-all">Add Submission</button>
            <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl bg-white/5 text-white/40 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
          </div>
        </div>
      )}
      {subs.length === 0 ? (
        <EmptyState icon={<Send size={22} />} title="No Submissions" body="Track every query letter, pitch, and manuscript submission in one place." cta="Add First" onCta={() => setAdding(true)} />
      ) : (
        <div className="space-y-2">
          {subs.sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0)).map(s => (
            <div key={s.id} className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:border-white/15 transition-all">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1"><p className="text-sm font-black text-white">{s.publication}</p><p className="text-[10px] text-white/40">{s.type.replace(/_/g, ' ')}{s.editorContact ? ` · ${s.editorContact}` : ''}</p>{s.notes && <p className="text-[10px] text-white/25 mt-1">{s.notes}</p>}</div>
                <div className="text-right shrink-0">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${statusColor[s.status] ?? 'text-white/40 bg-white/5'}`}>{s.status.replace(/_/g, ' ')}</span>
                  {s.submittedAt && <p className="text-[10px] text-white/25 mt-1">Sent {fmtDate(s.submittedAt)}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl">
        <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt: 'Act as Aria, my AI Literary Agent Advisor. Research the current literary landscape and give me: (1) The best literary agents and publishers for literary fiction set in Detroit, (2) How to write a compelling query letter that stands out, (3) The typical submission timeline I should expect, (4) Alternative publication paths if traditional publishing doesn\'t work out — small presses, hybrid publishing, self-publishing strategy.' } }))}
          className="flex items-center gap-2 text-cyan-400 text-xs font-black uppercase tracking-widest hover:text-cyan-300 transition-colors">
          <Sparkles size={11} /> Ask Aria — Literary Strategy Mode →
        </button>
      </div>
    </motion.div>
  );
};

// ─── Writer Tab: Events ─────────────────────────────────────────────────────

const WriterEventsTab: React.FC = () => {
  useEffect(() => { ensureWriterDemo(); }, []);
  const [events, setEvents] = useState<WriterEvent[]>(() => {
    const all = writerEventStore.get();
    return isDemoMode() ? all : all.filter(e => !WRITER_DEMO_IDS.has((e as any).projectId));
  });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'SIGNING' as WriterEvent['type'], venue: '', city: '', date: '', rsvpCount: '', fee: '', status: 'PLANNING' as WriterEvent['status'], notes: '' });
  const save = () => {
    const n: WriterEvent = { id: uuid(), ...form, date: form.date ? new Date(form.date).getTime() : undefined, rsvpCount: parseInt(form.rsvpCount) || 0, fee: parseFloat(form.fee) || 0, createdAt: Date.now() };
    const next = [...events, n]; writerEventStore.set(next); setEvents(next); setAdding(false);
    setForm({ title: '', type: 'SIGNING', venue: '', city: '', date: '', rsvpCount: '', fee: '', status: 'PLANNING', notes: '' });
  };
  const statusColor: Record<string, string> = { PLANNING: 'text-white/40 bg-white/5', CONFIRMED: 'text-emerald-400 bg-emerald-500/10', DONE: 'text-white/30 bg-white/5', CANCELLED: 'text-red-400/60 bg-red-500/10' };
  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-cyan-500/50';
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-[10px] text-white/30">Book signings, launches, panels, speaking engagements, and virtual appearances.</p>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-xs font-black uppercase tracking-widest hover:bg-cyan-500/25 transition-all shrink-0"><Plus size={12} /> Add Event</button>
      </div>
      {adding && (
        <div className="p-5 bg-white/[0.03] border border-cyan-500/20 rounded-2xl space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input className={inputCls} placeholder="Event Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <select className={inputCls} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}>
              {['SIGNING', 'LAUNCH', 'PANEL', 'KEYNOTE', 'WORKSHOP', 'READING', 'VIRTUAL'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className={inputCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}>
              {['PLANNING', 'CONFIRMED', 'DONE', 'CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <input className={inputCls} placeholder="Venue" value={form.venue} onChange={e => setForm(f => ({ ...f, venue: e.target.value }))} />
            <input className={inputCls} placeholder="City, State" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            <input className={inputCls} type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            <input className={inputCls} type="number" placeholder="Speaker Fee ($)" value={form.fee} onChange={e => setForm(f => ({ ...f, fee: e.target.value }))} />
          </div>
          <div className="flex gap-3">
            <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-cyan-500 text-white text-xs font-black uppercase tracking-widest hover:bg-cyan-400 transition-all">Add Event</button>
            <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl bg-white/5 text-white/40 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
          </div>
        </div>
      )}
      {events.length === 0 ? (
        <EmptyState icon={<Calendar size={22} />} title="No Events" body="Track book signings, panel appearances, readings, and speaking engagements." cta="Add Event" onCta={() => setAdding(true)} />
      ) : (
        <div className="space-y-3">
          {events.sort((a, b) => (a.date ?? 0) - (b.date ?? 0)).map(e => (
            <div key={e.id} className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:border-white/15 transition-all">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5"><span className="text-[9px] font-black text-white/30 bg-white/5 px-2 py-0.5 rounded">{e.type}</span><p className="text-sm font-black text-white">{e.title}</p></div>
                  <p className="text-[10px] text-white/40">{e.venue}{e.city ? ` · ${e.city}` : ''}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${statusColor[e.status] ?? 'text-white/40 bg-white/5'}`}>{e.status}</span>
                  {e.date && <p className="text-[10px] text-white/30 mt-1">{fmtDate(e.date)}</p>}
                  {e.fee > 0 && <p className="text-[10px] text-emerald-400">{fmtCurrency(e.fee)} fee</p>}
                </div>
              </div>
            </div>
          ))}
          <div className="pt-2">
            <button onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'EVENT_PRODUCTION_STUDIO' } }))} className="flex items-center gap-2 text-cyan-400 text-xs font-black uppercase tracking-widest hover:text-cyan-300 transition-colors">
              <Mic size={11} /> Plan Full Launch Event in Event Studio →
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
};

// ─── Writer Tab: Research ───────────────────────────────────────────────────

const WriterResearchTab: React.FC = () => {
  useEffect(() => { ensureWriterDemo(); }, []);
  const [notes, setNotes] = useState<WriterResearchNote[]>(() => writerResearchStore.get());
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ topic: '', content: '', sourceType: 'WEB' as WriterResearchNote['sourceType'], sourceUrl: '', tags: '' });
  const save = () => {
    const n: WriterResearchNote = { id: uuid(), ...form, createdAt: Date.now() };
    const next = [...notes, n]; writerResearchStore.set(next); setNotes(next); setAdding(false);
    setForm({ topic: '', content: '', sourceType: 'WEB', sourceUrl: '', tags: '' });
  };
  const filtered = q ? notes.filter(n => n.topic.toLowerCase().includes(q.toLowerCase()) || n.content.toLowerCase().includes(q.toLowerCase()) || n.tags.toLowerCase().includes(q.toLowerCase())) : notes;
  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-cyan-500/50';
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="relative flex-1"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" /><input className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-cyan-500/50" placeholder="Search notes, topics, tags…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-xs font-black uppercase tracking-widest hover:bg-cyan-500/25 transition-all shrink-0"><Plus size={12} /> Add Note</button>
      </div>
      {adding && (
        <div className="p-5 bg-white/[0.03] border border-cyan-500/20 rounded-2xl space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input className={inputCls} placeholder="Topic" value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} />
            <select className={inputCls} value={form.sourceType} onChange={e => setForm(f => ({ ...f, sourceType: e.target.value as any }))}>
              {['WEB', 'BOOK', 'INTERVIEW', 'DOCUMENT', 'OTHER'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input className={inputCls} placeholder="Tags (comma sep.)" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
          </div>
          <textarea className={`${inputCls} resize-none`} rows={3} placeholder="Research content, quotes, facts, notes…" value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />
          <input className={inputCls} placeholder="Source URL or citation" value={form.sourceUrl} onChange={e => setForm(f => ({ ...f, sourceUrl: e.target.value }))} />
          <div className="flex gap-3">
            <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-cyan-500 text-white text-xs font-black uppercase tracking-widest hover:bg-cyan-400 transition-all">Save Note</button>
            <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl bg-white/5 text-white/40 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
          </div>
        </div>
      )}
      {filtered.length === 0 ? (
        <EmptyState icon={<Search size={22} />} title="No Research Notes" body="Capture sources, quotes, facts, and ideas from interviews, books, and the web." cta="Add Note" onCta={() => setAdding(true)} />
      ) : (
        <div className="space-y-3">
          {filtered.map(n => (
            <div key={n.id} className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:border-white/15 transition-all">
              <div className="flex items-center gap-2 mb-2"><span className="text-[9px] font-black text-white/30 bg-white/5 px-2 py-0.5 rounded">{n.sourceType}</span><p className="text-xs font-black text-cyan-400">{n.topic}</p></div>
              <p className="text-[11px] text-white/60 leading-relaxed">{n.content}</p>
              {n.sourceUrl && <p className="text-[10px] text-white/25 mt-2 font-mono truncate">{n.sourceUrl}</p>}
              {n.tags && <div className="flex gap-1 flex-wrap mt-2">{n.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => <span key={t} className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400/70 font-bold">{t}</span>)}</div>}
            </div>
          ))}
        </div>
      )}
      <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl">
        <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt: 'Act as Aria, my AI Research Assistant. Search the web and help me find: credible sources, expert quotes, recent statistics, and historical context for my current writing projects. Ask me what topic or piece I\'m working on and do a deep research dive.' } }))}
          className="flex items-center gap-2 text-cyan-400 text-xs font-black uppercase tracking-widest hover:text-cyan-300 transition-colors">
          <Sparkles size={11} /> Ask Aria to research a topic →
        </button>
      </div>
    </motion.div>
  );
};

// ─── Writer Tab: Press ──────────────────────────────────────────────────────

const WriterPressTab: React.FC = () => (
  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
    <EmptyState icon={<Newspaper size={22} />} title="Press & Media Coverage" body="Track reviews, interviews, podcast appearances, and media coverage of your work here." cta="Add Coverage" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[
        { title: 'Review Tracker', desc: 'Log starred reviews from trade publications, blogs, and literary magazines.', icon: '⭐' },
        { title: 'Interview Log', desc: 'Track podcast appearances, journalist interviews, and Q&As.', icon: '🎙️' },
        { title: 'Press Release Builder', desc: 'Aria drafts press releases for book launches and major announcements.', icon: '📰' },
        { title: 'Media Contact CRM', desc: 'Maintain a database of journalists, critics, and podcast hosts in your beat.', icon: '📋' },
      ].map(item => (
        <button key={item.title} onClick={() => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt: `Act as Aria, my AI Publicist. Help me with: ${item.title}. I'm an author looking to build my media presence. Ask me about my work and then give me concrete, actionable guidance.` } }))}
          className="flex items-start gap-3 p-4 bg-white/[0.03] border border-white/[0.05] rounded-xl hover:border-cyan-500/20 hover:bg-cyan-500/5 transition-all text-left group">
          <span className="text-xl shrink-0">{item.icon}</span>
          <div><p className="text-xs font-black text-white group-hover:text-cyan-400 transition-colors">{item.title}</p><p className="text-[10px] text-white/30 leading-relaxed mt-0.5">{item.desc}</p></div>
        </button>
      ))}
    </div>
  </motion.div>
);

// ─── Main component ────────────────────────────────────────────────────────────

type PMTab =
  | 'overview' | 'releases' | 'productions' | 'import' | 'payroll' | 'contracts' | 'invoices' | 'tasks' | 'vendors' | 'venues' | 'events' | 'boards' | 'promote'
  | 'film_overview' | 'film_script' | 'film_breakdown' | 'film_budget' | 'film_crew' | 'film_locations' | 'film_schedule' | 'film_distro'
  | 'film_hub' | 'film_chat' | 'film_callsheets' | 'film_staffing' | 'film_roster' | 'film_brief' | 'film_craft' | 'film_reports' | 'film_clearances' | 'film_edit' | 'film_continuity'
  | 'writer_overview' | 'writer_projects' | 'writer_manuscripts' | 'writer_research' | 'writer_submissions' | 'writer_events' | 'writer_press';

type Discipline = 'music' | 'film' | 'writer';

interface Props {
  currentUser?: UserProfile | null;
}

const PM_TABS: { id: PMTab; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'overview',   label: 'Overview',    icon: <Briefcase size={13} />,  color: '#FF8C00' },
  { id: 'releases',   label: 'Releases',    icon: <Music2 size={13} />,     color: '#FF8C00' },
  { id: 'productions',label: 'Productions', icon: <Disc3 size={13} />,      color: '#D40055' },
  { id: 'import',     label: 'Import Work', icon: <Download size={13} />,   color: '#6B0099' },
  { id: 'events',     label: 'Events',      icon: <Mic size={13} />,        color: '#FF8C00' },
  { id: 'boards',     label: 'Boards',      icon: <Layers size={13} />,     color: '#a855f7' },
  { id: 'promote',    label: 'Promote',     icon: <Megaphone size={13} />,  color: '#6366f1' },
  { id: 'payroll',    label: 'Payroll',     icon: <Users size={13} />,      color: '#FF8C00' },
  { id: 'contracts',  label: 'Contracts',   icon: <FileText size={13} />,   color: '#a855f7' },
  { id: 'invoices',   label: 'Invoices',    icon: <Receipt size={13} />,    color: '#10b981' },
  { id: 'tasks',      label: 'Tasks',       icon: <CheckSquare size={13} />,color: '#3b82f6' },
  { id: 'vendors',    label: 'Vendors',     icon: <Truck size={13} />,      color: '#f59e0b' },
  { id: 'venues',     label: 'Venues',      icon: <MapPin size={13} />,     color: '#ef4444' },
];

const DISCIPLINES: { id: Discipline; label: string; emoji: string; color: string; desc: string }[] = [
  { id: 'music',  label: 'Music',            emoji: '🎵', color: '#FF8C00', desc: 'Artist · Band · Label' },
  { id: 'film',   label: 'Film',             emoji: '🎬', color: '#a855f7', desc: 'Director · Producer · EP' },
  { id: 'writer', label: 'Writer / Journalist', emoji: '✍️', color: '#06b6d4', desc: 'Author · Journalist · Blogger' },
];

const FILM_TABS: { id: PMTab; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'film_overview',   label: 'Overview',     icon: <BarChart2 size={13} />,    color: '#a855f7' },
  { id: 'film_hub',        label: 'On Set',       icon: <LayoutDashboard size={13} />, color: '#a855f7' },
  { id: 'film_chat',       label: 'Chat',         icon: <MessageSquare size={13} />, color: '#FF8C00' },
  { id: 'film_callsheets', label: 'Call Sheets',  icon: <FileText size={13} />,     color: '#a855f7' },
  { id: 'film_staffing',   label: 'Staffing',     icon: <Briefcase size={13} />,    color: '#6366f1' },
  { id: 'film_brief',      label: 'My Brief',     icon: <UserCheck size={13} />,    color: '#f59e0b' },
  { id: 'film_roster',     label: 'Roster',       icon: <Users size={13} />,        color: '#a855f7' },
  { id: 'film_craft',      label: 'Craft',        icon: <Utensils size={13} />,     color: '#14b8a6' },
  { id: 'film_reports',    label: 'Reports',      icon: <ClipboardList size={13} />, color: '#a855f7' },
  { id: 'film_edit',       label: 'Live Edit',    icon: <Scissors size={13} />,     color: '#06b6d4' },
  { id: 'film_continuity', label: 'Continuity',   icon: <Eye size={13} />,          color: '#22d3ee' },
  { id: 'film_script',     label: 'Script',       icon: <Clapperboard size={13} />, color: '#a855f7' },
  { id: 'film_breakdown',  label: 'Breakdown',    icon: <Layers size={13} />,       color: '#f97316' },
  { id: 'film_budget',     label: 'Budget',       icon: <DollarSign size={13} />,   color: '#10b981' },
  { id: 'film_crew',       label: 'Crew',         icon: <Users size={13} />,        color: '#a855f7' },
  { id: 'film_schedule',   label: 'Schedule',     icon: <Calendar size={13} />,     color: '#3b82f6' },
  { id: 'film_locations',  label: 'Locations',    icon: <MapPin size={13} />,       color: '#ef4444' },
  { id: 'film_clearances', label: 'Clearances',   icon: <Shield size={13} />,       color: '#eab308' },
  { id: 'film_distro',     label: 'Distribution', icon: <Award size={13} />,        color: '#f59e0b' },
  { id: 'contracts',       label: 'Contracts',    icon: <FileText size={13} />,     color: '#a855f7' },
  { id: 'invoices',        label: 'Invoices',     icon: <Receipt size={13} />,      color: '#10b981' },
  { id: 'tasks',           label: 'Tasks',        icon: <CheckSquare size={13} />,  color: '#3b82f6' },
];

const WRITER_TABS: { id: PMTab; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'writer_overview',     label: 'Overview',     icon: <BarChart2 size={13} />,   color: '#06b6d4' },
  { id: 'writer_projects',     label: 'Projects',     icon: <BookMarked size={13} />,  color: '#06b6d4' },
  { id: 'writer_manuscripts',  label: 'Manuscripts',  icon: <BookOpen size={13} />,    color: '#06b6d4' },
  { id: 'writer_research',     label: 'Research',     icon: <Search size={13} />,      color: '#3b82f6' },
  { id: 'writer_submissions',  label: 'Submissions',  icon: <Send size={13} />,        color: '#f59e0b' },
  { id: 'writer_events',       label: 'Events',       icon: <Calendar size={13} />,    color: '#a855f7' },
  { id: 'writer_press',        label: 'Press',        icon: <Newspaper size={13} />,   color: '#ef4444' },
  { id: 'contracts',           label: 'Contracts',    icon: <FileText size={13} />,    color: '#a855f7' },
  { id: 'invoices',            label: 'Invoices',     icon: <Receipt size={13} />,     color: '#10b981' },
  { id: 'tasks',               label: 'Tasks',        icon: <CheckSquare size={13} />, color: '#3b82f6' },
];

export const ArtistProjectManager: React.FC<Props> = ({ currentUser }) => {
  const [discipline, setDiscipline] = useState<Discipline>(() =>
    (localStorage.getItem('plajah_pm_discipline_v1') as Discipline) || 'music'
  );
  const [activeTab, setActiveTab] = useState<PMTab>(() => {
    // One-shot deep-link intent from Creator Hub: the discipline is set via
    // `plajah_pm_discipline_v1`, the target tab is handed over here. Consume it
    // so it doesn't persist to the next open.
    try {
      const intent = sessionStorage.getItem('plajah_pm_intent_tab_v1');
      if (intent) { sessionStorage.removeItem('plajah_pm_intent_tab_v1'); return intent as PMTab; }
    } catch { /* storage disabled */ }
    if (new URLSearchParams(window.location.search).get('productionInvite')) return 'film_staffing';
    // Otherwise honour the restored discipline so a persisted Film/Writer choice
    // doesn't open on the Music overview tab.
    const d = (localStorage.getItem('plajah_pm_discipline_v1') as Discipline) || 'music';
    return d === 'film' ? 'film_overview' : d === 'writer' ? 'writer_overview' : 'overview';
  });

  const switchDiscipline = (d: Discipline) => {
    setDiscipline(d);
    localStorage.setItem('plajah_pm_discipline_v1', d);
    const firstTab = d === 'music' ? 'overview' : d === 'film' ? 'film_overview' : 'writer_overview';
    setActiveTab(firstTab);
  };

  const activeTabs = discipline === 'music' ? PM_TABS : discipline === 'film' ? FILM_TABS : WRITER_TABS;
  const disciplineConfig = DISCIPLINES.find(d => d.id === discipline)!;

  // Global demo-data toggle (shared with Creator Hub). Re-rendering on change
  // refreshes every demo surface below, which reads isDemoMode() at render.
  const [demoOn, setDemoOn] = useState(() => isDemoMode());
  useEffect(() => subscribeDemoMode(setDemoOn), []);

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':            return <OverviewTab onSwitchTab={setActiveTab} />;
      case 'releases':            return <MusicReleasesTab currentUser={currentUser} />;
      case 'productions':         return <MelosLaunchTab currentUser={currentUser} />;
      case 'import':              return <CareerImportLaunchTab />;
      case 'events':              return <EventsLaunchTab />;
      case 'boards':              return <BoardsLaunchTab />;
      case 'promote':             return <AdHubTab />;
      case 'payroll':             return <PayrollTab />;
      case 'contracts':           return <ContractsTab />;
      case 'invoices':            return <InvoicesTab />;
      case 'tasks':               return <TasksTab />;
      case 'vendors':             return <VendorsTab />;
      case 'venues':              return <VenuesTab />;
      case 'film_overview':       return <FilmOverviewTab />;
      case 'film_hub':            return <ProductionHubTab />;
      case 'film_chat':           return <ProductionChatWorkspace />;
      case 'film_callsheets':     return <CallSheetsTab />;
      case 'film_staffing':       return <FilmStaffingTab />;
      case 'film_brief':          return <DailyBriefTab />;
      case 'film_roster':         return <RosterTab />;
      case 'film_craft':          return <CraftServicesTab />;
      case 'film_reports':        return <ReportsTab />;
      case 'film_script':         return <FilmScriptTab />;
      case 'film_breakdown':      return <FilmBreakdownTab />;
      case 'film_budget':         return <FilmBudgetTab />;
      case 'film_crew':           return <FilmCrewTab />;
      case 'film_locations':      return <FilmLocationsTab />;
      case 'film_clearances':     return <FilmClearancesTab />;
      case 'film_edit':           return <FilmEditTab />;
      case 'film_continuity':     return <FilmContinuityTab />;
      case 'film_schedule':       return <ProductionScheduleTab />;
      case 'film_distro':         return <FilmDistroTab />;
      case 'writer_overview':     return <WriterOverviewTab />;
      case 'writer_projects':     return <WriterProjectsTab currentUser={currentUser} />;
      case 'writer_manuscripts':  return <WriterManuscriptsTab currentUser={currentUser} />;
      case 'writer_research':     return <WriterResearchTab />;
      case 'writer_submissions':  return <WriterSubmissionsTab />;
      case 'writer_events':       return <WriterEventsTab />;
      case 'writer_press':        return <WriterPressTab />;
      default: return null;
    }
  };

  return (
    <div className="h-full flex flex-col bg-transparent text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/90 backdrop-blur-2xl border-b border-white/[0.06] px-6 py-4 shrink-0">
        <div className="max-w-5xl mx-auto space-y-4">
          {/* Discipline switcher */}
          <div className="flex items-center gap-2">
            {DISCIPLINES.map(d => (
              <button key={d.id} onClick={() => switchDiscipline(d.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${discipline === d.id ? 'text-black shadow-lg' : 'bg-white/5 text-white/40 hover:text-white/70 hover:bg-white/10'}`}
                style={discipline === d.id ? { background: d.color } : {}}
              >
                <span>{d.emoji}</span>
                <span>{d.label}</span>
              </button>
            ))}
            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={demoOn}
                onClick={() => setDemoMode(!demoOn)}
                title={demoOn ? 'Demo data is on — sample productions are shown' : 'Demo data is off — only your real work is shown'}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/50 transition-colors hover:border-white/25 hover:text-white/80"
              >
                <span>Demo</span>
                <span className="relative h-4 w-7 rounded-full transition-colors" style={{ background: demoOn ? disciplineConfig.color : 'rgba(255,255,255,0.16)' }}>
                  <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all" style={{ left: demoOn ? '0.875rem' : '0.125rem' }} />
                </span>
              </button>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center border" style={{ background: `${disciplineConfig.color}20`, borderColor: `${disciplineConfig.color}40` }}>
                <Briefcase size={14} style={{ color: disciplineConfig.color }} />
              </div>
              <div>
                <h1 className="text-sm font-black uppercase tracking-widest text-white">Artist Manager</h1>
                <p className="text-[10px] font-bold" style={{ color: disciplineConfig.color }}>{disciplineConfig.desc}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div className="sticky top-[85px] z-10 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/[0.05] shrink-0">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto no-scrollbar py-1.5">
            {activeTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  activeTab === tab.id ? 'text-black' : 'bg-transparent text-white/40 hover:text-white/70 hover:bg-white/5'
                }`}
                style={activeTab === tab.id ? { background: tab.color } : {}}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {discipline === 'film' ? (
            <FilmProductionProvider currentUser={currentUser} onGoTab={(t) => setActiveTab(t as PMTab)}>
              <AnimatePresence mode="wait">
                <motion.div key={activeTab}>
                  {renderTab()}
                </motion.div>
              </AnimatePresence>
            </FilmProductionProvider>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={activeTab}>
                {renderTab()}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
};

export default ArtistProjectManager;
