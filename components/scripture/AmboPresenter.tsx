// AmboPresenter — prepare and present Scripture.
//
// The one thing it does that ProPresenter cannot: it isn't importing anything.
// Text is live from the same store the reader uses, so the operator types
// "rom 8.28" and gets the verse — no slide to build, no text to paste.
//
// Runs in three places off the same component: the Apps view (standalone), a
// docked TV Studio panel (compact), and — when handed an engine — keying the
// real switcher output. Preview and Program draw through the SAME renderer the
// engine uses, so what is approved is what airs.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, Play, Eraser, Square, Radio, Download, Loader2,
  Type, Maximize2, Clock, MonitorPlay, Check, FileText,
} from 'lucide-react';
import { parseRef, formatRef, type ScriptureRef } from '../../services/scriptureRef';
import { TRANSLATIONS } from '../../services/bibleService';
import { DEFAULT_TRANSLATION } from '../../services/scriptureText';
import {
  buildSlides, fireCue, fireClear, formatTC, toLogEntry,
  DEFAULT_DESTINATIONS, type CueDestinations, type CueLogEntry,
  type ScriptureSlide, type SlideVariant, type SplitMode,
} from '../../services/amboService';
import { drawScriptureGraphic } from '../../services/scriptureGraphic';
import AmboStage from './AmboStage';
import {
  startSession, publishCue, clearCue, endSession, fetchSession, sessionIdFor,
  type KairosCue,
} from '../../services/kairosService';
import { buildRecap, saveRecap } from '../../services/vespersService';
import { refId } from '../../services/scriptureRef';
import { auth } from '../../services/backendService';
import type { TVStudioEngine } from '../../services/tvStudioEngine';

const OVERLAY_ID = 'ambo-scripture';

/** A monitor that draws a slide exactly as the switcher will. */
const Monitor: React.FC<{ slide: ScriptureSlide | null; label: string; live?: boolean }> =
({ slide, label, live }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    // A stage-ish ground so contrast reads the way it will on camera.
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, '#1A1430'); g.addColorStop(0.62, '#0C0A18'); g.addColorStop(1, '#06050C');
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    if (slide) {
      drawScriptureGraphic(ctx, {
        lines: slide.lines,
        reference: slide.refLabel,
        variant: slide.variant,
        copyright: slide.copyright,
        width: c.width, height: c.height,
      });
    }
  }, [slide]);

  return (
    <div>
      <div className="relative rounded-md overflow-hidden border-2"
        style={{ borderColor: live ? '#FF4B50' : '#2BE0A8' }}>
        <span className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded text-[8px] font-mono tracking-widest"
          style={{ background: live ? '#FF4B50' : '#2BE0A8', color: live ? '#fff' : '#062' }}>
          {label}
        </span>
        <canvas ref={ref} width={640} height={360} className="w-full block" />
      </div>
    </div>
  );
};

interface Props {
  /** When present, cues key the real switcher output. */
  engine?: TVStudioEngine | null;
  /** Docked-panel layout for the TV Studio side rail. */
  compact?: boolean;
  onBack?: () => void;
}

const AmboPresenter: React.FC<Props> = ({ engine, compact, onBack }) => {
  const [input, setInput] = useState('Romans 8:28-31');
  const [slug, setSlug] = useState(DEFAULT_TRANSLATION);
  const [variant, setVariant] = useState<SlideVariant>('LOWER_THIRD');
  const [mode, setMode] = useState<SplitMode>('verse');

  const [slides, setSlides] = useState<ScriptureSlide[]>([]);
  const [building, setBuilding] = useState(false);
  const [cursor, setCursor] = useState(0);          // index queued in PREVIEW
  const [onAir, setOnAir] = useState<ScriptureSlide | null>(null);
  const [dest, setDest] = useState<CueDestinations>(DEFAULT_DESTINATIONS);
  const [log, setLog] = useState<CueLogEntry[]>([]);
  const [tc, setTc] = useState(0);
  const [copied, setCopied] = useState(false);

  // Kairos — the live session phones follow.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [filing, setFiling] = useState(false);
  const [panel, setPanel] = useState<'SCRIPTURE' | 'STAGE'>('SCRIPTURE');
  const [filedRecapId, setFiledRecapId] = useState<string | null>(null);
  const seqRef = useRef(0);

  const parsed: ScriptureRef | null = useMemo(() => parseRef(input), [input]);

  // Program timecode — what stream viewers resolve their cue against.
  useEffect(() => {
    const t = setInterval(() => setTc(v => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Rebuild the stack whenever the reference or its shape changes.
  useEffect(() => {
    if (!parsed) { setSlides([]); return; }
    let dead = false;
    setBuilding(true);
    buildSlides(parsed, { variant, mode, slug })
      .then(s => { if (!dead) { setSlides(s); setCursor(0); setBuilding(false); } })
      .catch(() => { if (!dead) setBuilding(false); });
    return () => { dead = true; };
  }, [parsed?.book, parsed?.chapter, parsed?.verse, parsed?.endVerse, parsed?.endChapter, variant, mode, slug]);

  const preview = slides[cursor] ?? null;

  const pushToEngine = useCallback((slide: ScriptureSlide | null) => {
    if (!engine || !dest.switcher) return;
    const existing = engine.getOverlays?.().find(o => o.id === OVERLAY_ID);
    if (!slide) {
      if (existing) engine.setOverlayVisible(OVERLAY_ID, false);
      return;
    }
    const patch = {
      lines: slide.lines,
      reference: slide.refLabel,
      copyright: slide.copyright,
      scriptureVariant: slide.variant,
      visible: true,
    };
    if (existing) engine.updateOverlay(OVERLAY_ID, patch);
    else engine.addOverlay({ id: OVERLAY_ID, label: 'Ambo — Scripture', type: 'SCRIPTURE', opacity: 1, ...patch });
  }, [engine, dest.switcher]);

  // The whole point of building the presenter and the switcher as one product:
  // the operator's TAKE *is* the sync event. No speech recognition in the loop.
  const publishToKairos = useCallback((slide: ScriptureSlide) => {
    if (!sessionId) return;
    const kcue: KairosCue = {
      refId: refId(slide.ref),
      label: slide.refLabel,
      lines: slide.lines,
      translation: slide.translation,
      variant: slide.variant,
      wallClock: Date.now(),   // phones in the room fire on this
      programTC: tc,           // stream viewers fire against their own playhead
      seq: ++seqRef.current,
    };
    void publishCue(sessionId, kcue);
  }, [sessionId, tc]);

  const take = () => {
    if (!preview) return;
    setOnAir(preview);
    pushToEngine(preview);
    const cue = fireCue(preview, tc, dest);
    if (dest.inRoom || dest.stream) publishToKairos(preview);
    setLog(l => [toLogEntry(cue), ...l].slice(0, 40));
    if (cursor < slides.length - 1) setCursor(cursor + 1);
  };

  const clear = () => {
    setOnAir(null);
    pushToEngine(null);
    fireClear();
    if (sessionId) void clearCue(sessionId, tc, ++seqRef.current);
  };

  const goLive = async () => {
    if (sessionId || starting) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setStarting(true);
    try {
      const id = await startSession({
        orgId: uid,                       // per-host until an org is selected
        title: parsed ? formatRef(parsed, 'display') : 'Service',
        translation: slug,
      });
      setSessionId(id);
    } catch { /* signed out or offline — the presentation still runs */ }
    setStarting(false);
  };

  // Ending the service files it. The recap is built from the cue log alone and
  // saved immediately, so a member opening the app thirty seconds later already
  // finds their passages; ARIA's prose lands later if it lands at all.
  const stopLive = async () => {
    if (!sessionId) return;
    setFiling(true);
    await endSession(sessionId);
    const session = await fetchSession(sessionId);
    if (session) {
      const recap = buildRecap(session, { endedAt: Date.now() });
      try {
        await saveRecap(recap);
        setFiledRecapId(recap.id);
      } catch { /* offline — the operator is told below */ }
    }
    setSessionId(null);
    setFiling(false);
  };

  // Space takes, Escape clears — the two motions an operator makes under
  // pressure. Ignored while typing a reference.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA') return;
      if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); take(); }
      if (e.key === 'Escape') clear();
      if (e.key === 'ArrowDown') setCursor(c => Math.min(slides.length - 1, c + 1));
      if (e.key === 'ArrowUp') setCursor(c => Math.max(0, c - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const exportLog = async () => {
    const text = log.slice().reverse()
      .map(e => `${formatTC(e.programTC)}\t${e.label}\t${e.refIdStr}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };

  const chip = (on: boolean) =>
    `px-2 py-[3px] rounded-full text-[8.5px] font-black uppercase tracking-widest border transition-all ${
      on ? 'bg-[#d4af37] border-[#d4af37] text-black' : 'border-white/12 text-white/40 hover:text-white'
    }`;

  // ── Composer + stack, shared by both layouts ───────────────────────────────
  const composer = (
    <div className="space-y-3">
      <div>
        <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30 mb-1.5">Reference</p>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="rom 8.28-31"
          spellCheck={false}
          className={`w-full bg-black/45 border rounded-lg px-2.5 py-2 font-mono text-[12.5px] outline-none transition-colors ${
            parsed ? 'border-[#d4af37]/50 text-[#d4af37]' : input.trim() ? 'border-red-500/50 text-red-300' : 'border-white/12 text-white/70'
          }`}
        />
        <p className="text-[9px] mt-1 text-white/35">
          {building ? 'Fetching…'
            : parsed ? `${formatRef(parsed, 'display')} · ${slides.length} ${slides.length === 1 ? 'slide' : 'slides'}`
            : input.trim() ? 'Not a reference yet' : 'Type a reference'}
        </p>
      </div>

      <div>
        <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30 mb-1.5">Look</p>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setVariant('LOWER_THIRD')} className={chip(variant === 'LOWER_THIRD')}>
            <Type size={9} className="inline mr-1" />Lower ⅓
          </button>
          <button onClick={() => setVariant('FULLSCREEN')} className={chip(variant === 'FULLSCREEN')}>
            <Maximize2 size={9} className="inline mr-1" />Full
          </button>
        </div>
      </div>

      <div>
        <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30 mb-1.5">Split</p>
        <div className="flex gap-1.5 flex-wrap">
          {(['verse', 'clause', 'all'] as SplitMode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} className={chip(mode === m)}>
              {m === 'verse' ? '1 / slide' : m === 'clause' ? 'By clause' : 'All'}
            </button>
          ))}
        </div>
        <p className="text-[8.5px] text-white/25 mt-1.5 leading-relaxed">
          Type auto-fits and breaks at clause boundaries. Title-safe 5%.
        </p>
      </div>

      <div>
        <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30 mb-1.5">Translation</p>
        <div className="flex gap-1.5 flex-wrap">
          {TRANSLATIONS.map(t => (
            <button key={t.slug} onClick={() => setSlug(t.slug)} className={chip(slug === t.slug)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30 mb-1.5">Destinations</p>
        <div className="space-y-1">
          {([
            ['screens', 'Auditorium screens'],
            ['switcher', engine ? 'Switcher key' : 'Switcher key (not connected)'],
            ['inRoom', 'In-room phones'],
            ['stream', 'Stream viewers'],
            ['kids', 'Kids room · paraphrase'],
          ] as [keyof CueDestinations, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setDest(d => ({ ...d, [k]: !d[k] }))}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded-md border border-white/8 hover:border-white/20 transition-colors">
              <span className="text-[10px] text-white/60">{label}</span>
              <span className={`px-1.5 py-0.5 rounded text-[7.5px] font-black uppercase tracking-widest ${
                dest[k] ? 'bg-[#2BE0A8]/15 text-[#2BE0A8] border border-[#2BE0A8]/40' : 'text-white/25 border border-white/10'
              }`}>
                {dest[k] ? 'On' : 'Off'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const stack = (
    <div className="space-y-1.5">
      {slides.length === 0 && !building && (
        <p className="text-[10px] text-white/25 py-2">No slides yet.</p>
      )}
      {slides.map((s, i) => {
        const isNext = i === cursor;
        const isLive = onAir?.id === s.id;
        return (
          <button key={s.id} onClick={() => setCursor(i)}
            className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors ${
              isLive ? 'border-[#FF4B50]/60 bg-[#FF4B50]/10'
                : isNext ? 'border-[#d4af37]/50 bg-[#d4af37]/[0.08]'
                : 'border-white/10 hover:border-white/25'
            }`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[9px] uppercase tracking-wider"
                style={{ color: isLive ? '#FF4B50' : '#d4af37' }}>
                {formatRef(s.ref, 'compact')}
              </span>
              {isLive && <span className="text-[7.5px] font-black uppercase tracking-widest text-[#FF4B50]">On air</span>}
              {!isLive && isNext && <span className="text-[7.5px] font-black uppercase tracking-widest text-[#d4af37]">Next</span>}
            </div>
            <p className="text-[10.5px] text-white/55 mt-0.5 line-clamp-2">{s.lines.join(' ')}</p>
          </button>
        );
      })}
    </div>
  );

  const transport = (
    <div className="flex gap-1.5">
      <button onClick={take} disabled={!preview}
        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md bg-[#d4af37] text-black text-[9px] font-black uppercase tracking-widest disabled:opacity-30 hover:brightness-110 transition-all">
        <Play size={11} fill="currentColor" /> Take
      </button>
      <button onClick={clear}
        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md border border-white/15 text-white/60 text-[9px] font-black uppercase tracking-widest hover:bg-white/[0.08]">
        <Eraser size={11} /> Clear
      </button>
      <button onClick={clear}
        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md border border-[#FF4B50]/50 text-[#FF4B50] text-[9px] font-black uppercase tracking-widest hover:bg-[#FF4B50]/10">
        <Square size={10} fill="currentColor" /> Black
      </button>
    </div>
  );

  // ── Docked panel (TV Studio) ───────────────────────────────────────────────
  if (compact) {
    return (
      <div className="flex flex-col h-full text-white">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-black/30">
          <span className="text-[9px] font-black uppercase tracking-[0.16em] text-[#d4af37]">Ambo</span>
          <span className="px-1.5 py-0.5 rounded text-[7.5px] font-mono tracking-widest border border-[#d4af37]/40 text-[#d4af37]">
            {engine ? 'KEY' : 'NO ENGINE'}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
          {onAir && (
            <div className="rounded-lg border border-[#FF4B50]/50 bg-[#FF4B50]/10 px-2.5 py-2">
              <div className="font-mono text-[9px] uppercase tracking-wider text-[#FF4B50]">{formatRef(onAir.ref, 'compact')}</div>
              <p className="text-[10.5px] text-white/70 mt-1 line-clamp-2">{onAir.lines.join(' ')}</p>
            </div>
          )}
          {preview && (
            <div className="rounded-lg border border-[#d4af37]/45 bg-[#d4af37]/[0.07] px-2.5 py-2">
              <div className="font-mono text-[9px] uppercase tracking-wider text-[#d4af37]">
                {formatRef(preview.ref, 'compact')} — next
              </div>
              <p className="text-[10.5px] text-white/60 mt-1 line-clamp-2">{preview.lines.join(' ')}</p>
            </div>
          )}
          {transport}
          {composer}
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30 mb-1.5">Stack</p>
            {stack}
          </div>
        </div>
      </div>
    );
  }

  // ── Standalone app ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[120] bg-[#0A0910] text-white flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-black/40">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1.5 text-white/50 hover:text-white text-[9px] font-black uppercase tracking-widest">
            <ChevronLeft size={14} /> Exit
          </button>
        )}
        <span className="text-[15px] font-serif tracking-wide text-[#d4af37]" style={{ fontFamily: 'Palatino Linotype, Palatino, Georgia, serif' }}>Ambo</span>
        <span className="text-[9px] font-mono text-white/25">Scripture presenter</span>
        <div className="flex-1" />
        <span className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-white/12 text-[9px] font-mono text-white/50">
          <Clock size={10} /> {formatTC(tc)}
        </span>
        {filedRecapId && !sessionId && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('OPEN_VESPERS', { detail: { recapId: filedRecapId } }))}
            className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-[#d4af37]/50 bg-[#d4af37]/10 text-[9px] font-black uppercase tracking-widest text-[#d4af37]">
            <FileText size={10} /> Service filed
          </button>
        )}
        {sessionId ? (
          <button onClick={stopLive} disabled={filing}
            className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-[#2BE0A8]/50 bg-[#2BE0A8]/10 text-[9px] font-black uppercase tracking-widest text-[#2BE0A8] disabled:opacity-50"
            title="Congregation phones are following. Click to end the service and file it.">
            {filing ? <Loader2 size={10} className="animate-spin" /> : <Radio size={10} />}
            {filing ? 'Filing…' : 'Congregation following'}
          </button>
        ) : (
          <button onClick={goLive} disabled={starting}
            className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-white/15 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:border-white/35 disabled:opacity-40">
            {starting ? <Loader2 size={10} className="animate-spin" /> : <Radio size={10} />} Start following
          </button>
        )}
        {onAir ? (
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-[#FF4B50]/50 bg-[#FF4B50]/10 text-[9px] font-black uppercase tracking-widest text-[#FF4B50]">
            <Radio size={10} /> On air
          </span>
        ) : (
          <span className="px-2 py-1 rounded-full border border-white/12 text-[9px] font-black uppercase tracking-widest text-white/35">Cleared</span>
        )}
      </div>

      {/* Scripture is one mode; the media console is the rest of the service. */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-white/8 bg-black/25">
        {([['SCRIPTURE', 'Scripture'], ['STAGE', 'Media & slides']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setPanel(id)}
            className={`px-3 py-1.5 rounded-full text-[8.5px] font-black uppercase tracking-widest transition-all ${
              panel === id ? 'bg-[#d4af37] text-black' : 'text-white/40 hover:text-white'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {panel === 'STAGE' ? (
        <div className="flex-1 min-h-0"><AmboStage /></div>
      ) : (
      <div className="flex-1 min-h-0 flex">
        {/* stack */}
        <aside className="w-[230px] shrink-0 border-r border-white/10 bg-black/25 flex flex-col">
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
            <span className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30">Run of show</span>
            {building && <Loader2 size={11} className="animate-spin text-white/30" />}
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5">{stack}</div>
        </aside>

        {/* monitors */}
        <main className="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-4">
          <div className="grid grid-cols-2 gap-3 max-w-4xl">
            <Monitor slide={preview} label="PREVIEW" />
            <Monitor slide={onAir} label="PROGRAM" live />
          </div>

          <div className="max-w-4xl mt-3">{transport}</div>

          <div className="max-w-4xl mt-3 flex items-center gap-2 text-[9px] text-white/30">
            <MonitorPlay size={11} />
            <span>Space or Enter takes · Esc clears · ↑ ↓ move through the stack</span>
          </div>

          {/* cue log — the spine of the Vespers recap */}
          <div className="max-w-4xl mt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[8px] font-black uppercase tracking-[0.16em] text-white/30">
                Cue log · {log.length}
              </span>
              <button onClick={exportLog} disabled={!log.length}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-white/12 text-[8.5px] font-black uppercase tracking-widest text-white/50 hover:text-white disabled:opacity-30">
                {copied ? <Check size={10} /> : <Download size={10} />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            {log.length === 0 ? (
              <p className="text-[10px] text-white/25">
                Every take is logged with its program timecode — this becomes the service recap and the markers on the recording.
              </p>
            ) : (
              <div className="space-y-1">
                {log.map((e, i) => (
                  <div key={`${e.refIdStr}-${e.wallClock}-${i}`}
                    className="flex items-center gap-3 px-2.5 py-1.5 rounded-md border border-white/8">
                    <span className="font-mono text-[9.5px] text-white/35 tabular-nums w-12">{formatTC(e.programTC)}</span>
                    <span className="font-mono text-[9.5px] uppercase tracking-wider text-[#d4af37]">{e.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* composer */}
        <aside className="w-[250px] shrink-0 border-l border-white/10 bg-black/25 overflow-y-auto custom-scrollbar p-3">
          {composer}
        </aside>
      </div>
      )}
    </div>
  );
};

export default AmboPresenter;
