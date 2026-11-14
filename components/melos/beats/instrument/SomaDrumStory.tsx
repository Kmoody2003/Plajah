// SOMA — the drum behind the preset, with the Session Band's percussionist live beside it. A credited
// photo of the real instrument; Amara Okafor as a real-time character (band/live) who introduces each
// drum, watches and listens to you play SOMA, gives feedback in a pause, plays demos on this SOMA and
// talks back; and the history / build / technique / traditions she can read out, with the sources.
// Content lives in services/melos/instruments/soma/drumKnowledge.ts. SOMA is the first live host:
// SomaPanel reports hits, presets and knob moves on the band live bus.

import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronDown, ExternalLink, Volume2 } from 'lucide-react';
import { drumForPreset, drumPhotoLocalUrl, drumPhotoUrl, type DrumKnowledge } from '../../../../services/melos/instruments/soma/drumKnowledge';
import { sheetById } from '../../../../services/melos/beats/band/character/sheets';
import { SomaLens, type Observation } from '../../../../services/melos/beats/band/live/observations';
import { liveBus, now } from '../../../../services/melos/beats/band/live/events';
import type { LiveDirector } from '../../../../services/melos/beats/band/live/director';
import { LiveAvatar } from '../band/live/LiveAvatar';
import type { LiveHost } from '../band/live/useLiveCharacter';

const ACCENT = '#E86A33';

/** SOMA's playing zones for a demo stroke — the same spots as the panel's audition buttons. */
const STROKES: Record<string, { pos: number; striker: number }> = {
  bass: { pos: 0.08, striker: 1 }, tone: { pos: 0.6, striker: 1 }, slap: { pos: 0.78, striker: 2 },
  muted: { pos: 0.48, striker: 3 }, stick: { pos: 0.65, striker: 0 },
};

export type SomaStrike = (note?: number, velocity?: number, pos?: number, angle?: number, striker?: number) => void;

type Section = 'origins' | 'build' | 'playing' | 'traditions' | 'sources';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'origins', label: 'Origins & history' },
  { id: 'build', label: 'How it\'s built' },
  { id: 'playing', label: 'How it\'s played' },
  { id: 'traditions', label: 'Traditions & music' },
  { id: 'sources', label: 'Sources' },
];

function spokenText(d: DrumKnowledge, s: Section | 'intro'): string {
  if (s === 'intro') return d.intro;
  if (s === 'origins') return d.origins.join(' ');
  if (s === 'build') return `${d.build.shell} ${d.build.head} ${d.build.tuning}`;
  if (s === 'playing') return `${d.playing.summary} ${d.playing.strokes.map((k) => `${k.name}: ${k.how}`).join(' ')}`;
  if (s === 'traditions') return d.traditions.join(' ') + (d.respect ? ` ${d.respect}` : '');
  return '';
}

const SectionBody: React.FC<{ d: DrumKnowledge; s: Section }> = ({ d, s }) => {
  const p = 'text-[11px] leading-relaxed text-white/75';
  if (s === 'origins') return <div className="flex flex-col gap-1.5">{d.origins.map((t, i) => <p key={i} className={p}>{t}</p>)}</div>;
  if (s === 'build') return (
    <dl className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-1.5">
      {([['Shell', d.build.shell], ['Head', d.build.head], ['Tuning', d.build.tuning]] as const).map(([k, v]) => (
        <React.Fragment key={k}><dt className="text-[9.5px] uppercase tracking-wider text-white/40 pt-0.5">{k}</dt><dd className={p}>{v}</dd></React.Fragment>
      ))}
    </dl>
  );
  if (s === 'playing') return (
    <div className="flex flex-col gap-1.5">
      <p className={p}>{d.playing.summary}</p>
      <ul className="flex flex-col gap-1">
        {d.playing.strokes.map((k) => (
          <li key={k.name} className={p}><span className="font-semibold text-[#FFD7C2]">{k.name}</span> — {k.how}</li>
        ))}
      </ul>
    </div>
  );
  if (s === 'traditions') return (
    <div className="flex flex-col gap-1.5">
      <ul className="flex flex-col gap-1 list-disc pl-4">{d.traditions.map((t, i) => <li key={i} className={p}>{t}</li>)}</ul>
      {d.respect && <p className="text-[10.5px] leading-relaxed text-amber-200/80 border-l-2 border-amber-300/40 pl-2">{d.respect}</p>}
    </div>
  );
  return (
    <ul className="flex flex-col gap-1">
      {d.sources.map((src) => (
        <li key={src.url} className="text-[10.5px]">
          <a href={src.url} target="_blank" rel="noreferrer" className="text-[#7DD3FC] hover:underline inline-flex items-center gap-1">
            {src.title}<ExternalLink size={9} />
          </a>
          <span className="text-white/40"> · {src.publisher}</span>
        </li>
      ))}
    </ul>
  );
};

export const SomaDrumStory: React.FC<{ presetId?: string; presetName?: string; trackId?: string; defaultNote?: number; strike?: SomaStrike }> = ({ presetId, presetName, trackId = '', defaultNote = 48, strike }) => {
  const drum = drumForPreset(presetId);
  const amara = sheetById('amara');
  const [open, setOpen] = useState<Section | null>(null);
  // 0 = bundled copy, 1 = Commons, 2 = neither loaded.
  const [photoTry, setPhotoTry] = useState(0);
  const [director, setDirector] = useState<LiveDirector | null>(null);

  const lens = useMemo(() => new SomaLens(), []);
  // Opening the panel is the character's cue to say hello.
  useEffect(() => {
    liveBus.emit({ kind: 'open', instrument: 'soma', trackId, at: now(), presetId });
    return () => liveBus.emit({ kind: 'close', instrument: 'soma', trackId, at: now() });
  }, [trackId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPhotoTry(0); }, [drum?.id]);

  const host: LiveHost = {
    lens,
    playStep: strike ? (stroke, velocity, note) => {
      const z = STROKES[stroke] ?? STROKES.tone;
      strike(defaultNote + (note ?? 0), velocity, z.pos, undefined, z.striker);
    } : undefined,
    enrich: (o: Observation) => ({ intro: drum?.intro ?? '', drum: drum?.name ?? 'drum', preset: presetName ?? String(o.data.preset ?? '') }),
    trivia: () => {
      if (!drum) return undefined;
      const pool = [...drum.origins, drum.build.shell, drum.build.head, drum.build.tuning, ...drum.traditions];
      return pool[Math.floor(Math.random() * pool.length)];
    },
    screen: () => (drum
      ? `The learner has SOMA (physical-model percussion) open on the preset "${presetName ?? presetId}", which models the ${drum.name} (${drum.region}).`
      : 'The learner has SOMA open.'),
  };

  if (!drum) return null;

  const ph = drum.photo;
  return (
    <div className="px-4 py-3 border-b border-white/[0.07] grid grid-cols-1 md:grid-cols-[200px_1fr] gap-3" style={{ background: 'rgba(232,106,51,0.04)' }}>
      <figure className="m-0 flex flex-col gap-1">
        <a href={ph.sourceUrl} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border border-white/10 bg-black/50" style={{ aspectRatio: '4 / 3' }}>
          {photoTry < 2 ? (
            <img
              key={photoTry}
              src={photoTry === 0 ? drumPhotoLocalUrl(drum.id) : drumPhotoUrl(ph, 480)}
              alt={ph.caption}
              loading="lazy"
              onError={() => setPhotoTry((t) => t + 1)}
              className="w-full h-full object-contain"
            />
          ) : (
            <span className="w-full h-full grid place-items-center text-[10px] text-white/40 px-3 text-center">Photo unavailable offline — opens on Wikimedia Commons</span>
          )}
        </a>
        <figcaption className="text-[9.5px] leading-snug text-white/45">
          {ph.caption}{' '}
          <span className="text-white/35">
            Photo: <a href={ph.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">{ph.author}</a> ·{' '}
            {ph.licenseUrl ? <a href={ph.licenseUrl} target="_blank" rel="noreferrer" className="hover:underline">{ph.license}</a> : ph.license} · Wikimedia Commons
          </span>
        </figcaption>
      </figure>

      <div className="min-w-0 flex flex-col gap-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[14px] font-bold text-white">{drum.name}</span>
          {drum.aka.length > 0 && <span className="text-[10px] text-white/45">also {drum.aka.join(' · ')}</span>}
          <span className="text-[10px] text-white/35">· {drum.region}</span>
        </div>

        {amara && <LiveAvatar sheet={amara} host={host} fallbackLine={drum.intro} role="Session Band percussion · live" onDirector={setDirector} />}

        <div className="flex flex-wrap gap-1">
          {SECTIONS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setOpen(open === id ? null : id)}
              aria-expanded={open === id}
              className="h-6 px-2 rounded-lg text-[10px] font-semibold border flex items-center gap-1 transition"
              style={open === id
                ? { background: 'rgba(232,106,51,0.22)', borderColor: ACCENT, color: '#fff' }
                : { borderColor: 'rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.6)' }}
            >
              {id === 'sources' ? <BookOpen size={10} /> : <ChevronDown size={10} style={{ transform: open === id ? 'rotate(180deg)' : undefined }} />}
              {label}
            </button>
          ))}
        </div>

        {open && (
          <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5">
            {open !== 'sources' && director && (
              <div className="flex justify-end -mt-0.5 mb-1">
                <button
                  onClick={() => void director.say(spokenText(drum, open))}
                  className="h-5 px-1.5 rounded-md text-[9.5px] flex items-center gap-1 border border-white/10 text-white/55 hover:text-white hover:bg-white/10"
                >
                  <Volume2 size={10} /> Amara reads this
                </button>
              </div>
            )}
            <SectionBody d={drum} s={open} />
          </div>
        )}
      </div>
    </div>
  );
};
