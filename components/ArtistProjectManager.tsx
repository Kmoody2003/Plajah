/**
 * Artist Project Manager
 * Full business operations hub for artists, bands, and creator businesses.
 *
 * Tabs: Overview · Payroll · Contracts · Invoices · Tasks · Vendors · Venues · Ad Hub
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, FileText, Receipt, CheckSquare, Truck, MapPin, Megaphone,
  Plus, ChevronRight, X, Edit2, Trash2, Download, Send, CheckCircle2,
  Clock, AlertCircle, DollarSign, Calendar, Phone, Mail, Globe,
  Star, TrendingUp, BarChart2, Briefcase, Music2, Building2,
  Copy, Eye, Package, Zap, ArrowRight, Shield, Search, Filter,
  Mic, Layers, Ticket, Radio, Sparkles,
  Camera, Film, Clapperboard, Scissors, BookOpen, PenLine, Newspaper, Award, Target, BookMarked,
  LayoutDashboard, ClipboardList, Utensils, UserCheck,
} from 'lucide-react';
import { UserProfile } from '../types';
import {
  FilmProductionProvider, ProductionHubTab, CallSheetsTab, RosterTab, DailyBriefTab, CraftServicesTab,
} from './film/FilmProductionSuite';
import { listWritingProjects, type WritingProject, type WritingChapter } from '../services/loreaProjectsService';
import { MusicReleasesTab } from './music/MusicReleasesTab';

// ─── Storage helpers ────────────────────────────────────────────────────────────

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
  useEffect(() => { ensureFilmDemo(); }, []);
  const scenes    = filmSceneStore.get();
  const budget    = filmBudgetStore.get();
  const crew      = filmCrewStore.get();
  const locations = filmLocationStore.get();
  const festivals = filmFestivalStore.get();
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
        <StatCard icon={<Users size={16} />} label="Crew" value={crew.length} sub={`${crew.filter(c => c.department === 'Cast').length} cast`} color="#FF8C00" />
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

const FilmScriptTab: React.FC = () => {
  useEffect(() => { ensureFilmDemo(); }, []);
  const [scenes, setScenes] = useState<FilmScene[]>(() => filmSceneStore.get());
  const [filter, setFilter] = useState<string>('ALL');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ sceneNum: '', setting: 'INT' as FilmScene['setting'], location: '', timeOfDay: 'DAY' as FilmScene['timeOfDay'], synopsis: '', characters: '', pages: '1.0', shootDay: '1', notes: '' });
  const save = () => {
    const n: FilmScene = { id: uuid(), ...form, pages: parseFloat(form.pages) || 1, shootDay: parseInt(form.shootDay) || 1, status: 'NOT_SHOT', createdAt: Date.now() };
    const next = [...scenes, n].sort((a, b) => parseFloat(a.sceneNum) - parseFloat(b.sceneNum));
    filmSceneStore.set(next); setScenes(next); setAdding(false);
    setForm({ sceneNum: '', setting: 'INT', location: '', timeOfDay: 'DAY', synopsis: '', characters: '', pages: '1.0', shootDay: '1', notes: '' });
  };
  const toggle = (id: string, status: FilmScene['status']) => {
    const next = scenes.map(s => s.id === id ? { ...s, status } : s);
    filmSceneStore.set(next); setScenes(next);
  };
  const filtered = filter === 'ALL' ? scenes : scenes.filter(s => s.status === filter);
  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50';
  const statusColors: Record<string, string> = { NOT_SHOT: 'text-white/50 bg-white/5', SHOT: 'text-emerald-400 bg-emerald-500/10', PARTIAL: 'text-yellow-400 bg-yellow-500/10', OMIT: 'text-white/25 bg-white/5' };
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
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
                <p className="text-[9px] font-black text-white/30 uppercase">{s.setting}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-white uppercase tracking-wide mb-0.5">{s.location} — {s.timeOfDay}</p>
                <p className="text-[11px] text-white/50 leading-relaxed">{s.synopsis}</p>
                {s.characters && <p className="text-[10px] text-violet-400/70 mt-1 font-bold">{s.characters}</p>}
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

const FilmBudgetTab: React.FC = () => {
  useEffect(() => { ensureFilmDemo(); }, []);
  const [lines, setLines] = useState<FilmBudgetLine[]>(() => filmBudgetStore.get());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ department: FILM_CREW_DEPTS[0], lineItem: '', estimated: '', actual: '', notes: '' });
  const save = () => {
    const n: FilmBudgetLine = { id: uuid(), department: form.department, lineItem: form.lineItem, estimated: parseFloat(form.estimated) || 0, actual: parseFloat(form.actual) || 0, notes: form.notes, createdAt: Date.now() };
    const next = [...lines, n]; filmBudgetStore.set(next); setLines(next); setAdding(false);
    setForm({ department: FILM_CREW_DEPTS[0], lineItem: '', estimated: '', actual: '', notes: '' });
  };
  const depts = [...new Set(lines.map(l => l.department))].sort();
  const totalEst = lines.reduce((s, l) => s + l.estimated, 0);
  const totalAct = lines.reduce((s, l) => s + l.actual, 0);
  const pct = totalEst > 0 ? Math.min(100, (totalAct / totalEst) * 100) : 0;
  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50';
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="p-5 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <div><p className="text-[10px] font-black uppercase tracking-widest text-white/30">Total Budget</p><p className="text-2xl font-black text-white">{fmtCurrency(totalEst)}</p></div>
          <div className="text-right"><p className="text-[10px] font-black uppercase tracking-widest text-white/30">Actual Spent</p><p className={`text-xl font-black ${pct > 85 ? 'text-red-400' : pct > 65 ? 'text-yellow-400' : 'text-emerald-400'}`}>{fmtCurrency(totalAct)}</p></div>
        </div>
        <div className="h-2.5 bg-white/10 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-yellow-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} /></div>
        <div className="flex justify-between mt-2"><p className="text-[10px] text-white/30">{pct.toFixed(1)}% spent</p><p className="text-[10px] text-emerald-400">{fmtCurrency(totalEst - totalAct)} remaining</p></div>
      </div>
      <div className="flex justify-end">
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-400 text-xs font-black uppercase tracking-widest hover:bg-violet-500/25 transition-all"><Plus size={12} /> Add Line Item</button>
      </div>
      {adding && (
        <div className="p-5 bg-white/[0.03] border border-violet-500/20 rounded-2xl space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <select className={inputCls} value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
              {FILM_CREW_DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <input className={inputCls} placeholder="Line item description" value={form.lineItem} onChange={e => setForm(f => ({ ...f, lineItem: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} type="number" placeholder="Estimated ($)" value={form.estimated} onChange={e => setForm(f => ({ ...f, estimated: e.target.value }))} />
            <input className={inputCls} type="number" placeholder="Actual ($)" value={form.actual} onChange={e => setForm(f => ({ ...f, actual: e.target.value }))} />
          </div>
          <div className="flex gap-3">
            <button onClick={save} className="flex-1 py-2.5 rounded-xl bg-violet-500 text-white text-xs font-black uppercase tracking-widest hover:bg-violet-400 transition-all">Add</button>
            <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl bg-white/5 text-white/40 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
          </div>
        </div>
      )}
      <div className="space-y-6">
        {depts.map(dept => {
          const dLines = lines.filter(l => l.department === dept);
          const dEst = dLines.reduce((s, l) => s + l.estimated, 0);
          const dAct = dLines.reduce((s, l) => s + l.actual, 0);
          return (
            <div key={dept}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">{dept}</p>
                <div className="flex gap-4 text-[10px] font-black"><span className="text-white/30">Est {fmtCurrency(dEst)}</span><span className={dAct > dEst ? 'text-red-400' : 'text-emerald-400'}>Act {fmtCurrency(dAct)}</span></div>
              </div>
              <div className="space-y-1.5">
                {dLines.map(l => (
                  <div key={l.id} className="flex items-center gap-4 px-4 py-2.5 bg-white/[0.02] border border-white/[0.04] rounded-xl hover:border-white/10 transition-all">
                    <p className="flex-1 text-xs text-white/70">{l.lineItem}</p>
                    <p className="text-xs text-white/40 w-24 text-right">{fmtCurrency(l.estimated)}</p>
                    <p className={`text-xs w-24 text-right font-bold ${l.actual > l.estimated ? 'text-red-400' : l.actual === 0 ? 'text-white/20' : 'text-emerald-400'}`}>{l.actual > 0 ? fmtCurrency(l.actual) : '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="p-4 bg-violet-500/5 border border-violet-500/20 rounded-2xl">
        <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt: `Act as Aria, my AI Film Budget Supervisor. My production budget is ${fmtCurrency(totalEst)} with ${fmtCurrency(totalAct)} spent (${pct.toFixed(0)}%). Review these departments: ${depts.join(', ')}. Tell me: Where am I overspending? What contingency should I set? How do other indie films this size typically allocate budget? Give me 3 cost-saving strategies without compromising production quality.` } }))}
          className="flex items-center gap-2 text-violet-400 text-xs font-black uppercase tracking-widest hover:text-violet-300 transition-colors">
          <Sparkles size={11} /> Ask Aria — Budget Supervisor Mode →
        </button>
      </div>
    </motion.div>
  );
};

// ─── Film Tab: Crew ─────────────────────────────────────────────────────────

const FilmCrewTab: React.FC = () => {
  useEffect(() => { ensureFilmDemo(); }, []);
  const [crew, setCrew] = useState<FilmCrewMember[]>(() => filmCrewStore.get());
  const [adding, setAdding] = useState(false);
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [form, setForm] = useState({ name: '', role: '', department: FILM_CREW_DEPTS[0], email: '', phone: '', status: 'ACTIVE' as FilmCrewMember['status'], rate: '', notes: '' });
  const save = () => {
    const n: FilmCrewMember = { id: uuid(), ...form, createdAt: Date.now() };
    const next = [...crew, n]; filmCrewStore.set(next); setCrew(next); setAdding(false);
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
  useEffect(() => { ensureFilmDemo(); }, []);
  const [locs, setLocs] = useState<FilmLocation[]>(() => filmLocationStore.get());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'INT' as FilmLocation['type'], address: '', city: '', contactName: '', contactPhone: '', permitStatus: 'SCOUTED' as FilmLocation['permitStatus'], rentalFee: '', notes: '' });
  const save = () => {
    const n: FilmLocation = { id: uuid(), ...form, rentalFee: parseFloat(form.rentalFee) || 0, createdAt: Date.now() };
    const next = [...locs, n]; filmLocationStore.set(next); setLocs(next); setAdding(false);
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

// ─── Film Tab: Schedule ─────────────────────────────────────────────────────

const FilmScheduleTab: React.FC = () => {
  useEffect(() => { ensureFilmDemo(); }, []);
  const scenes = filmSceneStore.get();
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
          const locations = [...new Set(dayScenes.map(s => s.location))];
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
                    <span className="text-[9px] text-white/30 font-black w-16">{s.setting} · {s.timeOfDay}</span>
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
  useEffect(() => { ensureFilmDemo(); }, []);
  const [subs, setSubs] = useState<FilmFestivalSub[]>(() => filmFestivalStore.get());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ festival: '', tier: 'B' as FilmFestivalSub['tier'], deadline: '', fee: '', status: 'PLANNING' as FilmFestivalSub['status'], category: '', notes: '' });
  const save = () => {
    const n: FilmFestivalSub = { id: uuid(), ...form, deadline: form.deadline ? new Date(form.deadline).getTime() : Date.now(), fee: parseFloat(form.fee) || 0, createdAt: Date.now() };
    const next = [...subs, n]; filmFestivalStore.set(next); setSubs(next); setAdding(false);
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
  const projects = writerProjectStore.get();
  const chapters = writerChapterStore.get();
  const subs     = writerSubmissionStore.get();
  const events   = writerEventStore.get();
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
  const demoIds = new Set(['proj1', 'proj2', 'proj3']);
  const displayProjects = lorea.length ? [...loreaAsWriter, ...projects.filter(p => !demoIds.has(p.id))] : projects;
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
  const [subs, setSubs] = useState<WriterSubmission[]>(() => writerSubmissionStore.get());
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
  const [events, setEvents] = useState<WriterEvent[]>(() => writerEventStore.get());
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
  | 'overview' | 'releases' | 'payroll' | 'contracts' | 'invoices' | 'tasks' | 'vendors' | 'venues' | 'events' | 'boards' | 'promote'
  | 'film_overview' | 'film_script' | 'film_budget' | 'film_crew' | 'film_locations' | 'film_schedule' | 'film_distro'
  | 'film_hub' | 'film_callsheets' | 'film_roster' | 'film_brief' | 'film_craft'
  | 'writer_overview' | 'writer_projects' | 'writer_manuscripts' | 'writer_research' | 'writer_submissions' | 'writer_events' | 'writer_press';

type Discipline = 'music' | 'film' | 'writer';

interface Props {
  currentUser?: UserProfile | null;
}

const PM_TABS: { id: PMTab; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'overview',   label: 'Overview',    icon: <Briefcase size={13} />,  color: '#FF8C00' },
  { id: 'releases',   label: 'Releases',    icon: <Music2 size={13} />,     color: '#FF8C00' },
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
  { id: 'film_callsheets', label: 'Call Sheets',  icon: <FileText size={13} />,     color: '#a855f7' },
  { id: 'film_brief',      label: 'My Brief',     icon: <UserCheck size={13} />,    color: '#f59e0b' },
  { id: 'film_roster',     label: 'Roster',       icon: <Users size={13} />,        color: '#a855f7' },
  { id: 'film_craft',      label: 'Craft',        icon: <Utensils size={13} />,     color: '#14b8a6' },
  { id: 'film_script',     label: 'Script',       icon: <Clapperboard size={13} />, color: '#a855f7' },
  { id: 'film_budget',     label: 'Budget',       icon: <DollarSign size={13} />,   color: '#10b981' },
  { id: 'film_crew',       label: 'Crew',         icon: <Users size={13} />,        color: '#a855f7' },
  { id: 'film_schedule',   label: 'Schedule',     icon: <Calendar size={13} />,     color: '#3b82f6' },
  { id: 'film_locations',  label: 'Locations',    icon: <MapPin size={13} />,       color: '#ef4444' },
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
  const [activeTab, setActiveTab] = useState<PMTab>('overview');

  const switchDiscipline = (d: Discipline) => {
    setDiscipline(d);
    localStorage.setItem('plajah_pm_discipline_v1', d);
    const firstTab = d === 'music' ? 'overview' : d === 'film' ? 'film_overview' : 'writer_overview';
    setActiveTab(firstTab);
  };

  const activeTabs = discipline === 'music' ? PM_TABS : discipline === 'film' ? FILM_TABS : WRITER_TABS;
  const disciplineConfig = DISCIPLINES.find(d => d.id === discipline)!;

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':            return <OverviewTab onSwitchTab={setActiveTab} />;
      case 'releases':            return <MusicReleasesTab currentUser={currentUser} />;
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
      case 'film_callsheets':     return <CallSheetsTab />;
      case 'film_brief':          return <DailyBriefTab />;
      case 'film_roster':         return <RosterTab />;
      case 'film_craft':          return <CraftServicesTab />;
      case 'film_script':         return <FilmScriptTab />;
      case 'film_budget':         return <FilmBudgetTab />;
      case 'film_crew':           return <FilmCrewTab />;
      case 'film_locations':      return <FilmLocationsTab />;
      case 'film_schedule':       return <FilmScheduleTab />;
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
            <FilmProductionProvider currentUser={currentUser} onGoTab={setActiveTab}>
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
