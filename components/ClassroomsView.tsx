import React, { useState, useEffect, Suspense } from 'react';
import PageHeader from './PageHeader';
import {
  BookOpen,
  Video,
  FileText,
  Users,
  Plus,
  Search,
  GraduationCap,
  Clock,
  CheckCircle,
  PlayCircle,
  MessageSquare,
  ChevronRight,
  ArrowLeft,
  Upload,
  BarChart3,
  Lock,
  Globe,
  Star,
  Layers,
  Sparkles,
  CalendarDays,
  Send,
  Award,
  AlertCircle,
  Link2,
  X,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Classroom, Lesson, Assignment, Submission, ProgressReport, ClassroomModule, LiveClassSession, StudentGrade } from '../types';
import { fetchClassrooms, enrollInClassroom, createClassroom, auth, fetchClassroomModules, createClassroomModule, deleteClassroomModule, submitAssignment, gradeSubmission } from '../services/backendService';
import { collection, addDoc, getDocs, query, where, orderBy, updateDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import SolarSystemModule from './SolarSystemModule';
import PlantBiologyModule from './PlantBiologyModule';
import HumanBodyExperience from './HumanBodyExperience';
import ErrorBoundary from './ErrorBoundary';
import TeacherStudentsPanel from './TeacherStudentsPanel';
import { lazy } from 'react';
const SportExplainerModule = lazy(() => import('./sports/SportExplainerModule'));

interface ClassroomsViewProps {
  onBack: () => void;
  user: any;
  onNavigate?: (view: string) => void;
}

// ── DEMO CLASSROOM SEEDER ─────────────────────────────────────────────────────

const DEMO_CLASS_ID = 'demo_music_production_101';

const seedDemoClassroom = async (user: any): Promise<Classroom> => {
  const now = Date.now();
  const demo: Classroom = {
    id: DEMO_CLASS_ID,
    ownerId: user?.uid ?? 'demo',
    ownerName: user?.displayName ?? 'Plajah Academy',
    title: 'Music Production 101',
    description: 'Learn to produce music from scratch. Beat-making, sound design, mixing, and mastering — all inside Plajah.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=1600&auto=format&fit=crop',
    price: 0,
    category: 'Music',
    syllabus: `Week 1 — The Studio Foundation
Understand your DAW, signal flow, and how professional studios work.

Week 2 — Beat Anatomy
Kick, snare, hi-hat patterns. Swing, groove, and feel. Build your first beat.

Week 3 — Sound Design
Synthesis basics: subtractive, FM, wavetable. Design pads, leads, and basses from scratch.

Week 4 — Song Structure
Intro, verse, hook, bridge, outro. Why structure matters and how to break the rules.

Week 5 — Mixing Fundamentals
EQ, compression, reverb, delay. The stereo field. Gain staging.

Week 6 — Mastering & Release
Loudness, limiting, export formats. Distribute your track on Plajah.`,
    lessons: [
      { id: 'l1', title: 'Welcome to the Studio', description: 'Overview of what we cover and how to get the most from this class.', type: 'VIDEO', contentUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ', order: 1 },
      { id: 'l2', title: 'DAW Setup & Signal Flow', description: 'Install your DAW, configure audio, and understand how signal moves through a session.', type: 'VIDEO', contentUrl: '', order: 2 },
      { id: 'l3', title: 'Your First Beat', description: 'Step-sequencer 101. Build a 4-bar loop using kick, snare, and hi-hats.', type: 'VIDEO', contentUrl: '', order: 3 },
      { id: 'l4', title: 'Introduction to Synthesis', description: 'Oscillators, filters, envelopes, and LFOs explained simply.', type: 'TEXT', textContent: 'Synthesis is the art of building sounds from scratch using oscillators...', order: 4 },
      { id: 'l5', title: 'Mixing — EQ & Compression', description: 'The two most powerful mixing tools and how to use them together.', type: 'VIDEO', contentUrl: '', order: 5 },
      { id: 'l6', title: 'Mastering for Plajah', description: 'Export settings, loudness targets, and how to submit your track.', type: 'TEXT', textContent: 'Before distributing, your master should sit around -14 LUFS for streaming platforms...', order: 6 },
    ],
    assignments: [
      { id: 'a1', title: 'Build a 4-Bar Loop', description: 'Create a 4-bar drum loop with at least kick, snare, and hi-hat. Export as MP3 and share the link.', dueDate: now + 7 * 86400000, maxPoints: 100 },
      { id: 'a2', title: 'Sound Design Challenge', description: 'Design an original bass sound from scratch using a synthesizer plugin. Describe your process.', dueDate: now + 14 * 86400000, maxPoints: 100 },
      { id: 'a3', title: 'Full Track Draft', description: 'Submit a 1-minute draft of an original track using everything from weeks 1–4.', dueDate: now + 28 * 86400000, maxPoints: 150 },
    ],
    enrolledStudents: [],
    liveSessionUrl: 'https://meet.google.com/demo',
  };
  await setDoc(doc(db, 'classrooms', DEMO_CLASS_ID), demo);
  return demo;
};

// ── CREATE CLASS FORM ─────────────────────────────────────────────────────────

const CATEGORIES = ['Music', 'Art', 'Film', 'Writing', 'Technology', 'Business', 'Science', 'Health', 'Language', 'Other'];

interface LessonDraft { id: string; title: string; description: string; type: 'VIDEO' | 'TEXT'; contentUrl: string; }
interface AssignmentDraft { id: string; title: string; description: string; dueInDays: number; maxPoints: number; }

interface CreateClassModalProps {
  user: any;
  track?: 'ACADEMIC' | 'CREATOR';
  onClose: () => void;
  onCreated: (cls: Classroom) => void;
}

const CreateClassModal: React.FC<CreateClassModalProps> = ({ user, track = 'CREATOR', onClose, onCreated }) => {
  const academic = track === 'ACADEMIC';
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'Music',
    price: 0,
    thumbnailUrl: '',
    syllabus: '',
  });
  const [lessons, setLessons] = useState<LessonDraft[]>([
    { id: 'l1', title: '', description: '', type: 'VIDEO', contentUrl: '' },
  ]);
  const [assignments, setAssignments] = useState<AssignmentDraft[]>([
    { id: 'a1', title: '', description: '', dueInDays: 7, maxPoints: 100 },
  ]);

  const setF = (k: keyof typeof form, v: any) => setForm(p => ({ ...p, [k]: v }));

  const addLesson = () => setLessons(p => [...p, { id: `l${Date.now()}`, title: '', description: '', type: 'VIDEO', contentUrl: '' }]);
  const removeLesson = (id: string) => setLessons(p => p.filter(l => l.id !== id));
  const updateLesson = (id: string, k: keyof LessonDraft, v: any) => setLessons(p => p.map(l => l.id === id ? { ...l, [k]: v } : l));

  const addAssignment = () => setAssignments(p => [...p, { id: `a${Date.now()}`, title: '', description: '', dueInDays: 7, maxPoints: 100 }]);
  const removeAssignment = (id: string) => setAssignments(p => p.filter(a => a.id !== id));
  const updateAssignment = (id: string, k: keyof AssignmentDraft, v: any) => setAssignments(p => p.map(a => a.id === id ? { ...a, [k]: v } : a));

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const now = Date.now();
      const cls = await createClassroom({
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        track,
        price: academic ? 0 : form.price,
        thumbnailUrl: form.thumbnailUrl.trim() || `https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=800&auto=format&fit=crop`,
        syllabus: form.syllabus.trim(),
        lessons: lessons.filter(l => l.title.trim()).map((l, i) => ({
          id: l.id,
          title: l.title.trim(),
          description: l.description.trim(),
          type: l.type,
          contentUrl: l.contentUrl.trim() || undefined,
          order: i + 1,
        })),
        assignments: assignments.filter(a => a.title.trim()).map(a => ({
          id: a.id,
          title: a.title.trim(),
          description: a.description.trim(),
          dueDate: now + a.dueInDays * 86400000,
          maxPoints: a.maxPoints,
        })),
      });
      if (cls) onCreated(cls);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const STEPS = ['Info', 'Lessons', 'Assignments'];

  return (
    <motion.div
      className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-0 sm:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.div
        className="relative w-full max-w-2xl bg-[var(--bg-color)] border border-[var(--border-color)] rounded-t-[3rem] sm:rounded-[3rem] max-h-[92vh] flex flex-col overflow-hidden"
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
      >
        {/* Accent line */}
        <div className="h-1 w-full bg-gradient-to-r from-[var(--text-secondary)] via-small-orange to-[var(--text-secondary)]" />

        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-[var(--border-color)]">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tightest text-[var(--text-primary)]">{academic ? 'New Academic Class' : 'New Creator Course'}</h2>
            <p className="text-[10px] text-[var(--text-primary)]/40 uppercase tracking-widest mt-0.5">{academic ? 'Standards-aligned · K-12' : 'Creator economy · monetizable'} · Step {step} of {STEPS.length} — {STEPS[step - 1]}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Step dots */}
        <div className="flex gap-2 px-8 py-3 border-b border-[var(--border-color)]">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <button
                onClick={() => i + 1 < step && setStep(i + 1)}
                className={`w-6 h-6 rounded-full text-[9px] font-black flex items-center justify-center transition-all ${
                  i + 1 === step ? 'bg-small-orange text-white scale-110' :
                  i + 1 < step ? 'bg-green-500 text-white cursor-pointer' :
                  'bg-white/10 text-white/30'
                }`}
              >
                {i + 1 < step ? <CheckCircle2 size={12} /> : i + 1}
              </button>
              <span className={`text-[10px] font-bold uppercase tracking-widest hidden sm:block ${i + 1 === step ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]/30'}`}>{s}</span>
              {i < STEPS.length - 1 && <div className={`w-8 h-px ${i + 1 < step ? 'bg-green-500' : 'bg-white/10'}`} />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-8 py-6">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/40 block mb-2">Class Title *</label>
                  <input value={form.title} onChange={e => setF('title', e.target.value)} placeholder="e.g. Music Production 101"
                    className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-4 text-[var(--text-primary)] focus:outline-none focus:border-small-orange transition-all text-sm" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/40 block mb-2">Description</label>
                  <textarea value={form.description} onChange={e => setF('description', e.target.value)} rows={3}
                    placeholder="What will students learn? Who is it for?"
                    className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-4 text-[var(--text-primary)] focus:outline-none focus:border-small-orange transition-all resize-none text-sm" />
                </div>
                <div className={academic ? '' : 'grid grid-cols-2 gap-4'}>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/40 block mb-2">{academic ? 'Subject' : 'Category'}</label>
                    <select value={form.category} onChange={e => setF('category', e.target.value)}
                      className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-4 text-[var(--text-primary)] focus:outline-none focus:border-small-orange transition-all text-sm">
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  {!academic && (
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/40 block mb-2">Price (0 = Free)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-primary)]/40 font-bold">$</span>
                        <input type="number" min={0} step={1} value={form.price} onChange={e => setF('price', +e.target.value)}
                          className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl pl-8 pr-4 py-4 text-[var(--text-primary)] focus:outline-none focus:border-small-orange transition-all text-sm" />
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/40 block mb-2">Thumbnail URL</label>
                  <input value={form.thumbnailUrl} onChange={e => setF('thumbnailUrl', e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-4 text-[var(--text-primary)] focus:outline-none focus:border-small-orange transition-all text-sm" />
                  {form.thumbnailUrl && (
                    <img src={form.thumbnailUrl} alt="" className="mt-2 w-full h-32 object-cover rounded-2xl opacity-70" />
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/40 block mb-2">Syllabus / Course Outline</label>
                  <textarea value={form.syllabus} onChange={e => setF('syllabus', e.target.value)} rows={5}
                    placeholder="Week 1 — Introduction&#10;Week 2 — Core Concepts&#10;..."
                    className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-4 text-[var(--text-primary)] focus:outline-none focus:border-small-orange transition-all resize-none text-sm font-mono" />
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/30">Add the lessons for your class. You can edit content after publishing.</p>
                {lessons.map((lesson, i) => (
                  <div key={lesson.id} className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/30">Lesson {i + 1}</span>
                      {lessons.length > 1 && (
                        <button onClick={() => removeLesson(lesson.id)} className="text-red-400/50 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <input value={lesson.title} onChange={e => updateLesson(lesson.id, 'title', e.target.value)}
                      placeholder="Lesson title"
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl p-3 text-[var(--text-primary)] focus:outline-none focus:border-small-orange text-sm" />
                    <input value={lesson.description} onChange={e => updateLesson(lesson.id, 'description', e.target.value)}
                      placeholder="What does this lesson cover?"
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl p-3 text-[var(--text-primary)] focus:outline-none focus:border-small-orange text-sm" />
                    <div className="flex gap-2">
                      {(['VIDEO', 'TEXT'] as const).map(t => (
                        <button key={t} onClick={() => updateLesson(lesson.id, 'type', t)}
                          className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                            lesson.type === t ? 'bg-small-orange border-small-orange text-white' : 'border-[var(--border-color)] text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]'
                          }`}>
                          {t === 'VIDEO' ? '▶ Video' : '✦ Text'}
                        </button>
                      ))}
                    </div>
                    {lesson.type === 'VIDEO' && (
                      <input value={lesson.contentUrl} onChange={e => updateLesson(lesson.id, 'contentUrl', e.target.value)}
                        placeholder="YouTube or video URL (optional)"
                        className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl p-3 text-[var(--text-primary)] focus:outline-none focus:border-small-orange text-sm" />
                    )}
                  </div>
                ))}
                <button onClick={addLesson}
                  className="w-full py-3 border-2 border-dashed border-[var(--border-color)] rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/30 hover:border-small-orange/40 hover:text-small-orange transition-all flex items-center justify-center gap-2">
                  <Plus size={14} /> Add Another Lesson
                </button>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/30">Set assignments students must complete. You can skip this and add later.</p>
                {assignments.map((a, i) => (
                  <div key={a.id} className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/30">Assignment {i + 1}</span>
                      {assignments.length > 1 && (
                        <button onClick={() => removeAssignment(a.id)} className="text-red-400/50 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <input value={a.title} onChange={e => updateAssignment(a.id, 'title', e.target.value)}
                      placeholder="Assignment title"
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl p-3 text-[var(--text-primary)] focus:outline-none focus:border-small-orange text-sm" />
                    <textarea value={a.description} onChange={e => updateAssignment(a.id, 'description', e.target.value)} rows={2}
                      placeholder="What should students submit?"
                      className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl p-3 text-[var(--text-primary)] focus:outline-none focus:border-small-orange text-sm resize-none" />
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)]/30 block mb-1">Due in (days)</label>
                        <input type="number" min={1} value={a.dueInDays} onChange={e => updateAssignment(a.id, 'dueInDays', +e.target.value)}
                          className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl p-3 text-[var(--text-primary)] focus:outline-none focus:border-small-orange text-sm" />
                      </div>
                      <div className="flex-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-primary)]/30 block mb-1">Max Points</label>
                        <input type="number" min={1} value={a.maxPoints} onChange={e => updateAssignment(a.id, 'maxPoints', +e.target.value)}
                          className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl p-3 text-[var(--text-primary)] focus:outline-none focus:border-small-orange text-sm" />
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={addAssignment}
                  className="w-full py-3 border-2 border-dashed border-[var(--border-color)] rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/30 hover:border-small-orange/40 hover:text-small-orange transition-all flex items-center justify-center gap-2">
                  <Plus size={14} /> Add Assignment
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-8 py-5 border-t border-[var(--border-color)]">
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)}
              className="px-6 py-3 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/60 hover:text-[var(--text-primary)] flex items-center gap-2 transition-all">
              <ArrowLeft size={14} /> Back
            </button>
          )}
          <button
            onClick={() => step < STEPS.length ? setStep(s => s + 1) : handleCreate()}
            disabled={saving || (step === 1 && !form.title.trim())}
            className="flex-1 py-3 bg-small-orange text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
          >
            {saving ? (
              <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Publishing…</>
            ) : step < STEPS.length ? (
              <>Next <ChevronRight size={14} /></>
            ) : (
              <><CheckCircle2 size={14} /> Publish Class</>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── MAIN VIEW ─────────────────────────────────────────────────────────────────

const ClassroomsView: React.FC<ClassroomsViewProps> = ({ onBack, user, onNavigate }) => {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [modules, setModules] = useState<ClassroomModule[]>([]);
  const [selectedClass, setSelectedClass] = useState<Classroom | null>(null);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'EXPLORE' | 'COURSES' | 'MY_CLASSES' | 'TEACHING' | 'MODULES'>('MODULES');
  const [teachingMode, setTeachingMode] = useState<'ACADEMIC' | 'CREATOR'>('CREATOR');
  const [createTrack, setCreateTrack] = useState<'ACADEMIC' | 'CREATOR'>('CREATOR');
  const openCreate = (track: 'ACADEMIC' | 'CREATOR') => { setCreateTrack(track); setShowCreateModal(true); };
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showModuleModal, setShowModuleModal] = useState(false);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [newModule, setNewModule] = useState<Partial<ClassroomModule>>({
    name: '',
    description: '',
    url: '',
    coverArt: ''
  });

  useEffect(() => {
    loadClassrooms();
    loadModules();
  }, []);

  const loadClassrooms = async () => {
    setLoading(true);
    const data = await fetchClassrooms();
    setClassrooms(data);
    setLoading(false);
  };

  const loadModules = async () => {
    const data = await fetchClassroomModules();
    const solarSystemDefault: ClassroomModule = {
      id: 'default_solar_system',
      name: 'The Solar System',
      description: 'Interactive 3D exploration of our cosmic neighborhood. Explore planets, moons, and research probes.',
      url: 'SOLAR_SYSTEM',
      coverArt: 'https://images.unsplash.com/photo-1454789548928-1f63080f5509?q=80&w=1000&auto=format&fit=crop',
      createdAt: 0,
      isActive: true
    };

    const plantBiologyDefault: ClassroomModule = {
      id: 'default_plant_biology',
      name: 'Plant Architecture',
      description: 'Hand-drawn interactive exploration of plant cellular engines and the miracle of photosynthesis.',
      url: 'PLANT_BIOLOGY',
      coverArt: 'https://images.unsplash.com/photo-1599819177626-b50f9dd21c9b?q=80&w=2000&auto=format&fit=crop',
      createdAt: 0,
      isActive: true
    };
    
    const humanBodyDefault: ClassroomModule = {
      id: 'default_human_body',
      name: 'The Human Body Experience',
      description: 'Interactive 3D anatomy — explore organs, systems, and the biology that keeps you alive. Male and female bodies with medically accurate descriptions.',
      url: 'HUMAN_BODY',
      coverArt: 'https://images.unsplash.com/photo-1530026405186-ed1f139313f3?q=80&w=1000&auto=format&fit=crop',
      createdAt: 0,
      isActive: true
    };

    const nbaDefault: ClassroomModule = {
      id: 'default_sport_nba', name: 'NBA — How Basketball Works',
      description: 'Master basketball from tip-off to buzzer. Interactive court, positions, play simulations, and current league rules.',
      url: 'SPORT_NBA',
      coverArt: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=1000&auto=format&fit=crop',
      createdAt: 0, isActive: true,
    };
    const nflDefault: ClassroomModule = {
      id: 'default_sport_nfl', name: 'NFL — How Football Works',
      description: 'From the line of scrimmage to the end zone. Learn downs, formations, play types, and NFL scoring inside a live field sim.',
      url: 'SPORT_NFL',
      coverArt: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=1000&auto=format&fit=crop',
      createdAt: 0, isActive: true,
    };
    const mlbDefault: ClassroomModule = {
      id: 'default_sport_mlb', name: 'MLB — How Baseball Works',
      description: "Balls, strikes, innings, and outs — all the fundamentals of America's pastime with an interactive at-bat simulator.",
      url: 'SPORT_MLB',
      coverArt: 'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?q=80&w=1000&auto=format&fit=crop',
      createdAt: 0, isActive: true,
    };
    const nhlDefault: ClassroomModule = {
      id: 'default_sport_nhl', name: 'NHL — How Hockey Works',
      description: 'Periods, power plays, and the puck — dive into ice hockey rules, positions, and rink geography.',
      url: 'SPORT_NHL',
      coverArt: 'https://images.unsplash.com/photo-1515703407324-5f753afd8be8?q=80&w=1000&auto=format&fit=crop',
      createdAt: 0, isActive: true,
    };
    const fifaDefault: ClassroomModule = {
      id: 'default_sport_fifa', name: 'FIFA — How Soccer Works',
      description: 'Offside traps, set pieces, and formations — the beautiful game explained with an interactive pitch and live match sim.',
      url: 'SPORT_FIFA',
      coverArt: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=1000&auto=format&fit=crop',
      createdAt: 0, isActive: true,
    };
    const mlsDefault: ClassroomModule = {
      id: 'default_sport_mls', name: 'MLS — Major League Soccer',
      description: 'Everything you need to follow MLS — rules, teams, positions, and a quick-play match simulation.',
      url: 'SPORT_MLS',
      coverArt: 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?q=80&w=1000&auto=format&fit=crop',
      createdAt: 0, isActive: true,
    };

    // Check if defaults already exist in data to avoid duplicates if admin added it manually
    const finalModules = [...data];
    if (!data.some(m => m.url === 'SOLAR_SYSTEM')) finalModules.unshift(solarSystemDefault);
    if (!data.some(m => m.url === 'PLANT_BIOLOGY')) finalModules.unshift(plantBiologyDefault);
    if (!data.some(m => m.url === 'HUMAN_BODY')) finalModules.unshift(humanBodyDefault);
    if (!data.some(m => m.url === 'SPORT_NBA')) finalModules.push(nbaDefault);
    if (!data.some(m => m.url === 'SPORT_NFL')) finalModules.push(nflDefault);
    if (!data.some(m => m.url === 'SPORT_MLB')) finalModules.push(mlbDefault);
    if (!data.some(m => m.url === 'SPORT_NHL')) finalModules.push(nhlDefault);
    if (!data.some(m => m.url === 'SPORT_FIFA')) finalModules.push(fifaDefault);
    if (!data.some(m => m.url === 'SPORT_MLS')) finalModules.push(mlsDefault);

    setModules(finalModules);
  };

  const handleCreateModule = async () => {
    if (!newModule.name || !newModule.url) return alert('Please fill in module name and experience URL');
    await createClassroomModule(newModule);
    setShowModuleModal(false);
    setNewModule({ name: '', description: '', url: '', coverArt: '' });
    loadModules();
  };

  const handleDeleteModule = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this module?')) return;
    await deleteClassroomModule(id);
    loadModules();
  };

  const isAdmin = user?.role === 'admin' || user?.email === 'kmoody2003@gmail.com';

  const handleEnroll = async (classId: string) => {
    if (!user) return alert('Please sign in to enroll');
    await enrollInClassroom(classId);
    loadClassrooms();
  };

  const handleSeedDemo = async () => {
    setSeedingDemo(true);
    try {
      const demo = await seedDemoClassroom(user);
      setClassrooms(prev => {
        const exists = prev.find(c => c.id === demo.id);
        return exists ? prev.map(c => c.id === demo.id ? demo : c) : [demo, ...prev];
      });
      setActiveTab('EXPLORE');
    } finally {
      setSeedingDemo(false);
    }
  };

  const myClasses = classrooms.filter(c => c.enrolledStudents.includes(user?.uid || ''));
  const teachingClasses = classrooms.filter(c => c.ownerId === user?.uid);

  if (selectedClass) {
    return <ClassroomDetail classroom={selectedClass} onBack={() => setSelectedClass(null)} user={user} />;
  }

    if (selectedModule === 'SOLAR_SYSTEM') {
    return (
      <ErrorBoundary>
        <Suspense fallback={
          <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 border-2 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary animate-pulse">Syncing Star Maps...</p>
          </div>
        }>
          <SolarSystemModule onBack={() => setSelectedModule(null)} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (selectedModule === 'PLANT_BIOLOGY') {
    return (
      <ErrorBoundary>
        <Suspense fallback={
          <div className="min-h-screen bg-[#FDFCF0] flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 border-2 border-[#3E4A35]/20 border-t-[#3E4A35] rounded-full animate-spin mb-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[#3E4A35] animate-pulse">Gathering Botanical Samples...</p>
          </div>
        }>
          <PlantBiologyModule onBack={() => setSelectedModule(null)} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (selectedModule === 'HUMAN_BODY') {
    return (
      <ErrorBoundary>
        <Suspense fallback={
          <div className="min-h-screen bg-[#03060a] flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 border-2 border-cyan-400/20 border-t-cyan-400 rounded-full animate-spin mb-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-400 animate-pulse">Initialising Anatomy Scanner...</p>
          </div>
        }>
          <HumanBodyExperience onBack={() => setSelectedModule(null)} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  const SPORT_MODULE_MAP: Record<string, 'NBA' | 'NFL' | 'MLB' | 'NHL' | 'FIFA' | 'MLS'> = {
    SPORT_NBA: 'NBA', SPORT_NFL: 'NFL', SPORT_MLB: 'MLB',
    SPORT_NHL: 'NHL', SPORT_FIFA: 'FIFA', SPORT_MLS: 'MLS',
  };
  if (selectedModule && selectedModule in SPORT_MODULE_MAP) {
    const league = SPORT_MODULE_MAP[selectedModule];
    return (
      <ErrorBoundary>
        <Suspense fallback={
          <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 border-2 border-[#FF8C00]/20 border-t-[#FF8C00] rounded-full animate-spin mb-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[#FF8C00] animate-pulse">Loading {league} Playbook...</p>
          </div>
        }>
          <SportExplainerModule league={league} onBack={() => setSelectedModule(null)} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <div className="min-h-screen bg-transparent p-6 lg:p-12 text-[var(--text-primary)]">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-3 bg-[var(--card-bg)] hover:bg-[var(--card-bg)]/80 rounded-2xl transition-all border border-[var(--border-color)]">
              <ArrowLeft size={20} />
            </button>
            <div>
              <PageHeader textClassName="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Plajah Classrooms</PageHeader>
              <p className="text-[10px] font-bold text-[var(--text-primary)] opacity-40 uppercase tracking-widest">Virtual Learning Sanctuary</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-primary)] opacity-20" size={18} />
              <input 
                type="text" 
                placeholder="Search classes, teachers, topics..."
                className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl py-3 pl-12 pr-6 text-sm focus:outline-none focus:border-[var(--text-secondary)]/30 w-full lg:w-80 text-[var(--text-primary)]"
              />
            </div>
            <button
              onClick={() => openCreate('CREATOR')}
              className="px-6 py-3 bg-[var(--text-primary)] text-[var(--bg-color)] rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all"
            >
              <Plus size={16} />
              Create Class
            </button>
          </div>
        </div>

        {/* Demo ClassDojo-style class — behavior points, attendance, parent view */}
        {onNavigate && (
          <button
            onClick={() => onNavigate('CLASSROOM_DOJO')}
            className="w-full mb-4 flex items-center gap-3 rounded-2xl px-5 py-4 text-left transition-all hover:scale-[1.005]"
            style={{ border: '1px solid rgba(255,140,0,0.3)', background: 'linear-gradient(120deg, rgba(255,140,0,0.12), rgba(54,197,240,0.1))' }}
          >
            <span className="text-2xl">🎯</span>
            <div className="flex-1">
              <div className="text-sm font-black text-white flex items-center gap-2">Try the Demo Class <span className="bg-black/40 text-[#FFD24A] text-[8px] font-black tracking-widest px-2 py-0.5 rounded-full">DEMO</span></div>
              <div className="text-[11px] text-white/50">ClassDojo-style — award behavior points, take attendance, switch to the parent view.</div>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-[#FF8C00]">Open →</span>
          </button>
        )}

        {/* Reading Quest — gamified reading practice that awards Dojo points */}
        {onNavigate && (
          <button
            onClick={() => onNavigate('READING_QUEST')}
            className="w-full mb-4 flex items-center gap-3 rounded-2xl px-5 py-4 text-left transition-all hover:scale-[1.005]"
            style={{ border: '1px solid rgba(129,102,230,0.3)', background: 'linear-gradient(120deg, rgba(255,140,0,0.12), rgba(129,102,230,0.12))' }}
          >
            <span className="text-2xl">📖</span>
            <div className="flex-1">
              <div className="text-sm font-black text-white flex items-center gap-2">Reading Quest <span className="bg-black/40 text-[#FFD24A] text-[8px] font-black tracking-widest px-2 py-0.5 rounded-full">BETA</span></div>
              <div className="text-[11px] text-white/50">Pre-K–Grade 7 reading games + Phoneme Beat — finishing a quest awards points to the ClassDojo class story.</div>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-[#FF8C00]">Play →</span>
          </button>
        )}

        {/* Science Quest — NGSS cartridge on the same chassis */}
        {onNavigate && (
          <button
            onClick={() => onNavigate('SCIENCE_QUEST')}
            className="w-full mb-4 flex items-center gap-3 rounded-2xl px-5 py-4 text-left transition-all hover:scale-[1.005]"
            style={{ border: '1px solid rgba(54,197,240,0.3)', background: 'linear-gradient(120deg, rgba(129,102,230,0.12), rgba(54,197,240,0.12))' }}
          >
            <span className="text-2xl">🔬</span>
            <div className="flex-1">
              <div className="text-sm font-black text-white flex items-center gap-2">Science Quest <span className="bg-black/40 text-[#FFD24A] text-[8px] font-black tracking-widest px-2 py-0.5 rounded-full">BETA</span></div>
              <div className="text-[11px] text-white/50">Pre-K–Grade 7 NGSS science practices — observe, analyze, explain. Same engine as Reading Quest; writes the learner ledger + Turbo.</div>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-[#36c5f0]">Play →</span>
          </button>
        )}

        {/* Featured learning hero card */}
        {onNavigate && (
          <div className="mb-8">
            <button
              onClick={() => onNavigate('MATH_CLASSROOM')}
              className="relative w-full rounded-[1.75rem] overflow-hidden group hover:scale-[1.01] transition-all duration-300 shadow-2xl"
              style={{ border: '1px solid rgba(167,139,250,0.3)', height: 160 }}
            >
              {/* Animated gradient bg */}
              <div className="absolute inset-0 bg-gradient-to-br from-violet-950/90 via-indigo-900/70 to-purple-950/90" />
              {/* Decorative math symbols */}
              <div className="absolute inset-0 flex items-center justify-end pr-8 pointer-events-none select-none">
                <span className="text-[10rem] font-black text-white/5 leading-none">π</span>
              </div>
              <div className="absolute top-4 left-1/3 text-6xl opacity-5 select-none">∑</div>
              <div className="absolute bottom-4 left-1/2 text-5xl opacity-5 select-none">√</div>
              {/* Grid of floating number tiles */}
              <div className="absolute inset-0 grid grid-cols-8 gap-2 p-4 pointer-events-none opacity-10">
                {['1+1','2×3','7−4','9÷3','¼','%','∞','x²'].map((s, i) => (
                  <div key={i} className="flex items-center justify-center bg-white/20 rounded-lg text-[8px] font-black text-white">{s}</div>
                ))}
              </div>
              <div className="relative h-full flex flex-col justify-between p-6">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-[7px] font-black uppercase tracking-[0.35em] text-amber-400">New · Beta</span>
                  </div>
                  <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 rounded-full text-[7px] font-black text-amber-400 uppercase tracking-widest">BETA</span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-purple-300/80 mb-1">Grades 1–8 · Flash Cards · Quizzes</p>
                    <h3 className="text-2xl font-black text-white leading-tight">Math Classroom</h3>
                    <p className="text-[10px] text-white/50 mt-1">The most addictive way to learn math →</p>
                  </div>
                  <div className="flex gap-2 pb-1">
                    {['1','2','3','4','5','6','7','8'].map(g => (
                      <div key={g} className="w-6 h-6 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-[8px] font-black text-white/60">{g}</div>
                    ))}
                  </div>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-10 p-1 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-full w-fit">
          {[
            { id: 'MODULES', label: 'Modules', icon: Sparkles },
            { id: 'EXPLORE', label: 'Academic Classes', icon: GraduationCap },
            { id: 'COURSES', label: 'Creator Courses', icon: Video },
            { id: 'MY_CLASSES', label: 'My Learning', icon: BookOpen },
            { id: 'TEACHING', label: 'Teaching', icon: Users }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === tab.id 
                  ? 'bg-[var(--text-primary)] text-[var(--bg-color)]' 
                  : 'text-[var(--text-primary)] opacity-40 hover:opacity-100 hover:bg-[var(--card-bg)]/50'
              }`}
            >
              {/* @ts-ignore */}
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Teaching: two parallel tracks sharing the same classroom infrastructure */}
        {activeTab === 'TEACHING' && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-5 p-1 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-full w-fit">
              {([['ACADEMIC', '🎓 Teacher · Academic'], ['CREATOR', '🎨 Instructor · Creator Course']] as ['ACADEMIC' | 'CREATOR', string][]).map(([m, label]) => (
                <button key={m} onClick={() => setTeachingMode(m)}
                  className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${teachingMode === m ? 'bg-[var(--text-primary)] text-[var(--bg-color)]' : 'text-[var(--text-primary)] opacity-40 hover:opacity-100'}`}>
                  {label}
                </button>
              ))}
            </div>

            {teachingMode === 'ACADEMIC' ? (
              <div className="space-y-4">
                <div className="p-5 rounded-[2rem]" style={{ border: '1px solid rgba(255,140,0,0.25)', background: 'linear-gradient(120deg, rgba(255,140,0,0.08), rgba(129,102,230,0.08))' }}>
                  <div className="text-sm font-black text-white mb-1">Academic class — standards-aligned & ledger-backed</div>
                  <div className="text-[11px] text-white/50 leading-relaxed">For K-12 / academia. Provision student accounts, align to international standards, and every activity writes to the learner's portable ledger.</div>
                  <button onClick={() => openCreate('ACADEMIC')} className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-small-orange text-white text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all"><Plus size={14} /> Create academic class</button>
                </div>
                {user && (
                  <div className="p-5 sm:p-6 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[2rem]">
                    <TeacherStudentsPanel user={user} />
                  </div>
                )}
              </div>
            ) : (
              <div className="p-5 rounded-[2rem]" style={{ border: '1px solid rgba(129,102,230,0.25)', background: 'linear-gradient(120deg, rgba(129,102,230,0.1), rgba(54,197,240,0.06))' }}>
                <div className="text-sm font-black text-white mb-1">Creator course — teach your craft</div>
                <div className="text-[11px] text-white/50 leading-relaxed">MasterClass / Skillshare-style. Share your expertise (photography, music, business…), set a price or make it free, and learners enroll directly — no student provisioning needed.</div>
                <button onClick={() => openCreate('CREATOR')} className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] transition-all"><Plus size={14} /> Create creator course</button>
              </div>
            )}
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {activeTab === 'MODULES' && (
             <>
               {isAdmin && (
                 <motion.button 
                   initial={{ opacity: 0, y: 20 }}
                   animate={{ opacity: 1, y: 0 }}
                   onClick={() => setShowModuleModal(true)}
                   className="group relative aspect-[9/16] bg-[var(--card-bg)] border border-dashed border-[var(--border-color)] rounded-[2.5rem] flex flex-col items-center justify-center gap-4 hover:border-[var(--text-secondary)]/40 transition-all font-bebas text-xl tracking-widest text-[var(--text-primary)] opacity-40 hover:opacity-100"
                 >
                   <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all">
                    <Plus size={32} />
                   </div>
                   Setup Module
                 </motion.button>
               )}
               
               {modules.map((module, idx) => (
                 <motion.div 
                    key={module.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => setSelectedModule(module.url)}
                    className="group relative aspect-[9/16] bg-[var(--bg-color)] border border-[var(--border-color)] rounded-[2.5rem] overflow-hidden hover:border-[var(--text-secondary)]/50 transition-all cursor-pointer shadow-2xl"
                  >
                      <img 
                        src={module.coverArt || "https://images.unsplash.com/photo-1454789548928-1f63080f5509?q=80&w=1000&auto=format&fit=crop"} 
                        className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
                        alt={module.name}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-color)] via-[var(--bg-color)]/40 to-transparent" />
                      
                      {isAdmin && !module.id.startsWith('default_') && (
                        <button 
                          onClick={(e) => handleDeleteModule(module.id, e)}
                          className="absolute top-6 right-6 p-2 bg-red-500/20 text-red-500 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white"
                        >
                          <FileText size={16} /> {/* Using FileText as a generic icon or could use Trash if available */}
                        </button>
                      )}

                      <div className="absolute inset-0 p-8 flex flex-col justify-end">
                        <div className="flex items-center gap-2 mb-4">
                          <Star className="text-[var(--text-secondary)] fill-[var(--text-secondary)]" size={12} />
                          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-secondary)]">Classroom Module {String(idx + 1).padStart(2, '0')}</span>
                        </div>
                        <h3 className="text-4xl font-black uppercase tracking-tightest leading-[0.9] mb-4 group-hover:scale-105 transition-transform origin-left">{module.name}</h3>
                        <p className="text-[10px] text-[var(--text-primary)] opacity-40 uppercase tracking-widest leading-loose mb-8 line-clamp-3">
                          {module.description}
                        </p>
                        
                        <div className="flex items-center justify-between pointer-events-none">
                          <span className="text-[10px] font-black uppercase tracking-widest text-[#00FF00]">Free Access</span>
                          <div className="w-12 h-12 rounded-full border border-[var(--border-color)] flex items-center justify-center group-hover:bg-[var(--text-primary)] group-hover:text-[var(--bg-color)] transition-all">
                            <ChevronRight size={20} />
                          </div>
                        </div>
                      </div>
                  </motion.div>
               ))}

               {modules.length === 0 && !isAdmin && (
                 <div className="col-span-full py-32 text-center bg-white/5 rounded-[3rem] border border-white/10">
                   <Sparkles className="mx-auto mb-6 text-white/20" size={48} />
                   <h3 className="text-2xl font-black uppercase tracking-widest mb-2 font-bebas">No Modules Loaded</h3>
                   <p className="text-[10px] text-white/40 uppercase tracking-widest">Check back later for cosmic learning experiences.</p>
                 </div>
               )}
             </>
          )}

          {activeTab !== 'MODULES' && (() => {
            const trackOf = (c: Classroom) => c.track || 'CREATOR';
            const pool =
              activeTab === 'EXPLORE' ? classrooms.filter(c => trackOf(c) === 'ACADEMIC') :
              activeTab === 'COURSES' ? classrooms.filter(c => trackOf(c) === 'CREATOR') :
              activeTab === 'MY_CLASSES' ? myClasses :
              teachingClasses;

            if (loading) return (
              <div className="col-span-full flex flex-col items-center justify-center py-24">
                <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Loading classrooms…</p>
              </div>
            );

            if (pool.length === 0) return (
              <div className="col-span-full py-16 px-8 text-center bg-white/[0.03] border border-dashed border-white/10 rounded-[3rem]">
                <GraduationCap size={48} className="mx-auto mb-6 text-white/10" />
                {activeTab === 'EXPLORE' && (
                  <>
                    <h3 className="text-2xl font-black uppercase tracking-tightest mb-3">No Classes Yet</h3>
                    <p className="text-[10px] text-white/30 uppercase tracking-widest mb-8">Be the first to create one, or load a demo to see how it looks.</p>
                    <div className="flex flex-wrap items-center justify-center gap-4">
                      <button
                        onClick={() => openCreate('CREATOR')}
                        className="flex items-center gap-2 px-8 py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all"
                      >
                        <Plus size={14} /> Create a Class
                      </button>
                      {(isAdmin || user) && (
                        <button
                          onClick={handleSeedDemo}
                          disabled={seedingDemo}
                          className="flex items-center gap-2 px-8 py-4 bg-small-orange text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50"
                        >
                          {seedingDemo ? (
                            <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Seeding…</>
                          ) : (
                            <><Sparkles size={14} /> Load Demo Classroom</>
                          )}
                        </button>
                      )}
                    </div>
                  </>
                )}
                {activeTab === 'COURSES' && (
                  <>
                    <h3 className="text-2xl font-black uppercase tracking-tightest mb-3">No Courses Yet</h3>
                    <p className="text-[10px] text-white/30 uppercase tracking-widest mb-8">MasterClass-style courses from creators. Be the first to teach your craft.</p>
                    <button onClick={() => openCreate('CREATOR')} className="flex items-center gap-2 px-8 py-4 bg-white text-black mx-auto rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all">
                      <Plus size={14} /> Create a Course
                    </button>
                  </>
                )}
                {activeTab === 'MY_CLASSES' && (
                  <>
                    <h3 className="text-2xl font-black uppercase tracking-tightest mb-3">Not Enrolled Yet</h3>
                    <p className="text-[10px] text-white/30 uppercase tracking-widest mb-6">Explore classes and enroll to start learning.</p>
                    <button onClick={() => setActiveTab('COURSES')} className="px-8 py-4 bg-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all">
                      Browse Courses
                    </button>
                  </>
                )}
                {activeTab === 'TEACHING' && (
                  <>
                    <h3 className="text-2xl font-black uppercase tracking-tightest mb-3">No Classes Created</h3>
                    <p className="text-[10px] text-white/30 uppercase tracking-widest mb-6">Create your first class and start teaching.</p>
                    <button onClick={() => openCreate(teachingMode)} className="flex items-center gap-2 px-8 py-4 bg-white text-black mx-auto rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all">
                      <Plus size={14} /> Create a {teachingMode === 'ACADEMIC' ? 'Class' : 'Course'}
                    </button>
                  </>
                )}
              </div>
            );

            return pool.map(cls => (
              <motion.div
                key={cls.id}
                layoutId={cls.id}
                onClick={() => setSelectedClass(cls)}
                className="group relative bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden hover:border-white/30 transition-all cursor-pointer"
              >
                <div className="aspect-video relative">
                  <img src={cls.thumbnailUrl || ''} className="w-full h-full object-cover" alt={cls.title} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute top-4 left-4 flex items-center gap-2">
                    <div className="px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-xl border border-white/10">
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/60">{cls.category}</span>
                    </div>
                    <div className="px-2.5 py-1.5 backdrop-blur-md rounded-xl border" style={trackOf(cls) === 'ACADEMIC' ? { background: 'rgba(255,140,0,0.18)', borderColor: 'rgba(255,140,0,0.4)' } : { background: 'rgba(129,102,230,0.18)', borderColor: 'rgba(129,102,230,0.4)' }}>
                      <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: trackOf(cls) === 'ACADEMIC' ? '#FF8C00' : '#a78bfa' }}>{trackOf(cls) === 'ACADEMIC' ? '🎓 Academic' : '🎨 Course'}</span>
                    </div>
                  </div>
                  {cls.price > 0 && (
                    <div className="absolute top-4 right-4 px-3 py-1.5 bg-small-orange rounded-xl flex items-center gap-2 shadow-xl">
                      <span className="text-[10px] font-black text-white">${cls.price}</span>
                    </div>
                  )}
                  {cls.price === 0 && (
                    <div className="absolute top-4 right-4 px-3 py-1.5 bg-green-500/80 backdrop-blur-sm rounded-xl">
                      <span className="text-[10px] font-black text-white">Free</span>
                    </div>
                  )}
                </div>

                <div className="p-8">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-full bg-white/10 border border-white/10 flex items-center justify-center">
                      <Users size={12} className="text-white/40" />
                    </div>
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{cls.ownerName}</span>
                  </div>

                  <h3 className="text-xl font-black uppercase tracking-tightest mb-2 group-hover:text-[var(--text-secondary)] transition-colors">{cls.title}</h3>
                  <p className="text-[10px] text-[var(--text-primary)]/40 uppercase tracking-widest leading-relaxed mb-6 line-clamp-2">{cls.description}</p>

                  <div className="flex items-center justify-between pt-6 border-t border-white/5">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <BookOpen size={14} className="text-white/20" />
                        <span className="text-[10px] font-black text-white/40">{cls.lessons.length} Lessons</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Users size={14} className="text-white/20" />
                        <span className="text-[10px] font-black text-white/40">{cls.enrolledStudents.length} Students</span>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-white/20 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </motion.div>
            ));
          })()}
        </div>
      </div>

      {/* Create Module Modal */}
      <AnimatePresence>
        {showModuleModal && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 text-white">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModuleModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-lg bg-[var(--bg-color)] border border-[var(--border-color)] rounded-[3rem] p-10 overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[var(--text-secondary)] via-[var(--text-primary)] to-[var(--text-secondary)]" />
              
              <h2 className="text-4xl font-black uppercase tracking-tightest mb-8 font-bebas text-[var(--text-primary)]">Setup New Module</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/40 block mb-2">Module Name</label>
                  <input 
                    type="text" 
                    value={newModule.name}
                    onChange={(e) => setNewModule({...newModule, name: e.target.value})}
                    placeholder="e.g. The Quantum Realm"
                    className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-4 text-sm focus:outline-none focus:border-[var(--text-secondary)] transition-all text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/40 block mb-2">Experience Route/ID (Internal)</label>
                  <input 
                    type="text" 
                    value={newModule.url}
                    onChange={(e) => setNewModule({...newModule, url: e.target.value})}
                    placeholder="e.g. SOLAR_SYSTEM"
                    className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-4 text-sm focus:outline-none focus:border-[var(--text-secondary)] transition-all font-mono text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/40 block mb-2">Description</label>
                  <textarea 
                    value={newModule.description}
                    onChange={(e) => setNewModule({...newModule, description: e.target.value})}
                    placeholder="Briefly describe the learning experience..."
                    rows={3}
                    className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-4 text-sm focus:outline-none focus:border-[var(--text-secondary)] transition-all resize-none text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/40 block mb-2">Cover Art URL</label>
                  <input 
                    type="text" 
                    value={newModule.coverArt}
                    onChange={(e) => setNewModule({...newModule, coverArt: e.target.value})}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-4 text-sm focus:outline-none focus:border-[var(--text-secondary)] transition-all text-[var(--text-primary)]"
                  />
                </div>
                
                  <div className="flex gap-4 pt-4">
                    <button 
                      onClick={() => setShowModuleModal(false)}
                      className="flex-1 py-4 bg-[var(--card-bg)] rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[var(--card-bg)]/80 text-[var(--text-primary)] border border-[var(--border-color)]"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleCreateModule}
                      className="flex-1 py-4 bg-[var(--text-secondary)] text-[var(--bg-color)] rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl hover:scale-105 transition-all"
                    >
                      Confirm Setup
                    </button>
                  </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Class Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateClassModal
            user={user}
            track={createTrack}
            onClose={() => setShowCreateModal(false)}
            onCreated={(cls) => {
              setClassrooms(prev => [cls, ...prev.filter(c => c.id !== cls.id)]);
              setSelectedClass(cls);
              setShowCreateModal(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ── HELPERS ───────────────────────────────────────────────────────────────────

function dueDateColor(dueDate: number) {
  const diff = dueDate - Date.now();
  if (diff < 0) return 'text-red-400';
  if (diff < 86400000) return 'text-amber-400';
  return 'text-white/50';
}

function formatDue(dueDate: number) {
  const diff = dueDate - Date.now();
  if (diff < 0) return 'Past due';
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

function gradeColor(pct: number) {
  if (pct >= 90) return '#22c55e';
  if (pct >= 75) return '#eab308';
  if (pct >= 60) return '#f97316';
  return '#ef4444';
}

// ── CLASSROOM DETAIL ──────────────────────────────────────────────────────────

const ClassroomDetail: React.FC<{ classroom: Classroom; onBack: () => void; user: any }> = ({ classroom, onBack, user }) => {
  const [activeTab, setActiveTab] = useState<'SYLLABUS' | 'LESSONS' | 'ASSIGNMENTS' | 'LIVE' | 'GRADES'>('SYLLABUS');
  const [isEnrolled, setIsEnrolled] = useState(classroom.enrolledStudents.includes(user?.uid || ''));
  const [isOwner] = useState(classroom.ownerId === user?.uid);

  // Assignments + submissions state
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submitText, setSubmitText] = useState('');
  const [submitUrl, setSubmitUrl] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Grades state
  const [grades, setGrades] = useState<StudentGrade[]>([]);

  // Live sessions state
  const [sessions, setSessions] = useState<LiveClassSession[]>([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [sessionForm, setSessionForm] = useState({ title: '', scheduledAt: '', durationMinutes: 60, meetingUrl: '' });
  const [savingSession, setSavingSession] = useState(false);

  // Grading state (teacher view)
  const [gradingSubmission, setGradingSubmission] = useState<Submission | null>(null);
  const [gradeInput, setGradeInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');

  useEffect(() => {
    if (activeTab === 'ASSIGNMENTS' && (isEnrolled || isOwner)) loadSubmissions();
    if (activeTab === 'GRADES'      && (isEnrolled || isOwner)) loadGrades();
    if (activeTab === 'LIVE'        && (isEnrolled || isOwner)) loadSessions();
  }, [activeTab]);

  const loadSubmissions = async () => {
    try {
      const q = query(
        collection(db, 'submissions'),
        where('classroomId', '==', classroom.id),
        ...(!isOwner ? [where('studentId', '==', user?.uid)] : []),
      );
      const snap = await getDocs(q);
      setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Submission)));
    } catch {}
  };

  const loadGrades = async () => {
    try {
      const q = query(
        collection(db, 'studentGrades'),
        where('classroomId', '==', classroom.id),
        ...(!isOwner ? [where('studentId', '==', user?.uid)] : []),
      );
      const snap = await getDocs(q);
      setGrades(snap.docs.map(d => ({ id: d.id, ...d.data() } as StudentGrade)));
    } catch {}
  };

  const loadSessions = async () => {
    try {
      const q = query(
        collection(db, 'liveClassSessions'),
        where('classroomId', '==', classroom.id),
        orderBy('scheduledAt', 'desc'),
      );
      const snap = await getDocs(q);
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as LiveClassSession)));
    } catch {}
  };

  const handleSubmitAssignment = async (assignment: Assignment) => {
    if (!submitText.trim() && !submitUrl.trim()) return setSubmitError('Add text or a link to your submission');
    setSubmitting(true); setSubmitError('');
    try {
      await submitAssignment({
        assignmentId: assignment.id,
        studentId: user?.uid,
        studentName: user?.displayName ?? 'Student',
        textContent: submitText.trim() || undefined,
        contentUrl: submitUrl.trim() || undefined,
        timestamp: Date.now(),
      });
      setSubmittingId(null); setSubmitText(''); setSubmitUrl('');
      await loadSubmissions();
    } catch (e: any) {
      setSubmitError(e.message ?? 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGrade = async () => {
    if (!gradingSubmission) return;
    const g = parseFloat(gradeInput);
    if (isNaN(g)) return;
    try {
      await gradeSubmission(gradingSubmission.id, g, feedbackInput);
      // Also save to studentGrades for easy progress lookup
      await addDoc(collection(db, 'studentGrades'), {
        classroomId: classroom.id,
        studentId: gradingSubmission.studentId,
        studentName: gradingSubmission.studentName,
        assignmentId: gradingSubmission.assignmentId,
        grade: g,
        maxPoints: classroom.assignments.find(a => a.id === gradingSubmission.assignmentId)?.maxPoints ?? 100,
        feedback: feedbackInput,
        gradedBy: user?.uid,
        gradedAt: Date.now(),
      });
      setGradingSubmission(null); setGradeInput(''); setFeedbackInput('');
      await loadSubmissions();
      await loadGrades();
    } catch {}
  };

  const handleScheduleSession = async () => {
    if (!sessionForm.title || !sessionForm.scheduledAt) return;
    setSavingSession(true);
    try {
      await addDoc(collection(db, 'liveClassSessions'), {
        classroomId: classroom.id,
        hostId: user?.uid,
        title: sessionForm.title,
        scheduledAt: new Date(sessionForm.scheduledAt).getTime(),
        durationMinutes: sessionForm.durationMinutes,
        meetingUrl: sessionForm.meetingUrl || undefined,
        status: 'SCHEDULED',
        attendeeIds: [],
        createdAt: Date.now(),
      });
      setShowScheduleModal(false);
      setSessionForm({ title: '', scheduledAt: '', durationMinutes: 60, meetingUrl: '' });
      await loadSessions();
    } catch {}
    setSavingSession(false);
  };

  const totalGradePoints = grades.reduce((s, g) => s + g.grade, 0);
  const totalMaxPoints   = grades.reduce((s, g) => s + g.maxPoints, 0);
  const overallPct = totalMaxPoints > 0 ? Math.round((totalGradePoints / totalMaxPoints) * 100) : null;

  const upcomingSessions = sessions.filter(s => s.status !== 'ENDED' && s.scheduledAt > Date.now()).sort((a, b) => a.scheduledAt - b.scheduledAt);
  const pastSessions = sessions.filter(s => s.status === 'ENDED' || s.scheduledAt <= Date.now());

  return (
    <div className="min-h-screen bg-[var(--bg-color)] text-[var(--text-primary)]">
      {/* Hero Section */}
      <div className="relative h-[40vh] lg:h-[50vh] overflow-hidden">
        <img src={classroom.thumbnailUrl || ''} className="w-full h-full object-cover opacity-40" alt="" />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-color)] via-[var(--bg-color)]/40 to-transparent" />

        <div className="absolute inset-0 p-6 lg:p-12 flex flex-col justify-end">
          <div className="max-w-7xl mx-auto w-full">
            <button onClick={onBack} className="mb-8 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-all">
              <ArrowLeft size={16} /> Back to Explore
            </button>

            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
              <div className="max-w-3xl">
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-lg text-[8px] font-black uppercase tracking-widest border border-white/10">{classroom.category}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-white text-black flex items-center justify-center"><GraduationCap size={12} /></div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Taught by {classroom.ownerName}</span>
                  </div>
                </div>
                <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">{classroom.title}</h1>
                <p className="text-sm lg:text-base text-white/40 uppercase tracking-widest leading-relaxed">{classroom.description}</p>
              </div>
              {!isEnrolled && !isOwner && (
                <button
                  onClick={() => enrollInClassroom(classroom.id)}
                  className="px-12 py-6 bg-white text-black rounded-[2rem] text-sm font-black uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_50px_rgba(255,255,255,0.2)]"
                >
                  Enroll Now {classroom.price > 0 ? `- $${classroom.price}` : '(Free)'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6 lg:p-12">
        <div className="flex flex-col lg:flex-row gap-12">
          {/* Left: Navigation */}
          <div className="lg:w-64 flex-shrink-0">
            <div className="sticky top-12 space-y-2">
              {[
                { id: 'SYLLABUS',     label: 'Syllabus',     icon: FileText   },
                { id: 'LESSONS',      label: 'Lessons',       icon: PlayCircle, locked: !isEnrolled && !isOwner },
                { id: 'ASSIGNMENTS',  label: 'Assignments',   icon: BookOpen,   locked: !isEnrolled && !isOwner },
                { id: 'LIVE',         label: 'Live Sessions', icon: Video,      locked: !isEnrolled && !isOwner },
                { id: 'GRADES',       label: 'Progress',      icon: BarChart3,  locked: !isEnrolled && !isOwner },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => !tab.locked && setActiveTab(tab.id as any)}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    activeTab === tab.id ? 'bg-white text-black' : 'text-white/40 hover:text-white hover:bg-white/5'
                  } ${tab.locked ? 'opacity-30 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    {/* @ts-ignore */}
                    <tab.icon size={16} />
                    {tab.label}
                  </div>
                  {tab.locked && <Lock size={12} />}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Tab Content */}
          <div className="flex-1 min-h-[600px]">
            <AnimatePresence mode="wait">

              {/* SYLLABUS */}
              {activeTab === 'SYLLABUS' && (
                <motion.div key="syllabus" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                  className="bg-white/5 border border-white/10 rounded-[3rem] p-10 lg:p-16">
                  <h2 className="text-3xl font-black uppercase tracking-tightest mb-10">Course Syllabus</h2>
                  <p className="text-white/60 leading-loose whitespace-pre-wrap uppercase tracking-widest text-xs">
                    {classroom.syllabus || 'No syllabus provided yet.'}
                  </p>
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 mt-10">
                    {[
                      { label: 'Lessons', value: classroom.lessons.length, icon: PlayCircle },
                      { label: 'Assignments', value: classroom.assignments.length, icon: BookOpen },
                      { label: 'Students', value: classroom.enrolledStudents.length, icon: Users },
                    ].map(s => (
                      <div key={s.label} className="bg-white/5 rounded-2xl p-4 text-center border border-white/5">
                        <s.icon size={20} className="mx-auto mb-2 text-white/20" />
                        <div className="text-2xl font-black">{s.value}</div>
                        <div className="text-[9px] uppercase tracking-widest text-white/30 mt-1">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* LESSONS */}
              {activeTab === 'LESSONS' && (
                <motion.div key="lessons" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  {classroom.lessons.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white/5 border border-white/10 rounded-[3rem] text-center">
                      <PlayCircle size={40} className="text-white/10 mb-4" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/30">No lessons published yet.</p>
                    </div>
                  ) : classroom.lessons.map((lesson, i) => (
                    <div key={lesson.id} className="group p-6 bg-white/5 border border-white/10 rounded-3xl flex items-center justify-between hover:border-white/30 transition-all">
                      <div className="flex items-center gap-6">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/20 font-black">{i + 1}</div>
                        <div>
                          <h4 className="text-sm font-black uppercase tracking-widest mb-1">{lesson.title}</h4>
                          <p className="text-[10px] text-white/40 uppercase tracking-widest">{lesson.type} · {lesson.description}</p>
                        </div>
                      </div>
                      <button className="p-4 bg-white/5 rounded-2xl text-white/40 group-hover:bg-white group-hover:text-black transition-all">
                        <PlayCircle size={20} />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}

              {/* ASSIGNMENTS */}
              {activeTab === 'ASSIGNMENTS' && (
                <motion.div key="assignments" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  {/* Grading modal for teachers */}
                  <AnimatePresence>
                    {gradingSubmission && isOwner && (
                      <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setGradingSubmission(null)} />
                        <motion.div className="relative w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-3xl p-8 space-y-4"
                          initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}>
                          <h3 className="text-lg font-black uppercase tracking-widest">Grade Submission</h3>
                          <div className="bg-white/5 rounded-2xl p-4 text-sm text-white/70 max-h-32 overflow-y-auto">
                            {gradingSubmission.textContent || 'No text — see attached link.'}
                          </div>
                          {gradingSubmission.contentUrl && (
                            <a href={gradingSubmission.contentUrl} target="_blank" rel="noreferrer"
                              className="flex items-center gap-2 text-[--small-orange] text-sm">
                              <Link2 size={14} /> View submission link
                            </a>
                          )}
                          <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-2">
                              Grade / {classroom.assignments.find(a => a.id === gradingSubmission.assignmentId)?.maxPoints ?? 100} pts
                            </label>
                            <input type="number" value={gradeInput} onChange={e => setGradeInput(e.target.value)} placeholder="e.g. 85"
                              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none" />
                          </div>
                          <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-2">Feedback</label>
                            <textarea value={feedbackInput} onChange={e => setFeedbackInput(e.target.value)} rows={3}
                              placeholder="Optional feedback for the student..."
                              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white resize-none focus:outline-none" />
                          </div>
                          <div className="flex gap-3">
                            <button onClick={() => setGradingSubmission(null)}
                              className="flex-1 py-3 bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest">Cancel</button>
                            <button onClick={handleGrade}
                              className="flex-1 py-3 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest">Submit Grade</button>
                          </div>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {classroom.assignments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white/5 border border-white/10 rounded-[3rem] text-center">
                      <BookOpen size={40} className="text-white/10 mb-4" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/30">No assignments yet.</p>
                    </div>
                  ) : classroom.assignments.map(assignment => {
                    const mySubmission = submissions.find(s => s.assignmentId === assignment.id && (!isOwner || true));
                    const submissionsForThis = isOwner ? submissions.filter(s => s.assignmentId === assignment.id) : [];
                    const isPastDue = assignment.dueDate < Date.now();

                    return (
                      <div key={assignment.id} className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
                        {/* Assignment header */}
                        <div className="p-6 flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-sm font-black uppercase tracking-widest">{assignment.title}</h4>
                              {mySubmission && !isOwner && (
                                <span className="text-[9px] font-bold bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <CheckCircle2 size={9} /> Submitted
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-white/40 uppercase tracking-widest leading-relaxed">{assignment.description}</p>
                            <div className="flex items-center gap-4 mt-3">
                              <span className={`text-[10px] font-bold flex items-center gap-1 ${dueDateColor(assignment.dueDate)}`}>
                                <Clock size={10} /> {formatDue(assignment.dueDate)}
                              </span>
                              <span className="text-[10px] text-white/30">{assignment.maxPoints} pts</span>
                              {isOwner && submissionsForThis.length > 0 && (
                                <span className="text-[10px] text-white/40">{submissionsForThis.length} submission{submissionsForThis.length !== 1 ? 's' : ''}</span>
                              )}
                            </div>
                          </div>
                          {!isOwner && !mySubmission && !isPastDue && (
                            <button onClick={() => setSubmittingId(submittingId === assignment.id ? null : assignment.id)}
                              className="flex-shrink-0 px-4 py-2 bg-white text-black rounded-2xl text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all">
                              Submit
                            </button>
                          )}
                          {mySubmission && !isOwner && mySubmission.grade !== undefined && (
                            <div className="flex-shrink-0 text-center">
                              <div className="text-2xl font-black" style={{ color: gradeColor((mySubmission.grade / assignment.maxPoints) * 100) }}>
                                {mySubmission.grade}
                              </div>
                              <div className="text-[9px] text-white/30">/ {assignment.maxPoints}</div>
                            </div>
                          )}
                        </div>

                        {/* Student submission form */}
                        <AnimatePresence>
                          {submittingId === assignment.id && !isOwner && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden border-t border-white/10">
                              <div className="p-6 space-y-3">
                                <textarea value={submitText} onChange={e => setSubmitText(e.target.value)} rows={4}
                                  placeholder="Write your answer here..."
                                  className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white resize-none focus:outline-none focus:border-white/30" />
                                <div className="flex gap-3">
                                  <div className="flex-1 relative">
                                    <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                                    <input value={submitUrl} onChange={e => setSubmitUrl(e.target.value)}
                                      placeholder="Or paste a link (Google Drive, GitHub...)"
                                      className="w-full bg-black/30 border border-white/10 rounded-2xl pl-9 pr-4 py-3 text-sm text-white focus:outline-none focus:border-white/30" />
                                  </div>
                                  <button onClick={() => handleSubmitAssignment(assignment)} disabled={submitting}
                                    className="px-5 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center gap-2">
                                    <Send size={14} /> {submitting ? '…' : 'Submit'}
                                  </button>
                                </div>
                                {submitError && (
                                  <div className="flex items-center gap-2 text-red-400 text-xs">
                                    <AlertCircle size={12} /> {submitError}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Teacher: see all submissions */}
                        {isOwner && submissionsForThis.length > 0 && (
                          <div className="border-t border-white/10 p-4 space-y-2">
                            <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Submissions</p>
                            {submissionsForThis.map(sub => (
                              <div key={sub.id} className="flex items-center gap-3 bg-white/5 rounded-2xl p-3">
                                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-black">
                                  {sub.studentName[0]}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-bold text-white truncate">{sub.studentName}</div>
                                  <div className="text-[9px] text-white/30">{new Date(sub.timestamp).toLocaleDateString()}</div>
                                </div>
                                {sub.grade !== undefined ? (
                                  <span className="text-xs font-black" style={{ color: gradeColor((sub.grade / assignment.maxPoints) * 100) }}>
                                    {sub.grade}/{assignment.maxPoints}
                                  </span>
                                ) : (
                                  <button onClick={() => { setGradingSubmission(sub); setGradeInput(''); setFeedbackInput(''); }}
                                    className="text-[9px] font-black uppercase tracking-widest text-[--small-orange] hover:text-white transition-colors">
                                    Grade
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </motion.div>
              )}

              {/* LIVE SESSIONS */}
              {activeTab === 'LIVE' && (
                <motion.div key="live" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  {/* Teacher controls */}
                  {isOwner && (
                    <div className="flex justify-end">
                      <button onClick={() => setShowScheduleModal(true)}
                        className="flex items-center gap-2 px-5 py-3 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all">
                        <Plus size={14} /> Schedule Session
                      </button>
                    </div>
                  )}

                  {/* Schedule modal */}
                  <AnimatePresence>
                    {showScheduleModal && (
                      <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowScheduleModal(false)} />
                        <motion.div className="relative w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-3xl p-8 space-y-4"
                          initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}>
                          <div className="flex justify-between items-center">
                            <h3 className="text-lg font-black uppercase tracking-widest">Schedule Live Session</h3>
                            <button onClick={() => setShowScheduleModal(false)} className="text-white/40 hover:text-white"><X size={18} /></button>
                          </div>
                          <div className="space-y-3">
                            <input value={sessionForm.title} onChange={e => setSessionForm(p => ({ ...p, title: e.target.value }))}
                              placeholder="Session title" className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none" />
                            <input type="datetime-local" value={sessionForm.scheduledAt} onChange={e => setSessionForm(p => ({ ...p, scheduledAt: e.target.value }))}
                              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none" />
                            <div className="flex gap-3">
                              <select value={sessionForm.durationMinutes} onChange={e => setSessionForm(p => ({ ...p, durationMinutes: Number(e.target.value) }))}
                                className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none">
                                {[30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}
                              </select>
                            </div>
                            <input value={sessionForm.meetingUrl} onChange={e => setSessionForm(p => ({ ...p, meetingUrl: e.target.value }))}
                              placeholder="Meeting URL (Zoom, Google Meet...)" className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none" />
                          </div>
                          <div className="flex gap-3">
                            <button onClick={() => setShowScheduleModal(false)}
                              className="flex-1 py-3 bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/60">Cancel</button>
                            <button onClick={handleScheduleSession} disabled={savingSession}
                              className="flex-1 py-3 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40">
                              {savingSession ? 'Saving…' : 'Schedule'}
                            </button>
                          </div>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Upcoming sessions */}
                  {upcomingSessions.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Upcoming</p>
                      {upcomingSessions.map(session => {
                        const isLive = session.status === 'LIVE';
                        return (
                          <div key={session.id} className={`p-6 rounded-3xl border transition-all ${isLive ? 'bg-red-500/10 border-red-500/30' : 'bg-white/5 border-white/10'}`}>
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-4">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${isLive ? 'bg-red-500/20 animate-pulse' : 'bg-white/5'}`}>
                                  <Video size={20} className={isLive ? 'text-red-500' : 'text-white/30'} />
                                </div>
                                <div>
                                  <h4 className="text-sm font-black uppercase tracking-widest mb-1">{session.title}</h4>
                                  <p className="text-[10px] text-white/40 flex items-center gap-2">
                                    <CalendarDays size={10} />
                                    {new Date(session.scheduledAt).toLocaleString()}
                                    <span>·</span>
                                    {session.durationMinutes} min
                                  </p>
                                </div>
                              </div>
                              {session.meetingUrl && (
                                <a href={session.meetingUrl} target="_blank" rel="noreferrer"
                                  className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest ${isLive ? 'bg-red-500 text-white animate-pulse' : 'bg-white/10 text-white/60 hover:bg-white/20'} transition-all`}>
                                  <Video size={12} /> {isLive ? 'Join Live' : 'Join'}
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* No upcoming */}
                  {upcomingSessions.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 bg-white/5 border border-white/10 rounded-[3rem] text-center">
                      <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-8">
                        <Video size={32} className="text-red-500/60" />
                      </div>
                      <h2 className="text-2xl font-black uppercase tracking-tightest mb-3">No Live Sessions Scheduled</h2>
                      <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
                        {isOwner ? 'Click "Schedule Session" above to set one up.' : 'Check back for the next live session.'}
                      </p>
                    </div>
                  )}

                  {/* Past sessions */}
                  {pastSessions.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Past Sessions</p>
                      {pastSessions.map(session => (
                        <div key={session.id} className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center gap-4 opacity-50">
                          <Video size={16} className="text-white/20 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-white/60 truncate">{session.title}</div>
                            <div className="text-[9px] text-white/30">{new Date(session.scheduledAt).toLocaleDateString()} · {session.durationMinutes} min</div>
                          </div>
                          {session.recordingUrl && (
                            <a href={session.recordingUrl} target="_blank" rel="noreferrer"
                              className="text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white flex items-center gap-1">
                              <PlayCircle size={12} /> Recording
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* GRADES / PROGRESS */}
              {activeTab === 'GRADES' && (
                <motion.div key="grades" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  {/* Overall score */}
                  {!isOwner && overallPct !== null && (
                    <div className="bg-white/5 border border-white/10 rounded-[3rem] p-10 flex flex-col items-center text-center">
                      <div className="relative w-32 h-32 mb-6">
                        <svg className="w-full h-full -rotate-90">
                          <circle cx="64" cy="64" r="56" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
                          <circle cx="64" cy="64" r="56" fill="none" strokeWidth="10"
                            stroke={gradeColor(overallPct)}
                            strokeDasharray={`${(overallPct / 100) * 351.86} 351.86`}
                            strokeLinecap="round" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-3xl font-black" style={{ color: gradeColor(overallPct) }}>{overallPct}%</span>
                          <span className="text-[9px] text-white/30 uppercase tracking-widest">Overall</span>
                        </div>
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/30">
                        {totalGradePoints} / {totalMaxPoints} total points
                      </p>
                    </div>
                  )}

                  {/* Per-assignment breakdown */}
                  {grades.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white/5 border border-white/10 rounded-[3rem] text-center">
                      <Award size={40} className="text-white/10 mb-4" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/30">
                        {isOwner ? 'No grades submitted yet.' : 'No grades yet — submit your assignments first.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {isOwner && <p className="text-[10px] font-black uppercase tracking-widest text-white/30">All Student Grades</p>}
                      {grades.map(g => {
                        const pct = Math.round((g.grade / g.maxPoints) * 100);
                        const assignment = classroom.assignments.find(a => a.id === g.assignmentId);
                        return (
                          <div key={g.id} className="bg-white/5 border border-white/10 rounded-3xl p-5">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                {isOwner && <div className="text-[10px] font-bold text-white/40 mb-0.5">{g.studentName}</div>}
                                <h4 className="text-sm font-black uppercase tracking-widest">{assignment?.title ?? g.assignmentId}</h4>
                              </div>
                              <div className="text-right">
                                <div className="text-xl font-black" style={{ color: gradeColor(pct) }}>{g.grade}</div>
                                <div className="text-[9px] text-white/30">/ {g.maxPoints}</div>
                              </div>
                            </div>
                            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: gradeColor(pct) }} />
                            </div>
                            {g.feedback && (
                              <p className="text-xs text-white/40 mt-3 italic">"{g.feedback}"</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Lesson completion */}
                  <div className="bg-white/5 border border-white/10 rounded-[3rem] p-8">
                    <h3 className="text-sm font-black uppercase tracking-widest mb-6">Lesson Progress</h3>
                    <div className="space-y-3">
                      {classroom.lessons.map((lesson, i) => (
                        <div key={lesson.id} className="flex items-center gap-4">
                          <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-[9px] font-black text-white/20 flex-shrink-0">{i + 1}</div>
                          <div className="flex-1">
                            <div className="text-xs font-bold text-white/60">{lesson.title}</div>
                          </div>
                          <div className="w-3 h-3 rounded-full bg-white/10 flex-shrink-0" />
                        </div>
                      ))}
                      {classroom.lessons.length === 0 && (
                        <p className="text-[10px] text-white/20 uppercase tracking-widest">No lessons yet.</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClassroomsView;
