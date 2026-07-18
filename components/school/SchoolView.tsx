// SchoolView — the shared school chassis UI. Renders ANY Curriculum: track browser → lesson
// list → lesson reader (text, video, watch-along, assignment, resources) with progress and
// ledger-backed completion. Film School, the Photo/Art School, Chora's music history and
// Academia's tracks all render through this one component.

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft, CheckCircle2, Circle, Clock, PlayCircle, Film, BookOpen, ChevronRight,
  ExternalLink, Sparkles, GraduationCap, Trophy,
} from 'lucide-react';
import YouTubeEmbed from '../labs/YouTubeEmbed';
import {
  loadProgress, markLessonComplete, unmarkLesson, trackProgress, curriculumProgress,
  type Curriculum, type Track, type Lesson,
} from '../../services/schoolChassis';
import { auth } from '../../services/backendService';

const TOOL_EVENT: Record<string, string> = {
  FABULA: 'OPEN_FABULA', PHOTO: 'OPEN_MEDIA_CONVERTER', CHORA: 'NAVIGATE', LOREA: 'NAVIGATE', PIXELS: 'OPEN_PLAJAH_PIXELS',
};

const Bar: React.FC<{ pct: number; accent: string }> = ({ pct, accent }) => (
  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: accent }} />
  </div>
);

// ── Lesson reader ─────────────────────────────────────────────────────────────
const LessonReader: React.FC<{
  curriculum: Curriculum; track: Track; lesson: Lesson;
  done: boolean; onToggleDone: () => void; onBack: () => void;
}> = ({ curriculum, track, lesson, done, onToggleDone, onBack }) => {
  const accent = curriculum.accent;
  return (
    <div className="min-h-screen text-white pb-24 bg-black/40 backdrop-blur-2xl">
      <div className="max-w-3xl mx-auto px-5 sm:px-6 pt-7">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-white/40 hover:text-white transition-colors mb-6">
          <ArrowLeft size={16} /> <span className="text-[10px] font-black uppercase tracking-widest">{track.title}</span>
        </button>

        <p className="text-[10px] font-black uppercase tracking-[0.4em]" style={{ color: accent }}>{curriculum.label}</p>
        <h1 className="font-black tracking-tight mt-2 leading-[1.02]" style={{ fontSize: 'clamp(1.9rem, 5.5vw, 2.9rem)' }}>{lesson.title}</h1>
        <div className="flex items-center gap-3 mt-3 text-white/45 text-[12px]">
          {lesson.minutes ? <span className="flex items-center gap-1.5"><Clock size={13} /> {lesson.minutes} min</span> : null}
          {done && <span className="flex items-center gap-1.5" style={{ color: accent }}><CheckCircle2 size={13} /> Completed</span>}
        </div>
        <p className="text-[1.05rem] text-white/70 leading-relaxed mt-5">{lesson.blurb}</p>

        {lesson.videoId && (
          <div className="mt-7">
            <YouTubeEmbed id={lesson.videoId} title={lesson.title} channel={curriculum.label} accent={accent} />
          </div>
        )}

        {lesson.body && (
          <div className="mt-7 space-y-4">
            {lesson.body.split(/\n\s*\n/).map((p, i) => (
              <p key={i} className="text-[1.02rem] leading-relaxed text-white/70">{p.trim()}</p>
            ))}
          </div>
        )}

        {lesson.watchAlong && (
          <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-center gap-2 mb-2"><Film size={15} style={{ color: accent }} /><p className="text-[10px] font-black uppercase tracking-widest text-white/70">Watch along</p></div>
            <p className="text-[15px] font-black text-white">{lesson.watchAlong.title}</p>
            {(lesson.watchAlong.start || lesson.watchAlong.end) && (
              <p className="text-[12px] font-bold mt-1 tabular-nums" style={{ color: accent }}>
                {lesson.watchAlong.start}{lesson.watchAlong.end ? ` – ${lesson.watchAlong.end}` : ''}
              </p>
            )}
            {lesson.watchAlong.note && <p className="text-[13px] text-white/55 mt-2 leading-relaxed">{lesson.watchAlong.note}</p>}
            {lesson.watchAlong.url && (
              <a href={lesson.watchAlong.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white">
                Watch <ExternalLink size={11} />
              </a>
            )}
          </div>
        )}

        {lesson.assignment && (
          <div className="mt-5 rounded-2xl p-5 border" style={{ borderColor: `${accent}44`, background: `${accent}12` }}>
            <div className="flex items-center gap-2 mb-2"><Sparkles size={15} style={{ color: accent }} /><p className="text-[10px] font-black uppercase tracking-widest text-white/80">Make your own</p></div>
            <p className="text-[14px] text-white/75 leading-relaxed">{lesson.assignment.prompt}</p>
            {lesson.assignment.tool && lesson.assignment.tool !== 'NONE' && (
              <button
                onClick={() => {
                  const evt = TOOL_EVENT[lesson.assignment!.tool!];
                  if (evt === 'NAVIGATE') window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: lesson.assignment!.tool === 'CHORA' ? 'MUSIC' : 'BOOKS' } }));
                  else if (evt) window.dispatchEvent(new CustomEvent(evt, { detail: {} }));
                }}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest"
                style={{ background: accent, color: '#000' }}
              >
                Open {lesson.assignment.tool === 'FABULA' ? 'Fabula' : lesson.assignment.tool === 'PHOTO' ? 'the photo editor' : lesson.assignment.tool === 'CHORA' ? 'Chora' : lesson.assignment.tool === 'PIXELS' ? 'Pixels' : 'Lorea'} <ChevronRight size={12} />
              </button>
            )}
            {lesson.assignment.postTag && (
              <p className="text-[11px] text-white/40 mt-3">Publish with <span className="font-bold text-white/60">#{lesson.assignment.postTag}</span> to appear on the student wall.</p>
            )}
          </div>
        )}

        {lesson.resources?.length ? (
          <div className="mt-5">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/35 mb-2.5">Resources</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {lesson.resources.map((r, i) => (
                <a key={i} href={r.url} target="_blank" rel="noreferrer" className="rounded-xl border border-white/8 bg-white/[0.03] p-3 hover:bg-white/[0.06] transition-all flex items-center gap-2">
                  <BookOpen size={13} style={{ color: accent }} /><span className="text-[12px] text-white/70 flex-1">{r.label}</span><ExternalLink size={11} className="text-white/25" />
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <button
          onClick={onToggleDone}
          className={`mt-8 w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${done ? 'bg-white/8 text-white/60 border border-white/12' : ''}`}
          style={done ? undefined : { background: accent, color: '#000' }}
        >
          {done ? <><Circle size={15} /> Mark as not complete</> : <><CheckCircle2 size={15} /> Mark complete</>}
        </button>
        {!auth.currentUser && <p className="text-[11px] text-white/30 mt-3 text-center italic">Sign in to save progress to your Academic Passport.</p>}
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
interface Props { curriculum: Curriculum; onBack?: () => void; embedded?: boolean }

const SchoolView: React.FC<Props> = ({ curriculum, onBack, embedded }) => {
  const accent = curriculum.accent;
  const [completed, setCompleted] = useState<string[]>([]);
  const [openTrack, setOpenTrack] = useState<Track | null>(null);
  const [openLesson, setOpenLesson] = useState<Lesson | null>(null);

  useEffect(() => { let a = true; loadProgress(curriculum.id).then(p => a && setCompleted(p)); return () => { a = false; }; }, [curriculum.id]);

  const overall = useMemo(() => curriculumProgress(curriculum, completed), [curriculum, completed]);

  const toggleDone = async (lesson: Lesson) => {
    const isDone = completed.includes(lesson.id);
    const next = isDone
      ? await unmarkLesson(curriculum.id, lesson.id, completed)
      : await markLessonComplete(curriculum, lesson, completed);
    setCompleted(next);
  };

  if (openLesson && openTrack) {
    return (
      <LessonReader
        curriculum={curriculum} track={openTrack} lesson={openLesson}
        done={completed.includes(openLesson.id)}
        onToggleDone={() => toggleDone(openLesson)}
        onBack={() => setOpenLesson(null)}
      />
    );
  }

  const Body = (
    <div className="max-w-4xl mx-auto px-5 sm:px-6">
      {/* Header */}
      <div className="pt-2">
        {onBack && !embedded && (
          <button onClick={onBack} className="inline-flex items-center gap-2 text-white/40 hover:text-white transition-colors mb-6">
            <ArrowLeft size={16} /> <span className="text-[10px] font-black uppercase tracking-widest">Back</span>
          </button>
        )}
        <p className="text-[10px] font-black uppercase tracking-[0.4em]" style={{ color: accent }}>School</p>
        <h1 className="font-black tracking-tight mt-1.5 leading-none flex items-center gap-3" style={{ fontSize: 'clamp(1.9rem, 6vw, 2.9rem)' }}>
          <GraduationCap size={34} style={{ color: accent }} /> {curriculum.label}
        </h1>
        <p className="text-white/50 mt-3 max-w-2xl leading-relaxed">{curriculum.blurb}</p>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/55 flex items-center gap-2"><Trophy size={13} style={{ color: accent }} /> Your progress</span>
            <span className="text-[12px] font-black tabular-nums" style={{ color: accent }}>{overall.done} / {overall.total}</span>
          </div>
          <Bar pct={overall.pct} accent={accent} />
        </div>
      </div>

      {/* Tracks */}
      <div className="mt-8 space-y-3 pb-24">
        {curriculum.tracks.map(track => {
          const tp = trackProgress(track, completed);
          const isOpen = openTrack?.id === track.id;
          return (
            <div key={track.id} className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
              <button onClick={() => setOpenTrack(isOpen ? null : track)} className="w-full text-left p-5 hover:bg-white/[0.03] transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[16px] font-black text-white">{track.title}</h3>
                      {track.level && <span className="px-2 py-0.5 rounded-full bg-white/8 border border-white/12 text-[8px] font-black uppercase tracking-widest text-white/50">{track.level}</span>}
                    </div>
                    <p className="text-[13px] text-white/50 mt-1.5 leading-relaxed">{track.blurb}</p>
                  </div>
                  <ChevronRight size={18} className={`shrink-0 mt-1 text-white/30 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex-1"><Bar pct={tp.pct} accent={accent} /></div>
                  <span className="text-[10px] font-black tabular-nums text-white/40 shrink-0">{tp.done}/{tp.total}</span>
                </div>
              </button>

              {isOpen && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-t border-white/8">
                  {track.lessons.map((lesson, i) => {
                    const done = completed.includes(lesson.id);
                    return (
                      <button key={lesson.id} onClick={() => { setOpenTrack(track); setOpenLesson(lesson); }}
                        className="w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-white/[0.04] transition-colors border-b border-white/5 last:border-0">
                        <span className="shrink-0">{done ? <CheckCircle2 size={17} style={{ color: accent }} /> : <Circle size={17} className="text-white/20" />}</span>
                        <span className="text-[10px] font-black tabular-nums text-white/25 w-5 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[14px] font-bold text-white/85 leading-tight">{lesson.title}</span>
                          <span className="block text-[11.5px] text-white/40 mt-0.5 line-clamp-1">{lesson.blurb}</span>
                        </span>
                        {lesson.videoId && <PlayCircle size={15} className="text-white/25 shrink-0" />}
                        {lesson.minutes ? <span className="text-[10px] text-white/30 tabular-nums shrink-0">{lesson.minutes}m</span> : null}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return embedded ? Body : <div className="min-h-screen text-white bg-black/40 backdrop-blur-2xl pt-7">{Body}</div>;
};

export default SchoolView;
