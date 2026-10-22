/**
 * LessonPlayer — where a learner actually takes a lesson. Until this existed the lesson list's play
 * button did nothing, so no creator course could be consumed.
 *
 * Plays official YouTube/Vimeo embeds and direct video files, shows text lessons inline, and falls
 * back to an "open link" for anything else (see lessonMedia: never embeds arbitrary URLs).
 * "Mark complete" is the only progress signal; the parent persists it.
 * Learning supports: Listen reads text lessons aloud paragraph by paragraph with the paragraph highlighted, and
 * Easier to read switches text lessons to Atkinson Hyperlegible with wider spacing.
 */
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, Headphones, Square, X } from 'lucide-react';
import type { Lesson } from '../../../types';
import { lessonMedia } from '../../../services/creatorCourses';
import { useActiveSupports } from '../../../hooks/useLearningSupport';
import { canReadAloud, readPassages, stopReading, useReading } from '../../../services/readAloud';

interface Props {
  lesson: Lesson;
  index: number;
  total: number;
  completed: boolean;
  /** Mark done and (if there is one) move to the next lesson. */
  onComplete: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
  saving?: boolean;
}

export default function LessonPlayer({ lesson, index, total, completed, onComplete, onPrev, onNext, onClose, saving }: Props) {
  const media = lessonMedia(lesson.contentUrl);
  const sup = useActiveSupports();
  const key = `player:${lesson.id}`;
  const reading = useReading(key);
  const paras = (lesson.textContent || '').split(/\n{2,}/).map(t => t.trim()).filter(Boolean);
  useEffect(() => () => stopReading(), [lesson.id]);
  const listen = () => (reading >= 0 ? stopReading() : void readPassages(key, [lesson.title, lesson.description || '', ...paras], { rate: sup.readRate }));
  const hl = (on: boolean) => (on ? ' bg-[#00DAF3]/15 ring-4 ring-[#00DAF3]/15 rounded' : '');
  return createPortal(
    <div className="fixed inset-0 z-[2100] flex flex-col bg-[#07070c] text-white" role="dialog" aria-modal="true" aria-label={lesson.title}>
      <header className="flex items-center gap-3 px-4 sm:px-8 py-3 border-b border-white/10">
        <button onClick={onClose} aria-label="Close lesson" className="p-3 -m-1 rounded-xl hover:bg-white/10"><X size={18} /></button>
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">Lesson {index + 1} of {total}{lesson.section ? ` · ${lesson.section}` : ''}</div>
          <div className="text-sm font-black truncate">{lesson.title}</div>
        </div>
        {completed && <span className="ml-auto flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-300"><CheckCircle2 size={14} /> Completed</span>}
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 space-y-6">
          {media.kind === 'iframe' && (
            <div className="aspect-video max-h-[70vh] mx-auto rounded-2xl sm:rounded-3xl overflow-hidden bg-black border border-white/10">
              <iframe src={media.src} title={lesson.title} className="w-full h-full" allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
            </div>
          )}
          {media.kind === 'video' && (
            <video src={media.src} controls playsInline className="w-full aspect-video rounded-3xl bg-black border border-white/10" />
          )}
          {media.kind === 'link' && (
            <a href={media.src} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-6 hover:border-white/30">
              <ExternalLink size={22} className="text-[#00DAF3]" />
              <div><div className="font-black">Open this lesson</div><div className="text-xs text-white/50 break-all">{media.src}</div></div>
            </a>
          )}
          {media.kind === 'none' && !lesson.textContent && (
            <div className="rounded-3xl border border-dashed border-white/15 p-10 text-center text-white/50">
              Your instructor hasn't added the content for this lesson yet.
            </div>
          )}

          <div>
            <div className="flex items-start gap-3">
              <h2 className={`text-2xl sm:text-3xl font-black tracking-tight flex-1${hl(reading === 0)}`}>{lesson.title}</h2>
              {canReadAloud() && (lesson.textContent || lesson.description) && (
                <button type="button" onClick={listen} aria-pressed={reading >= 0} className={`shrink-0 min-h-[44px] px-4 rounded-full border text-sm font-bold inline-flex items-center gap-2 ${reading >= 0 ? 'border-[#00DAF3] text-[#00DAF3]' : 'border-white/20 hover:bg-white/10'}`}>
                  {reading >= 0 ? <><Square size={14} /> Stop</> : <><Headphones size={15} /> Listen</>}
                </button>
              )}
            </div>
            {lesson.description && <p className={`text-white/60 mt-2${hl(reading === 1)}`}>{lesson.description}</p>}
          </div>
          {paras.length > 0 && (
            <div className="text-white/80 leading-relaxed text-[15px] space-y-4" style={sup.easyRead ? { fontFamily: '"Atkinson Hyperlegible", Verdana, sans-serif', lineHeight: 1.8, letterSpacing: '0.02em', fontSize: 17 } : undefined}>
              {paras.map((t, i) => <p key={i} className={`whitespace-pre-wrap${hl(reading === i + 2)}`}>{t}</p>)}
            </div>
          )}
        </div>
      </div>

      <footer className="border-t border-white/10 px-4 sm:px-8 pt-3 flex items-center gap-2" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <button onClick={onPrev} disabled={!onPrev} className="min-h-[48px] px-3 sm:px-4 rounded-xl text-sm font-bold text-white/60 hover:text-white disabled:opacity-30 flex items-center gap-2" aria-label="Previous lesson"><ArrowLeft size={16} /><span className="hidden sm:inline">Previous</span></button>
        <div className="ml-auto flex items-center gap-2">
          {onNext && <button onClick={onNext} className="min-h-[48px] px-4 rounded-xl border border-white/20 text-sm font-bold hover:bg-white/10 flex items-center gap-2">Skip <ArrowRight size={15} /></button>}
          <button onClick={onComplete} disabled={saving} className="min-h-[48px] px-5 rounded-xl bg-gradient-to-r from-[#6B0099] to-[#D40055] text-sm font-black disabled:opacity-50 flex items-center gap-2">
            <CheckCircle2 size={15} /> {completed ? (onNext ? 'Next lesson' : 'Done') : onNext ? 'Complete & next' : 'Complete lesson'}
          </button>
        </div>
      </footer>
    </div>,
    document.body,
  );
}
