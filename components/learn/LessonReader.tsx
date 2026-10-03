import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Play, Flag, NotebookPen, Pencil, Users } from 'lucide-react';
import MediaStrip from '../media/MediaStrip';
import AccuracyBadge from './AccuracyBadge';
import TraditionPanel from './TraditionPanel';
import ConnectedIdeas from './ConnectedIdeas';
import { LESSON_MEDIA } from '../../data/lessonMediaMap';
import { LESSON_FIGURES } from '../../data/lessonFigures';
import { resolveMediaRefs, type MediaAsset, type MediaRef } from '../../services/lessonMedia';
import { reportProblem } from '../../services/contentIntegrity';
import { queueLessonNotes } from '../../services/notesService';
import type { SchoolProfile } from '../../services/schoolProfile';
import type { Impact } from '../../services/livingKnowledge/types';
import DevelopmentsPanel from './DevelopmentsPanel';
import LessonFolio, { type Customization } from './lesson/LessonFolio';
import LessonEditor, { SharedVersions } from './lesson/LessonEditor';
import { applyOverlay, creditLine, adaptedLine, INTEGRITY_NOTE, type LessonOverlay } from './lesson/lessonOverlay';
import { activeOverlay, classIdsFor } from '../../services/lessonOverlayService';

/**
 * Reads one lesson: the teaching text, real photographs and recordings from the archives where they
 * help, scripture connections for schools that have turned them on, and a way to report a mistake.
 */
export interface ReaderLesson { id: string; title: string; body: string; courseId: string; accent: string; courseTitle: string; subject?: string }

export interface ConnectionHooks { resolve: (courseId: string, lessonId: string) => { title: string; course: string } | null; onOpenLesson: (courseId: string, lessonId: string) => void; onOpenLabs: (disciplineId: string) => void }

export interface Viewer { uid: string; name: string; isTeacher: boolean; school?: string }
const LessonReader: React.FC<{ developments?: Impact[]; lesson: ReaderLesson; school?: SchoolProfile; connections?: ConnectionHooks; viewer?: Viewer; canPractice: boolean; onPractice: () => void; onClose: () => void }> = ({ developments, lesson, school, connections, viewer, canPractice, onPractice, onClose }) => {
  const [media, setMedia] = useState<Array<{ ref: MediaRef; assets: MediaAsset[] }> | null>(null);
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState('');
  const articleRef = useRef<HTMLElement>(null);
  const [overlay, setOverlay] = useState<LessonOverlay | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const baseFigures = LESSON_FIGURES[lesson.id] || [];
  const base = { id: lesson.id, courseId: lesson.courseId, title: lesson.title, body: lesson.body, figures: baseFigures };

  // The teacher's own version, or the one made for the viewer's class. The original lesson is never replaced.
  useEffect(() => {
    let alive = true; setOverlay(null); setShowOriginal(false);
    if (!viewer?.uid) return;
    classIdsFor(viewer.uid).then(ids => activeOverlay(lesson.id, viewer.uid, ids)).then(o => { if (alive) setOverlay(o); }).catch(() => {});
    return () => { alive = false; };
  }, [lesson.id, viewer?.uid]);
  const applied = useMemo(() => applyOverlay({ title: lesson.title, body: lesson.body, figures: baseFigures }, showOriginal ? null : overlay), [lesson.id, lesson.body, lesson.title, overlay, showOriginal]);
  const customization: Customization | null = overlay ? { credit: creditLine(overlay), adapted: adaptedLine(overlay), note: overlay.note, stale: applyOverlay({ title: lesson.title, body: lesson.body, figures: baseFigures }, overlay).stale, changed: applied.changed, showingOriginal: showOriginal, onToggleOriginal: () => setShowOriginal(v => !v), integrity: INTEGRITY_NOTE } : null;
  const teacherActions = viewer?.isTeacher ? (
    <span className="folio-controls flex flex-wrap gap-2 ml-auto" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <button type="button" onClick={() => setEditing(true)} className="rounded-full px-3.5 py-1.5 text-[12px] font-black border border-white/25 hover:bg-white/10 inline-flex items-center gap-1.5"><Pencil size={13} /> {overlay && overlay.authorUid === viewer.uid ? 'Edit my version' : 'Customize this lesson'}</button>
      <button type="button" onClick={() => setBrowsing(true)} className="rounded-full px-3.5 py-1.5 text-[12px] font-black border border-white/25 hover:bg-white/10 inline-flex items-center gap-1.5"><Users size={13} /> Teacher versions</button>
    </span>) : null;

  useEffect(() => {
    let alive = true; setMedia(null);
    const refs = LESSON_MEDIA[lesson.id] || [];
    if (!refs.length) { setMedia([]); return; }
    resolveMediaRefs(refs).then(r => alive && setMedia(r)).catch(() => alive && setMedia([]));
    return () => { alive = false; };
  }, [lesson.id]);

  const send = async () => {
    if (note.trim().length < 3) return;
    const ok = await reportProblem({ kind: 'lesson', ref: lesson.id, courseId: lesson.courseId, note, excerpt: lesson.body.slice(0, 400) });
    setSent(ok ? 'Thank you. This lesson has been sent for review.' : 'Saved on this device and will be sent when you are online. Thank you.');
    setReporting(false); setNote('');
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={lesson.title} className="fixed inset-0 z-[320] bg-black/80 backdrop-blur-sm flex justify-center" onClick={onClose}>
      <article ref={articleRef} className="w-full max-w-2xl h-full overflow-y-auto bg-[#0e0b16] border-x border-white/10 text-white p-5 sm:p-7 pl-7 sm:pl-9" onClick={e => e.stopPropagation()}>
        <div className="flex justify-end -mb-2">
          <button type="button" aria-label="Close lesson" onClick={onClose} className="w-9 h-9 grid place-items-center rounded-full hover:bg-white/10 text-white/60"><X size={18} /></button>
        </div>
        <div className="mb-5"><AccuracyBadge courseId={lesson.courseId} compact /></div>

        {developments && developments.length > 0 && <DevelopmentsPanel rows={developments} domain={lesson.courseId.startsWith('law-') ? 'law' : 'medicine'} accent={lesson.accent} />}

        <LessonFolio lessonId={lesson.id} title={applied.title} courseTitle={lesson.courseTitle} body={applied.body} accent={lesson.accent} figures={applied.figures} customization={customization} actions={teacherActions} scrollRef={articleRef} />

        {(media || []).map(({ ref, assets }, i) => <MediaStrip key={i} assets={assets} caption={ref.caption} large />)}
        {media === null && (LESSON_MEDIA[lesson.id] || []).length > 0 && <p className="text-[12px] text-white/40 my-3">Finding photos and recordings from the archives…</p>}

        {connections && <ConnectedIdeas courseId={lesson.courseId} lessonId={lesson.id} {...connections} />}

        <TraditionPanel courseId={lesson.courseId} lessonId={lesson.id} school={school} />

        <div className="flex flex-wrap gap-2 mt-6 pt-5 border-t border-white/10">
          <button type="button" onClick={() => { queueLessonNotes({ kind: 'lesson', courseId: lesson.courseId, lessonId: lesson.id, title: lesson.title, courseTitle: lesson.courseTitle, subject: lesson.subject || '', body: lesson.body }); onClose(); }} className="rounded-full px-5 py-2.5 text-[13px] font-black border border-white/20 hover:bg-white/10 inline-flex items-center gap-2"><NotebookPen size={14} /> Take notes</button>
          {canPractice && <button type="button" onClick={onPractice} className="rounded-full px-5 py-2.5 text-[13px] font-black text-black inline-flex items-center gap-2" style={{ background: lesson.accent }}><Play size={14} /> Practice this lesson</button>}
          {sent ? <p className="text-[12px] text-white/55 self-center">{sent}</p>
            : reporting ? (
              <div className="w-full grid gap-2">
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="What looks wrong? (a fact, a date, the wording)" aria-label="Describe the problem" className="rounded-xl bg-black/30 border border-white/15 px-3 py-2 text-[13px] text-white placeholder:text-white/35" />
                <div className="flex gap-2"><button type="button" onClick={send} className="rounded-full px-4 py-1.5 text-[12px] font-black bg-white text-black">Send report</button><button type="button" onClick={() => setReporting(false)} className="rounded-full px-4 py-1.5 text-[12px] font-black border border-white/20">Cancel</button></div>
              </div>
            ) : <button type="button" onClick={() => setReporting(true)} className="rounded-full px-4 py-2.5 text-[12px] font-black border border-white/15 text-white/65 hover:bg-white/10 inline-flex items-center gap-1.5"><Flag size={13} /> Report a problem</button>}
        </div>
      </article>
      {editing && viewer && <LessonEditor base={base} existing={overlay && overlay.authorUid === viewer.uid ? overlay : null} me={{ uid: viewer.uid, name: viewer.name, school: viewer.school }} onClose={() => setEditing(false)} onSaved={o => { setOverlay(o); setShowOriginal(false); }} />}
      {browsing && viewer && <SharedVersions base={base} me={{ uid: viewer.uid, name: viewer.name, school: viewer.school }} onClose={() => setBrowsing(false)} onAdopted={o => { setOverlay(o); setShowOriginal(false); }} />}
    </div>,
    document.body,
  );
};

export default LessonReader;
