/**
 * The Writer's Desk — Lorea Literary & Journalism Studio
 * Comprehensive authoring, chapter management, research desk, and submission pipeline for writers and journalists.
 *
 * Tabs: Overview · Projects · Manuscripts · Research · Submissions · Events · Press
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  BookOpen, BookMarked, PenLine, Search, Send, Calendar, Newspaper,
  Plus, CheckCircle2, Target, Sparkles, Mic, ChevronLeft,
} from 'lucide-react';
import { UserProfile } from '../../types';
import { listWritingProjects, type WritingProject, type WritingChapter } from '../../services/loreaProjectsService';
import { isDemoMode } from '../../services/demoMode';

// ─── Storage & Types ─────────────────────────────────────────────────────────

const WRITER_DEMO_IDS = new Set(['proj1', 'proj2', 'proj3']);

function deskStore<T>(key: string): { get: () => T[]; set: (v: T[]) => void } {
  const K = `plajah_pm_${key}_v1`;
  return {
    get: () => { try { return JSON.parse(localStorage.getItem(K) || '[]'); } catch { return []; } },
    set: (v) => { try { localStorage.setItem(K, JSON.stringify(v)); } catch {} },
  };
}

function uuid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
function fmtDate(ts: number) { return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function fmtCurrency(n: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n); }

export interface WriterProject {
  id: string; title: string;
  type: 'BOOK' | 'ARTICLE' | 'COLUMN' | 'ESSAY' | 'NEWSLETTER' | 'SCRIPT' | 'PODCAST';
  status: 'ACTIVE' | 'DRAFTING' | 'EDITING' | 'SUBMITTED' | 'PUBLISHED' | 'ON_HOLD';
  wordCountTarget: number; wordCountCurrent: number;
  deadline?: number; genre: string; logline: string; notes: string; createdAt: number;
}

export interface WriterChapter {
  id: string; projectId: string; order: number; title: string;
  wordCount: number; status: 'OUTLINE' | 'DRAFTING' | 'REVISION' | 'FINAL';
  notes: string; createdAt: number;
}

export interface WriterSubmission {
  id: string; publication: string; editorContact: string; editorEmail: string;
  type: 'QUERY' | 'FULL_MS' | 'PARTIAL_MS' | 'ARTICLE_PITCH' | 'PROPOSAL';
  status: 'PLANNING' | 'SENT' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'REVISE_RESUBMIT';
  submittedAt?: number; responseDeadline?: number; notes: string; createdAt: number;
}

export interface WriterEvent {
  id: string; title: string;
  type: 'SIGNING' | 'LAUNCH' | 'PANEL' | 'KEYNOTE' | 'WORKSHOP' | 'READING' | 'VIRTUAL';
  venue: string; city: string; date?: number; rsvpCount: number; fee: number;
  status: 'PLANNING' | 'CONFIRMED' | 'DONE' | 'CANCELLED'; notes: string; createdAt: number;
}

export interface WriterResearchNote {
  id: string; topic: string; content: string; sourceType: 'WEB' | 'BOOK' | 'INTERVIEW' | 'DOCUMENT' | 'OTHER';
  sourceUrl: string; tags: string; createdAt: number;
}

const writerProjectStore    = deskStore<WriterProject>('writer_projects');
const writerChapterStore    = deskStore<WriterChapter>('writer_chapters');
const writerSubmissionStore = deskStore<WriterSubmission>('writer_subs');
const writerEventStore      = deskStore<WriterEvent>('writer_events');
const writerResearchStore   = deskStore<WriterResearchNote>('writer_research');

const WRITER_PROJECT_TYPES = ['BOOK', 'ARTICLE', 'COLUMN', 'ESSAY', 'NEWSLETTER', 'SCRIPT', 'PODCAST'];

function ensureWriterDemo() {
  if (!isDemoMode()) return;
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

// ─── UI Atoms ───────────────────────────────────────────────────────────────

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
      <button onClick={onCta} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-xs font-black uppercase tracking-widest hover:bg-cyan-500/25 transition-all">
        <Plus size={13} /> {cta}
      </button>
    )}
  </div>
);

// ─── Desk Tabs ───────────────────────────────────────────────────────────────

export type DeskTab = 'overview' | 'projects' | 'manuscripts' | 'research' | 'submissions' | 'events' | 'press';

const DESK_TABS: { id: DeskTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',     label: 'Overview',     icon: <BookMarked size={13} /> },
  { id: 'projects',     label: 'Projects',     icon: <BookOpen size={13} /> },
  { id: 'manuscripts',  label: 'Manuscripts',  icon: <PenLine size={13} /> },
  { id: 'research',     label: 'Research',     icon: <Search size={13} /> },
  { id: 'submissions',  label: 'Submissions',  icon: <Send size={13} /> },
  { id: 'events',       label: 'Events',       icon: <Calendar size={13} /> },
  { id: 'press',        label: 'Press & Media',icon: <Newspaper size={13} /> },
];

export const WritersDesk: React.FC<{
  currentUser?: UserProfile | null;
  onBackToLibrary?: () => void;
}> = ({ currentUser, onBackToLibrary }) => {
  const [activeTab, setActiveTab] = useState<DeskTab>('overview');

  return (
    <div className="min-h-full flex flex-col bg-[#0c0d12] text-white">
      {/* Studio Header */}
      <header className="border-b border-white/10 px-6 py-4 bg-[#11131a] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {onBackToLibrary && (
            <button
              onClick={onBackToLibrary}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs font-bold flex items-center gap-1.5 transition"
            >
              <ChevronLeft size={14} /> Back to Library
            </button>
          )}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center font-bold text-base shadow-lg shadow-cyan-950/40">
              ✍️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-black text-white uppercase tracking-wider">The Writer's Desk</h1>
                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  Lorea Literary Studio
                </span>
              </div>
              <p className="text-[11px] text-white/40">Manuscript authoring, chapter outlines, research CRM, and publishing submissions.</p>
            </div>
          </div>
        </div>

        {/* Desk Tabs Rail */}
        <nav className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 overflow-x-auto">
          {DESK_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                activeTab === tab.id
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow'
                  : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
        {activeTab === 'overview' && <WriterOverviewTab />}
        {activeTab === 'projects' && <WriterProjectsTab currentUser={currentUser} />}
        {activeTab === 'manuscripts' && <WriterManuscriptsTab currentUser={currentUser} />}
        {activeTab === 'research' && <WriterResearchTab />}
        {activeTab === 'submissions' && <WriterSubmissionsTab />}
        {activeTab === 'events' && <WriterEventsTab />}
        {activeTab === 'press' && <WriterPressTab />}
      </main>
    </div>
  );
};

// ─── Sub-Tab Implementations ────────────────────────────────────────────────

const WriterOverviewTab: React.FC = () => {
  useEffect(() => { ensureWriterDemo(); }, []);
  const demoOn = isDemoMode();
  const projects = demoOn ? writerProjectStore.get() : writerProjectStore.get().filter(p => !WRITER_DEMO_IDS.has(p.id));
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

const WriterProjectsTab: React.FC<{ currentUser?: UserProfile | null }> = ({ currentUser }) => {
  const uid = currentUser?.uid;
  const [lorea, setLorea] = useState<WritingProject[]>([]);
  const [projects, setProjects] = useState<WriterProject[]>(() => writerProjectStore.get());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'BOOK' as WriterProject['type'], status: 'DRAFTING' as WriterProject['status'], wordCountTarget: '', wordCountCurrent: '', genre: '', logline: '', deadline: '', notes: '' });

  useEffect(() => {
    if (!uid) { ensureWriterDemo(); setProjects(writerProjectStore.get()); return; }
    listWritingProjects(uid).then(({ projects: p }) => {
      setLorea(p);
      if (p.length === 0) { ensureWriterDemo(); setProjects(writerProjectStore.get()); }
    }).catch(() => { ensureWriterDemo(); setProjects(writerProjectStore.get()); });
  }, [uid]);

  const save = () => {
    const n: WriterProject = { id: uuid(), ...form, wordCountTarget: parseInt(form.wordCountTarget) || 0, wordCountCurrent: parseInt(form.wordCountCurrent) || 0, deadline: form.deadline ? new Date(form.deadline).getTime() : undefined, createdAt: Date.now() };
    const next = [...projects, n]; writerProjectStore.set(next); setProjects(next); setAdding(false);
    setForm({ title: '', type: 'BOOK', status: 'DRAFTING', wordCountTarget: '', wordCountCurrent: '', genre: '', logline: '', deadline: '', notes: '' });
  };

  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-cyan-500/50';
  const statusColor: Record<string, string> = { ACTIVE: 'text-emerald-400 bg-emerald-500/10', DRAFTING: 'text-blue-400 bg-blue-500/10', EDITING: 'text-yellow-400 bg-yellow-500/10', SUBMITTED: 'text-violet-400 bg-violet-500/10', PUBLISHED: 'text-emerald-400 bg-emerald-500/15', ON_HOLD: 'text-white/30 bg-white/5' };
  const loreaIds = new Set(lorea.map(l => l.id));
  const loreaAsWriter: WriterProject[] = lorea.map(l => ({ id: l.id, title: l.title, type: l.type, status: l.status, wordCountTarget: l.wordCountTarget, wordCountCurrent: l.wordCountCurrent, genre: l.genre, logline: l.logline, notes: '', createdAt: l.createdAt }));
  const demoIds = WRITER_DEMO_IDS;
  const showDemoRows = isDemoMode() && lorea.length === 0;
  const displayProjects = showDemoRows
    ? projects
    : [...loreaAsWriter, ...projects.filter(p => !demoIds.has(p.id))];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        {lorea.length > 0 ? <p className="text-[10px] text-white/30 font-bold flex items-center gap-1.5"><BookOpen size={11} className="text-cyan-400" /> {lorea.length} live from your Lorea library · auto-synced</p> : <span />}
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

export default WritersDesk;
