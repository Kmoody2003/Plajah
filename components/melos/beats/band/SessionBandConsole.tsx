// The Session Band console — thirteen master session players who play your song in real time on
// Chora's own instruments while you produce them: talk to them ("Dwayne, lay back", "Rosie, take a
// solo", "make it gospel", "build over 8 bars"), watch their personalities come and go as they
// play, ask them anything (their instrument, its history, technique, Chora itself), take a lesson
// while they play the examples, and print what they played to the timeline as editable takes.
//
// The band itself is pure (services/melos/beats/band/): this panel seats the players on real
// tracks, drives the session from the engine's clock, and shows the bandstand + talkback.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Play, Square, Radio, Printer, PenLine, GraduationCap, Send, Star, Music, ChevronDown } from 'lucide-react';
import type { GrooveDoc, NoteEvent } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { songTime } from '../../../../services/melos/beats/tempoMap';
import { BAND, type BandPlayer } from '../../../../services/melos/beats/band/roster';
import { GENRES, genreById } from '../../../../services/melos/beats/band/styles';
import { seatLineup } from '../../../../services/melos/beats/band/direction';
import { BandSession, type BandClock, type BandOutput, type FeedEvent } from '../../../../services/melos/beats/band/session';
import { kitMap, printTake } from '../../../../services/melos/beats/band/printTake';
import { parseChart } from '../../../../services/melos/beats/band/chords';
import { ALL_LESSONS, grooveLine } from '../../../../services/melos/beats/band/teach';
import { BandAvatar } from './BandAvatar';
import { createSeatTrack, seatSound } from './bandSeats';

interface Props {
  doc: GrooveDoc;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  running: boolean;
  onPlayFrom: (fromBeats: number) => void;
  /** The region "Write region" composes (the loop, or the bars around the playhead). */
  startBeats: number;
  endBeats: number;
  onClose: () => void;
}

const QUICK = ['Lay back', 'Fill into the next bar', 'Build over 8 bars', 'Breakdown', 'Full band', 'Everybody softer', 'Busier', 'Half-time'];
const ACCENT = '#8B5CFF';

export const SessionBandConsole: React.FC<Props> = ({ doc, onMutate, running, onPlayFrom, startBeats, endBeats, onClose }) => {
  const session = useMemo(() => new BandSession(doc, doc.band?.genre ?? 'pop'), []); // eslint-disable-line react-hooks/exhaustive-deps
  const docRef = useRef(doc);
  docRef.current = doc;
  session.setDoc(doc);
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [jamming, setJamming] = useState(false);
  const [talk, setTalk] = useState('');
  const [chart, setChart] = useState(doc.band?.chart ?? '');
  const [selected, setSelected] = useState<string | null>(null);
  const [showLessons, setShowLessons] = useState(false);
  const [teaching, setTeaching] = useState(false);
  const feedEnd = useRef<HTMLDivElement | null>(null);

  // First open: restore the genre/chart this song's band last used, and say hello.
  useEffect(() => {
    if (doc.band?.genre) seatLineup(session.dir, doc.band.genre);
    session.chart = parseChart(chart) ? chart : '';
    const off = session.onFeed((e) => setFeed((f) => [...f.slice(-120), e]));
    const g = genreById(session.dir.genre);
    const hosts = BAND.filter((p) => session.dir.players[p.id].in).slice(0, 2);
    setFeed([{ id: 0, kind: 'band', text: `The band is set up for ${g.label}. Hit Jam and press play — then talk to us like a producer. Ask any of us about our instruments, music history, or Chora.`, bar: 0 },
      ...hosts.map((p, i) => ({ id: -1 - i, kind: 'say' as const, playerId: p.id, text: session.activePersona(p).lines.enter[0], bar: 0, persona: session.activePersona(p).name }))]);
    bump();
    return () => { off(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { feedEnd.current?.scrollIntoView({ block: 'end' }); }, [feed.length]);

  // Seats: every player who's in gets a real track (drums play the MEKA kit — no track needed).
  const seatPlayers = (ids: string[]) => {
    const need = BAND.filter((p) => ids.includes(p.id) && p.seat.kind === 'instrument' && !docRef.current.arrangement.some((t) => t.id === docRef.current.band?.seats[p.id]));
    if (!need.length) return;
    onMutate((d) => {
      d.band ??= { genre: session.dir.genre, seats: {} };
      for (const p of need) d.band.seats[p.id] = createSeatTrack(d, p, session.dir.genre, `${p.name} · ${p.instrument}`).id;
    });
  };
  useEffect(() => { session.ownTracks = Object.values(doc.band?.seats ?? {}); }, [doc.band?.seats, session]);

  // Live: drive the session from the engine's clock while jamming.
  useEffect(() => {
    if (!jamming) return;
    const engine = BeatsEngine.get();
    const clock: BandClock = {
      running: () => engine.isRunning(),
      pos: () => engine.posBeats(),
      now: () => engine.audioNow(),
      wrap: () => engine.pendingWrap(),
      timeAt: (b, prev) => engine.timeAtBeat(b, prev),
    };
    let kit = kitMap(docRef.current.kit), kitOf = docRef.current.kit;
    const out: BandOutput = {
      note: (pid, n, when, lenSec) => {
        const d = docRef.current;
        const t = d.arrangement.find((x) => x.id === d.band?.seats[pid]);
        if (!t || t.kind !== 'instrument' || t.mute) return;
        if (d.arrangement.some((x) => x.solo) && !t.solo) return;
        const note: NoteEvent = { id: 'band', startBeats: 0, lengthBeats: n.len, key: n.key, vel: n.vel, ...(n.articulation ? { articulation: n.articulation } : {}), ...(n.expr ? { expr: n.expr } : {}) };
        engine.playTrackNote(t, note, when, lenSec);
      },
      hit: (_pid, h, when) => {
        if (kitOf !== docRef.current.kit) { kitOf = docRef.current.kit; kit = kitMap(kitOf); }
        const pad = kit[h.voice];
        if (pad >= 0) engine.trigger(pad, h.vel, when);
      },
    };
    const id = window.setInterval(() => session.tick(clock, out), 25);
    const ui = window.setInterval(bump, 140);
    return () => { window.clearInterval(id); window.clearInterval(ui); };
  }, [jamming, session]);

  const startJam = () => {
    seatPlayers(BAND.filter((p) => session.dir.players[p.id].in).map((p) => p.id));
    session.clearTake();
    setJamming(true);
    if (!running) {
      const loop = docRef.current.loop;
      onPlayFrom(loop?.on ? loop.startBeats : startBeats);
    }
  };
  const stopJam = () => { setJamming(false); BeatsEngine.get().stop(); };

  const say = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setFeed((f) => [...f, { id: Date.now(), kind: 'band', text: `🎧 ${t}`, bar: session.currentBar() }]);
    const before = session.dir.genre;
    session.direct(t);
    // Anyone the direction brought in sits down at their instrument.
    if (jamming) seatPlayers(BAND.filter((p) => session.dir.players[p.id].in).map((p) => p.id));
    if (session.dir.genre !== before) onMutate((d) => { d.band = { seats: {}, ...d.band, genre: session.dir.genre }; });
    setTalk('');
    bump();
  };

  const setGenre = (id: string) => {
    seatLineup(session.dir, id);
    onMutate((d) => { d.band = { seats: {}, ...d.band, genre: id }; });
    setFeed((f) => [...f, { id: Date.now(), kind: 'band', text: `Genre → ${genreById(id).label}`, bar: session.currentBar() }]);
    if (jamming) seatPlayers(BAND.filter((p) => session.dir.players[p.id].in).map((p) => p.id));
    bump();
  };

  const applyChart = (text: string) => {
    setChart(text);
    const ok = !text.trim() || !!parseChart(text);
    if (ok) { session.chart = text.trim(); onMutate((d) => { d.band = { seats: {}, ...d.band, genre: d.band?.genre ?? session.dir.genre, chart: text.trim() || undefined }; }); }
  };

  const takeLabel = () => String.fromCharCode(65 + ((doc.band?.takes ?? 0) % 26));
  const print = (bars = [...session.take.values()]) => {
    const loop = doc.loop?.on ? doc.loop : null;
    const inRegion = loop ? bars.filter((b) => b.start >= loop.startBeats - 1e-6 && b.start < loop.endBeats - 1e-6) : bars;
    if (!inRegion.length) { setFeed((f) => [...f, { id: Date.now(), kind: 'band', text: 'Nothing to print yet — jam a few bars first, or use Write region.', bar: 0 }]); return; }
    const label = takeLabel();
    let printed = 0;
    onMutate((d) => {
      d.band ??= { genre: session.dir.genre, seats: {} };
      const seats = d.band.seats;
      const r = printTake(d, inRegion, { seats, label, createTrack: (dd, player, name, after) => createSeatTrack(dd, player, session.dir.genre, name, after) });
      d.band.takes = (d.band.takes ?? 0) + 1;
      printed = r.players.length;
    });
    // The take now plays from the timeline — stop the live band so it isn't doubled.
    if (jamming) setJamming(false);
    setFeed((f) => [...f, { id: Date.now(), kind: 'band', text: `Take ${label} printed — ${printed} players, ${inRegion.length} bars, now on the timeline as editable clips. Jam again for another take.`, bar: 0 }]);
  };
  const writeRegion = () => {
    const { meter } = songTime(doc);
    const a = meter.at(Math.max(0, startBeats)).bar, b = Math.max(a + 1, meter.at(Math.max(startBeats, endBeats - 1e-6)).bar + 1);
    print(session.writeRegion(a, b));
  };

  const togglePlayer = (p: BandPlayer) => {
    const d = session.dir.players[p.id];
    say(`${p.name.split(' ')[0]}, ${d.in ? 'lay out' : 'come in'}`);
  };
  const cyclePersona = (p: BandPlayer) => {
    const i = p.personas.findIndex((x) => x.id === session.persona[p.id]);
    say(`${p.name.split(' ')[0]}, ${p.personas[(i + 1) % 3].name}`);
  };

  const now = BeatsEngine.get().audioNow();
  const sel = selected ? BAND.find((p) => p.id === selected) ?? null : null;
  const g = genreById(session.dir.genre);
  const chartBad = chart.trim() && !parseChart(chart);
  const field = 'bg-black/40 border border-white/12 rounded-lg text-[11px] text-white outline-none focus:border-[#8B5CFF]/70';

  return createPortal(
    <div className="fixed right-4 top-20 bottom-4 z-[140] w-[620px] max-w-[calc(100vw-32px)] flex flex-col rounded-2xl border border-white/12 bg-[#120C1C]/96 backdrop-blur-xl shadow-2xl text-white" role="dialog" aria-label="Session band">
      {/* header */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-white/10">
        <Music size={16} style={{ color: ACCENT }} />
        <div className="font-bold text-sm tracking-wide">Session Band</div>
        <span className="text-[10px] text-white/45 truncate">13 players · real-time · on Chora's instruments</span>
        <div className="flex-1" />
        <button onClick={onClose} className="p-1 rounded-md hover:bg-white/10" aria-label="Close"><X size={16} /></button>
      </div>

      {/* transport + style */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-white/10">
        {!jamming
          ? <button onClick={startJam} className="h-8 px-3 rounded-lg bg-gradient-to-r from-[#8B5CFF] to-[#00DAF3] text-[11px] font-bold flex items-center gap-1.5"><Radio size={13} /> Jam</button>
          : <button onClick={stopJam} className="h-8 px-3 rounded-lg bg-[#FF3B6B] text-[11px] font-bold flex items-center gap-1.5"><Square size={12} /> Stop</button>}
        {jamming && !running && <button onClick={() => onPlayFrom(doc.loop?.on ? doc.loop.startBeats : startBeats)} className="h-8 px-2.5 rounded-lg border border-white/20 text-[11px] flex items-center gap-1"><Play size={12} /> Play</button>}
        <button onClick={() => print()} className="h-8 px-2.5 rounded-lg border border-white/20 text-[11px] flex items-center gap-1.5" title="Print the bars the band just played to the timeline"><Printer size={13} /> Print take {takeLabel()}</button>
        <button onClick={writeRegion} className="h-8 px-2.5 rounded-lg border border-white/20 text-[11px] flex items-center gap-1.5" title="Compose the whole region without playing it"><PenLine size={13} /> Write region</button>
        <div className="flex-1" />
        <select value={session.dir.genre} onChange={(e) => setGenre(e.target.value)} className={`${field} h-8 px-2`} aria-label="Genre">
          {GENRES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <label className="flex items-center gap-1 text-[10px] text-white/55" title="Band energy">
          Energy
          <input type="range" min={0} max={1} step={0.05} value={session.dir.energy} onChange={(e) => { session.dir.energy = Number(e.target.value); session.dir.build = undefined; bump(); }} className="w-20 accent-[#8B5CFF]" />
        </label>
      </div>
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-white/10">
        <span className="text-[10px] text-white/50 shrink-0">Chart</span>
        <input value={chart} onChange={(e) => applyChart(e.target.value)} placeholder="Leave empty to follow the song's chords — or type C | Am | F G | G7" className={`${field} h-7 px-2 flex-1 ${chartBad ? 'border-[#FF3B6B]/70' : ''}`} />
        <label className="flex items-center gap-1 text-[10px] text-white/60 shrink-0 cursor-pointer">
          <input type="checkbox" checked={teaching} onChange={(e) => { setTeaching(e.target.checked); session.teaching = e.target.checked; }} className="accent-[#8B5CFF]" />
          <GraduationCap size={12} /> Teach as they play
        </label>
      </div>
      {!running && jamming && <div className="px-4 py-1 text-[10px] text-amber-300/90 border-b border-white/10">Press Play (Song mode) — the band plays along with Chora's transport and the loop.</div>}

      {/* bandstand */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 px-3 py-2 border-b border-white/10 max-h-[38%] overflow-y-auto">
        {BAND.map((p) => {
          const d = session.dir.players[p.id];
          const persona = session.activePersona(p);
          const lit = jamming && running && now - (session.lastSound[p.id] ?? -9) < 0.18;
          return (
            <div key={p.id} onClick={() => setSelected(selected === p.id ? null : p.id)}
              className={`rounded-xl border px-2 py-1.5 cursor-pointer transition-colors ${selected === p.id ? 'border-[#8B5CFF]/70 bg-[#8B5CFF]/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
              <div className="flex items-center gap-2">
                <BandAvatar player={p} size={34} lit={lit} dim={!d.in} />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold truncate flex items-center gap-1">
                    {p.nickname ?? p.name.split(' ')[0]}
                    {d.feature && <Star size={10} className="text-amber-300 fill-amber-300" />}
                  </div>
                  <div className="text-[9.5px] text-white/45 truncate">{p.instrument.split(' (')[0]}</div>
                </div>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <button onClick={(e) => { e.stopPropagation(); cyclePersona(p); }} title={persona.tagline}
                  className="flex-1 min-w-0 truncate text-[9.5px] px-1.5 py-0.5 rounded-md border text-left" style={{ borderColor: `${p.color}66`, color: p.color }}>
                  {persona.name}{d.persona ? ' ·pinned' : ''}
                </button>
                <button onClick={(e) => { e.stopPropagation(); togglePlayer(p); }}
                  className={`text-[9.5px] px-1.5 py-0.5 rounded-md ${d.in ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-white/40'}`}>{d.in ? 'In' : 'Out'}</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* selected player */}
      {sel && <PlayerDetail player={sel} session={session} genre={g.id} onSay={say} onLesson={(lessonId) => { session.startLesson('', sel.id, lessonId); bump(); }} />}

      {/* feed */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-1.5">
        {feed.map((e) => {
          const p = e.playerId ? BAND.find((x) => x.id === e.playerId) : undefined;
          if (!p) return <div key={e.id} className={`text-[10.5px] ${e.text.startsWith('🎧') ? 'text-white/80 text-right' : 'text-white/50 italic'}`}>{e.text}</div>;
          const tone = e.kind === 'teach' || e.kind === 'answer' || e.kind === 'lesson' ? 'bg-[#00DAF3]/[0.07] border-[#00DAF3]/20' : e.kind === 'persona' ? 'bg-white/[0.04] border-white/10' : 'bg-white/[0.02] border-transparent';
          return (
            <div key={e.id} className={`flex gap-2 items-start rounded-lg border px-2 py-1.5 ${tone}`}>
              <BandAvatar player={p} size={24} />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold" style={{ color: p.color }}>
                  {p.nickname ?? p.name.split(' ')[0]}
                  <span className="text-white/35 font-normal"> · {e.kind === 'teach' ? 'what I just played' : e.kind === 'answer' ? 'answer' : e.kind === 'lesson' ? 'lesson' : e.persona ?? session.activePersona(p).name}</span>
                </div>
                <div className="text-[11px] text-white/85 whitespace-pre-line leading-snug">{e.text}</div>
              </div>
            </div>
          );
        })}
        <div ref={feedEnd} />
      </div>

      {/* talkback */}
      <div className="border-t border-white/10 px-3 pt-2 pb-3">
        <div className="flex gap-1 flex-wrap mb-1.5">
          {QUICK.map((q) => <button key={q} onClick={() => say(q)} className="text-[10px] px-2 py-0.5 rounded-full border border-white/12 text-white/70 hover:bg-white/10">{q}</button>)}
          <button onClick={() => setShowLessons(!showLessons)} className="text-[10px] px-2 py-0.5 rounded-full border border-[#00DAF3]/40 text-[#7FEFFF] flex items-center gap-1"><GraduationCap size={10} /> Lessons <ChevronDown size={10} /></button>
          {session.lessonRunning() && <button onClick={() => { session.advanceLesson(); bump(); }} className="text-[10px] px-2 py-0.5 rounded-full bg-[#00DAF3]/20 text-[#7FEFFF]">Next step</button>}
        </div>
        {showLessons && (
          <div className="mb-2 max-h-36 overflow-y-auto rounded-lg border border-white/10 bg-black/30 p-1.5 grid grid-cols-2 gap-1">
            {ALL_LESSONS.map(({ player, lesson }) => (
              <button key={`${player.id}:${lesson.id}`} onClick={() => { session.startLesson('', player.id, lesson.id); setShowLessons(false); if (!jamming) startJam(); bump(); }}
                className="text-left text-[10px] px-2 py-1 rounded-md hover:bg-white/10">
                <span style={{ color: player.color }}>{player.nickname ?? player.name.split(' ')[0]}</span> · {lesson.title}
                <div className="text-white/40 truncate">{lesson.summary}</div>
              </button>
            ))}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); say(talk); }} className="flex gap-1.5">
          <input value={talk} onChange={(e) => setTalk(e.target.value)} placeholder='Talk to the band — "Dwayne, lay back", "Rosie take a solo", "make it gospel", "who invented the sax?"'
            className={`${field} flex-1 h-9 px-3 text-[12px]`} aria-label="Talk to the band" />
          <button type="submit" className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: ACCENT }} aria-label="Send"><Send size={14} /></button>
        </form>
      </div>
    </div>,
    document.body,
  );
};

const PlayerDetail: React.FC<{ player: BandPlayer; session: BandSession; genre: string; onSay: (t: string) => void; onLesson: (id: string) => void }> = ({ player, session, genre, onSay, onLesson }) => {
  const d = session.dir.players[player.id];
  const first = player.name.split(' ')[0];
  const sound = seatSound(player, genre);
  const slider = (label: string, value: number, more: string, less: string) => (
    <div className="flex items-center gap-1 text-[10px] text-white/60">
      <span className="w-16">{label}</span>
      <button onClick={() => onSay(`${first}, ${less}`)} className="px-1.5 rounded bg-white/5 hover:bg-white/10">−</button>
      <div className="w-14 h-1 rounded bg-white/10 relative"><div className="absolute top-0 h-1 rounded" style={{ left: '50%', width: `${Math.abs(value) * 50}%`, transform: value < 0 ? 'translateX(-100%)' : undefined, background: player.color }} /></div>
      <button onClick={() => onSay(`${first}, ${more}`)} className="px-1.5 rounded bg-white/5 hover:bg-white/10">+</button>
    </div>
  );
  return (
    <div className="px-4 py-2 border-b border-white/10 bg-white/[0.02] max-h-[34%] overflow-y-auto">
      <div className="flex gap-3">
        <BandAvatar player={player} size={52} />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold">{player.name}{player.nickname ? <span className="text-white/50 font-normal"> “{player.nickname}”</span> : null} <span className="text-white/40 font-normal">· {player.from}</span></div>
          <div className="text-[10.5px] text-white/70 leading-snug">{player.bio}</div>
          <div className="text-[10px] text-white/40 mt-0.5">Hears: {player.influences.join(', ')}</div>
          <div className="text-[10px] text-white/40">Plays: {player.seat.kind === 'kit' ? 'your MEKA kit' : `${sound?.type.toUpperCase()} · ${sound?.presetName ?? sound?.presetId}`}{player.seat.kind === 'instrument' && player.seat.standIn ? ` — ${player.seat.standIn}` : ''}</div>
        </div>
      </div>
      <div className="flex gap-1 mt-2">
        {player.personas.map((x) => (
          <button key={x.id} onClick={() => onSay(`${first}, ${x.name}`)} title={x.tagline}
            className={`flex-1 text-left rounded-lg border px-2 py-1 ${session.persona[player.id] === x.id ? 'bg-white/10' : 'bg-transparent'}`} style={{ borderColor: `${player.color}55` }}>
            <div className="text-[10.5px] font-semibold" style={{ color: player.color }}>{x.name}{d.persona === x.id ? ' · pinned' : ''}</div>
            <div className="text-[9.5px] text-white/50 leading-tight">{x.tagline}</div>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
        {slider('Energy', d.energy, 'more energy', 'chill')}
        {slider('Busy', d.density, 'busier', 'simpler')}
        {slider('Dynamics', d.dynamics, 'louder', 'softer')}
        {slider('Pocket', d.pocket, 'lay back', 'on top of the beat')}
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {[['Solo', `${first}, take a solo`], ['Back to the section', `${first}, back to the section`], ['Fill', `${first}, fill`], ['Octave up', `${first}, up an octave`], ['Octave down', `${first}, down an octave`], ['Hold', `${first}, hold long notes`], ['Short', `${first}, short`], ['Your call', `${first}, be yourself`]].map(([l, t]) => (
          <button key={l} onClick={() => onSay(t)} className="text-[10px] px-2 py-0.5 rounded-full border border-white/12 text-white/70 hover:bg-white/10">{l}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 mt-1.5 items-center">
        <span className="text-[10px] text-white/40">Ask {first}:</span>
        {[`${first}, what are you playing?`, `${first}, tell me the history of the ${player.role === 'orchestra' ? 'orchestra' : player.instrument.toLowerCase().split(' (')[0]}?`, `${first}, how does it work in Chora?`].map((q) => (
          <button key={q} onClick={() => onSay(q)} className="text-[10px] px-2 py-0.5 rounded-full border border-[#00DAF3]/30 text-[#7FEFFF] hover:bg-[#00DAF3]/10">{q.replace(`${first}, `, '')}</button>
        ))}
        {player.lessons.map((l) => <button key={l.id} onClick={() => onLesson(l.id)} className="text-[10px] px-2 py-0.5 rounded-full bg-[#00DAF3]/15 text-[#7FEFFF]">Lesson: {l.title}</button>)}
      </div>
      <div className="text-[9.5px] text-white/35 mt-1.5">{grooveLine(player, genre)}</div>
    </div>
  );
};
