import React, { useEffect, useState } from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';
import { notesFor } from '../../data/traditionNotes';
import type { TraditionNote } from '../../data/traditionTypes';
import { usesScripture, type SchoolProfile, TRADITIONS } from '../../services/schoolProfile';
import { parseRef, refId, formatRef } from '../../services/scriptureRef';
import { fetchRefText, type ResolvedRef } from '../../services/scriptureText';

/**
 * Scripture connections for a lesson, shown only to schools and families that turned the tradition
 * layer on. Each connection is labelled with its perspective and the passages open in the user's
 * chosen translation or in Lectio. The lesson itself is unchanged: this is an addition.
 */
const KIND: Record<TraditionNote['kind'], string> = { echo: 'Scripture echo', context: 'Scripture context', 'church-history': 'Church history', devotional: 'For reflection' };

const Passage: React.FC<{ refText: string; translation: string }> = ({ refText, translation }) => {
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<ResolvedRef | null | undefined>(undefined);
  const ref = parseRef(refText);
  if (!ref) return null;
  const toggle = async () => {
    setOpen(o => !o);
    if (res === undefined) setRes(await fetchRefText(ref, translation, 10).catch(() => null));
  };
  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={toggle} aria-expanded={open} className="text-[12px] font-black text-[#fbbf24] hover:text-[#fde68a] inline-flex items-center gap-1.5"><BookOpen size={12} /> {formatRef(ref, 'display')}</button>
        <button type="button" onClick={() => { try { window.dispatchEvent(new CustomEvent('OPEN_BIBLE', { detail: { refId: refId(ref) } })); } catch { /* */ } }} className="text-[10px] text-white/45 hover:text-white inline-flex items-center gap-1">Open in Lectio <ExternalLink size={9} /></button>
      </div>
      {open && (
        <blockquote className="mt-1.5 border-l-2 border-[#fbbf24]/50 pl-3 text-[13px] text-white/80 leading-relaxed">
          {res === undefined ? 'Loading…' : res === null ? 'The text could not be loaded right now.' : (<>{res.verses.map(v => <span key={v.verse}><sup className="text-[9px] text-white/40 mr-0.5">{v.verse}</sup>{v.text} </span>)}{res.truncated && '…'}<footer className="text-[10px] text-white/40 mt-1">{res.translation}</footer></>)}
        </blockquote>
      )}
    </div>
  );
};

const TraditionPanel: React.FC<{ courseId: string; lessonId: string; school?: SchoolProfile }> = ({ courseId, lessonId, school }) => {
  const [notes, setNotes] = useState<TraditionNote[]>([]);
  const enabled = usesScripture(school);
  useEffect(() => { let a = true; if (enabled) notesFor(courseId, lessonId).then(n => a && setNotes(n)); else setNotes([]); return () => { a = false; }; }, [courseId, lessonId, enabled]);
  if (!enabled || !notes.length) return null;
  const label = TRADITIONS.find(t => t.id === school!.tradition)?.label || 'Christian';
  const translation = school!.scripture.translation;
  return (
    <section className="mt-6 rounded-2xl border border-[#fbbf24]/30 bg-[#fbbf24]/[0.06] p-4" aria-label="Scripture connections">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#fbbf24] mb-2">Scripture connections · {label} perspective</p>
      <div className="grid gap-4">
        {notes.map((n, i) => (
          <div key={i}>
            <p className="text-[11px] font-black uppercase tracking-wider text-white/45">{KIND[n.kind]}</p>
            <p className="text-[13px] text-white/85 leading-snug mt-0.5">{n.connection}</p>
            {n.passages.map(p => <Passage key={p} refText={p} translation={translation} />)}
            {n.canonNote && <p className="text-[11px] text-white/45 mt-1.5">{n.canonNote}</p>}
          </div>
        ))}
      </div>
    </section>
  );
};

export default TraditionPanel;
