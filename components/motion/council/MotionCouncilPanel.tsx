// MotionCouncilPanel — ask the Motion Graphics & VFX Council about a moving visual. You give it the piece's
// spec (medium, delivery target, tempo) and it renders the deliberation: each director's proposal, where they
// split, and the ranked, frame-accurate plan. Optional onApply wires the one-click moves (fps / beat-grid /
// shutter / ease / stepping) into the host surface (Pixels / Fabula). Aria is the voice; these are the team behind her.
// A crew from the Studio Roster (anime, cartoon, graphic, CG, stop-motion, experimental, games, world traditions)
// is auto-cast from the ask, medium, guild and era — or pinned by hand from the roster browser — and sits in.
// Mirrors components/melos/council/MusicCouncilPanel.
import React, { useMemo, useState } from 'react';
import { Loader2, Sparkles, Check, History, Film, X, Pin, BookUser } from 'lucide-react';
import { deliberate, speakerName } from '../../../services/motion/council/motionCouncilService';
import type { MotionDeliberation, MotionSpec, MotionMedium, ApplyAction, SpeakerId } from '../../../services/motion/council/motionCouncilTypes';
import { castCrew, rosterMember, eraFacets, ROSTER_GUILDS, type RosterGuild } from '../../../services/motion/council/motionRoster';
import MotionRosterBrowser, { GUILD_HUE } from './MotionRosterBrowser';
import { MOTION_DELIVERIES, deliveryTarget } from '../../../services/motion/council/motionKnowledge';
import { saveSession, markUsed, leadCounts, listSessions } from '../../../services/motion/council/motionCouncilStore';

const AC = '#3DD6FF';      // accent (motion cyan)
const AC_SOFT = '#B6ECFF'; // soft accent for names

const MEDIA: { id: MotionMedium; label: string }[] = [
  { id: 'title', label: 'Title' }, { id: 'lower-third', label: 'Lower third' }, { id: 'transition', label: 'Transition' },
  { id: 'mograph', label: 'Motion graphics' }, { id: 'vj-loop', label: 'VJ loop' }, { id: 'background', label: 'Background' },
  { id: 'logo-sting', label: 'Logo sting' }, { id: 'character', label: 'Character' }, { id: 'vfx-shot', label: 'VFX shot' },
  { id: 'shader', label: 'Shader' }, { id: 'generator', label: 'Generator' },
];
const ENERGY: { label: string; v: number }[] = [{ label: 'calm', v: 0.3 }, { label: 'medium', v: 0.55 }, { label: 'high', v: 0.85 }];

export default function MotionCouncilPanel({ onApply, supports, initial }: {
  /** apply a one-click move on the host; return false if it could not (e.g. nothing selected) so it is not marked applied */
  onApply?: (a: ApplyAction) => boolean | void;
  /** the ApplyAction kinds this host can honestly perform — others render without an Apply button (default: all) */
  supports?: ApplyAction['kind'][];
  /** seed the brief from the host (its medium, delivery target, tempo) */
  initial?: { ask?: string; medium?: MotionMedium; delivery?: string; tempo?: number };
}) {
  const [ask, setAsk] = useState(initial?.ask ?? 'How should this logo enter?');
  const [medium, setMedium] = useState<MotionMedium>(initial?.medium ?? 'logo-sting');
  const [delivery, setDelivery] = useState(initial?.delivery ?? 'web');
  const [tempo, setTempo] = useState<string>(initial?.tempo ? String(Math.round(initial.tempo)) : '120');
  const [energy, setEnergy] = useState(0.55);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<MotionDeliberation | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [used, setUsed] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  // ── Studio Roster crew ──
  const [pinned, setPinned] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [guild, setGuild] = useState<RosterGuild | ''>('');
  const [era, setEra] = useState<number | ''>('');
  const [crewSize, setCrewSize] = useState(4);
  const [showRoster, setShowRoster] = useState(false);
  const decades = useMemo(eraFacets, []);
  const crew = useMemo(() => {
    if (crewSize === 0) return pinned.slice();
    const cast = castCrew({ ask, medium, guilds: guild ? [guild] : undefined, era: era === '' ? undefined : era, pinned, size: crewSize + excluded.length });
    return cast.filter(m => !excluded.includes(m.id)).slice(0, Math.max(crewSize, pinned.length)).map(m => m.id);
  }, [ask, medium, guild, era, pinned, excluded, crewSize]);
  const togglePin = (id: string) => {
    setPinned(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
    setExcluded(x => x.filter(e => e !== id));
  };
  const dropFromCrew = (id: string) => { setPinned(p => p.filter(x => x !== id)); setExcluded(x => x.includes(id) ? x : [...x, id]); };
  const counts = leadCounts();
  const topLead = (Object.entries(counts) as [SpeakerId, number][]).sort((a, b) => b[1] - a[1])[0];

  const run = async () => {
    if (busy || !ask.trim()) return;
    setBusy(true); setRes(null); setUsed(false); setApplied(new Set());
    try {
      const dt = deliveryTarget(delivery);
      const spec: MotionSpec = { delivery, fps: dt?.fps, aspect: dt?.aspect, energy };
      const bpm = parseInt(tempo, 10); if (!Number.isNaN(bpm) && bpm > 0) spec.tempo = bpm;
      const d = await deliberate({ ask: ask.trim(), medium, crew }, spec);
      setRes(d);
      const sess = saveSession({ ask: ask.trim(), medium, crew }, d);
      setSessionId(sess.id); setTick(t => t + 1);
    } catch { /* deliberate already falls back */ }
    finally { setBusy(false); }
  };
  const canApply = (a: ApplyAction | undefined) => !!a && !!onApply && (!supports || supports.includes(a.kind));
  const doApply = (a: ApplyAction | undefined, key: string) => { if (!a || !onApply) return; if (onApply(a) === false) return; setApplied(s => new Set(s).add(key)); };
  const followed = () => { if (sessionId) { markUsed(sessionId); setUsed(true); setTick(t => t + 1); } };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c0f14] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Film size={15} style={{ color: AC }} />
        <span className="text-[11px] font-black uppercase tracking-[0.25em] text-white/70">Motion Council</span>
        <span className="text-[9px] text-white/25">kinetic · animator · compositor · generative · signal · 3d + studio roster</span>
      </div>

      <input value={ask} onChange={e => setAsk(e.target.value)} onKeyDown={e => e.key === 'Enter' && run()}
        onFocus={e => (e.currentTarget.style.borderColor = `${AC}99`)} onBlur={e => (e.currentTarget.style.borderColor = '')}
        placeholder="Ask about a moving visual…"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[13px] text-white placeholder:text-white/25 outline-none mb-2" />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={medium} onChange={e => setMedium(e.target.value as MotionMedium)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white outline-none">
          {MEDIA.map(m => <option key={m.id} value={m.id} className="bg-[#0c0f14]">{m.label}</option>)}
        </select>
        <select value={delivery} onChange={e => setDelivery(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white outline-none">
          {MOTION_DELIVERIES.map(d => <option key={d.id} value={d.id} className="bg-[#0c0f14]">{d.label}</option>)}
        </select>
        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1">
          <input value={tempo} onChange={e => setTempo(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="BPM"
            className="w-10 bg-transparent text-[11px] font-bold text-white outline-none placeholder:text-white/25" />
          <span className="text-[9px] text-white/30 uppercase tracking-widest">bpm</span>
        </div>
        <select value={String(energy)} onChange={e => setEnergy(parseFloat(e.target.value))} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white outline-none">
          {ENERGY.map(e => <option key={e.label} value={e.v} className="bg-[#0c0f14]">{e.label}</option>)}
        </select>
        <button onClick={run} disabled={busy || !ask.trim()} className="ml-auto h-8 px-4 rounded-full text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center gap-1.5" style={{ background: AC, color: '#04121a' }}>
          {busy ? <><Loader2 size={13} className="animate-spin" /> Deliberating…</> : <><Sparkles size={13} /> Ask the council</>}
        </button>
      </div>

      <div className="rounded-xl border border-white/8 bg-white/[0.015] px-3 py-2 mb-3">
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <span className="text-[9px] font-black uppercase tracking-widest text-white/45">Studio crew</span>
          <select value={guild} onChange={e => setGuild(e.target.value as RosterGuild | '')} className="bg-white/5 border border-white/10 rounded-md px-1.5 py-1 text-[10px] font-bold text-white outline-none">
            <option value="" className="bg-[#0c0f14]">Any guild</option>
            {ROSTER_GUILDS.map(g => <option key={g.id} value={g.id} className="bg-[#0c0f14]">{g.label}</option>)}
          </select>
          <select value={era === '' ? '' : String(era)} onChange={e => setEra(e.target.value ? parseInt(e.target.value, 10) : '')} className="bg-white/5 border border-white/10 rounded-md px-1.5 py-1 text-[10px] font-bold text-white outline-none">
            <option value="" className="bg-[#0c0f14]">Any era</option>
            {decades.map(d => <option key={d} value={d} className="bg-[#0c0f14]">{d}s</option>)}
          </select>
          <select value={String(crewSize)} onChange={e => setCrewSize(parseInt(e.target.value, 10))} title="How many roster members sit in (0 = only the ones you pin)" className="bg-white/5 border border-white/10 rounded-md px-1.5 py-1 text-[10px] font-bold text-white outline-none">
            {[0, 2, 3, 4, 5, 6].map(n => <option key={n} value={n} className="bg-[#0c0f14]">{n === 0 ? 'pinned only' : `${n} sit in`}</option>)}
          </select>
          {excluded.length > 0 && <button onClick={() => setExcluded([])} className="text-[9px] uppercase tracking-widest text-white/35 hover:text-white/70">recast</button>}
          <button onClick={() => setShowRoster(v => !v)} className="ml-auto flex items-center gap-1 text-[9px] font-black uppercase tracking-widest rounded-full px-2 py-1" style={{ color: AC, background: `${AC}14`, border: `1px solid ${AC}40` }}>
            <BookUser size={11} /> {showRoster ? 'Hide roster' : 'Roster'}
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {crew.map(id => {
            const m = rosterMember(id); if (!m) return null; const hue = GUILD_HUE[m.guild];
            return (
              <span key={id} className="flex items-center gap-1 text-[10px] font-bold rounded-full pl-2 pr-1 py-0.5" style={{ color: hue, background: `${hue}14`, border: `1px solid ${hue}40` }}>
                {pinned.includes(id) && <Pin size={9} />}{m.name.replace(/^The /, '')}
                <button onClick={() => dropFromCrew(id)} title="Leave this one out" className="opacity-60 hover:opacity-100"><X size={10} /></button>
              </span>
            );
          })}
          {crew.length === 0 && <span className="text-[10px] text-white/30">Council only — pin someone from the roster, or let the ask cast a crew.</span>}
        </div>
        {showRoster && <div className="mt-2"><MotionRosterBrowser pinned={pinned} onTogglePin={togglePin} crew={crew} /></div>}
      </div>

      {res && (
        <div className="space-y-3">
          <p className="text-[12px] text-white/60 italic leading-relaxed">{res.intro}</p>
          <div className="space-y-2">
            {res.proposals.map((p, i) => (
              <div key={i} className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black uppercase tracking-widest shrink-0" style={{ color: rosterMember(p.personaId) ? GUILD_HUE[rosterMember(p.personaId)!.guild] : AC_SOFT }}>{speakerName(p.personaId)}</span>
                  <span className="text-[10px] text-white/40">{p.headline}</span>
                </div>
                <ul className="space-y-0.5">
                  {p.moves.map((m, j) => (
                    <li key={j} className="text-[12px] text-white/70 flex gap-2 items-start">
                      <span className="flex-1">{m.text}</span>
                      {m.where && <span className="shrink-0 text-[9px] font-mono rounded px-1.5 py-0.5 self-start" style={{ color: AC, background: `${AC}1a`, border: `1px solid ${AC}40` }}>{m.where}</span>}
                      {canApply(m.apply) && (
                        applied.has(`${i}:${j}`)
                          ? <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-[#3DFFC0] flex items-center gap-0.5 self-start"><Check size={11} /> applied</span>
                          : <button onClick={() => doApply(m.apply, `${i}:${j}`)} className="shrink-0 text-[9px] font-black uppercase tracking-widest self-start transition-colors rounded px-1.5 py-0.5" style={{ color: AC, background: `${AC}1a`, border: `1px solid ${AC}4d` }}>Apply</button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {res.tensions.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-400/80 mb-1">Where they split</p>
              {res.tensions.map((t, i) => <p key={i} className="text-[12px] text-white/60 leading-snug">{t}</p>)}
            </div>
          )}
          {res.plan.length > 0 && (
            <div className="rounded-xl px-3 py-2" style={{ border: `1px solid ${AC}40`, background: `${AC}10` }}>
              <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: AC_SOFT }}>The plan</p>
              <ol className="space-y-1 list-decimal list-inside">
                {res.plan.map((m, i) => <li key={i} className="text-[12px] text-white/75"><span>{m.text}</span>{m.where && <span className="text-[10px] font-mono ml-1" style={{ color: AC }}>· {m.where}</span>}</li>)}
              </ol>
            </div>
          )}
          {res.summary && <p className="text-[12px] text-white/70 leading-relaxed">{res.summary}</p>}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] text-white/25 uppercase tracking-widest">{res.grounded ? '▣ grounded in the spec' : '— set delivery, tempo & fps for frame-accurate direction'} · {res.source}</span>
            {used
              ? <span className="text-[9px] font-black uppercase tracking-widest text-[#3DFFC0] flex items-center gap-0.5"><Check size={11} /> followed</span>
              : <button onClick={followed} className="text-[9px] font-black uppercase tracking-widest text-white/45 hover:text-white border border-white/12 rounded-full px-2 py-0.5">I followed this</button>}
          </div>
        </div>
      )}

      {(topLead || listSessions().length > 0) && (
        <div className="mt-3 pt-3 border-t border-white/8" key={tick}>
          <button onClick={() => setShowHistory(v => !v)} className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-white/35 hover:text-white/60">
            <History size={11} /> {topLead ? `${speakerName(topLead[0])} has led ${topLead[1]} you've kept` : 'Council history'}
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1">
              {listSessions().slice(0, 6).map(s => (
                <div key={s.id} className="flex items-center gap-2 text-[11px]">
                  {s.used && <Check size={10} className="text-[#3DFFC0] shrink-0" />}
                  <span className="flex-1 truncate text-white/50">{s.ask}</span>
                  {s.leadPersona && <span className="shrink-0 text-[9px] uppercase tracking-widest" style={{ color: `${AC}b3` }}>{speakerName(s.leadPersona).replace(/^The /, '').toLowerCase()}</span>}
                </div>
              ))}
              {listSessions().length === 0 && <p className="text-[10px] text-white/25">No sessions yet.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
