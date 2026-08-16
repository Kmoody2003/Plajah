// FollowAlong — the congregation's side of Kairos.
//
// One component, two clocks. In the room it fires the instant the cue lands;
// on a stream it fires against the viewer's own playhead. Everything else is
// identical, including the note that gets written with the program timecode —
// which is why a person in row twelve and a viewer abroad get the same recap.
//
// SANCTUARY MODE IS THE DEFAULT, NOT A SETTING. Three hundred phones
// brightening at once during a quiet moment is precisely what makes churches
// distrust phone apps, and one complaint from the front row ends adoption. So:
// darkest surface while following, no sound, no haptic, and the page never
// grabs itself back from someone who has scrolled away to read.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDown, BookOpen, Check, Highlighter, StickyNote, X, Radio,
} from 'lucide-react';
import {
  listenToSession, resolveCue, cueRef, markersFor,
  type FollowMode, type KairosCue, type ScriptureSession,
} from '../../services/kairosService';
import { fetchRefText, DEFAULT_TRANSLATION, type ResolvedRef } from '../../services/scriptureText';
import { formatRef, refId, type ScriptureRef } from '../../services/scriptureRef';
import { TRANSLATIONS } from '../../services/bibleService';
import { openScripture } from './ScriptureRefChip';
import { recordServiceNote, pushSession, verseKeyOf } from '../../services/serviceNotes';
import { auth } from '../../services/backendService';

const HL_KEY = 'plajah_lectio_highlights_v1';
const PREF_KEY = 'plajah_follow_translation_v1';
const SERIF = '"Palatino Linotype", "Iowan Old Style", Palatino, Georgia, serif';

const fmtTC = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function readMap(key: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}
function writeMap(key: string, v: Record<string, string>) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* quota */ }
}

interface Props {
  sessionId: string;
  /** IN_ROOM fires immediately; STREAM waits for the playhead. */
  mode: FollowMode;
  /** Required in STREAM mode — the viewer's own playhead, in seconds. */
  playheadSec?: number;
  /** Jump the video to a marker (stream mode). */
  onSeek?: (sec: number) => void;
  onClose?: () => void;
  className?: string;
}

const FollowAlong: React.FC<Props> = ({ sessionId, mode, playheadSec, onSeek, onClose, className }) => {
  const [session, setSession] = useState<ScriptureSession | null>(null);
  const [slug, setSlug] = useState(() => localStorage.getItem(PREF_KEY) || DEFAULT_TRANSLATION);
  const [resolved, setResolved] = useState<ResolvedRef | null>(null);
  const [following, setFollowing] = useState(true);
  const [saved, setSaved] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<Record<string, string>>(() => readMap(HL_KEY));

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastAppliedSeq = useRef<number>(-1);

  useEffect(() => listenToSession(sessionId, setSession), [sessionId]);

  // The two-clock rule, applied. Everything else in this component is presentation.
  const liveCue: KairosCue | null = useMemo(
    () => resolveCue(session, mode, playheadSec),
    [session, mode, playheadSec],
  );

  // What is actually being shown — frozen when the reader has scrolled away.
  const [shown, setShown] = useState<KairosCue | null>(null);
  useEffect(() => {
    if (following) setShown(liveCue);
  }, [liveCue, following]);

  const behind = !following && liveCue && shown?.refId !== liveCue.refId;
  const ref: ScriptureRef | null = useMemo(() => cueRef(shown), [shown]);

  // Re-resolve in the VIEWER's translation, not the church's. One cue, N
  // renderings — the room can be on KJV while this phone shows NIV.
  useEffect(() => {
    if (!ref) { setResolved(null); return; }
    let dead = false;
    fetchRefText(ref, slug, 12).then(r => { if (!dead) setResolved(r); });
    return () => { dead = true; };
  }, [ref?.book, ref?.chapter, ref?.verse, ref?.endVerse, slug]);

  // Record that this passage was put in front of you, with the moment it
  // happened. It lands in the SERVICE notes store, not your own notebook — a
  // receipt is not a thought you had, and it must never block or overwrite a
  // note you typed on the same verse.
  useEffect(() => {
    if (!shown || !ref || shown.seq === lastAppliedSeq.current) return;
    lastAppliedSeq.current = shown.seq;

    recordServiceNote({
      verseKey: verseKeyOf(ref),
      refId: shown.refId,
      label: shown.label || formatRef(ref, 'display'),
      sessionId,
      serviceTitle: session?.title ?? 'Service',
      programTC: shown.programTC,
    });

    // Mirror to the member's own copy so it survives a new phone. Local already
    // has it, so a failure here is invisible and harmless.
    const uid = auth.currentUser?.uid;
    if (uid) void pushSession(uid, sessionId);

    setSaved(shown.refId);
    const t = setTimeout(() => setSaved(null), 2600);
    return () => clearTimeout(t);
  }, [shown?.seq]);

  // Reading ahead pauses following. It never yanks the page back — a pane that
  // moves under a reading finger is worse than one that never followed.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop > 24 && following) setFollowing(false);
  }, [following]);

  const jumpToLive = () => {
    setFollowing(true);
    setShown(liveCue);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleHighlight = () => {
    if (!ref) return;
    const key = `${ref.book}:${ref.chapter}:${ref.verse ?? 1}`;
    setHighlights(prev => {
      const n = { ...prev };
      if (n[key]) delete n[key]; else n[key] = 'gold';
      writeMap(HL_KEY, n);
      return n;
    });
  };

  const markers = useMemo(() => markersFor(session), [session]);
  const isHighlighted = ref ? !!highlights[`${ref.book}:${ref.chapter}:${ref.verse ?? 1}`] : false;

  if (!session) {
    return (
      <div className={`flex items-center justify-center p-6 text-[10px] uppercase tracking-widest text-white/25 ${className ?? ''}`}>
        Waiting for the service…
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-[#08070c] text-white ${className ?? ''}`}>
      {/* header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/8 shrink-0">
        <span className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border ${
          following
            ? 'border-[#d4af37]/50 bg-[#d4af37]/10 text-[#d4af37]'
            : 'border-white/12 text-white/40'
        }`}>
          <Radio size={9} /> {following ? 'Following' : 'Reading ahead'}
        </span>
        <span className="text-[9px] text-white/30 truncate flex-1">{session.title}</span>
        {shown && <span className="font-mono text-[9px] text-white/30 tabular-nums">{fmtTC(shown.programTC)}</span>}
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="text-white/35 hover:text-white"><X size={14} /></button>
        )}
      </div>

      {/* the passage */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto custom-scrollbar">
        <AnimatePresence mode="wait">
          {!shown || !ref ? (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="px-5 py-12 text-center">
              <BookOpen size={22} className="mx-auto text-white/15 mb-3" />
              <p className="text-[11px] text-white/30 leading-relaxed">
                {mode === 'IN_ROOM'
                  ? 'Your phone will turn to the passage when it’s read. Nothing to do.'
                  : 'The passage will appear as the message reaches it.'}
              </p>
            </motion.div>
          ) : (
            <motion.div key={refId(ref)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
              {/* the ONE skinnable surface, at its darkest while following */}
              <div style={{ background: 'linear-gradient(180deg,#0F0D16 0%,#0A0910 100%)' }}
                className="px-5 py-5">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#d4af37]">
                    {formatRef(ref, 'display')}
                  </span>
                  <span className="text-[8px] uppercase tracking-widest text-white/25">
                    {resolved?.translation ?? '…'}
                  </span>
                </div>

                {resolved ? (
                  <div style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.75 }}>
                    {resolved.verses.map(v => (
                      <p key={v.verse} className="mb-2"
                        style={{
                          color: '#E8E0CC',
                          background: isHighlighted ? 'rgba(212,175,55,0.16)' : undefined,
                          borderRadius: isHighlighted ? 3 : undefined,
                        }}>
                        <sup className="font-mono font-bold mr-1" style={{ fontSize: 9, color: '#d4af37', verticalAlign: '0.42em' }}>{v.verse}</sup>
                        {v.text}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2" aria-hidden>
                    <div className="h-3 rounded bg-white/8 w-full" />
                    <div className="h-3 rounded bg-white/8 w-11/12" />
                    <div className="h-3 rounded bg-white/8 w-3/5" />
                  </div>
                )}
              </div>

              {/* actions */}
              <div className="px-4 py-3 flex items-center gap-1.5 flex-wrap border-t border-white/6">
                <button onClick={toggleHighlight}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-[8.5px] font-black uppercase tracking-widest transition-colors ${
                    isHighlighted ? 'border-[#d4af37] text-[#d4af37] bg-[#d4af37]/10' : 'border-white/12 text-white/50'
                  }`}>
                  <Highlighter size={10} /> {isHighlighted ? 'Highlighted' : 'Highlight'}
                </button>
                <button onClick={() => openScripture(ref)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-white/12 text-white/50 text-[8.5px] font-black uppercase tracking-widest">
                  <BookOpen size={10} /> Open
                </button>
                {saved === shown.refId && (
                  <span className="flex items-center gap-1 text-[8.5px] font-black uppercase tracking-widest text-[#2BE0A8]">
                    <Check size={10} /> Added to today’s service notes
                  </span>
                )}
              </div>

              {/* what has been read so far — and, on a stream, a way back to it */}
              {markers.length > 0 && (
                <div className="px-4 pb-5">
                  <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/25 mb-2">
                    This service · {markers.length}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {markers.map(m => (
                      <button key={`${m.refId}-${m.programTC}`}
                        onClick={() => onSeek?.(m.programTC)}
                        disabled={!onSeek}
                        className="px-2 py-1 rounded-md border border-white/10 font-mono text-[8.5px] uppercase tracking-wider text-white/50 hover:text-[#d4af37] hover:border-[#d4af37]/40 transition-colors disabled:hover:text-white/50 disabled:hover:border-white/10">
                        {m.label} <span className="text-white/25">{fmtTC(m.programTC)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Jump to live — the page never moves on its own once you've scrolled */}
      <AnimatePresence>
        {behind && (
          <motion.button
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            onClick={jumpToLive}
            className="mx-3 mb-3 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#d4af37] text-black text-[9px] font-black uppercase tracking-widest shrink-0">
            <ArrowDown size={11} /> Jump to live · {liveCue?.label}
          </motion.button>
        )}
      </AnimatePresence>

      {/* footer: per-viewer translation + the etiquette promise */}
      <div className="px-3 py-2.5 border-t border-white/8 shrink-0">
        <div className="flex items-center gap-1 flex-wrap mb-1.5">
          {TRANSLATIONS.slice(0, 4).map(t => (
            <button key={t.slug}
              onClick={() => { setSlug(t.slug); localStorage.setItem(PREF_KEY, t.slug); }}
              className={`px-2 py-[3px] rounded-full text-[8px] font-black uppercase tracking-widest border transition-all ${
                slug === t.slug ? 'bg-[#d4af37] border-[#d4af37] text-black' : 'border-white/12 text-white/35'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-[8px] text-white/22 leading-relaxed">
          {mode === 'IN_ROOM'
            ? 'Silent · screen stays dim · never wakes on its own'
            : 'Follows your playhead, not the room’s'}
          {session.translation && slug !== session.translation && ' · the screen shows a different translation'}
        </p>
      </div>
    </div>
  );
};

export default FollowAlong;
