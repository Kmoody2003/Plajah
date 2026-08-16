// VespersRecap — what a member opens on Tuesday.
//
// The passages, in the order they were taught, each one a way back into both
// the text and the moment on the replay. Their own highlights and notes are
// folded in locally — the church never sees them.
//
// It renders identically for someone who sat in row twelve and someone who
// watched from another country, because Kairos stamped both their notes with
// the same program timecode.

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ChevronLeft, Play, FileText, Highlighter, StickyNote, BookOpen, Sparkles, Clock,
} from 'lucide-react';
import {
  listenToRecap, personalize, replayUrlAt, formatTC,
  type PersonalRecap, type ServiceRecap,
} from '../../services/vespersService';
import { parseRefId, formatRef } from '../../services/scriptureRef';
import { syncServiceNotes } from '../../services/serviceNotes';
import { auth } from '../../services/backendService';
import { openScripture } from './ScriptureRefChip';

const SERIF = '"Palatino Linotype", "Iowan Old Style", Palatino, Georgia, serif';

interface Props {
  recapId: string;
  /** Seek the replay to a passage rather than opening a URL. */
  onSeek?: (sec: number) => void;
  onBack?: () => void;
}

const VespersRecap: React.FC<Props> = ({ recapId, onSeek, onBack }) => {
  const [recap, setRecap] = useState<ServiceRecap | null>(null);
  const [loading, setLoading] = useState(true);
  const [showArticle, setShowArticle] = useState(false);

  useEffect(() => listenToRecap(recapId, r => { setRecap(r); setLoading(false); }), [recapId]);

  // Pull the member's own copy first — someone who followed on their phone and
  // opens the briefing on a laptop should still see their service notes.
  const [synced, setSynced] = useState(0);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    let dead = false;
    void syncServiceNotes(uid).then(() => { if (!dead) setSynced(v => v + 1); });
    return () => { dead = true; };
  }, [recapId]);

  const personal: PersonalRecap | null = useMemo(
    () => (recap ? personalize(recap) : null),
    [recap, synced],
  );

  if (loading) {
    return (
      <div className="fixed inset-0 z-[120] bg-[#08070c] flex items-center justify-center">
        <span className="text-[10px] uppercase tracking-widest text-white/25">Gathering the service…</span>
      </div>
    );
  }

  if (!recap || !personal) {
    return (
      <div className="fixed inset-0 z-[120] bg-[#08070c] text-white flex flex-col items-center justify-center px-6 text-center">
        <BookOpen size={24} className="text-white/15 mb-3" />
        <p className="text-[11px] text-white/35 max-w-xs leading-relaxed">
          This service hasn’t been filed yet. It appears here once the stream ends.
        </p>
        {onBack && (
          <button onClick={onBack} className="mt-5 text-[9px] font-black uppercase tracking-widest text-white/45 hover:text-white">
            Go back
          </button>
        )}
      </div>
    );
  }

  const goTo = (tc: number) => {
    if (onSeek) { onSeek(tc); return; }
    const url = replayUrlAt(recap, tc);
    if (url) window.open(url, '_blank', 'noopener');
  };

  const dateLabel = new Date(recap.startedAt).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
  });

  return (
    <div className="fixed inset-0 z-[120] bg-[#08070c] text-white overflow-y-auto custom-scrollbar">
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-2.5 bg-[#08070c]/90 backdrop-blur-xl border-b border-white/8">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1.5 text-white/50 hover:text-white text-[9px] font-black uppercase tracking-widest">
            <ChevronLeft size={14} /> Back
          </button>
        )}
        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-[#d4af37]">Vespers</span>
        <div className="flex-1" />
        <span className="font-mono text-[9px] text-white/30">{formatTC(recap.durationSec)}</span>
      </div>

      <div className="max-w-md mx-auto px-5 pb-16">
        {/* the service */}
        <header className="pt-7 pb-5">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#d4af37] mb-2">{dateLabel}</p>
          <h1 className="text-2xl leading-tight" style={{ fontFamily: SERIF }}>{recap.title}</h1>
          <div className="flex items-center gap-3 mt-3 text-[9px] uppercase tracking-widest text-white/30">
            <span className="flex items-center gap-1"><BookOpen size={10} /> {recap.passages.length} passages</span>
            {personal.highlightCount > 0 && (
              <span className="flex items-center gap-1 text-[#d4af37]"><Highlighter size={10} /> {personal.highlightCount} yours</span>
            )}
            {recap.durationSec > 0 && (
              <span className="flex items-center gap-1"><Clock size={10} /> {Math.round(recap.durationSec / 60)} min</span>
            )}
          </div>
        </header>

        {/* ARIA's summary — present only when prose ran */}
        {recap.summary && (
          <section className="mb-6">
            <div className="flex items-center gap-1.5 mb-2">
              <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30">The message, in short</p>
              {recap.status === 'DRAFT' && (
                <span className="px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest border border-white/12 text-white/30">
                  Unreviewed
                </span>
              )}
            </div>
            <p className="text-[13px] leading-relaxed text-white/65" style={{ fontFamily: SERIF }}>
              {recap.summary}
            </p>
          </section>
        )}

        {/* the passages — the spine */}
        <section className="mb-6">
          <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30 mb-2.5">
            Scripture · return to any
          </p>
          {personal.passages.length === 0 ? (
            <p className="text-[11px] text-white/25">No passages were put on screen in this service.</p>
          ) : (
            <div className="space-y-1.5">
              {personal.passages.map(p => {
                const ref = parseRefId(p.refId);
                return (
                  <div key={`${p.refId}-${p.programTC}`}
                    className={`rounded-lg border transition-colors ${
                      p.highlighted ? 'border-[#d4af37]/45 bg-[#d4af37]/[0.07]' : 'border-white/10'
                    }`}>
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <button
                        onClick={() => ref && openScripture(ref)}
                        className="font-mono text-[10px] uppercase tracking-wider text-[#d4af37] hover:text-[#F0D171] text-left flex-1">
                        {ref ? formatRef(ref, 'display') : p.label}
                      </button>
                      <button onClick={() => goTo(p.programTC)}
                        disabled={!onSeek && !recap.replayUrl}
                        title="Play from this moment"
                        className="flex items-center gap-1 font-mono text-[9px] text-white/35 hover:text-white disabled:hover:text-white/35 tabular-nums">
                        <Play size={9} /> {formatTC(p.programTC)}
                      </button>
                    </div>
                    {(p.highlighted || p.note) && (
                      <div className="px-3 pb-2.5 -mt-0.5 space-y-1">
                        {p.highlighted && (
                          <p className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-[#d4af37]">
                            <Highlighter size={9} /> you highlighted this
                          </p>
                        )}
                        {p.note && (
                          <p className="flex items-start gap-1.5 text-[11px] italic text-white/55" style={{ fontFamily: SERIF }}>
                            <StickyNote size={10} className="mt-0.5 shrink-0 text-white/30" />
                            {p.note}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Notes generated for this day — the platform's record of what you were
            shown, deliberately its own section rather than mixed in above. */}
        {personal.serviceNotes.length > 0 && (
          <section className="mb-6 rounded-xl border border-white/10 overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.03] border-b border-white/8">
              <Sparkles size={10} className="text-white/35" />
              <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/35 flex-1">
                Service notes · {dateLabel}
              </p>
              <span className="text-[8px] uppercase tracking-widest text-white/22">Generated</span>
            </div>
            <div className="divide-y divide-white/6">
              {personal.serviceNotes.map(n => {
                const ref = parseRefId(n.refId);
                return (
                  <div key={`${n.sessionId}-${n.refId}`} className="flex items-center gap-2 px-3 py-2">
                    <button onClick={() => ref && openScripture(ref)}
                      className="font-mono text-[9.5px] uppercase tracking-wider text-[#d4af37]/80 hover:text-[#d4af37] flex-1 text-left">
                      {n.label}
                    </button>
                    <button onClick={() => goTo(n.programTC)}
                      disabled={!onSeek && !recap.replayUrl}
                      className="flex items-center gap-1 font-mono text-[9px] text-white/30 hover:text-white disabled:hover:text-white/30 tabular-nums">
                      <Play size={8} /> {formatTC(n.programTC)}
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="px-3 py-2 text-[8.5px] text-white/22 leading-relaxed border-t border-white/6">
              Recorded automatically as each passage came up. Your own notes stay above, untouched.
              {auth.currentUser
                ? ' Synced to your account — only you can see this.'
                : ' Sign in to keep these across your devices.'}
            </p>
          </section>
        )}

        {/* actions */}
        <div className="flex gap-2 mb-6">
          {(recap.replayUrl || onSeek) && (
            <button onClick={() => goTo(0)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-white/15 text-[9px] font-black uppercase tracking-widest text-white/65 hover:bg-white/[0.06]">
              <Play size={11} /> Replay
            </button>
          )}
          {recap.article && (
            <button onClick={() => setShowArticle(v => !v)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-[#d4af37] text-black text-[9px] font-black uppercase tracking-widest">
              <FileText size={11} /> {showArticle ? 'Hide' : 'Read'} article
            </button>
          )}
        </div>

        {/* the article draft */}
        {showArticle && recap.article && (
          <motion.article initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="mb-8 pt-5 border-t border-white/8">
            <h2 className="text-xl leading-tight mb-2" style={{ fontFamily: SERIF }}>{recap.article.title}</h2>
            {recap.article.dek && (
              <p className="text-[12px] text-white/45 mb-5 leading-relaxed">{recap.article.dek}</p>
            )}
            {recap.article.sections?.map((s, i) => (
              <section key={i} className="mb-5">
                {s.heading && <h3 className="text-[10px] font-black uppercase tracking-[0.14em] text-[#d4af37] mb-1.5">{s.heading}</h3>}
                <p className="text-[13.5px] leading-relaxed text-white/75 whitespace-pre-wrap" style={{ fontFamily: SERIF }}>{s.body}</p>
              </section>
            ))}
            {!!recap.article.supplements?.length && (
              <div className="mt-6 pt-4 border-t border-white/8">
                <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30 mb-2">Notes &amp; sources</p>
                <div className="space-y-2">
                  {recap.article.supplements.map((s, i) => (
                    <div key={i} className="text-[11px] leading-relaxed">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-[#d4af37] mr-1.5">{s.label}</span>
                      <span className="text-white/50">{s.detail}</span>
                      {s.source && <span className="text-white/25"> — {s.source}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-6 text-[9px] text-white/25 leading-relaxed">
              Drafted by Aria from the service transcript and reviewed by your church before publishing.
            </p>
          </motion.article>
        )}

        {/* keep going */}
        {personal.passages.length > 0 && (
          <button
            onClick={() => {
              const ref = parseRefId(personal.passages[0].refId);
              if (ref) openScripture(ref);
            }}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-[#d4af37]/35 bg-[#d4af37]/[0.06] text-[9px] font-black uppercase tracking-widest text-[#d4af37]">
            <Sparkles size={11} /> Keep reading in Lectio
          </button>
        )}

        <p className="mt-5 text-center text-[9px] text-white/22 leading-relaxed">
          Your highlights and notes stay on your account and leave with you.
        </p>
      </div>
    </div>
  );
};

export default VespersRecap;
