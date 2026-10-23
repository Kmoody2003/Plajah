// Dev lab for Chora Music Intelligence — the album hero's Share button, the On-air host rail and the
// Liner notes panel, fed a fixture bundle whose measured block comes from the real DSP (dsp.ts) run
// on a synthesized song. npx vite --config music-intel-lab.vite.config.mjs
//   → http://127.0.0.1:3148/music-intel-lab.html?state=ready | running | none   (&owner=1)
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../../index.css';
import CinemaProsceniumHero from '../../CinemaProsceniumHero';
import MusicIntelRail from '../MusicIntelRail';
import MusicIntelPanel from '../MusicIntelPanel';
import { measureAudio } from '../../../../services/musicIntel/dsp';
import { normalizeTrackIntel } from '../../../../services/musicIntel/prompts';
import type { MusicIntelBundle } from '../../../../services/musicIntel/types';
import { Heart, Users } from 'lucide-react';

const FS = 22050;
function synthSong(sec: number, bpm: number): Float32Array {
  const n = sec * FS, pcm = new Float32Array(n * 2), beat = Math.round((60 / bpm) * FS);
  for (let i = 0; i < n; i++) {
    const t = i / FS, swell = 0.35 + 0.65 * Math.max(0, Math.sin((Math.PI * t) / sec * 2.2));
    const chord = Math.floor(t / 8) % 4, roots = [220, 174.61, 261.63, 196][chord];
    let v = (Math.sin(2 * Math.PI * roots * t) + 0.6 * Math.sin(2 * Math.PI * roots * 1.26 * t) + 0.5 * Math.sin(2 * Math.PI * roots * 1.5 * t)) * 0.08 * swell;
    const k = i % beat;
    if (k < 700) v += Math.sin((2 * Math.PI * 55 * k) / FS) * Math.exp(-k / 140) * 0.5 * swell;
    pcm[i * 2] = v + Math.sin(2 * Math.PI * 880 * t) * 0.01;
    pcm[i * 2 + 1] = v * 0.86 - Math.sin(2 * Math.PI * 880 * t) * 0.01;
  }
  return pcm;
}

const LYRICS = `I folded the night into a paper moon
Hung it where the streetlight used to be
You said nothing burns as slow as June
And I believed you, I believed`;

function fixture(state: string): MusicIntelBundle & { stalled?: boolean } {
  if (state === 'none') return { job: null, tracks: {} };
  const measured = measureAudio(synthSong(64, 96), FS, 2);
  const t1 = normalizeTrackIntel({
    summary: 'A slow-burning opener that builds a whole room out of four chords and one patient vocal — it asks you to lean in before it ever raises its voice.',
    genreTags: ['indie folk', 'dream pop', 'slowcore'],
    mood: { primary: 'tender', secondary: ['wistful', 'hopeful'], valence: 0.45, arousal: 0.35 },
    emotionalArc: [
      { atSec: 2, emotion: 'hush', intensity: 0.3, note: 'Just the pulse and a low chord — the song clears its throat.' },
      { atSec: 18, emotion: 'longing', intensity: 0.55, note: 'The voice enters close-mic’d, almost spoken.' },
      { atSec: 34, emotion: 'swell', intensity: 0.85, note: 'Everything opens up as the chorus lands on the F.' },
      { atSec: 52, emotion: 'release', intensity: 0.4, note: 'It falls away to the pulse again, unresolved on purpose.' },
    ],
    sections: [
      { startSec: 0, endSec: 16, label: 'Intro', description: 'Kick pulse and pad' },
      { startSec: 16, endSec: 32, label: 'Verse', description: 'Vocal enters' },
      { startSec: 32, endSec: 48, label: 'Chorus', description: 'Full band swell' },
      { startSec: 48, endSec: 64, label: 'Outro', description: 'Back to the pulse' },
    ],
    lyrics: {
      hasVocals: true, themes: ['memory', 'making light from nothing', 'trust'], imagery: ['paper moon', 'streetlight', 'June'],
      perspective: 'First person, speaking to someone who isn’t there anymore', storyArc: 'From making something to replace a missing light, to admitting what was believed.',
      craft: 'Long vowels sit on the downbeat (“moon”, “June”), and the last line repeats “I believed” so the song ends on the feeling rather than the rhyme.',
      standoutLines: [{ line: 'I folded the night into a paper moon', why: 'The whole album’s image in one line — handmade light.' }],
    },
    composition: {
      key: measured.key.key, tempoBpm: measured.tempo.bpm, timeSignature: '4/4',
      harmony: 'A four-chord loop that never quite resolves home, so the song stays suspended.',
      melody: 'Stepwise and low in the verse, leaping a sixth into the chorus.',
      rhythm: 'A steady heartbeat kick; the vocal phrases float across the bar lines.',
      arrangement: 'Pad and pulse first, voice at 0:16, the full swell at 0:32, then everything but the pulse leaves.',
      instrumentation: ['kick drum', 'synth pad', 'lead vocal', 'reverb guitar'],
      chordChart: [{ section: 'Verse', chords: ['Am', 'F', 'C', 'G'] }, { section: 'Chorus', chords: ['F', 'C', 'G', 'Am'] }],
    },
    production: {
      overview: 'An intimate mix: the vocal is dry and forward while the pad blooms behind it, so it feels like being in the room and in the dream at once.',
      techniques: [
        { technique: 'Close-mic’d, dry vocal', where: 'Verse', effect: 'Puts the singer right at your ear.' },
        { technique: 'Long plate reverb on the pad', where: '0:32', effect: 'Makes the chorus feel like the room got bigger.' },
      ],
      vocals: 'Centred, lightly compressed, with breaths left in.', lowEnd: 'A round, short kick carries the low end on its own.',
      space: 'Pad spread wide, voice and kick in the middle.', dynamics: 'The loudness range lets the chorus genuinely rise.',
    },
    hostCards: [
      { kind: 'intro', title: 'Before the first word', text: 'Listen to how long this song waits before anyone sings. That heartbeat kick is doing all the talking — and it’s telling you to slow down.', atSec: 0 },
      { kind: 'lyric', title: 'The paper moon', text: 'There it is — “I folded the night into a paper moon.” That’s the thesis for the whole record: when the light goes out, you make your own.', atSec: 17 },
      { kind: 'composition', title: 'Four chords, never home', text: 'The loop keeps circling without landing on its home chord, which is why it feels like a held breath.', atSec: 26 },
      { kind: 'mix', title: 'The room gets bigger', text: 'Right here the pad gets a long plate reverb and spreads wide — same four chords, but now it sounds like a cathedral.', atSec: 33 },
      { kind: 'emotion', title: 'Letting it go', text: 'And it falls away. No big ending — just the pulse again, which feels honest for a song about memory.', atSec: 50 },
    ],
    linerNote: 'The opener is the record’s mission statement.',
  }, { trackId: 't1', title: 'Paper Moon', version: 1, analyzedAt: Date.now(), sourceUrl: 'x', measured }, LYRICS);

  const running = state === 'running';
  return {
    job: {
      albumId: 'lab', ownerId: 'u', status: running ? 'LISTENING' : 'READY', isSoundtrack: true, version: 1, createdAt: 0, updatedAt: Date.now(),
      progress: running ? { done: 1, total: 6, note: 'Listening to “Streetlight”' } : { done: 6, total: 6 },
      film: { status: 'LINKED', filmAlbumId: 'f', filmTitle: 'Paper Moon', logline: 'A night-shift artist rebuilds her late father’s planetarium out of paper.', connection: 'The score keeps returning to the same four chords the way the film keeps returning to the planetarium — the music is the thing she is building.' },
      album: running ? undefined : {
        overview: 'Paper Moon is a record about making light by hand. Across six songs it trades volume for closeness, and lets small sounds — a breath, a kick drum — carry the weight.',
        sonicSignature: 'Dry, close vocals over wide, blooming pads; a heartbeat kick in place of a drum kit.',
        sequencing: 'It opens at 96 BPM and never rushes; the middle songs drift into F, and the closer comes home to A minor.',
        throughlines: ['handmade light', 'the moon as memory', 'waiting before speaking'],
        standoutMoments: [{ trackId: 't1', atSec: 33, why: 'The first time the record opens all the way up.' }],
        linerNotes: 'There is a patience to Paper Moon that is rare. Ada lets songs wait — for the voice, for the chorus, for the feeling to arrive on its own.\n\nThe opener says it plainly: when the light goes out, you fold the night into something that glows.',
        hostCards: [{ kind: 'intro', title: 'Welcome in', text: 'Tonight, a record that whispers. Turn it up a little — it’s worth it.' }],
      },
    },
    tracks: { t1 },
  };
}

const TRACKS = [{ id: 't1', title: 'Paper Moon' }, { id: 't2', title: 'Streetlight' }, { id: 't3', title: 'June' }];

const Lab: React.FC = () => {
  const q = new URLSearchParams(location.search);
  const state = q.get('state') || 'ready';
  const owner = q.get('owner') === '1';
  const bundle = useMemo(() => fixture(state), [state]);
  const [time, setTime] = useState(20);
  const [shared, setShared] = useState(0);
  if (q.get('layout') === 'phone') return (
    <div className="min-h-screen text-white px-4 py-4 space-y-6" style={{ background: '#06040A', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <MusicIntelRail bundle={bundle} trackId="t1" trackTitle="Paper Moon" currentTime={time} playingHere onSeek={setTime} isOwner={owner} onRun={() => {}} />
      <MusicIntelPanel bundle={bundle} albumTitle="Paper Moon" artist="Ada" tracks={TRACKS} currentTrackId="t1" isOwner={owner}
        onRun={() => {}} onEditNotes={() => {}} onPlayAt={(id, s) => s != null && setTime(s)} onOpenScore={() => {}} />
    </div>
  );
  return (
    <div className="min-h-screen text-white" style={{ background: '#06040A', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <CinemaProsceniumHero
        stage="ART" stages={[{ id: 'ART', label: 'Art' }]} onStage={() => {}}
        backdropSrc="https://images.unsplash.com/photo-1532767153582-b1a0e5145009?w=1600"
        medallion={<div className="w-full h-full" style={{ background: 'radial-gradient(circle at 35% 35%, #ffe7b8, #d08a2c 45%, #2b1640)' }} />}
        eyebrow="An album on Chora" title="Paper Moon" artist="Ada" meta={['2026', '6 songs, 31 min', 'Indie folk']}
        isPlaying={false} onPlay={() => {}} onShuffle={() => {}} onAddToPlaylist={() => {}}
        reaction={<Heart size={19} />} onShare={() => setShared(n => n + 1)}
        menu={[[]]} onBack={() => {}}
      />
      {shared > 0 && <div data-testid="shared" className="px-12 pt-2 text-sm text-[#FFB86B]">Share dialog opened ×{shared}</div>}
      <div className="grid gap-12 px-12 pt-3 pb-16" style={{ gridTemplateColumns: 'minmax(0, 1fr) 400px' }}>
        <div className="min-w-0 pt-4">
          <MusicIntelPanel bundle={bundle} albumTitle="Paper Moon" artist="Ada" tracks={TRACKS} currentTrackId="t1" isOwner={owner}
            onRun={() => {}} onEditNotes={() => {}} onPlayAt={(id, s) => s != null && setTime(s)} onOpenScore={() => alert('notation lens')} />
        </div>
        <aside className="flex flex-col gap-4 pt-4">
          <div className="rounded-3xl px-6 py-5 bg-white/[0.04] border border-white/10">
            <div className="flex justify-between text-[13px] font-semibold text-white/70"><span>Now playing · Paper Moon</span><span className="font-mono text-xs">{Math.floor(time / 60)}:{String(Math.floor(time % 60)).padStart(2, '0')}</span></div>
            <input aria-label="Playhead" type="range" min={0} max={64} value={time} onChange={e => setTime(Number(e.target.value))} className="w-full mt-3 accent-[#FF8C00]" />
            <p className="mt-2 text-white/55" style={{ fontFamily: 'Newsreader, Georgia, serif', fontStyle: 'italic', fontSize: 17 }}>Lyrics follow along as it plays.</p>
          </div>
          <MusicIntelRail bundle={bundle} trackId="t1" trackTitle="Paper Moon" currentTime={time} playingHere onSeek={setTime} isOwner={owner} onRun={() => {}} onOpenBreakdown={() => {}} />
          <div className="rounded-3xl px-5 py-4 flex items-center gap-4 border" style={{ background: 'linear-gradient(135deg, rgba(107,0,153,0.32), rgba(212,0,85,0.16))', borderColor: 'rgba(208,188,255,0.22)' }}>
            <Users size={20} className="shrink-0 text-[#D0BCFF]" />
            <p className="flex-1 text-sm text-white/85">Start a listening party — everyone hears it in sync.</p>
          </div>
        </aside>
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<Lab />);
