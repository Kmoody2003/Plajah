// SOMA — the drum behind the preset: a credited photo of the real instrument, the Session Band's
// percussionist (Amara) introducing it, and the history / build / technique / traditions she can open
// up, with the sources. Content lives in services/melos/instruments/soma/drumKnowledge.ts.

import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ExternalLink, Square, Volume2 } from 'lucide-react';
import { drumForPreset, drumPhotoLocalUrl, drumPhotoUrl, type DrumKnowledge } from '../../../../services/melos/instruments/soma/drumKnowledge';
import { playerById } from '../../../../services/melos/beats/band/roster';
import { BandAvatar } from '../band/BandAvatar';
import { ariaVoice } from '../../../../services/voice/aria/ariaVoice';
import type { VoiceProfile } from '../../../../services/voice/aria/types';

const ACCENT = '#E86A33';

// Amara's voice: on-device only (Kokoro, else the system voice) — talking about a drum never calls a cloud TTS.
const AMARA_VOICE: VoiceProfile = {
  id: 'band-amara', name: 'Amara', persona: 'narrator', rate: 0.98, pitch: 1.0, onDeviceOnly: true,
  providerPrefs: { kokoro: { voice: 'af_kore' }, webSpeech: {} }, fallbackOrder: ['kokoro', 'webSpeech'],
};

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

export const SomaDrumStory: React.FC<{ presetId?: string }> = ({ presetId }) => {
  const drum = drumForPreset(presetId);
  const amara = playerById('amara');
  const [open, setOpen] = useState<Section | null>(null);
  const [speaking, setSpeaking] = useState<Section | 'intro' | null>(null);
  // 0 = bundled copy, 1 = Commons, 2 = neither loaded.
  const [photoTry, setPhotoTry] = useState(0);
  const speakRun = useRef(0);
  const talking = useRef(false);
  const prevProfile = useRef<VoiceProfile | null>(null);

  const stop = () => {
    speakRun.current++;
    if (talking.current) {
      ariaVoice.cancel();
      if (prevProfile.current) ariaVoice.setProfile(prevProfile.current);
    }
    talking.current = false;
    setSpeaking(null);
  };
  // A new drum (or leaving the panel) stops Amara mid-sentence.
  useEffect(() => { setPhotoTry(0); stop(); }, [drum?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (talking.current) stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!drum) return null;

  const speak = async (s: Section | 'intro') => {
    if (speaking === s) { stop(); return; }
    const run = ++speakRun.current;
    // Borrow the shared voice for Amara and hand it back as it was — only the latest run restores it.
    if (ariaVoice.getProfile().id !== AMARA_VOICE.id) prevProfile.current = ariaVoice.getProfile();
    ariaVoice.setProfile(AMARA_VOICE);
    setSpeaking(s);
    talking.current = true;
    try { await ariaVoice.speak(spokenText(drum, s)); }
    finally {
      if (run === speakRun.current) {
        if (prevProfile.current) ariaVoice.setProfile(prevProfile.current);
        talking.current = false;
        setSpeaking(null);
      }
    }
  };

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

        <div className="flex gap-2.5 items-start">
          {amara && <BandAvatar player={amara} size={36} lit={speaking !== null} />}
          <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm border border-white/10 bg-black/35 px-3 py-2">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span className="text-[10px] font-semibold" style={{ color: amara?.color ?? ACCENT }}>
                {amara ? `${amara.name} · Session Band percussion` : 'Session Band percussion'}
              </span>
              <button
                onClick={() => speak('intro')}
                className="h-5 px-1.5 rounded-md text-[9.5px] flex items-center gap-1 border border-white/10 text-white/60 hover:text-white hover:bg-white/10"
                title={speaking === 'intro' ? 'Stop' : 'Hear Amara say it (on-device voice)'}
              >
                {speaking === 'intro' ? <Square size={9} /> : <Volume2 size={10} />} {speaking === 'intro' ? 'Stop' : 'Listen'}
              </button>
            </div>
            <p className="text-[11.5px] leading-relaxed text-white/85 m-0">{drum.intro}</p>
          </div>
        </div>

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
            {open !== 'sources' && (
              <div className="flex justify-end -mt-0.5 mb-1">
                <button
                  onClick={() => speak(open)}
                  className="h-5 px-1.5 rounded-md text-[9.5px] flex items-center gap-1 border border-white/10 text-white/55 hover:text-white hover:bg-white/10"
                >
                  {speaking === open ? <Square size={9} /> : <Volume2 size={10} />} {speaking === open ? 'Stop' : 'Amara reads this'}
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
