import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Plus, Trash2, Edit, X, Check, DollarSign,
  Calendar, ChevronRight, AlertCircle, CheckCircle2, Clock, Trophy,
  BarChart3, FileText, ExternalLink,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type GrantStatus = 'DRAFTING' | 'SUBMITTED' | 'UNDER_REVIEW' | 'AWARDED' | 'REJECTED' | 'WITHDRAWN';

export interface Grant {
  id: string;
  title: string;
  funder: string;
  programName?: string;
  amountRequestedCents: number;
  amountAwardedCents?: number;
  status: GrantStatus;
  deadline?: number;
  submittedAt?: number;
  decisionAt?: number;
  discipline?: string;
  description?: string;
  portalUrl?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const uid_short = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const fmtMoney = (cents: number) => cents >= 100000
  ? `$${(cents / 100000).toFixed(1)}K`
  : cents >= 100 ? `$${(cents / 100).toLocaleString()}` : '$0';
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const daysUntil = (ts: number) => Math.ceil((ts - Date.now()) / 86400000);

const STATUS_META: Record<GrantStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  DRAFTING:     { label: 'Drafting',      color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', icon: FileText },
  SUBMITTED:    { label: 'Submitted',     color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  icon: Check },
  UNDER_REVIEW: { label: 'Under Review',  color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', icon: Clock },
  AWARDED:      { label: 'Awarded ✓',     color: '#34d399', bg: 'rgba(52,211,153,0.1)', icon: Trophy },
  REJECTED:     { label: 'Rejected',      color: '#f87171', bg: 'rgba(248,113,113,0.1)',icon: X },
  WITHDRAWN:    { label: 'Withdrawn',     color: '#94a3b8', bg: 'rgba(148,163,184,0.08)',icon: X },
};

const STATUS_ORDER: GrantStatus[] = ['DRAFTING', 'SUBMITTED', 'UNDER_REVIEW', 'AWARDED', 'REJECTED'];

// ── Grant Form ────────────────────────────────────────────────────────────────

const GrantForm: React.FC<{
  initial?: Partial<Grant>;
  onSave: (g: Grant) => void;
  onCancel: () => void;
}> = ({ initial, onSave, onCancel }) => {
  const [form, setForm] = useState<Partial<Grant>>(initial ?? { status: 'DRAFTING', amountRequestedCents: 0 });
  const upd = (p: Partial<Grant>) => setForm(f => ({ ...f, ...p }));

  const handleSave = () => {
    if (!form.title || !form.funder) return;
    onSave({
      id: uid_short(), createdAt: Date.now(), updatedAt: Date.now(),
      status: 'DRAFTING', amountRequestedCents: 0,
      ...form,
    } as Grant);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <motion.div initial={{ scale: 0.92 }} animate={{ scale: 1 }}
        className="bg-[#0d0d0d] border border-white/10 rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <h3 className="font-black text-white text-base">{initial?.id ? 'Edit Grant' : 'New Grant'}</h3>
          <button onClick={onCancel}><X size={16} className="text-white/30 hover:text-white" /></button>
        </div>
        <div className="p-6 space-y-4">
          {[
            { key: 'title', label: 'Grant / Project Title', placeholder: 'Neural plasticity in adult brains under stress', required: true },
            { key: 'funder', label: 'Funding Body', placeholder: 'NIH, NSF, ERC, Wellcome Trust…', required: true },
            { key: 'programName', label: 'Program / Mechanism', placeholder: 'R01, CAREER, ERC-CoG…' },
            { key: 'portalUrl', label: 'Application Portal URL' },
          ].map(({ key, label, placeholder, required }) => (
            <div key={key}>
              <label className="block text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">{label}{required ? ' *' : ''}</label>
              <input value={(form as any)[key] ?? ''} onChange={e => upd({ [key]: e.target.value })} placeholder={placeholder}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none" />
            </div>
          ))}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">Amount Requested</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-white/30">$</span>
                <input type="number" value={form.amountRequestedCents ? form.amountRequestedCents / 100 : ''} onChange={e => upd({ amountRequestedCents: Math.round(+e.target.value * 100) })}
                  placeholder="500000" className="w-full pl-6 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">Status</label>
              <select value={form.status ?? 'DRAFTING'} onChange={e => upd({ status: e.target.value as GrantStatus })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none cursor-pointer">
                {STATUS_ORDER.map(s => <option key={s} value={s} className="bg-[#0d0d0d]">{STATUS_META[s].label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">Deadline</label>
              <input type="date" value={form.deadline ? new Date(form.deadline).toISOString().split('T')[0] : ''} onChange={e => upd({ deadline: e.target.value ? new Date(e.target.value).getTime() : undefined })}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none" />
            </div>
            <div>
              <label className="block text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">Discipline</label>
              <input value={form.discipline ?? ''} onChange={e => upd({ discipline: e.target.value })} placeholder="Neuroscience, Physics…"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">Notes</label>
            <textarea value={form.notes ?? ''} onChange={e => upd({ notes: e.target.value })} rows={3}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none resize-none" />
          </div>

          <button onClick={handleSave} disabled={!form.title || !form.funder}
            className="w-full py-3 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl text-xs font-black uppercase disabled:opacity-40">
            {initial?.id ? 'Save Changes' : 'Add Grant'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Grant Card ────────────────────────────────────────────────────────────────

const GrantCard: React.FC<{
  grant: Grant;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: GrantStatus) => void;
}> = ({ grant, onEdit, onDelete, onStatusChange }) => {
  const meta = STATUS_META[grant.status];
  const StatusIcon = meta.icon as any;
  const deadline = grant.deadline ? daysUntil(grant.deadline) : null;
  const isUrgent = deadline !== null && deadline <= 7 && deadline >= 0;
  const isPast = deadline !== null && deadline < 0;

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="p-4 bg-white/[0.04] border border-white/8 rounded-2xl hover:border-white/14 transition-all">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
            {isUrgent && <span className="px-2 py-0.5 bg-red-500/15 text-red-400 rounded-full text-[7px] font-black uppercase">Due in {deadline}d</span>}
            {isPast && !['AWARDED', 'REJECTED', 'WITHDRAWN'].includes(grant.status) && <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-[7px] font-black uppercase">Overdue</span>}
          </div>
          <p className="text-sm font-bold text-white leading-snug">{grant.title}</p>
          <p className="text-[9px] text-white/40 mt-0.5">{grant.funder}{grant.programName ? ` · ${grant.programName}` : ''}</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {grant.portalUrl && <a href={grant.portalUrl} target="_blank" rel="noreferrer" className="p-1.5 bg-white/5 border border-white/8 rounded-lg text-white/25 hover:text-white transition-all"><ExternalLink size={11} /></a>}
          <button onClick={onEdit} className="p-1.5 bg-white/5 border border-white/8 rounded-lg text-white/25 hover:text-white transition-all"><Edit size={11} /></button>
          <button onClick={onDelete} className="p-1.5 bg-white/5 border border-white/8 rounded-lg text-white/15 hover:text-red-400 transition-all"><Trash2 size={11} /></button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[9px] flex-wrap mb-3">
        <span className="flex items-center gap-1 text-white/50"><DollarSign size={10} />
          {fmtMoney(grant.amountRequestedCents)} requested
          {grant.amountAwardedCents ? <span className="text-[#34d399] ml-1">· {fmtMoney(grant.amountAwardedCents)} awarded</span> : null}
        </span>
        {grant.deadline && <span className={`flex items-center gap-1 ${isUrgent ? 'text-red-400' : isPast ? 'text-red-500' : 'text-white/40'}`}><Calendar size={10} />{fmtDate(grant.deadline)}</span>}
        {grant.discipline && <span className="text-white/30">{grant.discipline}</span>}
      </div>

      {grant.notes && <p className="text-[9px] text-white/30 leading-relaxed mb-3 line-clamp-2">{grant.notes}</p>}

      {/* Status pipeline */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        {STATUS_ORDER.slice(0, 4).map((s, i) => {
          const m = STATUS_META[s];
          const isActive = grant.status === s;
          const isPrev = STATUS_ORDER.indexOf(grant.status) > i;
          return (
            <React.Fragment key={s}>
              <button onClick={() => onStatusChange(s)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[7px] font-black uppercase tracking-widest whitespace-nowrap transition-all shrink-0 ${isActive ? 'text-black' : isPrev ? 'text-white/50' : 'text-white/20 hover:text-white/40'}`}
                style={isActive ? { background: m.color } : isPrev ? { background: `${m.color}18` } : {}}>
                {s === 'AWARDED' ? '🏆' : s === 'SUBMITTED' ? '✓' : s === 'UNDER_REVIEW' ? '⏳' : '✎'} {m.label}
              </button>
              {i < 3 && <ChevronRight size={8} className="text-white/10 shrink-0" />}
            </React.Fragment>
          );
        })}
      </div>
    </motion.div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

interface Props { currentUser: any; onBack: () => void; }

const LabsGrantTracker: React.FC<Props> = ({ currentUser, onBack }) => {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingGrant, setEditingGrant] = useState<Grant | null>(null);
  const [filterStatus, setFilterStatus] = useState<GrantStatus | 'ALL'>('ALL');

  const sKey = `labsGrants_${currentUser?.uid ?? 'guest'}`;
  useEffect(() => { try { const s = localStorage.getItem(sKey); if (s) setGrants(JSON.parse(s)); } catch {} }, [sKey]);
  const save = (updated: Grant[]) => { setGrants(updated); localStorage.setItem(sKey, JSON.stringify(updated)); };

  const handleSave = (grant: Grant) => {
    save(grants.some(g => g.id === grant.id) ? grants.map(g => g.id === grant.id ? grant : g) : [grant, ...grants]);
    setShowForm(false); setEditingGrant(null);
  };

  const handleDelete = (id: string) => save(grants.filter(g => g.id !== id));
  const handleStatus = (id: string, status: GrantStatus) => save(grants.map(g => g.id === id ? { ...g, status, updatedAt: Date.now() } : g));

  const filtered = grants.filter(g => filterStatus === 'ALL' || g.status === filterStatus);
  const totalRequested = grants.reduce((s, g) => s + g.amountRequestedCents, 0);
  const totalAwarded = grants.filter(g => g.status === 'AWARDED').reduce((s, g) => s + (g.amountAwardedCents ?? g.amountRequestedCents), 0);
  const pending = grants.filter(g => ['SUBMITTED', 'UNDER_REVIEW'].includes(g.status)).length;
  const upcoming = grants.filter(g => g.deadline && daysUntil(g.deadline) <= 14 && daysUntil(g.deadline) >= 0).sort((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0));

  return (
    <div className="min-h-screen text-white">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/8">
        <button onClick={onBack} className="text-white/30 hover:text-white transition-colors"><ArrowLeft size={16} /></button>
        <div className="flex-1">
          <div className="flex items-center gap-2"><Trophy size={15} className="text-[#fbbf24]" /><h1 className="font-black text-white text-sm">Grant Tracker</h1></div>
          <p className="text-[8px] text-white/25 uppercase tracking-widest mt-0.5">{grants.length} grants · Museion</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl text-xs font-black uppercase">
          <Plus size={12} /> New Grant
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Summary */}
        {grants.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Applied', value: fmtMoney(totalRequested), color: '#a78bfa' },
              { label: 'Awarded', value: fmtMoney(totalAwarded), color: '#34d399' },
              { label: 'Pending Decision', value: pending, color: '#fbbf24' },
              { label: 'Success Rate', value: grants.length ? `${Math.round((grants.filter(g => g.status === 'AWARDED').length / grants.length) * 100)}%` : '—', color: '#60a5fa' },
            ].map(s => (
              <div key={s.label} className="p-4 bg-white/[0.04] border border-white/8 rounded-2xl">
                <p className="text-[8px] uppercase tracking-widest text-white/25 mb-1">{s.label}</p>
                <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming deadlines */}
        {upcoming.length > 0 && (
          <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-2xl">
            <p className="text-[8px] font-black uppercase tracking-widest text-red-400 mb-3 flex items-center gap-1.5"><AlertCircle size={11} /> Upcoming Deadlines (14 days)</p>
            <div className="space-y-2">
              {upcoming.map(g => {
                const d = daysUntil(g.deadline!);
                return (
                  <div key={g.id} className="flex items-center gap-3">
                    <span className={`text-sm font-black w-10 text-right ${d <= 3 ? 'text-red-400' : 'text-[#fbbf24]'}`}>{d}d</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{g.title}</p>
                      <p className="text-[8px] text-white/40">{g.funder} · {fmtDate(g.deadline!)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filter tabs */}
        {grants.length > 0 && (
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {(['ALL', ...STATUS_ORDER] as (GrantStatus | 'ALL')[]).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest whitespace-nowrap shrink-0 transition-all ${filterStatus === s ? 'bg-white text-black' : 'bg-white/5 text-white/30 hover:text-white'}`}>
                {s === 'ALL' ? `All (${grants.length})` : `${STATUS_META[s].label} (${grants.filter(g => g.status === s).length})`}
              </button>
            ))}
          </div>
        )}

        {/* Grant list */}
        <div className="space-y-3">
          {filtered.map(g => (
            <GrantCard key={g.id} grant={g} onEdit={() => { setEditingGrant(g); setShowForm(true); }} onDelete={() => handleDelete(g.id)} onStatusChange={s => handleStatus(g.id, s)} />
          ))}
          {filtered.length === 0 && grants.length === 0 && (
            <div className="py-16 text-center">
              <Trophy size={32} className="text-white/10 mx-auto mb-3" />
              <p className="text-sm text-white/30">No grants tracked yet</p>
              <p className="text-[10px] text-white/15 mt-1">Add your first grant application to start tracking deadlines and funding</p>
              <button onClick={() => setShowForm(true)} className="mt-4 px-4 py-2 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl text-xs font-black uppercase">Add Grant</button>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {(showForm || editingGrant) && (
          <GrantForm initial={editingGrant ?? undefined} onSave={handleSave} onCancel={() => { setShowForm(false); setEditingGrant(null); }} />
        )}
      </AnimatePresence>
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
    </div>
  );
};

export default LabsGrantTracker;
