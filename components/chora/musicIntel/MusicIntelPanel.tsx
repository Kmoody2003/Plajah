// MusicIntelPanel — the Liner notes tab once Music Intelligence has listened: the creator's own
// notes first (always theirs, never rewritten), the liner notes the analysis wrote, the album
// read, and a song-by-song breakdown — feeling, words, writing (with a lead sheet and the full
// notation lens), and the mix, with the measured numbers explained in plain words.
import React, { useMemo, useState } from 'react';
import { Download, Film, Loader2, Music2, Pen, Play, RefreshCw, Sparkles } from 'lucide-react';
import { leadSheetMusicXML, type MusicIntelBundle, type TrackIntel } from '../../../services/musicIntelService';
import { AudienceSentimentAlbum, AudienceSentimentTrack, useAudienceSentiment } from './AudienceSentiment';

const SERIF = 'Newsreader, Georgia, serif';
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

interface Props {
  /** Enables Audience sentiment (what listening parties felt) — fetched for everyone, no party needed. */
  albumId?: string;
  bundle: MusicIntelBundle | null;
  loading?: boolean;
  albumTitle: string;
  artist: string;
  creatorLinerNotes?: string;
  tracks: { id: string; title?: string }[];
  currentTrackId?: string;
  isOwner: boolean;
  onRun?: (force: boolean) => void;
  onEditNotes?: () => void;
  onPlayAt?: (trackId: string, sec?: number) => void;
  onOpenScore?: (trackId: string) => void;
}

const H = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#FFB86B]">{children}</h3>
);
const Prose = ({ children, big }: { children: React.ReactNode; big?: boolean }) => (
  <p className="text-white/82 leading-relaxed whitespace-pre-line" style={{ fontFamily: SERIF, fontSize: big ? 19 : 16 }}>{children}</p>
);
const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="h-7 px-2.5 rounded-full inline-flex items-center text-[12px] text-white/75 border border-white/12 bg-white/[0.03]">{children}</span>
);
const Field = ({ label, text }: { label: string; text?: string }) => text ? (
  <div><div className="text-[12px] font-semibold text-white/50">{label}</div><p className="mt-0.5 text-[15px] text-white/80 leading-relaxed">{text}</p></div>
) : null;

const MusicIntelPanel: React.FC<Props> = ({ albumId, bundle, loading, albumTitle, artist, creatorLinerNotes, tracks, currentTrackId, isOwner, onRun, onEditNotes, onPlayAt, onOpenScore }) => {
  const job = bundle?.job;
  const audience = useAudienceSentiment(albumId);
  const reads = bundle?.tracks || {};
  const analysed = tracks.filter(t => reads[t.id]);
  const [pick, setPick] = useState<string | null>(null);
  const selectedId = pick && reads[pick] ? pick : currentTrackId && reads[currentTrackId] ? currentTrackId : analysed[0]?.id;
  const sel = selectedId ? reads[selectedId] : undefined;
  const running = !!job && ['QUEUED', 'LISTENING', 'SYNTHESIZING'].includes(job.status);
  const titleOf = (id: string) => tracks.find(t => t.id === id)?.title || reads[id]?.title || 'this song';

  return (
    <div className="space-y-10 pb-10 normal-case font-sans">
      {/* Liner notes: the artist's own words lead; the analysis' notes only exist once it listened. */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <H>Liner notes</H>
          {isOwner && onEditNotes && (
            <button type="button" onClick={onEditNotes} className="h-9 px-1 text-sm font-semibold text-white/50 hover:text-white inline-flex items-center gap-1.5"><Pen size={13} /> Edit your notes</button>
          )}
        </div>
        {creatorLinerNotes?.trim() && (
          <div>
            <div className="text-[12px] text-white/45 mb-1">From {artist}</div>
            <Prose big>{creatorLinerNotes}</Prose>
          </div>
        )}
        {job?.album?.linerNotes ? (
          <div className={creatorLinerNotes?.trim() ? 'pt-4 border-t border-white/10' : ''}>
            <div className="text-[12px] text-white/45 mb-1 inline-flex items-center gap-1.5"><Sparkles size={12} className="text-[#FF8C00]" /> Written by Music Intelligence after listening to every song</div>
            <Prose big={!creatorLinerNotes?.trim()}>{job.album.linerNotes}</Prose>
          </div>
        ) : !creatorLinerNotes?.trim() && (
          <p className="text-white/50" style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 17 }}>
            {running ? 'Music Intelligence is listening to the album — liner notes appear here when it has heard every song.'
              : loading ? 'Loading…'
              : isOwner ? 'No liner notes yet. Write your own, or let Music Intelligence listen and write them from the music.'
              : 'No liner notes yet.'}
          </p>
        )}
        {isOwner && !job && onRun && (
          <button type="button" onClick={() => onRun(false)} className="h-11 px-5 rounded-full bg-[#FF8C00] text-[#06040A] text-sm font-extrabold inline-flex items-center gap-2 hover:brightness-110"><Sparkles size={15} /> Analyze this album</button>
        )}
      </section>

      {running && (
        <div className="rounded-2xl px-4 py-3 bg-white/[0.04] border border-white/10 flex items-center gap-3 text-sm text-white/70">
          <Loader2 size={16} className="animate-spin text-[#FF8C00]" />
          {job!.progress?.note || 'Listening'} · {job!.progress?.done ?? 0} of {job!.progress?.total ?? 0} songs
        </div>
      )}

      {job?.album && (
        <section className="space-y-5">
          <H>The album</H>
          <Prose big>{job.album.overview}</Prose>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Sonic signature" text={job.album.sonicSignature} />
            <Field label="The running order" text={job.album.sequencing} />
          </div>
          {job.album.throughlines.length > 0 && (
            <div><div className="text-[12px] font-semibold text-white/50 mb-2">Throughlines</div><div className="flex flex-wrap gap-1.5">{job.album.throughlines.map(t => <Chip key={t}>{t}</Chip>)}</div></div>
          )}
          {job.album.standoutMoments.length > 0 && (
            <div className="space-y-2">
              <div className="text-[12px] font-semibold text-white/50">Moments to listen for</div>
              {job.album.standoutMoments.map((m, i) => (
                <button key={i} type="button" onClick={() => onPlayAt?.(m.trackId, m.atSec)} className="w-full text-left rounded-2xl px-4 py-3 bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] transition-colors flex gap-3">
                  <Play size={15} className="mt-1 shrink-0 text-[#FF8C00]" />
                  <span className="min-w-0"><span className="text-sm font-semibold text-white">{titleOf(m.trackId)}{typeof m.atSec === 'number' ? ` · ${fmt(m.atSec)}` : ''}</span><span className="block text-[14px] text-white/70">{m.why}</span></span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {job?.isSoundtrack && job.film && job.film.status !== 'NONE' && (
        <section className="rounded-3xl p-5 border space-y-2" style={{ background: 'linear-gradient(135deg, rgba(107,0,153,0.22), rgba(255,140,0,0.08))', borderColor: 'rgba(208,188,255,0.22)' }}>
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#D0BCFF]"><Film size={13} /> With Story Intelligence · {job.film.filmTitle}</div>
          {job.film.status === 'LINKED'
            ? <>{job.film.connection && <Prose>{job.film.connection}</Prose>}{job.film.logline && <p className="text-[14px] text-white/60">The film: {job.film.logline}</p>}</>
            : <p className="text-[14px] text-white/65">The film is still being analysed. When its story read lands, this album's read is rewritten with the film as context.</p>}
        </section>
      )}

      <AudienceSentimentAlbum data={audience} onPlayAt={onPlayAt} currentTrackId={currentTrackId} />

      {analysed.length > 0 && (
        <section className="space-y-5">
          <H>Song by song</H>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {analysed.map((t, i) => (
              <button key={t.id} type="button" onClick={() => setPick(t.id)} aria-pressed={t.id === selectedId}
                className={`h-10 px-4 shrink-0 rounded-full text-sm font-semibold border transition-colors ${t.id === selectedId ? 'bg-white text-[#06040A] border-white' : 'text-white/75 border-white/15 hover:border-white/35'}`}>
                {i + 1}. {t.title || reads[t.id].title}
              </button>
            ))}
          </div>
          {sel && <TrackRead t={sel} artist={artist} albumTitle={albumTitle} onPlayAt={onPlayAt} onOpenScore={onOpenScore} />}
          {selectedId && <AudienceSentimentTrack data={audience} trackId={selectedId} onPlayAt={onPlayAt} />}
        </section>
      )}

      {isOwner && job && !running && onRun && (
        <button type="button" onClick={() => onRun(true)} className="h-10 px-1 text-sm font-semibold text-white/45 hover:text-white inline-flex items-center gap-2"><RefreshCw size={14} /> Listen again from scratch</button>
      )}
    </div>
  );
};

// ─── One song ─────────────────────────────────────────────────────────────────

const TrackRead: React.FC<{ t: TrackIntel; artist: string; albumTitle: string; onPlayAt?: Props['onPlayAt']; onOpenScore?: Props['onOpenScore'] }> = ({ t, artist, onPlayAt, onOpenScore }) => {
  const m = t.measured;
  const downloadLeadSheet = () => {
    const xml = leadSheetMusicXML(t, artist);
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${t.title.replace(/[^\w\- ]+/g, '').trim() || 'song'} — lead sheet.musicxml`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Prose big>{t.summary}</Prose>
        <div className="flex flex-wrap gap-1.5">{[t.mood.primary, ...t.mood.secondary, ...t.genreTags].filter(Boolean).map(x => <Chip key={x}>{x}</Chip>)}</div>
      </div>

      {/* The feeling: the measured energy curve with the emotional read pinned on it. */}
      <div className="space-y-3">
        <H>The feeling</H>
        <EmotionArc t={t} onSeek={sec => onPlayAt?.(t.trackId, sec)} />
        {t.sections.length > 0 && <SectionStrip t={t} onSeek={sec => onPlayAt?.(t.trackId, sec)} />}
      </div>

      {t.lyrics.hasVocals && (t.lyrics.themes.length > 0 || t.lyrics.craft) && (
        <div className="space-y-4">
          <H>The words</H>
          {t.lyrics.themes.length > 0 && <div className="flex flex-wrap gap-1.5">{t.lyrics.themes.map(x => <Chip key={x}>{x}</Chip>)}</div>}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Who's speaking" text={t.lyrics.perspective} />
            <Field label="How the story moves" text={t.lyrics.storyArc} />
            <Field label="The craft" text={t.lyrics.craft} />
            {t.lyrics.imagery.length > 0 && <Field label="Imagery" text={t.lyrics.imagery.join(' · ')} />}
          </div>
          {t.lyrics.standoutLines.map((l, i) => (
            <blockquote key={i} className="pl-4 border-l-2 border-[#FF8C00]/60">
              <p className="text-white" style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 19 }}>“{l.line}”</p>
              <p className="mt-1 text-[14px] text-white/65">{l.why}</p>
            </blockquote>
          ))}
        </div>
      )}

      <div className="space-y-4">
        <H>The writing</H>
        <div className="grid grid-cols-3 gap-3">
          {[['Key', t.composition.key || '—'], ['Tempo', t.composition.tempoBpm ? `${Math.round(t.composition.tempoBpm)} BPM` : '—'], ['Meter', t.composition.timeSignature]].map(([k, v]) => (
            <div key={k} className="rounded-2xl px-4 py-3 bg-white/[0.04] border border-white/10">
              <div className="text-[12px] text-white/50">{k}</div>
              <div className="text-lg font-bold text-white">{v}</div>
            </div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Harmony" text={t.composition.harmony} />
          <Field label="Melody" text={t.composition.melody} />
          <Field label="Rhythm" text={t.composition.rhythm} />
          <Field label="Arrangement" text={t.composition.arrangement} />
        </div>
        {t.composition.instrumentation.length > 0 && <div className="flex flex-wrap gap-1.5">{t.composition.instrumentation.map(x => <Chip key={x}>{x}</Chip>)}</div>}
        {t.composition.chordChart.length > 0 && (
          <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/[0.08] space-y-2">
            <div className="text-[12px] font-semibold text-white/50">Chord chart (lead sheet, by ear)</div>
            {t.composition.chordChart.map((c, i) => (
              <div key={i} className="flex gap-3 items-baseline">
                <span className="w-24 shrink-0 text-[13px] text-white/55">{c.section}</span>
                <span className="font-mono text-[15px] text-white tracking-wide">{c.chords.join('  ·  ')}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {t.composition.chordChart.length > 0 && (
            <button type="button" onClick={downloadLeadSheet} className="h-11 px-4 rounded-full border border-white/25 text-sm font-semibold text-white hover:bg-white/10 inline-flex items-center gap-2"><Download size={15} /> Lead sheet (MusicXML)</button>
          )}
          {onOpenScore && (
            <button type="button" onClick={() => onOpenScore(t.trackId)} className="h-11 px-4 rounded-full border border-white/25 text-sm font-semibold text-white hover:bg-white/10 inline-flex items-center gap-2"><Music2 size={15} /> Sheet music &amp; stems</button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <H>The mix</H>
        <Prose>{t.production.overview}</Prose>
        {t.production.techniques.length > 0 && (
          <ul className="space-y-2">
            {t.production.techniques.map((x, i) => (
              <li key={i} className="rounded-2xl px-4 py-3 bg-white/[0.03] border border-white/[0.08]">
                <div className="text-sm font-semibold text-white">{x.technique}{x.where ? <span className="font-normal text-white/50"> · {x.where}</span> : null}</div>
                <div className="text-[14px] text-white/70">{x.effect}</div>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Vocals" text={t.production.vocals} />
          <Field label="Low end" text={t.production.lowEnd} />
          <Field label="Space" text={t.production.space} />
          <Field label="Dynamics" text={t.production.dynamics} />
        </div>
        {m && <Measured m={m} />}
      </div>
    </div>
  );
};

/** Energy curve (measured) as an area, with the emotional read as labelled pins on top. */
const EmotionArc: React.FC<{ t: TrackIntel; onSeek: (sec: number) => void }> = ({ t, onSeek }) => {
  const m = t.measured;
  const dur = m?.durationSec || Math.max(1, ...t.emotionalArc.map(p => p.atSec + 10));
  const W = 600, Hh = 120;
  const path = useMemo(() => {
    if (!m?.energyCurve.length) return '';
    const pts = m.energyCurve.map((v, i) => [((i * m.energyCurveStepSec) / dur) * W, Hh - 8 - v * (Hh - 24)]);
    return `M0,${Hh} ${pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} L${W},${Hh} Z`;
  }, [m, dur]);
  return (
    <div className="rounded-2xl p-3 bg-white/[0.03] border border-white/[0.08]">
      <svg viewBox={`0 0 ${W} ${Hh + 26}`} className="w-full h-auto" role="img" aria-label={`Energy and emotion across ${t.title}`}>
        <defs><linearGradient id="miArc" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#FF8C00" stopOpacity="0.55" /><stop offset="1" stopColor="#FF8C00" stopOpacity="0.04" /></linearGradient></defs>
        {path && <path d={path} fill="url(#miArc)" stroke="#FF8C00" strokeOpacity="0.8" strokeWidth="1.5" />}
        {t.emotionalArc.map((p, i) => {
          const x = Math.min(W - 4, (p.atSec / dur) * W);
          const y = Hh - 8 - p.intensity * (Hh - 24);
          const anchor = x > W - 90 ? 'end' : x < 60 ? 'start' : 'middle';
          return (
            <g key={i} className="cursor-pointer" onClick={() => onSeek(p.atSec)}>
              <title>{`${fmt(p.atSec)} · ${p.emotion}: ${p.note}`}</title>
              <line x1={x} x2={x} y1={y} y2={Hh} stroke="white" strokeOpacity="0.18" strokeDasharray="2 3" />
              <circle cx={x} cy={y} r="5" fill="#06040A" stroke="#FFD19A" strokeWidth="2" />
              <text x={x} y={Hh + 18} textAnchor={anchor} fontSize="12" fill="rgba(255,255,255,0.75)">{p.emotion}</text>
            </g>
          );
        })}
      </svg>
      {t.emotionalArc.length > 0 && (
        <ol className="mt-2 space-y-1.5">
          {t.emotionalArc.map((p, i) => (
            <li key={i} className="flex gap-3 text-[14px]">
              <button type="button" onClick={() => onSeek(p.atSec)} className="w-11 shrink-0 font-mono text-white/45 hover:text-white text-left">{fmt(p.atSec)}</button>
              <span className="text-white/75"><span className="font-semibold text-white">{p.emotion}</span> — {p.note}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

const SectionStrip: React.FC<{ t: TrackIntel; onSeek: (sec: number) => void }> = ({ t, onSeek }) => {
  const end = Math.max(t.measured?.durationSec || 0, ...t.sections.map(s => s.endSec)) || 1;
  return (
    <div>
      <div className="flex h-9 rounded-xl overflow-hidden border border-white/10">
        {t.sections.map((s, i) => (
          <button key={i} type="button" onClick={() => onSeek(s.startSec)} title={`${s.label} · ${fmt(s.startSec)} — ${s.description}`}
            className="h-full px-1.5 text-[11px] font-semibold text-white/85 truncate border-r border-[#06040A]/60 hover:brightness-125"
            style={{ width: `${(100 * Math.max(1, s.endSec - s.startSec)) / end}%`, background: /chorus|drop|hook/i.test(s.label) ? 'rgba(255,140,0,0.45)' : /bridge|break/i.test(s.label) ? 'rgba(208,188,255,0.35)' : 'rgba(255,255,255,0.10)' }}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
};

/** The DSP numbers, each with a plain-words reading. */
const Measured: React.FC<{ m: NonNullable<TrackIntel['measured']> }> = ({ m }) => {
  const sb = m.spectralBalance;
  const bands: [string, number][] = [['Sub', sb.sub], ['Low', sb.low], ['Low-mid', sb.lowMid], ['High-mid', sb.highMid], ['Presence', sb.presence], ['Air', sb.air]];
  const maxBand = Math.max(...bands.map(b => b[1]), 1);
  const tiles: [string, string, string][] = [
    ['Loudness', m.integratedLufs != null ? `${m.integratedLufs} LUFS` : '—', m.integratedLufs == null ? '' : m.integratedLufs > -9 ? 'Mastered loud and dense' : m.integratedLufs > -14 ? 'Streaming-level loudness' : 'Mastered with headroom to breathe'],
    ['Dynamic range', `${m.loudnessRangeLu} LU`, m.loudnessRangeLu < 4 ? 'Steady, consistent level' : m.loudnessRangeLu < 9 ? 'Moves between quieter and fuller parts' : 'Wide swings from hush to full'],
    ['Peaks', `${m.samplePeakDbfs} dBFS`, m.crestFactorDb != null ? `${m.crestFactorDb} dB crest — ${m.crestFactorDb < 8 ? 'tightly controlled transients' : m.crestFactorDb < 13 ? 'punch kept in the transients' : 'very open, natural transients'}` : ''],
    ['Stereo', m.stereo ? `${Math.round(m.stereo.width * 100)}% width` : 'Mono', m.stereo ? (m.stereo.width < 0.15 ? 'Centred, focused image' : m.stereo.width < 0.45 ? 'Balanced spread' : 'Wide, enveloping image') : ''],
  ];
  return (
    <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/[0.08] space-y-4">
      <div className="text-[12px] font-semibold text-white/50">Measured from the file</div>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map(([k, v, note]) => (
          <div key={k}><div className="text-[12px] text-white/50">{k}</div><div className="text-base font-bold text-white">{v}</div>{note && <div className="text-[13px] text-white/60">{note}</div>}</div>
        ))}
      </div>
      <div>
        <div className="text-[12px] text-white/50 mb-2">Where the energy sits</div>
        <div className="flex items-end gap-2 h-20">
          {bands.map(([k, v]) => (
            <div key={k} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              <div className="w-full rounded-t-md bg-[#FF8C00]/70" style={{ height: `${Math.max(3, (v / maxBand) * 100)}%` }} title={`${v}%`} />
              <span className="text-[11px] text-white/55">{k}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MusicIntelPanel;
