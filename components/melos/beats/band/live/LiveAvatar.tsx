// A Session Band character, live: their portrait animated by what they're doing (breathing when idle,
// nodding to your hits, talking in time with their words, leaning in to listen, thinking), a caption
// that follows their voice word by word, and the controls to talk back — mic or typing — show-me
// demos, voice on/off and how chatty they are.

import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Send, Volume2, VolumeX, Play, Square } from 'lucide-react';
import type { CharacterSheet } from '../../../../../services/melos/beats/band/character/schema';
import type { Chattiness, LiveDirector } from '../../../../../services/melos/beats/band/live/director';
import { useLiveCharacter, type LiveHost } from './useLiveCharacter';

const KEYFRAMES = `
@keyframes bandlive-breathe { 0%,100% { transform: scale(1) } 50% { transform: scale(1.018) } }
@keyframes bandlive-nod { 0% { transform: translateY(0) } 35% { transform: translateY(2px) rotate(-1deg) } 100% { transform: translateY(0) } }
@keyframes bandlive-talk { 0% { transform: scale(1) } 40% { transform: scale(1.035) translateY(-1px) } 100% { transform: scale(1) } }
@keyframes bandlive-lean { 0% { transform: scale(1) } 50% { transform: scale(1.06) } 100% { transform: scale(1.03) } }
@keyframes bandlive-think { 0%,100% { transform: rotate(0) } 50% { transform: rotate(-3deg) } }
@keyframes bandlive-ring { 0% { box-shadow: 0 0 0 0 var(--c) } 100% { box-shadow: 0 0 0 10px transparent } }
@keyframes bandlive-dot { 0%,80%,100% { opacity: .25 } 40% { opacity: 1 } }
@media (prefers-reduced-motion: reduce) { .bandlive-anim { animation: none !important } }
`;

const CHAT_LABEL: Record<Chattiness, string> = { 1: 'Quiet', 2: 'Coach', 3: 'Chatty' };
const STATE_LABEL = { idle: '', watching: 'watching you play', listening: 'listening…', thinking: 'thinking…', speaking: '', playing: 'playing for you' } as const;

export const LiveAvatar: React.FC<{
  sheet: CharacterSheet; host: LiveHost; fallbackLine?: string; role?: string;
  /** Hands the host the character's director, e.g. to have them read something aloud. */
  onDirector?: (d: LiveDirector) => void;
}> = ({ sheet, host, fallbackLine, role, onDirector }) => {
  const { snap, director, prefs, update, mic } = useLiveCharacter(sheet, host);
  useEffect(() => { onDirector?.(director); }, [director, onDirector]);
  const [typed, setTyped] = useState('');
  const [photo, setPhoto] = useState(true);
  const c = sheet.look.color;

  // Restart the one-shot animations when their trigger changes.
  const nodKey = snap.beat;
  const talkKey = snap.spokenWords;
  const portraitAnim =
    snap.state === 'speaking' ? 'bandlive-talk 220ms ease-out'
      : snap.state === 'thinking' ? 'bandlive-think 1.4s ease-in-out infinite'
        : snap.state === 'listening' ? 'bandlive-lean 600ms ease-out forwards'
          : snap.state === 'watching' || snap.state === 'playing' ? 'bandlive-nod 260ms ease-out'
            : 'bandlive-breathe 4s ease-in-out infinite';
  const ringAnim = snap.state === 'listening' || snap.state === 'playing' ? 'bandlive-ring 1s ease-out infinite' : snap.state === 'speaking' ? 'bandlive-ring 700ms ease-out infinite' : 'none';

  const words = (snap.caption || fallbackLine || '').split(/\s+/).filter(Boolean);
  const userLine = snap.from === 'user' && (snap.state === 'thinking');
  const scroller = useRef<HTMLParagraphElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [snap.spokenWords]);

  const send = () => { const q = typed.trim(); if (!q) return; setTyped(''); void director.hear(q); };
  const first = sheet.displayName.split(' ')[0];

  return (
    <div className="flex gap-3 items-start" data-band-live={sheet.id}>
      <style>{KEYFRAMES}</style>
      <div className="relative shrink-0" style={{ width: 72, height: 72 }}>
        <div
          key={`${snap.state}-${snap.state === 'speaking' ? talkKey : snap.state === 'watching' || snap.state === 'playing' ? nodKey : 0}`}
          className="bandlive-anim w-full h-full rounded-2xl overflow-hidden"
          style={{ animation: portraitAnim, ['--c' as string]: `${c}99`, boxShadow: `0 0 0 2px ${c}${snap.state === 'idle' ? '55' : 'ee'}` }}
        >
          {photo ? (
            <img src={sheet.look.portrait} alt={sheet.displayName} onError={() => setPhoto(false)} className="w-full h-full object-cover" draggable={false} />
          ) : (
            <div className="w-full h-full grid place-items-center text-[20px] font-black text-black/70" style={{ background: c }}>{first[0]}</div>
          )}
        </div>
        <span className="bandlive-anim absolute inset-0 rounded-2xl pointer-events-none" style={{ animation: ringAnim, ['--c' as string]: `${c}88` }} />
        {snap.state === 'thinking' && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-black/80 flex gap-0.5">
            {[0, 1, 2].map((i) => <span key={i} className="bandlive-anim w-1 h-1 rounded-full bg-white" style={{ animation: `bandlive-dot 1s ${i * 0.15}s infinite` }} />)}
          </span>
        )}
        {snap.state === 'listening' && <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full grid place-items-center" style={{ background: c }}><Mic size={11} className="text-black" /></span>}
      </div>

      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold" style={{ color: c }}>{sheet.displayName}</span>
          {role && <span className="text-[10px] text-white/40">{role}</span>}
          {STATE_LABEL[snap.state] && <span className="text-[10px] italic text-white/45">{STATE_LABEL[snap.state]}</span>}
          <span className="ml-auto flex items-center gap-1">
            <button
              onClick={() => update({ voice: !prefs.voice })}
              className="h-5 w-5 grid place-items-center rounded-md border border-white/10 text-white/60 hover:text-white"
              title={prefs.voice ? `Mute ${first}'s voice (captions stay)` : `Let ${first} speak (on-device voice)`}
            >
              {prefs.voice ? <Volume2 size={10} /> : <VolumeX size={10} />}
            </button>
            <span className="flex rounded-md border border-white/10 overflow-hidden" title="How often they comment on your playing">
              {([1, 2, 3] as Chattiness[]).map((n) => (
                <button key={n} onClick={() => update({ chattiness: n })}
                  className="h-5 px-1.5 text-[9px]"
                  style={prefs.chattiness === n ? { background: `${c}44`, color: '#fff' } : { color: 'rgba(255,255,255,0.45)' }}>
                  {CHAT_LABEL[n]}
                </button>
              ))}
            </span>
          </span>
        </div>

        <div className="rounded-xl rounded-tl-sm border border-white/10 bg-black/35 px-3 py-2">
          {userLine && <p className="text-[10.5px] text-white/45 m-0 mb-1">You: “{snap.caption}”</p>}
          <p ref={scroller} className="text-[11.5px] leading-relaxed m-0 max-h-28 overflow-y-auto">
            {userLine
              ? <span className="text-white/40">…</span>
              : words.map((w, i) => (
                <span key={i} style={{ color: snap.state === 'speaking' && i >= snap.spokenWords ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.88)', transition: 'color 120ms' }}>{w} </span>
              ))}
          </p>
          {snap.note && <p className="text-[9.5px] text-amber-200/70 m-0 mt-1">{snap.note}</p>}
          {mic.heard && <p className="text-[10.5px] m-0 mt-1" style={{ color: c }}>You: {mic.heard}</p>}
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => (mic.state === 'idle' || mic.state === 'error' ? mic.start() : mic.stop())}
            disabled={!mic.available}
            className="h-6 px-2 rounded-lg text-[10px] font-semibold border flex items-center gap-1 disabled:opacity-40"
            style={mic.state === 'listening' ? { background: `${c}33`, borderColor: c, color: '#fff' } : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}
            title={mic.available ? `Talk to ${first} — they wait for you to finish` : 'No speech recognition on this device — type instead'}
          >
            {mic.state === 'listening' ? <MicOff size={10} /> : <Mic size={10} />} {mic.state === 'listening' ? 'Stop talking' : `Talk to ${first}`}
          </button>
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-1 flex-1 min-w-[140px]">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={`Ask ${first}…`}
              className="h-6 flex-1 min-w-0 rounded-lg bg-black/40 border border-white/10 px-2 text-[10.5px] text-white placeholder:text-white/30 outline-none focus:border-white/30"
            />
            <button type="submit" className="h-6 w-6 grid place-items-center rounded-lg border border-white/10 text-white/60 hover:text-white"><Send size={10} /></button>
          </form>
          {(snap.state === 'speaking' || snap.state === 'playing' || snap.state === 'thinking') && (
            <button onClick={() => director.interrupt()} className="h-6 px-2 rounded-lg text-[10px] border border-white/10 text-white/60 hover:text-white flex items-center gap-1"><Square size={9} /> Stop</button>
          )}
        </div>

        {sheet.demos.length > 0 && host.playStep && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[9.5px] uppercase tracking-wider text-white/35 mr-0.5">Show me</span>
            {sheet.demos.map((d) => (
              <button key={d.id} onClick={() => void director.demo(d.id)}
                className="h-5 px-1.5 rounded-md text-[9.5px] border border-white/10 text-white/65 hover:text-white hover:bg-white/10 flex items-center gap-1">
                <Play size={8} /> {d.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
