import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  List, Users, DollarSign, FileText, Megaphone, Plus, Trash2,
  Check, Clock, AlertCircle, ChevronDown, ChevronUp, X, Edit,
  ArrowLeft, Brain, Send, RefreshCw, Download, ExternalLink,
  Ticket, Music2, Film, BookOpen, Gamepad2, Sparkles, Package,
  Calendar, MapPin, BarChart3, Copy, CheckCircle2, Circle,
  Printer, CreditCard, Banknote, Receipt,
} from 'lucide-react';
import {
  EVENT_TASK_TEMPLATES, VENDOR_CATEGORIES, BUDGET_TEMPLATES,
  CONTRACT_TEMPLATES, EVENT_TYPE_META, buildIntroLetterPrompt,
  buildMuseEventContextPrompt,
} from '../services/eventProductionTemplates';
import { UserProfile, EventProductionProject, EventTask, EventVendor, EventBudgetItem, EventProductionType, ContractType } from '../types';

interface Props {
  currentUser: UserProfile;
  onBack: () => void;
}

type Tab = 'checklist' | 'vendors' | 'budget' | 'contracts' | 'marketing' | 'payroll';

const fmtMoney = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const uid_short = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;

const PRIORITY_COLORS: Record<string, string> = { LOW: '#94a3b8', MEDIUM: '#fbbf24', HIGH: '#fb923c', URGENT: '#f87171' };
const STATUS_COLORS: Record<string, string> = { TODO: '#94a3b8', IN_PROGRESS: '#60a5fa', DONE: '#34d399', BLOCKED: '#f87171' };
const VENDOR_STATUS_LABELS: Record<string, string> = { PROSPECTING: 'Prospecting', CONTACTED: 'Contacted', NEGOTIATING: 'Negotiating', CONTRACTED: 'Contracted ✓', PAID: 'Paid ✓', CANCELLED: 'Cancelled' };

// ── New Project Picker ────────────────────────────────────────────────────────

const NewProjectPicker: React.FC<{ onCreate: (type: EventProductionType, title: string, budgetCents: number, eventDate?: number) => void }> = ({ onCreate }) => {
  const [type, setType] = useState<EventProductionType | null>(null);
  const [title, setTitle] = useState('');
  const [budget, setBudget] = useState('');
  const [eventDate, setEventDate] = useState('');

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <h2 className="text-2xl font-black uppercase tracking-tight text-white mb-2">New Event Project</h2>
      <p className="text-sm text-white/40 mb-8">Choose your event type and we'll build a full production checklist, vendor list, and budget template — with Aria AI to guide you every step of the way.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {(Object.keys(EVENT_TYPE_META) as EventProductionType[]).map(t => {
          const meta = EVENT_TYPE_META[t];
          return (
            <button key={t} onClick={() => setType(t)} className={`p-4 rounded-2xl border text-left transition-all ${type === t ? 'border-opacity-100' : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.05]'}`} style={type === t ? { borderColor: `${meta.color}60`, background: `${meta.color}12` } : {}}>
              <div className="text-2xl mb-2">{meta.emoji}</div>
              <p className="text-xs font-black text-white leading-tight">{meta.label}</p>
              <p className="text-[9px] text-white/30 mt-1">{meta.desc}</p>
            </button>
          );
        })}
      </div>

      {type && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div>
            <label className="blk-label">Event Name</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder={`e.g. ${EVENT_TYPE_META[type].emoji} My Big Show`} className="blk-input" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="blk-label">Event Date</label>
              <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className="blk-input" />
            </div>
            <div>
              <label className="blk-label">Total Budget (USD)</label>
              <div className="relative"><span className="absolute left-3 top-2.5 text-white/30">$</span><input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="5000" className="blk-input pl-6" /></div>
            </div>
          </div>
          <button onClick={() => { if (!title.trim()) return; onCreate(type, title, Math.round(parseFloat(budget||'0') * 100), eventDate ? new Date(eventDate).getTime() : undefined); }} disabled={!title.trim()} className="w-full py-4 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
            <Sparkles size={15} /> Create Event Project + Build Checklist
          </button>
        </motion.div>
      )}

      <style>{`.blk-label{display:block;font-size:9px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:6px}.blk-input{width:100%;padding:10px 14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;font-size:13px;color:white;outline:none}.blk-input:focus{border-color:rgba(255,255,255,0.25)}.blk-input::placeholder{color:rgba(255,255,255,0.2)}`}</style>
    </div>
  );
};

// ── Aria AI Chat Panel ────────────────────────────────────────────────────────

const MusePanel: React.FC<{ project: EventProductionProject; onUpdateHistory: (history: any[]) => void }> = ({ project, onUpdateHistory }) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const history = project.museChatHistory ?? [];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [history.length]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user' as const, content: input, timestamp: Date.now() };
    const newHistory = [...history, userMsg];
    onUpdateHistory(newHistory);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/muse/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: buildMuseEventContextPrompt(project), question: input, history: history.slice(-10) }),
      });
      const data = await res.json();
      onUpdateHistory([...newHistory, { role: 'assistant' as const, content: data.answer || 'I couldn\'t get a response right now. Try again.', timestamp: Date.now() }]);
    } catch {
      onUpdateHistory([...newHistory, { role: 'assistant' as const, content: 'Network error — check your connection.', timestamp: Date.now() }]);
    } finally { setLoading(false); }
  };

  const QUICK_PROMPTS = [
    `Find me ${project.type === 'CONCERT' ? 'sound companies' : 'vendors'} in my area`,
    'Draft an intro email to the venue',
    'What should I prioritize this week?',
    'Review my budget and suggest cuts',
  ];

  return (
    <div className="flex flex-col h-full bg-[#080808] border-l border-white/8">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8 shrink-0">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#6B0099] to-[#D40055] flex items-center justify-center">
          <Brain size={13} className="text-white" />
        </div>
        <div>
          <p className="text-xs font-black text-white">Aria AI</p>
          <p className="text-[8px] text-white/30 uppercase tracking-widest">Event planning assistant</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {history.length === 0 && (
          <div className="space-y-2 mt-2">
            <p className="text-[10px] text-white/30 text-center">Ask Aria anything about your event</p>
            {QUICK_PROMPTS.map(p => (
              <button key={p} onClick={() => { setInput(p); }} className="w-full text-left px-3 py-2 bg-white/[0.04] border border-white/8 rounded-xl text-[10px] text-white/50 hover:text-white hover:border-white/20 transition-all">{p}</button>
            ))}
          </div>
        )}
        {history.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#6B0099] to-[#D40055] flex items-center justify-center shrink-0 mt-0.5"><Brain size={10} className="text-white" /></div>}
            <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${msg.role === 'user' ? 'bg-[#6B0099]/30 text-white' : 'bg-white/[0.06] text-white/80'}`}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && <div className="flex gap-2"><div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#6B0099] to-[#D40055] flex items-center justify-center"><Brain size={10} className="text-white" /></div><div className="px-3 py-2 bg-white/[0.06] rounded-2xl"><RefreshCw size={12} className="text-white/30 animate-spin" /></div></div>}
        <div ref={endRef} />
      </div>

      <div className="p-3 border-t border-white/8 shrink-0">
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())} placeholder="Ask Muse…" className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-white/20" />
          <button onClick={send} disabled={loading || !input.trim()} className="px-3 py-2 bg-gradient-to-r from-[#6B0099] to-[#D40055] rounded-xl disabled:opacity-40"><Send size={13} className="text-white" /></button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const EventProductionManager: React.FC<Props> = ({ currentUser, onBack }) => {
  const [projects, setProjects]   = useState<EventProductionProject[]>([]);
  const [activeProject, setActiveProject] = useState<EventProductionProject | null>(null);
  const [tab, setTab]             = useState<Tab>('checklist');
  const [showMuse, setShowMuse]   = useState(true);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [addVendorOpen, setAddVendorOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<EventVendor | null>(null);
  const [contractView, setContractView] = useState<string | null>(null);
  const [introLoading, setIntroLoading] = useState<string | null>(null);

  // Persist to localStorage for now (Firestore sync via backendService)
  const storageKey = `eventProduction_${currentUser.uid}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setProjects(JSON.parse(saved));
    } catch {}
  }, [storageKey]);

  const save = (updated: EventProductionProject[]) => {
    setProjects(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const updateProject = (p: EventProductionProject) => {
    const updated = projects.map(x => x.id === p.id ? p : x);
    setActiveProject(p);
    save(updated);
  };

  const createProject = (type: EventProductionType, title: string, totalBudgetCents: number, eventDate?: number) => {
    const templateTasks = EVENT_TASK_TEMPLATES[type] ?? [];
    const budgetTemplates = BUDGET_TEMPLATES[type] ?? [];
    const tasks: EventTask[] = templateTasks.map(t => ({
      id: uid_short(), title: t.title, description: t.description, status: 'TODO', category: t.category,
      priority: t.priority, isAiSuggested: false,
      dueDate: eventDate ? eventDate - t.weeksBefore * 7 * 24 * 3600 * 1000 : undefined,
    }));
    const budgetItems: EventBudgetItem[] = budgetTemplates.map(b => ({
      id: uid_short(), category: b.category, label: b.label,
      estimatedCents: Math.round(totalBudgetCents * b.estimatedPct / 100),
      isPaid: false, notes: b.notes,
    }));
    const project: EventProductionProject = {
      id: uid_short(), creatorUid: currentUser.uid, title, type, eventDate,
      status: 'PLANNING', tasks, vendors: [], budgetItems, totalBudgetCents,
      isFreeEvent: projects.length === 0, museChatHistory: [], createdAt: Date.now(), updatedAt: Date.now(),
    };
    const updated = [...projects, project];
    save(updated);
    setActiveProject(project);
  };

  const updateTask = (taskId: string, patch: Partial<EventTask>) => {
    if (!activeProject) return;
    const tasks = activeProject.tasks.map(t => t.id === taskId ? { ...t, ...patch, completedAt: patch.status === 'DONE' ? Date.now() : t.completedAt } : t);
    updateProject({ ...activeProject, tasks, updatedAt: Date.now() });
  };

  const addTask = (title: string, category: string, priority: EventTask['priority']) => {
    if (!activeProject || !title.trim()) return;
    const task: EventTask = { id: uid_short(), title, category, priority, status: 'TODO', isAiSuggested: false };
    updateProject({ ...activeProject, tasks: [...activeProject.tasks, task], updatedAt: Date.now() });
  };

  const deleteTask = (taskId: string) => { if (!activeProject) return; updateProject({ ...activeProject, tasks: activeProject.tasks.filter(t => t.id !== taskId), updatedAt: Date.now() }); };

  const saveVendor = (vendor: EventVendor) => {
    if (!activeProject) return;
    const exists = activeProject.vendors.find(v => v.id === vendor.id);
    const vendors = exists ? activeProject.vendors.map(v => v.id === vendor.id ? vendor : v) : [...activeProject.vendors, vendor];
    updateProject({ ...activeProject, vendors, updatedAt: Date.now() });
    setEditingVendor(null);
    setAddVendorOpen(false);
  };

  const generateIntroLetter = async (vendor: EventVendor) => {
    if (!activeProject) return;
    setIntroLoading(vendor.id);
    try {
      const prompt = buildIntroLetterPrompt(activeProject.title, activeProject.eventDate ? new Date(activeProject.eventDate).toLocaleDateString() : 'TBD', activeProject.venue || 'TBD', vendor.type, currentUser.displayName);
      const res = await fetch('/api/muse/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context: 'You are Aria, Plajah\'s AI writing assistant.', question: prompt, history: [] }) });
      const data = await res.json();
      const updated = { ...vendor, introLetterDraft: data.answer || '' };
      saveVendor(updated);
    } catch {} finally { setIntroLoading(null); }
  };

  const updateBudgetItem = (id: string, patch: Partial<EventBudgetItem>) => {
    if (!activeProject) return;
    const budgetItems = activeProject.budgetItems.map(b => b.id === id ? { ...b, ...patch } : b);
    updateProject({ ...activeProject, budgetItems, updatedAt: Date.now() });
  };

  if (!activeProject && projects.length === 0) {
    return (
      <div className="min-h-screen text-white">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/8">
          <button onClick={onBack} className="text-white/30 hover:text-white"><ArrowLeft size={18} /></button>
          <h1 className="font-black text-white">Event Production Manager</h1>
        </div>
        <NewProjectPicker onCreate={createProject} />
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className="min-h-screen text-white p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="flex items-center gap-2 text-white/30 hover:text-white text-sm"><ArrowLeft size={16} /> Back</button>
          <button onClick={() => setActiveProject(null)} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6B0099] to-[#D40055] rounded-xl text-xs font-black uppercase text-white"><Plus size={13} /> New Event</button>
        </div>
        <h1 className="text-2xl font-black text-white mb-6">Event Projects</h1>
        <div className="grid gap-3">
          {projects.map(p => {
            const meta = EVENT_TYPE_META[p.type];
            const done = p.tasks.filter(t => t.status === 'DONE').length;
            return (
              <button key={p.id} onClick={() => setActiveProject(p)} className="p-5 bg-white/[0.04] border border-white/8 rounded-2xl text-left hover:border-white/18 hover:bg-white/[0.06] transition-all">
                <div className="flex items-start gap-4">
                  <div className="text-3xl shrink-0">{meta.emoji}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-black text-white">{p.title}</p>
                      {p.isFreeEvent && <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#34d399]/15 text-[#34d399] font-black uppercase">Free Event</span>}
                    </div>
                    <p className="text-[10px] text-white/40">{meta.label} · {p.eventDate ? new Date(p.eventDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date TBD'}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] text-white/30">{done}/{p.tasks.length} tasks</span>
                      <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden max-w-32"><div className="h-full bg-[#34d399] rounded-full" style={{ width: `${p.tasks.length ? (done / p.tasks.length) * 100 : 0}%` }} /></div>
                    </div>
                  </div>
                  <ChevronDown size={16} className="text-white/20 -rotate-90 shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Active project view ───────────────────────────────────────────────────
  const p = activeProject;
  const meta = EVENT_TYPE_META[p.type];
  const tasksByCategory = p.tasks.reduce<Record<string, EventTask[]>>((acc, t) => { if (!acc[t.category]) acc[t.category] = []; acc[t.category].push(t); return acc; }, {});
  const totalEstimated = p.budgetItems.reduce((s, b) => s + b.estimatedCents, 0);
  const totalActual = p.budgetItems.reduce((s, b) => s + (b.actualCents ?? b.estimatedCents), 0);
  const vendorCategories = VENDOR_CATEGORIES[p.type] ?? [];

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'checklist',  label: 'Checklist',  icon: List },
    { key: 'vendors',    label: 'Vendors',    icon: Users },
    { key: 'budget',     label: 'Budget',     icon: DollarSign },
    { key: 'payroll',    label: 'Payroll',    icon: Banknote },
    { key: 'contracts',  label: 'Contracts',  icon: FileText },
    { key: 'marketing',  label: 'Marketing',  icon: Megaphone },
  ];

  return (
    <div className="min-h-screen text-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8 shrink-0">
        <button onClick={() => setActiveProject(null)} className="text-white/30 hover:text-white"><ArrowLeft size={16} /></button>
        <span className="text-xl">{meta.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="font-black text-white text-sm truncate">{p.title}</p>
          <p className="text-[9px] text-white/30 uppercase tracking-widest">{meta.label} · {p.tasks.filter(t => t.status === 'DONE').length}/{p.tasks.length} tasks done</p>
        </div>
        <button onClick={() => setShowMuse(v => !v)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase transition-all ${showMuse ? 'bg-[#6B0099]/20 border-[#6B0099]/40 text-[#c084fc]' : 'bg-white/5 border-white/10 text-white/40'}`}>
          <Brain size={12} /> Aria
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 py-2 border-b border-white/8 overflow-x-auto shrink-0">
        {TABS.map(t => { const Icon = t.icon as any; return (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all shrink-0 ${tab === t.key ? 'bg-white text-black' : 'text-white/30 hover:text-white'}`}>
            <Icon size={11} />{t.label}
          </button>
        );})}
      </div>

      {/* Body: content + Aria panel */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto">

          {/* ── CHECKLIST ── */}
          {tab === 'checklist' && (
            <div className="p-4 space-y-6">
              {Object.entries(tasksByCategory).map(([cat, tasks]) => (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/40">{cat}</p>
                    <span className="text-[9px] text-white/25">{tasks.filter(t => t.status === 'DONE').length}/{tasks.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {tasks.map(task => (
                      <div key={task.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${task.status === 'DONE' ? 'border-white/5 bg-white/[0.02] opacity-60' : 'border-white/8 bg-white/[0.03]'}`}>
                        <button onClick={() => updateTask(task.id, { status: task.status === 'DONE' ? 'TODO' : 'DONE' })} className="shrink-0 mt-0.5">
                          {task.status === 'DONE' ? <CheckCircle2 size={16} className="text-[#34d399]" /> : task.status === 'IN_PROGRESS' ? <RefreshCw size={16} className="text-[#60a5fa]" /> : task.status === 'BLOCKED' ? <AlertCircle size={16} className="text-[#f87171]" /> : <Circle size={16} className="text-white/20" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${task.status === 'DONE' ? 'line-through text-white/30' : 'text-white'}`}>{task.title}</p>
                          {task.description && <p className="text-[10px] text-white/30 mt-0.5 leading-relaxed">{task.description}</p>}
                          {task.dueDate && <p className="text-[9px] text-white/25 mt-1 flex items-center gap-1"><Calendar size={9} />{new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: PRIORITY_COLORS[task.priority] }} />
                          <select value={task.status} onChange={e => updateTask(task.id, { status: e.target.value as EventTask['status'] })} className="text-[9px] bg-transparent text-white/30 focus:outline-none cursor-pointer">
                            {['TODO','IN_PROGRESS','DONE','BLOCKED'].map(s => <option key={s} value={s} className="bg-[#0d0d0d]">{s.replace('_',' ')}</option>)}
                          </select>
                          <button onClick={() => deleteTask(task.id)} className="text-white/15 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {/* Add custom task */}
              {addTaskOpen ? (
                <AddTaskForm onAdd={(title, cat, priority) => { addTask(title, cat, priority); setAddTaskOpen(false); }} onCancel={() => setAddTaskOpen(false)} />
              ) : (
                <button onClick={() => setAddTaskOpen(true)} className="w-full py-3 border border-dashed border-white/15 rounded-xl text-[10px] font-black uppercase text-white/30 hover:border-white/30 hover:text-white/60 transition-all flex items-center justify-center gap-2">
                  <Plus size={12} /> Add Custom Task
                </button>
              )}
            </div>
          )}

          {/* ── VENDORS ── */}
          {tab === 'vendors' && (
            <div className="p-4 space-y-6">
              {/* Suggested vendors */}
              {vendorCategories.length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Suggested Vendor Categories for {meta.label}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                    {vendorCategories.map(vc => {
                      const hasVendor = p.vendors.some(v => v.type === vc.type && v.status !== 'CANCELLED');
                      return (
                        <div key={vc.type} className={`p-3 border rounded-xl flex items-start gap-3 ${hasVendor ? 'border-[#34d399]/25 bg-[#34d399]/5' : 'border-white/8 bg-white/[0.02]'}`}>
                          <span className="text-xl shrink-0">{vc.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-black text-white">{vc.label}</p>
                              {vc.mustHave && <span className="text-[8px] px-1.5 py-0.5 bg-red-500/15 text-red-400 rounded-full font-black uppercase">Must Have</span>}
                              {hasVendor && <Check size={11} className="text-[#34d399]" />}
                            </div>
                            <p className="text-[9px] text-white/30 mt-0.5">{vc.avgCostRange}</p>
                            <p className="text-[9px] text-[#a78bfa]/60 mt-1">{vc.searchHint}</p>
                          </div>
                          {!hasVendor && <button onClick={() => setEditingVendor({ id: uid_short(), name: '', type: vc.type, status: 'PROSPECTING', contractSigned: false, createdAt: Date.now() })} className="px-2.5 py-1 text-[9px] font-black uppercase bg-white/8 rounded-lg text-white/50 hover:text-white transition-all shrink-0">Add</button>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Added vendors */}
              {p.vendors.length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Your Vendors ({p.vendors.length})</p>
                  <div className="space-y-2">
                    {p.vendors.map(vendor => (
                      <div key={vendor.id} className="p-4 bg-white/[0.04] border border-white/8 rounded-2xl">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <p className="font-black text-white text-sm">{vendor.name || `[${vendor.type}]`}</p>
                              <span className="text-[8px] px-2 py-0.5 rounded-full font-black uppercase" style={{ background: vendor.status === 'CONTRACTED' || vendor.status === 'PAID' ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.06)', color: vendor.status === 'CONTRACTED' || vendor.status === 'PAID' ? '#34d399' : '#94a3b8' }}>{VENDOR_STATUS_LABELS[vendor.status]}</span>
                              {vendor.contractSigned && <span className="text-[8px] px-2 py-0.5 rounded-full bg-[#60a5fa]/12 text-[#60a5fa] font-black uppercase">Contract Signed</span>}
                            </div>
                            {vendor.email && <p className="text-[10px] text-white/30">{vendor.email}</p>}
                            {vendor.quoteCents && <p className="text-[10px] text-white/50 mt-1">Quote: {fmtMoney(vendor.quoteCents)}{vendor.finalCents ? ` → Final: ${fmtMoney(vendor.finalCents)}` : ''}</p>}
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <button onClick={() => generateIntroLetter(vendor)} disabled={!!introLoading} className="px-2.5 py-1.5 bg-[#6B0099]/15 border border-[#6B0099]/30 rounded-lg text-[9px] font-black uppercase text-[#c084fc] hover:brightness-125 transition-all flex items-center gap-1">
                              {introLoading === vendor.id ? <RefreshCw size={9} className="animate-spin" /> : <Brain size={9} />} AI Intro
                            </button>
                            <button onClick={() => setEditingVendor(vendor)} className="p-1.5 text-white/20 hover:text-white transition-colors"><Edit size={13} /></button>
                            <button onClick={() => updateProject({ ...p, vendors: p.vendors.filter(v => v.id !== vendor.id), updatedAt: Date.now() })} className="p-1.5 text-white/20 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                          </div>
                        </div>
                        {vendor.introLetterDraft && (
                          <div className="mt-3 p-3 bg-[#6B0099]/8 border border-[#6B0099]/20 rounded-xl">
                            <p className="text-[9px] font-black uppercase tracking-widest text-[#c084fc] mb-2">Aria Draft Introduction Letter</p>
                            <p className="text-[10px] text-white/60 whitespace-pre-line">{vendor.introLetterDraft}</p>
                            <button onClick={() => navigator.clipboard.writeText(vendor.introLetterDraft!)} className="mt-2 flex items-center gap-1 text-[9px] text-[#c084fc]/60 hover:text-[#c084fc]"><Copy size={10} />Copy letter</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={() => setEditingVendor({ id: uid_short(), name: '', type: 'CUSTOM', status: 'PROSPECTING', contractSigned: false, createdAt: Date.now() })} className="w-full py-3 border border-dashed border-white/15 rounded-xl text-[10px] font-black uppercase text-white/30 hover:border-white/30 hover:text-white/60 transition-all flex items-center justify-center gap-2">
                <Plus size={12} /> Add Vendor
              </button>
            </div>
          )}

          {/* ── BUDGET ── */}
          {tab === 'budget' && (
            <div className="p-4 space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Total Budget', value: fmtMoney(p.totalBudgetCents), color: '#a78bfa' },
                  { label: 'Estimated Spend', value: fmtMoney(totalEstimated), color: '#fbbf24' },
                  { label: 'Remaining', value: fmtMoney(p.totalBudgetCents - totalActual), color: totalActual > p.totalBudgetCents ? '#f87171' : '#34d399' },
                ].map(s => <div key={s.label} className="p-4 bg-white/[0.04] border border-white/8 rounded-2xl"><p className="text-[9px] uppercase tracking-widest text-white/30 mb-1">{s.label}</p><p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p></div>)}
              </div>

              {/* Line items */}
              <div className="space-y-2">
                {p.budgetItems.map(item => (
                  <div key={item.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${item.isPaid ? 'border-[#34d399]/20 bg-[#34d399]/5' : 'border-white/8 bg-white/[0.02]'}`}>
                    <button onClick={() => updateBudgetItem(item.id, { isPaid: !item.isPaid, paidAt: !item.isPaid ? Date.now() : undefined })} className="shrink-0">
                      {item.isPaid ? <CheckCircle2 size={16} className="text-[#34d399]" /> : <Circle size={16} className="text-white/20" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-white">{item.label}</p>
                      <p className="text-[9px] text-white/30">{item.category}{item.notes ? ` · ${item.notes}` : ''}</p>
                    </div>
                    <div className="text-right shrink-0 space-y-0.5">
                      <p className="text-sm font-black text-white">{fmtMoney(item.actualCents ?? item.estimatedCents)}</p>
                      {item.actualCents !== undefined && item.actualCents !== item.estimatedCents && <p className="text-[9px] text-white/30 line-through">{fmtMoney(item.estimatedCents)}</p>}
                    </div>
                    <input type="number" value={item.actualCents !== undefined ? item.actualCents / 100 : ''} onChange={e => updateBudgetItem(item.id, { actualCents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined })} placeholder={String(item.estimatedCents / 100)} className="w-20 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs text-white text-right focus:outline-none" />
                  </div>
                ))}
              </div>

              {/* Payroll section */}
              {p.vendors.filter(v => v.finalCents && v.status !== 'PAID').length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Vendor Payroll Due</p>
                  <div className="space-y-2">
                    {p.vendors.filter(v => v.finalCents).map(v => (
                      <div key={v.id} className={`flex items-center gap-3 p-3 rounded-xl border ${v.status === 'PAID' ? 'border-[#34d399]/20 bg-[#34d399]/5' : v.depositPaidCents && !v.finalCents ? 'border-[#fbbf24]/20' : 'border-white/8'}`}>
                        <div className="flex-1"><p className="text-xs font-black text-white">{v.name || v.type}</p><p className="text-[9px] text-white/30">{v.status}</p></div>
                        <div className="text-right">
                          {v.depositPaidCents && <p className="text-[9px] text-white/30">Deposit: {fmtMoney(v.depositPaidCents)}</p>}
                          <p className="text-sm font-black text-white">{fmtMoney(v.finalCents!)}</p>
                          {v.finalPaymentDueDate && <p className="text-[9px] text-[#fbbf24]">Due {new Date(v.finalPaymentDueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PAYROLL ── */}
          {tab === 'payroll' && (
            <PayrollTab project={p} onUpdateProject={updateProject} />
          )}

          {/* ── CONTRACTS ── */}
          {tab === 'contracts' && (
            <div className="p-4 space-y-3">
              <p className="text-xs text-white/40 leading-relaxed">Template contracts ready to customise. Fill in the highlighted fields, review with your vendor, and sign. Always have a lawyer review before signing significant contracts.</p>
              {CONTRACT_TEMPLATES.map(ct => (
                <div key={ct.type} className="p-4 bg-white/[0.04] border border-white/8 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-black text-white">{ct.title}</p>
                      <p className="text-[9px] text-white/30 uppercase tracking-widest">{ct.type}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setContractView(contractView === ct.type ? null : ct.type)} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase text-white/50 hover:text-white transition-all flex items-center gap-1">
                        {contractView === ct.type ? <ChevronUp size={11} /> : <ChevronDown size={11} />} View
                      </button>
                      <button onClick={() => { const blob = new Blob([ct.body], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${ct.title.replace(/\s/g,'-')}.txt`; a.click(); }} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase text-white/50 hover:text-white transition-all flex items-center gap-1">
                        <Download size={11} /> Download
                      </button>
                    </div>
                  </div>
                  <AnimatePresence>
                    {contractView === ct.type && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <pre className="mt-3 p-4 bg-black/40 rounded-xl text-[10px] text-white/60 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">{ct.body}</pre>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}

          {/* ── MARKETING ── */}
          {tab === 'marketing' && (
            <div className="p-4 space-y-4">
              <div className="p-5 bg-gradient-to-br from-[#6B0099]/20 to-[#D40055]/10 border border-[#6B0099]/30 rounded-2xl">
                <p className="text-[9px] font-black uppercase tracking-widest text-[#c084fc] mb-2">Artist Services — On & Off-Platform Ads</p>
                <p className="text-sm font-black text-white mb-2">Promote your event with Plajah Artist Services</p>
                <p className="text-xs text-white/50 mb-4">Run ads on Plajah, Google, Meta, TikTok, and Bing — all from one dashboard. The platform handles the technical setup. You write the ad and set the budget.</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {['On-Platform boost', 'Google Ads', 'Meta (Facebook/Instagram)', 'TikTok Ads', 'Bing Ads'].map(p => <span key={p} className="px-2.5 py-1 bg-[#6B0099]/20 border border-[#6B0099]/30 rounded-full text-[9px] font-black text-[#c084fc]">{p}</span>)}
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 bg-white/[0.04] border border-white/8 rounded-xl">
                    <p className="text-xs font-black text-white">Per Event</p>
                    <p className="text-2xl font-black text-[#a78bfa]">$29.99</p>
                    <p className="text-[9px] text-white/30">One event, all platforms</p>
                  </div>
                  <div className="p-3 bg-white/[0.04] border border-white/8 rounded-xl">
                    <p className="text-xs font-black text-white">Monthly Add-On</p>
                    <p className="text-2xl font-black text-[#34d399]">$4.99<span className="text-sm">/mo</span></p>
                    <p className="text-[9px] text-white/30">Unlimited events + ongoing ad management</p>
                  </div>
                </div>
                <p className="text-[9px] text-[#34d399] font-black">✓ Your first event is FREE</p>
              </div>

              {/* Marketing checklist */}
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Marketing Tasks</p>
                {p.tasks.filter(t => t.category === 'Marketing').map(task => (
                  <div key={task.id} className={`flex items-center gap-3 p-3 mb-1.5 rounded-xl border ${task.status === 'DONE' ? 'border-white/5 opacity-60' : 'border-white/8 bg-white/[0.03]'}`}>
                    <button onClick={() => updateTask(task.id, { status: task.status === 'DONE' ? 'TODO' : 'DONE' })}>
                      {task.status === 'DONE' ? <CheckCircle2 size={15} className="text-[#34d399]" /> : <Circle size={15} className="text-white/20" />}
                    </button>
                    <p className={`text-sm flex-1 ${task.status === 'DONE' ? 'line-through text-white/30' : 'text-white'}`}>{task.title}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Aria panel */}
        <AnimatePresence>
          {showMuse && (
            <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 300, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="shrink-0 overflow-hidden" style={{ width: 300 }}>
              <MusePanel project={p} onUpdateHistory={history => updateProject({ ...p, museChatHistory: history, updatedAt: Date.now() })} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Vendor form modal */}
      <AnimatePresence>
        {editingVendor && <VendorFormModal vendor={editingVendor} onSave={saveVendor} onClose={() => setEditingVendor(null)} />}
      </AnimatePresence>
    </div>
  );
};

// ── Sub-forms ─────────────────────────────────────────────────────────────────

const AddTaskForm: React.FC<{ onAdd: (title: string, cat: string, priority: EventTask['priority']) => void; onCancel: () => void }> = ({ onAdd, onCancel }) => {
  const [title, setTitle] = useState('');
  const [cat, setCat] = useState('Custom');
  const [priority, setPriority] = useState<EventTask['priority']>('MEDIUM');
  return (
    <div className="p-4 bg-white/[0.04] border border-white/12 rounded-2xl space-y-3">
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title" autoFocus className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none" />
      <div className="flex gap-2">
        <input value={cat} onChange={e => setCat(e.target.value)} placeholder="Category" className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder:text-white/25 focus:outline-none" />
        <select value={priority} onChange={e => setPriority(e.target.value as any)} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none">
          {['LOW','MEDIUM','HIGH','URGENT'].map(p => <option key={p} value={p} className="bg-[#0d0d0d]">{p}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button onClick={() => { onAdd(title, cat, priority); }} disabled={!title.trim()} className="flex-1 py-2 bg-[#6B0099] text-white rounded-xl text-xs font-black uppercase disabled:opacity-40">Add Task</button>
        <button onClick={onCancel} className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white/40">Cancel</button>
      </div>
    </div>
  );
};

const VendorFormModal: React.FC<{ vendor: EventVendor; onSave: (v: EventVendor) => void; onClose: () => void }> = ({ vendor, onSave, onClose }) => {
  const [v, setV] = useState(vendor);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-[#0d0d0d] border border-white/10 rounded-3xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-black text-white">Vendor Details</h3>
          <button onClick={onClose}><X size={16} className="text-white/30" /></button>
        </div>
        <div className="space-y-3">
          {[
            ['name', 'Company / Vendor Name', 'text', 'e.g. Sound Masters LLC'],
            ['contactName', 'Contact Person', 'text', 'Full name'],
            ['email', 'Email', 'email', 'contact@vendor.com'],
            ['phone', 'Phone', 'tel', '+1 555 000 0000'],
            ['website', 'Website', 'url', 'https://'],
          ].map(([field, label, type, placeholder]) => (
            <div key={field}>
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">{label}</label>
              <input type={type} value={(v as any)[field] ?? ''} onChange={e => setV(x => ({ ...x, [field]: e.target.value }))} placeholder={placeholder} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none" />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Quote ($)</label><input type="number" value={v.quoteCents ? v.quoteCents / 100 : ''} onChange={e => setV(x => ({ ...x, quoteCents: Math.round(parseFloat(e.target.value||'0') * 100) }))} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none" /></div>
            <div><label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Final Fee ($)</label><input type="number" value={v.finalCents ? v.finalCents / 100 : ''} onChange={e => setV(x => ({ ...x, finalCents: Math.round(parseFloat(e.target.value||'0') * 100) }))} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none" /></div>
          </div>
          <div><label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Status</label>
            <select value={v.status} onChange={e => setV(x => ({ ...x, status: e.target.value as any }))} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none">
              {['PROSPECTING','CONTACTED','NEGOTIATING','CONTRACTED','PAID','CANCELLED'].map(s => <option key={s} value={s} className="bg-[#0d0d0d]">{s}</option>)}
            </select>
          </div>
          <div><label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Type</label>
            <select value={v.type} onChange={e => setV(x => ({ ...x, type: e.target.value as ContractType }))} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none">
              {['VENUE','SOUND_AV','CATERING','SECURITY','PHOTOGRAPHER','MUSICIAN_PERFORMER','MARKETING_PR','LIGHTING','TRANSPORT','CUSTOM'].map(t => <option key={t} value={t} className="bg-[#0d0d0d]">{t.replace(/_/g,' ')}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={v.contractSigned} onChange={e => setV(x => ({ ...x, contractSigned: e.target.checked }))} className="accent-[#6B0099]" /><span className="text-xs text-white/60">Contract signed</span></label>
          <div><label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Notes</label><textarea value={v.notes ?? ''} onChange={e => setV(x => ({ ...x, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none resize-none" /></div>
          <button onClick={() => onSave(v)} className="w-full py-3 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl font-black text-xs uppercase tracking-widest">Save Vendor</button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Payroll Tab ───────────────────────────────────────────────────────────────

const PAYROLL_CATEGORY_COLORS: Record<string, string> = {
  Venue: '#a78bfa', Production: '#60a5fa', Talent: '#f472b6', Marketing: '#fbbf24',
  Security: '#fb923c', Catering: '#34d399', Media: '#38bdf8', Contingency: '#94a3b8',
};

const PayrollTab: React.FC<{ project: EventProductionProject; onUpdateProject: (p: EventProductionProject) => void }> = ({ project, onUpdateProject }) => {
  const [payingId, setPayingId] = useState<string | null>(null);

  const vendorPayroll = project.vendors.filter(v => (v.quoteCents || v.finalCents) && v.status !== 'CANCELLED');
  const totalPayable = vendorPayroll.reduce((s, v) => s + (v.finalCents ?? v.quoteCents ?? 0), 0);
  const totalDeposits = vendorPayroll.reduce((s, v) => s + (v.depositPaidCents ?? 0), 0);
  const totalPaid = vendorPayroll.filter(v => v.status === 'PAID').reduce((s, v) => s + (v.finalCents ?? v.quoteCents ?? 0), 0);
  const totalDue = totalPayable - totalPaid;

  const handleMarkPaid = (vendorId: string) => {
    const vendors = project.vendors.map(v => v.id === vendorId ? { ...v, status: 'PAID' as const } : v);
    onUpdateProject({ ...project, vendors, updatedAt: Date.now() });
  };

  const handleStripePayVendor = async (vendor: EventVendor) => {
    if (!vendor.email || !(vendor.finalCents || vendor.quoteCents)) return;
    setPayingId(vendor.id);
    try {
      const res = await fetch('/api/stripe/vendor-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorEmail: vendor.email,
          vendorName: vendor.name,
          amountCents: vendor.finalCents ?? vendor.quoteCents,
          eventTitle: project.title,
          vendorId: vendor.id,
          projectId: project.id,
        }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.open(data.checkoutUrl, '_blank');
      } else if (data.success) {
        handleMarkPaid(vendor.id);
      }
    } catch {
    } finally { setPayingId(null); }
  };

  const budgetByCategory = project.budgetItems.reduce<Record<string, number>>((acc, b) => {
    acc[b.category] = (acc[b.category] ?? 0) + (b.actualCents ?? b.estimatedCents);
    return acc;
  }, {});

  const dueVendors = vendorPayroll.filter(v => v.status !== 'PAID');
  const paidVendors = vendorPayroll.filter(v => v.status === 'PAID');

  return (
    <div className="p-4 space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Payable', value: fmtMoney(totalPayable), color: '#a78bfa' },
          { label: 'Deposits Paid', value: fmtMoney(totalDeposits), color: '#60a5fa' },
          { label: 'Still Owed', value: fmtMoney(totalDue), color: totalDue > 0 ? '#f87171' : '#34d399' },
          { label: 'Paid Out', value: fmtMoney(totalPaid), color: '#34d399' },
        ].map(s => (
          <div key={s.label} className="p-4 bg-white/[0.04] border border-white/8 rounded-2xl">
            <p className="text-[9px] uppercase tracking-widest text-white/30 mb-1">{s.label}</p>
            <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Budget breakdown by category */}
      {Object.keys(budgetByCategory).length > 0 && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Budget by Category</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Object.entries(budgetByCategory).map(([cat, cents]) => (
              <div key={cat} className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/8 rounded-xl">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PAYROLL_CATEGORY_COLORS[cat] ?? '#94a3b8' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-white truncate">{cat}</p>
                  <p className="text-xs font-black" style={{ color: PAYROLL_CATEGORY_COLORS[cat] ?? '#94a3b8' }}>{fmtMoney(cents)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vendor payroll rows */}
      {dueVendors.length > 0 && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Outstanding Payments ({dueVendors.length})</p>
          <div className="space-y-2">
            {dueVendors.map(v => {
              const amount = v.finalCents ?? v.quoteCents ?? 0;
              const balanceDue = amount - (v.depositPaidCents ?? 0);
              return (
                <div key={v.id} className="p-4 bg-white/[0.04] border border-white/8 rounded-2xl">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-black text-white text-sm">{v.name || v.type.replace(/_/g, ' ')}</p>
                        <span className="text-[8px] px-2 py-0.5 rounded-full bg-white/6 text-white/40 font-black uppercase">{v.type.replace(/_/g, ' ')}</span>
                        {v.contractSigned && <span className="text-[8px] px-2 py-0.5 rounded-full bg-[#60a5fa]/12 text-[#60a5fa] font-black uppercase">Signed</span>}
                      </div>
                      {v.email && <p className="text-[10px] text-white/40 mb-1">{v.email}</p>}
                      <div className="flex items-center gap-4 text-[10px]">
                        {v.quoteCents && v.finalCents && v.quoteCents !== v.finalCents && (
                          <span className="text-white/30 line-through">Quote: {fmtMoney(v.quoteCents)}</span>
                        )}
                        <span className="text-white/60">Total: {fmtMoney(amount)}</span>
                        {v.depositPaidCents ? <span className="text-[#34d399]">Deposit paid: {fmtMoney(v.depositPaidCents)}</span> : null}
                        <span className="font-black text-[#fbbf24]">Balance due: {fmtMoney(balanceDue)}</span>
                      </div>
                      {v.finalPaymentDueDate && (
                        <p className="text-[9px] mt-1 flex items-center gap-1 text-[#fb923c]">
                          <Calendar size={9} /> Due {new Date(v.finalPaymentDueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      {v.email ? (
                        <button
                          onClick={() => handleStripePayVendor(v)}
                          disabled={payingId === v.id}
                          className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl text-[10px] font-black uppercase hover:brightness-110 transition-all disabled:opacity-50"
                        >
                          {payingId === v.id ? <RefreshCw size={10} className="animate-spin" /> : <CreditCard size={10} />}
                          Pay via Stripe
                        </button>
                      ) : null}
                      <button
                        onClick={() => handleMarkPaid(v.id)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white/6 border border-white/10 text-white/50 rounded-xl text-[10px] font-black uppercase hover:text-white transition-all"
                      >
                        <Check size={10} /> Mark Paid
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {paidVendors.length > 0 && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Paid ({paidVendors.length})</p>
          <div className="space-y-1.5">
            {paidVendors.map(v => (
              <div key={v.id} className="flex items-center gap-3 p-3 border border-[#34d399]/15 bg-[#34d399]/5 rounded-xl opacity-70">
                <CheckCircle2 size={15} className="text-[#34d399] shrink-0" />
                <p className="flex-1 text-xs font-black text-white/60">{v.name || v.type.replace(/_/g, ' ')}</p>
                <p className="text-sm font-black text-[#34d399]">{fmtMoney(v.finalCents ?? v.quoteCents ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {vendorPayroll.length === 0 && (
        <div className="py-16 text-center">
          <Receipt size={32} className="text-white/10 mx-auto mb-3" />
          <p className="text-sm text-white/30">No vendor payments yet.</p>
          <p className="text-[10px] text-white/20 mt-1">Add vendors with quotes in the Vendors tab to see payroll here.</p>
        </div>
      )}
    </div>
  );
};

export default EventProductionManager;
