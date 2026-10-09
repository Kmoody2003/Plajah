/**
 * CourseStudio — the guided "build a course" flow for creators.
 *
 * Five short steps, each answering one question, with a live course-page preview that updates as
 * the creator types so the work always feels like it is turning into something:
 *   1 Idea     — what are you teaching, and from which starting template? (Aria can draft the outline)
 *   2 Outline  — edit modules, lessons, assignments (shared OutlineEditor)
 *   3 Page     — title, promise, description, outcomes, cover
 *   4 Format   — self-paced / cohort / live, seats, price (with the take-home maths)
 *   5 Launch   — readiness checklist, then Save draft or Publish
 *
 * A course is always created as a DRAFT first and only becomes public on Publish, so a creator can
 * stop at any step and come back (the draft lives under Your studio).
 */
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Loader2, Rocket, Sparkles, X } from 'lucide-react';
import type { Classroom } from '../../../types';
import {
  COURSE_CATEGORIES, COURSE_TEMPLATES, COVER_STYLES, FORMATS, LEVELS, PLATFORM_CUT, applyOutline, categoryMeta,
  createCourseFromDraft, emptyDraft, generateOutline, generatedCover, money, readiness, skeletonFor, syllabusFrom, templateById,
  type CourseDraft,
} from '../../../services/creatorCourses';
import OutlineEditor from './OutlineEditor';
import { chalkBoard } from '../../../services/creatorArt';
import PayoutNotice from './PayoutNotice';
import MotionSwitch from './MotionSwitch';
import { useMotion } from './useMotion';

interface Props {
  ownerName: string;
  onClose: () => void;
  onCreated: (course: Classroom, published: boolean) => void;
  /** Start from this template id (the hub's quick-start tiles). */
  initialTemplate?: string;
  /** The creator has a Stripe payout account (UserProfile.stripeConnectAccountId). */
  hasPayouts?: boolean;
}

const STEPS = ['Idea', 'Outline', 'Your page', 'Format & price', 'Launch'] as const;
const inputCls = 'w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-base sm:text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/40';
const label = 'block text-[10px] font-black uppercase tracking-widest text-white/50 mb-1.5';

const STEP_ART = ['idea', 'outline', 'page', 'format', 'launch'] as const;

/** A short chalkboard banner at the top of each step: gives the flow a sense of place. */
const StepBanner = ({ step }: { step: number }) => (
  <div className="relative h-24 sm:h-28 rounded-3xl overflow-hidden border border-white/10 mb-6" aria-hidden="true"
    style={{ backgroundImage: `url("${chalkBoard(STEP_ART[step], { strength: 0.85 })}")`, backgroundSize: 'cover', backgroundPosition: 'right center' }}>
    <div className="absolute inset-0 bg-gradient-to-r from-[#07070c] via-[#07070c]/60 to-transparent" />
  </div>
);

const toLocalInput = (ms?: number) => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

export default function CourseStudio({ ownerName, onClose, onCreated, initialTemplate, hasPayouts = false }: Props) {
  useMotion(); // re-render when the Motion switch changes so the banners and preview follow it
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<CourseDraft>(() => {
    const d = emptyDraft();
    if (initialTemplate) {
      const t = templateById(initialTemplate);
      return { ...d, format: t.format, price: t.suggestedPrice, ...skeletonFor(t, '') };
    }
    return d;
  });
  const [templateId, setTemplateId] = useState(initialTemplate || '');
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('');
  const [coverStyle, setCoverStyle] = useState('aurora');
  const [customCover, setCustomCover] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const [saving, setSaving] = useState<'draft' | 'publish' | null>(null);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState(false);

  const set = <K extends keyof CourseDraft>(k: K, v: CourseDraft[K]) => setDraft(d => ({ ...d, [k]: v }));
  const cat = categoryMeta(draft.category);
  const cover = customCover.trim() || generatedCover(draft.title || topic || 'Your course', cat.emoji, coverStyle, draft.category);
  // The preview is allowed to move; what gets saved (`cover`) stays a static, light image.
  const liveCover = customCover.trim() || generatedCover(draft.title || topic || 'Your course', cat.emoji, coverStyle, draft.category, true);
  const full = { ...draft, thumbnailUrl: cover };
  const ready = useMemo(() => readiness({
    title: draft.title, description: draft.description, thumbnailUrl: cover, lessons: draft.lessons, assignments: draft.assignments,
    tagline: draft.tagline, outcomes: draft.outcomes, price: draft.price, format: draft.format, startDate: draft.startDate,
  }), [draft, cover]);

  const pickTemplate = (id: string) => {
    const t = templateById(id);
    setTemplateId(id);
    setDraft(d => ({ ...d, format: t.format, price: d.price || t.suggestedPrice, ...skeletonFor(t, topic) }));
  };

  const draftWithAria = async () => {
    if (!topic.trim()) { setError('Tell Aria what you teach first.'); return; }
    setError(''); setAiNote(''); setDrafting(true);
    const t = templateById(templateId || 'masterclass');
    const out = await generateOutline({ topic, audience, category: draft.category, level: draft.level, sections: Math.max(2, t.sections.length) });
    setDrafting(false);
    if (!out) {
      // Never block on AI: keep a template skeleton and say so plainly.
      if (draft.lessons.length === 0) setDraft(d => ({ ...d, ...skeletonFor(t, topic) }));
      setAiNote('Aria could not draft right now, so I started you with the template outline. You can write it yourself in the next step.');
      return;
    }
    setDraft(d => ({ ...d, ...applyOutline(out), title: d.title || topic.trim() }));
    setAiNote('Drafted. Everything is editable, change anything you like.');
    setStep(1);
  };

  const canNext = step === 0 ? (topic.trim().length > 1 || draft.title.trim().length > 1 || !!templateId)
    : step === 1 ? draft.lessons.some(l => l.title.trim())
    : step === 2 ? draft.title.trim().length >= 3
    : true;

  // Leaving the Idea step seeds the page title from the topic, so the creator edits instead of retyping.
  const next = () => {
    if (step === 0 && !draft.title.trim() && topic.trim()) set('title', topic.trim());
    setStep(step + 1);
  };

  const save = async (publish: boolean) => {
    setError(''); setSaving(publish ? 'publish' : 'draft');
    try {
      const finalDraft: CourseDraft = {
        ...full,
        title: draft.title.trim() || topic.trim() || 'Untitled course',
        lessons: draft.lessons.filter(l => l.title.trim()).map((l, i) => ({ ...l, title: l.title.trim(), order: i + 1 })),
        assignments: draft.assignments.filter(a => a.title.trim()),
        syllabus: syllabusFrom(draft.lessons.filter(l => l.title.trim())),
      };
      const course = await createCourseFromDraft(finalDraft, { publish });
      if (!course) throw new Error('Sign in to create a course.');
      onCreated(course, publish);
    } catch (e: any) {
      setError(e?.message || 'Could not save the course. Try again.');
      setSaving(null);
    }
  };

  const take = draft.price * (1 - PLATFORM_CUT);

  const body = (
    <motion.div className="fixed inset-0 z-[2000] flex flex-col bg-[#07070c] text-white" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="h-1 w-full bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00]" />
      <header className="flex items-center gap-3 px-4 sm:px-8 py-4 border-b border-white/10">
        <button onClick={onClose} aria-label="Close" className="p-3 -m-1 rounded-xl hover:bg-white/10"><X size={18} /></button>
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Course Studio</div>
          <div className="text-sm font-black truncate">{draft.title || 'New course'}</div>
        </div>
        <nav className="ml-auto hidden lg:flex items-center gap-1" aria-label="Steps">
          {STEPS.map((s, i) => (
            <button key={s} onClick={() => i <= step || canNext ? setStep(i) : undefined}
              className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${i === step ? 'bg-white text-black' : i < step ? 'text-emerald-300' : 'text-white/30'}`}>
              {i < step ? <Check size={11} className="inline mr-1" /> : null}{i + 1}. {s}
            </button>
          ))}
        </nav>
        <div className="lg:hidden ml-auto text-[10px] font-black uppercase tracking-widest text-white/50">Step {step + 1} / {STEPS.length}</div>
        <MotionSwitch compact className="hidden sm:block" />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_340px] gap-8 px-4 sm:px-8 py-8">
          <main className="min-w-0">
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="space-y-6">
                <StepBanner step={step} />
                {step === 0 && (
                  <>
                    <div>
                      <h2 className="text-3xl sm:text-4xl font-black tracking-tight">What do you teach?</h2>
                      <p className="text-white/50 mt-2 text-sm">Two sentences is enough. Pick a shape for the course and Aria will draft the outline. You can change everything.</p>
                    </div>
                    <div>
                      <span className={label}>I teach…</span>
                      <input className={inputCls} placeholder="e.g. Beat-making for total beginners" value={topic} onChange={e => setTopic(e.target.value)} />
                    </div>
                    <div>
                      <span className={label}>It's for…</span>
                      <input className={inputCls} placeholder="e.g. people who have never opened a DAW" value={audience} onChange={e => setAudience(e.target.value)} />
                    </div>
                    <div>
                      <span className={label}>Category</span>
                      <div className="flex flex-wrap gap-2">
                        {COURSE_CATEGORIES.map(c => (
                          <button key={c.id} type="button" onClick={() => setDraft(d => ({ ...d, category: c.id, accent: c.accent }))}
                            className={`px-3.5 py-2 rounded-full text-xs font-bold border transition-all ${draft.category === c.id ? 'bg-white text-black border-white' : 'border-white/15 text-white/60 hover:text-white'}`}>
                            {c.emoji} {c.id}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className={label}>Pick a shape</span>
                      <div className="grid sm:grid-cols-2 gap-3">
                        {COURSE_TEMPLATES.map(t => (
                          <button key={t.id} type="button" onClick={() => pickTemplate(t.id)}
                            className={`text-left rounded-3xl border overflow-hidden transition-all ${templateId === t.id ? 'border-white bg-white/10' : 'border-white/10 bg-white/[0.03] hover:border-white/30'}`}>
                            <div className="h-20 bg-cover bg-right" style={{ backgroundImage: `url("${chalkBoard(t.id, { strength: 0.8 })}")` }} aria-hidden="true" />
                            <div className="p-4 pt-3">
                            <div className="text-xl">{t.emoji}</div>
                            <div className="font-black mt-1">{t.name}</div>
                            <div className="text-xs text-white/50 mt-0.5">{t.blurb}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 items-center">
                      <button type="button" onClick={draftWithAria} disabled={drafting}
                        className="px-5 py-3 rounded-2xl bg-gradient-to-r from-[#6B0099] to-[#D40055] font-black text-sm flex items-center gap-2 disabled:opacity-60">
                        {drafting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {drafting ? 'Aria is drafting…' : 'Draft my outline with Aria'}
                      </button>
                      <button type="button" onClick={() => { if (!templateId) pickTemplate('masterclass'); next(); }} className="px-4 py-3 rounded-2xl border border-white/15 text-sm font-bold text-white/70 hover:text-white">
                        I'll write it myself
                      </button>
                    </div>
                    {aiNote && <p className="text-xs text-emerald-300">{aiNote}</p>}
                  </>
                )}

                {step === 1 && (
                  <>
                    <div>
                      <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Shape the course</h2>
                      <p className="text-white/50 mt-2 text-sm">Titles are enough for now. Add video links or write lessons as you go, and publish when it feels ready. Mark one or two lessons as free previews to let people taste it.</p>
                    </div>
                    <OutlineEditor lessons={draft.lessons} assignments={draft.assignments} onChange={n => setDraft(d => ({ ...d, ...n }))} />
                  </>
                )}

                {step === 2 && (
                  <>
                    <div>
                      <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Your course page</h2>
                      <p className="text-white/50 mt-2 text-sm">This is what people see before they enroll. Lead with the change they'll get.</p>
                    </div>
                    <div><span className={label}>Title</span><input className={inputCls} value={draft.title} onChange={e => set('title', e.target.value)} placeholder="Make your first beat in a weekend" maxLength={90} /></div>
                    <div><span className={label}>One-line promise</span><input className={inputCls} value={draft.tagline} onChange={e => set('tagline', e.target.value)} placeholder="From blank screen to finished track, no experience needed." maxLength={120} /></div>
                    <div><span className={label}>Description</span><textarea className={inputCls} rows={5} value={draft.description} onChange={e => set('description', e.target.value)} placeholder="Who is this for, and what will be different when they finish?" /></div>
                    <div>
                      <span className={label}>By the end, learners will…</span>
                      {[0, 1, 2, 3].map(i => (
                        <input key={i} className={`${inputCls} mb-2`} placeholder={['Build a 4-bar drum loop', 'Layer a bassline that sits right', 'Arrange a full 2-minute track', 'Export and release it'][i]}
                          value={draft.outcomes[i] || ''} onChange={e => { const o = [...draft.outcomes]; o[i] = e.target.value; set('outcomes', o); }} />
                      ))}
                    </div>
                    <div>
                      <span className={label}>Level</span>
                      <div className="flex flex-wrap gap-2">
                        {LEVELS.map(l => (
                          <button key={l.id} type="button" onClick={() => set('level', l.id)} className={`px-3.5 py-2 rounded-full text-xs font-bold border ${draft.level === l.id ? 'bg-white text-black border-white' : 'border-white/15 text-white/60 hover:text-white'}`}>{l.label}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className={label}>Cover</span>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {COVER_STYLES.map(c => (
                          <button key={c.id} type="button" onClick={() => { setCoverStyle(c.id); setCustomCover(''); }} aria-label={`${c.name} cover`}
                            className={`aspect-video rounded-xl border-2 ${!customCover && coverStyle === c.id ? 'border-white' : 'border-transparent'}`} style={{ background: `linear-gradient(135deg, ${c.a}, ${c.b})` }} />
                        ))}
                      </div>
                      <input className={`${inputCls} mt-2`} placeholder="…or paste your own image link" value={customCover} onChange={e => setCustomCover(e.target.value)} />
                    </div>
                  </>
                )}

                {step === 3 && (
                  <>
                    <div>
                      <h2 className="text-3xl sm:text-4xl font-black tracking-tight">How will it run?</h2>
                      <p className="text-white/50 mt-2 text-sm">You can change any of this after launch.</p>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-3">
                      {FORMATS.map(f => (
                        <button key={f.id} type="button" onClick={() => set('format', f.id)}
                          className={`text-left p-4 rounded-3xl border ${draft.format === f.id ? 'border-white bg-white/10' : 'border-white/10 bg-white/[0.03] hover:border-white/30'}`}>
                          <div className="text-2xl">{f.emoji}</div><div className="font-black mt-1">{f.label}</div><div className="text-xs text-white/50 mt-0.5">{f.blurb}</div>
                        </button>
                      ))}
                    </div>
                    {draft.format !== 'SELF_PACED' && (
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div><span className={label}>Starts</span><input type="datetime-local" className={inputCls} value={toLocalInput(draft.startDate)} onChange={e => set('startDate', e.target.value ? new Date(e.target.value).getTime() : undefined)} /></div>
                        <div><span className={label}>Seats (0 = unlimited)</span><input type="number" min={0} className={inputCls} value={draft.capacity} onChange={e => set('capacity', Math.max(0, Number(e.target.value) || 0))} /></div>
                      </div>
                    )}
                    <div>
                      <span className={label}>Price</span>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {[0, 9, 19, 29, 49, 99, 199].map(p => (
                          <button key={p} type="button" onClick={() => set('price', p)} className={`px-3.5 py-2 rounded-full text-xs font-bold border ${draft.price === p ? 'bg-white text-black border-white' : 'border-white/15 text-white/60 hover:text-white'}`}>{money(p)}</button>
                        ))}
                      </div>
                      <div className="relative max-w-[200px]"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">$</span><input type="number" min={0} className={`${inputCls} pl-8`} value={draft.price} onChange={e => set('price', Math.max(0, Number(e.target.value) || 0))} /></div>
                      <p className="text-xs text-white/50 mt-3">
                        {draft.price > 0
                          ? <>You keep <b className="text-emerald-300">{money(Math.round(take * 100) / 100)}</b> of every {money(draft.price)} enrollment. Plajah takes {Math.round(PLATFORM_CUT * 100)}%, plus Stripe's standard processing fee.</>
                          : 'Free courses are great for building an audience. You can add a price any time.'}
                      </p>
                      <div className="mt-3"><PayoutNotice price={draft.price} hasPayouts={hasPayouts} /></div>
                    </div>
                  </>
                )}

                {step === 4 && (
                  <>
                    <div>
                      <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Ready to launch?</h2>
                      <p className="text-white/50 mt-2 text-sm">Publish now, or save it as a draft and finish later. Drafts are private.</p>
                    </div>
                    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-[10px] font-black uppercase tracking-widest text-white/50">Launch readiness</div>
                        <div className="text-2xl font-black" style={{ color: ready.score >= 80 ? '#34d399' : ready.score >= 50 ? '#fbbf24' : '#f87171' }}>{ready.score}%</div>
                      </div>
                      <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-4"><div className="h-full rounded-full bg-gradient-to-r from-[#D40055] to-[#FF8C00]" style={{ width: `${ready.score}%` }} /></div>
                      <ul className="space-y-2">
                        {ready.items.map(i => (
                          <li key={i.id} className="flex items-start gap-2.5 text-sm">
                            {i.done ? <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" /> : <Circle size={16} className="text-white/25 mt-0.5 shrink-0" />}
                            <div><div className={i.done ? 'text-white/80' : 'text-white'}>{i.label}</div>{!i.done && <div className="text-xs text-white/40">{i.hint}</div>}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {!ready.ready && <p className="text-xs text-amber-300">To publish you need a title, at least 3 lessons, and content in your first lessons. You can still save a draft.</p>}
                  </>
                )}
              </motion.div>
            </AnimatePresence>
            <button type="button" onClick={() => setSheet(true)} className="lg:hidden mt-6 min-h-[44px] px-4 rounded-xl border border-white/15 text-[11px] font-black uppercase tracking-widest text-white/70">Preview your course card</button>
            {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
          </main>

          {/* Live preview of the public course card */}
          <aside className="hidden lg:block">
            <div className="sticky top-6">
              <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Live preview</div>
              <div className="rounded-3xl overflow-hidden border border-white/10 bg-white/[0.04]">
                <div className="aspect-video relative">
                  <img src={liveCover} alt="" className="w-full h-full object-cover" />
                  <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/60 text-[9px] font-black uppercase tracking-widest">{cat.emoji} {draft.category}</div>
                  {draft.price > 0 && <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-[#FF8C00] text-[11px] font-black">{money(draft.price)}</div>}
                </div>
                <div className="p-4">
                  <div className="font-black leading-tight">{draft.title || 'Your course title'}</div>
                  <div className="text-xs text-white/50 mt-1 line-clamp-2">{draft.tagline || 'Your one-line promise appears here.'}</div>
                  <div className="flex items-center gap-3 mt-3 text-[10px] font-bold uppercase tracking-widest text-white/40">
                    <span>{draft.lessons.filter(l => l.title.trim()).length} lessons</span><span>·</span><span>{FORMATS.find(f => f.id === draft.format)?.label}</span><span>·</span><span>by {ownerName}</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {sheet && (
        <div className="lg:hidden fixed inset-0 z-[2010] flex items-end bg-black/70" onClick={() => setSheet(false)} role="dialog" aria-modal="true" aria-label="Course card preview">
          <div className="w-full rounded-t-3xl bg-[#14121d] border-t border-white/10 p-5" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
            <div className="rounded-3xl overflow-hidden border border-white/10 bg-white/[0.04]">
              <div className="aspect-video relative">
                <img src={liveCover} alt="" className="w-full h-full object-cover" />
                {draft.price > 0 && <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-[#FF8C00] text-[11px] font-black">{money(draft.price)}</div>}
              </div>
              <div className="p-4"><div className="font-black leading-tight">{draft.title || 'Your course title'}</div><div className="text-xs text-white/50 mt-1">{draft.tagline || 'Your one-line promise appears here.'}</div></div>
            </div>
            <button onClick={() => setSheet(false)} className="mt-4 w-full min-h-[48px] rounded-2xl bg-white text-black text-sm font-black">Back to editing</button>
          </div>
        </div>
      )}

      <footer className="border-t border-white/10 px-4 sm:px-8 pt-3 flex items-center gap-3 bg-[#07070c]" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <button onClick={() => (step === 0 ? onClose() : setStep(step - 1))} className="min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-bold text-white/60 hover:text-white flex items-center gap-2"><ArrowLeft size={15} /> {step === 0 ? 'Cancel' : 'Back'}</button>
        <div className="ml-auto flex items-center gap-2">
          {step === STEPS.length - 1 ? (
            <>
              <button onClick={() => save(false)} disabled={!!saving || !(draft.title.trim() || topic.trim())} className="min-h-[44px] px-4 py-2.5 rounded-xl border border-white/20 text-sm font-bold hover:bg-white/10 disabled:opacity-40 flex items-center gap-2">
                {saving === 'draft' && <Loader2 size={14} className="animate-spin" />} Save draft
              </button>
              <button onClick={() => save(true)} disabled={!!saving || !ready.ready} className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D40055] to-[#FF8C00] text-sm font-black disabled:opacity-40 flex items-center gap-2">
                {saving === 'publish' ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={15} />} Publish course
              </button>
            </>
          ) : (
            <button onClick={next} disabled={!canNext} className="min-h-[44px] px-6 py-2.5 rounded-xl bg-white text-black text-sm font-black disabled:opacity-40 flex items-center gap-2">Next <ArrowRight size={15} /></button>
          )}
        </div>
      </footer>
    </motion.div>
  );

  // Fullscreen overlays must portal to <body>: transformed ancestors (page transitions) would
  // otherwise re-anchor position:fixed to the page top.
  return createPortal(body, document.body);
}
