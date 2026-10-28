// The Conservatory faculty — the Chora Session Band as teachers. Pick a player: their story, their
// three sides, everything they know (history, the science of the instrument, technique, theory, Chora),
// their lessons (the band plays every example), "hear me play", and a conversation with them —
// answered on this PC's model in the desktop app, cloud Gemini with your OK, or from what they know.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Cloud, Cpu, GraduationCap, Loader2, Play, Send, Sparkles, Square, Users } from 'lucide-react';
import { BAND, playerById, type BandPlayer, type KnowledgeEntry } from '../../services/melos/beats/band/roster';
import { BandAvatar } from '../melos/beats/band/BandAvatar';
import { FacultyRoom } from '../../services/musicPedagogy/bandClassroom';
import { bandVoices, hushBand } from '../../services/musicPedagogy/bandVoices';
import { audio } from '../../services/musicPedagogy/earAudio';
import { askPlayer, cloudConsent, deviceLane, setCloudConsent, type MindLane } from '../../services/melos/beats/band/bandMind';
import type { TeacherContext } from '../../services/melos/beats/band/teacherPrompt';
import type { FeedEvent } from '../../services/melos/beats/band/session';

const ACCENT = '#E0A458';

const TOPICS: { id: KnowledgeEntry['topic']; label: string }[] = [
  { id: 'history', label: 'History' },
  { id: 'science', label: 'Science' },
  { id: 'instrument', label: 'The instrument' },
  { id: 'technique', label: 'Technique' },
  { id: 'theory', label: 'Theory' },
  { id: 'genre', label: 'Styles' },
  { id: 'chora', label: 'In Chora' },
];

const LEVELS: { id: NonNullable<TeacherContext['level']>; label: string }[] = [
  { id: 'new', label: 'Never played' }, { id: 'beginner', label: 'Beginner' }, { id: 'intermediate', label: 'Intermediate' }, { id: 'advanced', label: 'Advanced' },
];

interface Msg { id: number; who: 'me' | string; text: string; lane?: MindLane | 'band'; note?: string }

const LANE_LABEL: Record<MindLane | 'band', string> = { device: 'On this PC', cloud: 'Cloud · Gemini', 'built-in': 'From what they know', band: 'In the room' };

/** Starter questions from what the player knows: one each of history, science, technique. */
function starters(p: BandPlayer): string[] {
  const ask: Record<string, string> = {
    history: `Where does the ${p.instrument.toLowerCase().split(' ')[0]} come from?`,
    science: `How does the ${p.instrument.toLowerCase().split(' ')[0]} actually make its sound?`,
    technique: 'I\'m a total beginner — where do I start?',
    chora: 'How do I use you in Chora?',
  };
  return Object.keys(ask).filter((t) => t === 'technique' || p.knowledge.some((k) => k.topic === t)).map((t) => ask[t]);
}

const BandFaculty: React.FC = () => {
  const [sel, setSel] = useState<string>(BAND[0].id);
  const player = playerById(sel)!;
  const [personaId, setPersonaId] = useState(player.personas[0].id);
  const [topic, setTopic] = useState<KnowledgeEntry['topic']>('history');
  const [level, setLevel] = useState<NonNullable<TeacherContext['level']>>('beginner');
  const [chats, setChats] = useState<Record<string, Msg[]>>({});
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(cloudConsent());
  const [device, setDevice] = useState<{ ok: boolean; model?: string }>({ ok: false });
  const [playing, setPlaying] = useState<null | { kind: 'demo' | 'lesson'; label: string }>(null);
  const [, force] = useState(0);
  const room = useRef<FacultyRoom | null>(null);
  const seq = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { void deviceLane().then(setDevice); }, []);
  useEffect(() => { setPersonaId(player.personas[0].id); setInput(''); }, [sel]);  // eslint-disable-line react-hooks/exhaustive-deps
  const msgs = chats[sel] ?? [];
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [msgs.length, busy]);

  const push = (pid: string, m: Omit<Msg, 'id'>) => setChats((c) => ({ ...c, [pid]: [...(c[pid] ?? []), { ...m, id: ++seq.current }] }));

  // The room plays through the classroom voices; what the band says lands in the teacher's chat.
  const ensureRoom = () => {
    if (!room.current) {
      const ac = audio();
      room.current = new FacultyRoom({ now: () => ac.currentTime }, bandVoices());
      room.current.onFeed((e: FeedEvent) => {
        if (e.kind === 'ack') return;
        const to = room.current?.session.lessonRunning() || e.kind === 'lesson' ? (e.playerId ?? sel) : sel;
        push(to, { who: e.playerId ?? 'band', text: e.persona && e.kind !== 'lesson' ? `${e.text}` : e.text, lane: 'band' });
      });
    }
    return room.current;
  };
  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => { room.current?.tick(); force((n) => (n + 1) % 1e6); }, 25);
    return () => clearInterval(iv);
  }, [playing]);
  useEffect(() => () => { room.current?.stop(); hushBand(); abort.current?.abort(); }, []);

  const stop = () => { room.current?.stop(); hushBand(); setPlaying(null); };
  const demo = () => { const r = ensureRoom(); r.demo(player.id); r.session.persona[player.id] = personaId; r.session.dir.players[player.id].persona = personaId; setPlaying({ kind: 'demo', label: `${player.name.split(' ')[0]} playing` }); };
  const lesson = (id: string) => { const r = ensureRoom(); r.lesson(player.id, id); setPlaying({ kind: 'lesson', label: player.lessons.find((l) => l.id === id)?.title ?? 'Lesson' }); };

  const sounding = (pid: string) => {
    const r = room.current;
    if (!r || !playing) return false;
    const t = r.session.lastSound[pid];
    return t !== undefined && audio().currentTime - t < 0.25 && audio().currentTime >= t - 0.02;
  };

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    const pid = sel;
    push(pid, { who: 'me', text });
    setInput('');
    setBusy(true);
    abort.current = new AbortController();
    const history = [...msgs.filter((m) => m.lane !== 'band'), { who: 'me', text } as Msg].map((m) => ({ role: m.who === 'me' ? 'user' as const : 'assistant' as const, content: m.text }));
    const lessonOn = room.current?.session.lessonRunning() && playing?.kind === 'lesson' ? playing.label : undefined;
    try {
      const r = await askPlayer(pid, history, { personaId, level, lesson: lessonOn }, abort.current.signal);
      push(pid, { who: pid, text: r.text, lane: r.lane, note: r.note });
    } catch { /* aborted */ }
    setBusy(false);
  };

  const byTopic = useMemo(() => player.knowledge.filter((k) => k.topic === topic), [player, topic]);
  const persona = player.personas.find((p) => p.id === personaId) ?? player.personas[0];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-black/60 via-[#0d0d12] to-black p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute -right-6 -top-6 opacity-10"><Users size={140} className="text-white" /></div>
        <p className="text-[8px] font-black uppercase tracking-[0.4em]" style={{ color: ACCENT }}>The Faculty</p>
        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mt-1">Learn from the Session Band</h1>
        <p className="text-sm text-white/45 mt-1.5 max-w-2xl">
          Thirteen players from Chora's Session Band teach here. Each knows their instrument's history, its science, its technique and how to use it in Chora. Ask them anything, run a lesson while the band plays the examples, or just listen to them play.
        </p>
      </div>

      {/* Faculty strip */}
      <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
        {BAND.map((p) => (
          <button key={p.id} onClick={() => setSel(p.id)} className="shrink-0 flex flex-col items-center gap-1.5 w-[84px] rounded-2xl py-2.5 border transition-colors"
            style={p.id === sel ? { background: `${p.color}1f`, borderColor: `${p.color}88` } : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }}>
            <BandAvatar player={p} size={48} lit={sounding(p.id)} />
            <span className="text-[10px] font-black leading-tight text-center px-1">{p.nickname ?? p.name.split(' ')[0]}</span>
            <span className="text-[8px] uppercase tracking-widest text-white/35 leading-none text-center px-1">{p.instrument.split(' (')[0]}</span>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-5">
        {/* Left: who they are, what they know, lessons */}
        <div className="space-y-4 min-w-0">
          <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
            <div className="flex items-start gap-4">
              <BandAvatar player={player} size={96} lit={sounding(player.id)} />
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-black uppercase tracking-[0.35em]" style={{ color: player.color }}>{player.instrument}</p>
                <h2 className="text-xl font-black leading-tight">{player.name}{player.nickname && <span className="text-white/40 font-bold"> “{player.nickname}”</span>}</h2>
                <p className="text-[11px] text-white/40">{player.from}</p>
                <p className="text-sm text-white/60 leading-relaxed mt-2">{player.bio}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              <span className="text-[8px] font-black uppercase tracking-widest text-white/30 mr-1 self-center">Learned from</span>
              {player.influences.map((n) => <span key={n} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/8 text-white/55">{n}</span>)}
            </div>
            <div className="grid sm:grid-cols-3 gap-2 mt-4">
              {player.personas.map((x) => (
                <button key={x.id} onClick={() => setPersonaId(x.id)} className="text-left rounded-2xl p-3 border transition-colors"
                  style={x.id === personaId ? { background: `${player.color}1a`, borderColor: `${player.color}77` } : { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                  <p className="text-[11px] font-black">{x.name}</p>
                  <p className="text-[10px] text-white/45 leading-snug mt-0.5">{x.tagline}</p>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {playing ? (
                <button onClick={stop} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest bg-white text-black"><Square size={11} /> Stop · {playing.label}</button>
              ) : (
                <button onClick={demo} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest" style={{ background: player.color, color: '#000' }}><Play size={11} /> Hear {persona.name}</button>
              )}
              <span className="text-[10px] text-white/35">Classroom sketch sound — in Chora they play the real engines.</span>
            </div>
          </div>

          <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
            <div className="flex items-center gap-1.5 mb-3"><GraduationCap size={12} style={{ color: ACCENT }} /><p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/40">Lessons — the band plays the examples</p></div>
            <div className="space-y-2">
              {player.lessons.map((l) => (
                <div key={l.id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 bg-white/[0.03] border border-white/6">
                  <div className="min-w-0 flex-1"><p className="text-sm font-black">{l.title}</p><p className="text-[11px] text-white/45">{l.summary} · {l.steps.length} steps</p></div>
                  <button onClick={() => lesson(l.id)} className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border" style={{ borderColor: `${player.color}88`, color: player.color }}><Play size={10} /> Start</button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
            <div className="flex items-center gap-1.5 mb-3"><BookOpen size={12} style={{ color: ACCENT }} /><p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/40">What {player.name.split(' ')[0]} knows</p></div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {TOPICS.filter((t) => player.knowledge.some((k) => k.topic === t.id)).map((t) => (
                <button key={t.id} onClick={() => setTopic(t.id)} className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border"
                  style={t.id === topic ? { background: `${ACCENT}22`, borderColor: ACCENT, color: ACCENT } : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>{t.label}</button>
              ))}
            </div>
            <ul className="space-y-2">
              {byTopic.map((k, i) => <li key={i} className="text-[13px] text-white/65 leading-relaxed rounded-xl px-3 py-2 bg-white/[0.025] border border-white/5">{k.text}</li>)}
              {!byTopic.length && <li className="text-[12px] text-white/35">Ask — they'll tell you.</li>}
            </ul>
          </div>
        </div>

        {/* Right: the conversation */}
        <div className="rounded-3xl border border-white/8 bg-white/[0.03] flex flex-col min-h-[520px] lg:max-h-[860px] lg:sticky lg:top-4">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8">
            <BandAvatar player={player} size={36} lit={busy} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black truncate">Ask {player.nickname ?? player.name.split(' ')[0]}</p>
              <p className="text-[10px] text-white/40 truncate">as {persona.name} · {device.ok ? `on this PC${device.model ? ` (${device.model})` : ''}` : consent ? 'cloud Gemini' : 'from what they know'}</p>
            </div>
            <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)} className="bg-white/5 border border-white/10 rounded-full text-[10px] px-2 py-1 text-white/70" aria-label="Your level">
              {LEVELS.map((l) => <option key={l.id} value={l.id} className="bg-black">{l.label}</option>)}
            </select>
          </div>
          {!device.ok && (
            <label className="flex items-start gap-2 px-4 py-2 border-b border-white/6 text-[10px] text-white/45 cursor-pointer">
              <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setCloudConsent(e.target.checked); }} className="mt-0.5" />
              <span>Let teachers answer with cloud AI (your questions go to Google Gemini). In the Plajah desktop app they answer on your PC instead. Off, they answer from what they know.</span>
            </label>
          )}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-3">
            {!msgs.length && (
              <div className="space-y-2">
                <p className="text-[12px] text-white/45">{persona.lines.enter[0]} Ask me anything — about the {player.instrument.toLowerCase().split(' (')[0]}, where it came from, how it works, or how to start.</p>
                {starters(player).map((q) => (
                  <button key={q} onClick={() => void ask(q)} className="block w-full text-left text-[12px] px-3 py-2 rounded-xl bg-white/[0.04] border border-white/8 hover:bg-white/[0.07] text-white/70"><Sparkles size={10} className="inline mr-1.5" style={{ color: ACCENT }} />{q}</button>
                ))}
              </div>
            )}
            {msgs.map((m) => {
              const who = m.who === 'me' ? null : playerById(m.who);
              return m.who === 'me' ? (
                <div key={m.id} className="flex justify-end"><p className="max-w-[85%] text-[13px] rounded-2xl rounded-br-md px-3 py-2 text-black" style={{ background: ACCENT }}>{m.text}</p></div>
              ) : (
                <div key={m.id} className="flex gap-2">
                  {who ? <BandAvatar player={who} size={26} /> : <span className="w-[26px] h-[26px] rounded-full bg-white/10 flex items-center justify-center shrink-0"><Users size={12} /></span>}
                  <div className="max-w-[88%]">
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap rounded-2xl rounded-tl-md px-3 py-2 bg-white/[0.06] text-white/80">{m.text}</p>
                    <p className="text-[9px] text-white/30 mt-0.5 flex items-center gap-1">
                      {m.lane === 'device' ? <Cpu size={9} /> : m.lane === 'cloud' ? <Cloud size={9} /> : null}
                      {who?.name.split(' ')[0] ?? 'Band'} · {LANE_LABEL[m.lane ?? 'built-in']}{m.note ? ` — ${m.note}` : ''}
                    </p>
                  </div>
                </div>
              );
            })}
            {busy && <p className="text-[11px] text-white/40 flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> {player.name.split(' ')[0]} is thinking…</p>}
            <div ref={endRef} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void ask(input); }} className="flex gap-2 p-3 border-t border-white/8">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Ask ${player.name.split(' ')[0]}…`} aria-label={`Ask ${player.name}`}
              className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-[13px] outline-none focus:border-white/25" />
            <button type="submit" disabled={busy || !input.trim()} className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-40" style={{ background: player.color, color: '#000' }} aria-label="Send"><Send size={14} /></button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default BandFaculty;
