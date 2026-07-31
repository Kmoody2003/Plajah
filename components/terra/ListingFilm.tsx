/**
 * Listing Film — narration-driven auto-cut for real estate.
 *
 * An agent narrates a walkthrough ("…the chef's kitchen… the primary bedroom…").
 * We transcribe it, detect the rooms as they're named, and cut a titled,
 * room-by-room storyboard with the listing's own facts on the cards. Each cut
 * shows the exact narration that triggered it, so the agent can trust and tweak.
 *
 * Terra plans the cut; Fabula (the platform editor) renders it — the storyboard
 * hands off there, or exports as an EDL. We don't half-wire a WebCodecs encode
 * here.
 */

import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft, Film, Sparkles, Clapperboard, Music, Type as TypeIcon, Home, DollarSign,
  Quote, Printer, Wand2, Trash2, Clock, ArrowRight,
} from 'lucide-react';
import type { UserProfile } from '../../types';
import {
  buildFilmPlan, toEDL, FILM_STYLES, DEMO_TRANSCRIPT,
  type FilmStyle, type FilmPlan, type FilmScene, type ListingFacts, type TranscriptLine,
} from '../../services/terra/listingFilm/listingFilmService';

const ACCENT = '#FF8C00';
const PRO = '#5B8DEF';
const card = 'bg-white/[0.03] border border-white/[0.06] rounded-2xl';
const label = 'text-[10px] font-black uppercase tracking-widest text-white/30';
const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/25 focus:outline-none focus:border-[#FF8C00]/50';

const DEMO_FACTS: ListingFacts = {
  address: '4218 Rosedale St', price: 189000, beds: 3, baths: 1.5, sqft: 1410, agent: 'Rosedale Property Group',
};

const fmtTC = (s?: number) => (s == null ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

/** Parse pasted narration into timestamped lines. Real transcription carries
 *  timecodes; pasted text gets even synthetic spacing so ordering still works. */
function parseNarration(text: string): TranscriptLine[] {
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  return lines.map((t, i) => ({ time: i * 6, text: t }));
}

function printStoryboard(plan: FilmPlan) {
  const edl = toEDL(plan);
  const w = window.open('', '_blank', 'width=820,height=1000');
  if (!w) return;
  const rows = edl.cuts.map(c => `<tr><td>${c.order}</td><td>${c.kind}</td><td>${c.title}${c.subtitle ? `<br><span style="color:#666">${c.subtitle}</span>` : ''}</td><td>${c.sourceStart != null ? `${fmtTC(c.sourceStart)}–${fmtTC(c.sourceEnd)}` : '—'}</td></tr>`).join('');
  w.document.write(`<!doctype html><html><head><title>Listing Film — ${edl.title}</title><style>
    body{font-family:Georgia,serif;color:#111;padding:40px;max-width:720px;margin:0 auto;line-height:1.4}
    h1{font-size:20px;margin:0 0 2px} .muted{color:#666;font-size:12px;margin-bottom:18px}
    table{width:100%;border-collapse:collapse;font-size:12px} td,th{border:1px solid #bbb;padding:6px 8px;text-align:left} th{background:#f0f0f0}
  </style></head><body>
    <h1>Listing Film storyboard — ${edl.title}</h1>
    <div class="muted">${edl.style} · ${edl.musicBed} · ~${edl.estRuntimeSec}s · ${edl.cuts.length} cuts</div>
    <table><tr><th>#</th><th>Type</th><th>Title</th><th>Source</th></tr>${rows}</table>
  </body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => { try { w.print(); } catch { /* noop */ } }, 350);
}

const SceneCard: React.FC<{ scene: FilmScene; index: number; onRemove?: () => void; onTitle?: (t: string) => void }> = ({ scene, index, onRemove, onTitle }) => {
  const isCard = scene.kind !== 'room';
  const tint = scene.kind === 'title' ? ACCENT : scene.kind === 'cta' ? PRO : '#ffffff';
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}
      className={`${card} p-4 flex items-start gap-3`}
      style={isCard ? { borderColor: `${tint}33`, background: `${tint}0c` } : {}}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-black tabular-nums"
           style={{ background: `${isCard ? tint : ACCENT}18`, color: isCard ? tint : ACCENT }}>
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {scene.kind === 'title' && <TypeIcon size={12} style={{ color: ACCENT }} />}
          {scene.kind === 'cta' && <DollarSign size={12} style={{ color: PRO }} />}
          {scene.kind === 'room' && <Clapperboard size={12} className="text-white/40" />}
          {onTitle ? (
            <input value={scene.title} onChange={e => onTitle(e.target.value)}
              className="bg-transparent text-sm font-black text-white focus:outline-none focus:bg-white/5 rounded px-1 -mx-1 min-w-0 flex-1" />
          ) : <span className="text-sm font-black text-white">{scene.title}</span>}
          {scene.confidence && (
            <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${scene.confidence === 'high' ? 'text-emerald-400 bg-emerald-500/10' : 'text-yellow-400/80 bg-yellow-500/10'}`}>
              {scene.confidence === 'high' ? 'clear' : 'heard'}
            </span>
          )}
        </div>
        {scene.subtitle && <p className="text-[11px] text-white/45 mt-0.5">{scene.subtitle}</p>}
        {scene.quote && (
          <p className="text-[11px] text-white/40 mt-1.5 flex items-start gap-1.5 leading-relaxed">
            <Quote size={10} className="mt-0.5 shrink-0 text-white/25" /> “{scene.quote}”
          </p>
        )}
        {scene.sourceStart != null && (
          <p className="text-[9px] text-white/25 mt-1 font-mono">{fmtTC(scene.sourceStart)}–{fmtTC(scene.sourceEnd)}</p>
        )}
      </div>
      {onRemove && scene.kind === 'room' && (
        <button onClick={onRemove} className="p-1.5 rounded-lg text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0" title="Drop this scene">
          <Trash2 size={12} />
        </button>
      )}
    </motion.div>
  );
};

export interface ListingFilmProps {
  facts?: ListingFacts;
  currentUser?: UserProfile | null;
  onBack?: () => void;
  onOpenFabula?: () => void;
}

export const ListingFilm: React.FC<ListingFilmProps> = ({ facts, onBack, onOpenFabula }) => {
  const [narration, setNarration] = useState(() => DEMO_TRANSCRIPT.map(l => l.text).join('\n'));
  const [usedDemo, setUsedDemo] = useState(true);
  const [style, setStyle] = useState<FilmStyle>('warm');
  const [f, setF] = useState<ListingFacts>({ ...DEMO_FACTS, ...(facts || {}) });
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>({});

  // Detect from whichever transcript we have. Demo keeps real timecodes; a paste
  // gets synthetic even spacing (order preserved, timecodes approximate).
  const transcript: TranscriptLine[] = useMemo(() => {
    const demoText = DEMO_TRANSCRIPT.map(l => l.text).join('\n');
    if (usedDemo && narration.trim() === demoText.trim()) return DEMO_TRANSCRIPT;
    return parseNarration(narration);
  }, [narration, usedDemo]);

  const plan = useMemo(() => {
    const p = buildFilmPlan(transcript, f, style);
    p.scenes = p.scenes
      .filter(s => !removed.has(s.id))
      .map(s => (titleOverrides[s.id] ? { ...s, title: titleOverrides[s.id] } : s));
    return p;
  }, [transcript, f, style, removed, titleOverrides]);

  const roomCount = plan.scenes.filter(s => s.kind === 'room').length;
  const setFact = (patch: Partial<ListingFacts>) => setF(prev => ({ ...prev, ...patch }));

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-transparent text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/90 backdrop-blur-2xl border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
          {onBack && (
            <button onClick={onBack} className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white/90 transition-colors shrink-0" title="Back to Terra">
              <ArrowLeft size={14} />
            </button>
          )}
          <div className="w-9 h-9 rounded-xl flex items-center justify-center border" style={{ background: `${ACCENT}20`, borderColor: `${ACCENT}40` }}>
            <Film size={16} style={{ color: ACCENT }} />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-black uppercase tracking-widest text-white">Listing Film</h1>
            <p className="text-[10px] font-bold" style={{ color: ACCENT }}>Narrate the walkthrough — it cuts itself</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 grid lg:grid-cols-[300px_minmax(0,1fr)] gap-6">
        {/* Left — inputs */}
        <div className="space-y-5">
          <div>
            <p className={`${label} mb-2 flex items-center gap-1.5`}><Sparkles size={11} /> Walkthrough narration</p>
            <textarea rows={8} value={narration}
              onChange={e => { setNarration(e.target.value); setUsedDemo(false); }}
              className={`${inputCls} resize-none leading-relaxed`}
              placeholder="Paste your walkthrough narration, one thought per line…" />
            <div className="flex gap-2 mt-2">
              <button onClick={() => { setNarration(DEMO_TRANSCRIPT.map(l => l.text).join('\n')); setUsedDemo(true); setRemoved(new Set()); setTitleOverrides({}); }}
                className="flex-1 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white/80 transition-colors">
                Use demo walkthrough
              </button>
            </div>
            <p className="text-[10px] text-white/30 mt-2 leading-relaxed">
              A recorded walkthrough transcribes automatically (via the platform captions engine) — that
              audio-to-URL step connects next. For now, the detector runs on this text.
            </p>
          </div>

          <div>
            <p className={`${label} mb-2`}>Style</p>
            <div className="space-y-1.5">
              {FILM_STYLES.map(s => (
                <button key={s.key} onClick={() => setStyle(s.key)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[11px] transition-all ${style === s.key ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
                  style={style === s.key ? { background: `${s.accent}1c`, border: `1px solid ${s.accent}44` } : { border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="font-black">{s.label}</span>
                  <span className="text-[9px] text-white/35">{s.pacing}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className={`${label} mb-2 flex items-center gap-1.5`}><Home size={11} /> Listing facts <span className="text-white/20">· on the cards</span></p>
            <div className="space-y-2">
              <input className={inputCls} placeholder="Address" value={f.address || ''} onChange={e => setFact({ address: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Price" value={f.price ?? ''} onChange={e => setFact({ price: Number(e.target.value) || undefined })} />
                <input className={inputCls} placeholder="Sqft" value={f.sqft ?? ''} onChange={e => setFact({ sqft: Number(e.target.value) || undefined })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Beds" value={f.beds ?? ''} onChange={e => setFact({ beds: Number(e.target.value) || undefined })} />
                <input className={inputCls} placeholder="Baths" value={f.baths ?? ''} onChange={e => setFact({ baths: Number(e.target.value) || undefined })} />
              </div>
            </div>
          </div>
        </div>

        {/* Right — storyboard */}
        <div className="space-y-4">
          {/* Summary bar */}
          <div className={`${card} p-4 flex items-center gap-4 flex-wrap`}>
            <div className="flex items-center gap-2">
              <Wand2 size={16} style={{ color: ACCENT }} />
              <div>
                <p className="text-sm font-black text-white">{roomCount} rooms detected</p>
                <p className="text-[10px] text-white/40">from your narration</p>
              </div>
            </div>
            <div className="flex items-center gap-5 ml-auto text-center">
              <div><p className="text-sm font-black text-white tabular-nums flex items-center gap-1"><Clock size={11} className="text-white/30" />~{plan.estRuntimeSec}s</p><p className={label}>Runtime</p></div>
              <div><p className="text-sm font-black text-white flex items-center gap-1"><Music size={11} className="text-white/30" /></p><p className={label} style={{ maxWidth: 90 }}>{plan.musicBed}</p></div>
            </div>
          </div>

          {/* Scenes */}
          <div className="space-y-2">
            {plan.scenes.map((s, i) => (
              <SceneCard key={s.id} scene={s} index={i}
                onRemove={s.kind === 'room' ? () => setRemoved(prev => new Set(prev).add(s.id)) : undefined}
                onTitle={t => setTitleOverrides(prev => ({ ...prev, [s.id]: t }))} />
            ))}
          </div>

          {/* Actions */}
          <div className={`${card} p-5`}>
            <p className={`${label} mb-3`}>Render &amp; publish</p>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => onOpenFabula?.()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-black text-xs font-black uppercase tracking-widest transition-all hover:brightness-110"
                style={{ background: ACCENT }}>
                <Clapperboard size={14} /> Render in Fabula <ArrowRight size={13} />
              </button>
              <button onClick={() => printStoryboard(plan)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs font-black uppercase tracking-widest hover:text-white/90 transition-colors">
                <Printer size={13} /> Export storyboard
              </button>
            </div>
            <p className="text-[10px] text-white/30 mt-3 leading-relaxed">
              Terra plans the cut; the platform editor (Fabula) does the frame-accurate render off this
              storyboard — then publish to the property passport, Reello, or download. Titles above are
              bound to your listing facts and update live.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ListingFilm;
