import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Volume2, ExternalLink, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { WC26Team } from '../data/worldCup2026';
import { fetchAnthemData, AnthemData } from '../services/anthemService';

interface Props {
  team: WC26Team;
}

const AnthemPlayer: React.FC<Props> = ({ team }) => {
  const [anthem, setAnthem] = useState<AnthemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);   // 0–1
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef   = useRef<number>(0);

  // Load anthem data
  useEffect(() => {
    setLoading(true);
    setPlaying(false);
    setProgress(0);
    setAudioError(false);

    fetchAnthemData(team.id)
      .then(data => {
        setAnthem(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [team.id]);

  // Wire up audio element whenever the URL changes
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !anthem?.audioUrl) return;

    el.src = anthem.audioUrl;
    el.load();

    const onMeta = () => setDuration(el.duration || 0);
    const onEnded = () => { setPlaying(false); setProgress(0); setCurrentTime(0); };
    const onError = () => { setAudioError(true); setPlaying(false); };

    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);

    return () => {
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
      cancelAnimationFrame(rafRef.current);
    };
  }, [anthem?.audioUrl]);

  // RAF progress ticker
  const tickProgress = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    const ct = el.currentTime;
    const dur = el.duration || 1;
    setCurrentTime(ct);
    setProgress(ct / dur);
    if (!el.paused) rafRef.current = requestAnimationFrame(tickProgress);
  }, []);

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el || !anthem?.audioUrl || audioError) return;

    if (playing) {
      el.pause();
      cancelAnimationFrame(rafRef.current);
      setPlaying(false);
    } else {
      try {
        await el.play();
        setPlaying(true);
        rafRef.current = requestAnimationFrame(tickProgress);
      } catch {
        setAudioError(true);
      }
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !anthem?.audioUrl || audioError) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    el.currentTime = ratio * (el.duration || 0);
    setProgress(ratio);
  };

  const fmtTime = (s: number) => {
    if (!s || !isFinite(s)) return '–:––';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const hasAudio = Boolean(anthem?.audioUrl) && !audioError;
  const hasLyrics = Boolean(anthem?.lyrics);

  return (
    <div
      className="rounded-3xl overflow-hidden border border-white/10"
      style={{ background: `linear-gradient(145deg, ${team.primaryColor}22 0%, ${team.secondaryColor}14 100%)` }}
    >
      {/* Hidden audio element */}
      <audio ref={audioRef} preload="metadata" />

      {/* Top banner */}
      <div className="relative px-6 pt-6 pb-4">
        <span className="absolute right-6 top-6 text-7xl leading-none opacity-15 select-none pointer-events-none">
          {team.flag}
        </span>
        <p className="text-[7px] font-black uppercase tracking-[0.5em] text-white/35 mb-1.5">National Anthem</p>
        {loading ? (
          <div className="flex items-center gap-2 py-2">
            <Loader2 size={14} className="text-white/30 animate-spin" />
            <span className="text-xs text-white/30">Loading…</span>
          </div>
        ) : (
          <h3 className="text-lg font-black text-white leading-snug pr-16">
            {anthem?.anthemTitle ?? team.anthem}
          </h3>
        )}
        <p className="text-[9px] text-white/35 mt-0.5">{team.name}</p>
      </div>

      {!loading && (
        <div className="px-6 pb-5 space-y-3">
          {/* Progress bar */}
          <div
            className={`relative h-1.5 rounded-full bg-white/10 ${hasAudio ? 'cursor-pointer' : 'opacity-30'}`}
            onClick={hasAudio ? seek : undefined}
          >
            <div
              className="absolute left-0 top-0 h-full rounded-full transition-none"
              style={{ width: `${progress * 100}%`, background: team.primaryColor }}
            />
          </div>

          {/* Play button + time */}
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlay}
              disabled={!hasAudio}
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-all active:scale-95 disabled:opacity-30"
              style={{ background: team.primaryColor }}
              title={playing ? 'Pause' : 'Play national anthem'}
            >
              {playing
                ? <Pause size={16} className="text-white" fill="white" />
                : <Play  size={16} className="text-white" fill="white" style={{ transform: 'translateX(1px)' }} />
              }
            </button>

            <div className="flex-1">
              {hasAudio ? (
                <div className="flex items-center justify-between text-[8px] font-bold text-white/30">
                  <span>{fmtTime(currentTime)}</span>
                  <div className="flex items-center gap-1 text-white/20">
                    <Volume2 size={8} />
                    <span>nationalanthems.info · CC BY 4.0</span>
                  </div>
                  <span>{fmtTime(duration)}</span>
                </div>
              ) : (
                <p className="text-[9px] text-white/25">
                  {audioError ? 'Audio unavailable' : 'No audio for this anthem'}
                </p>
              )}
            </div>
          </div>

          {/* Description */}
          {anthem?.extract && (
            <p className="text-[9px] text-white/35 leading-relaxed line-clamp-3">{anthem.extract}</p>
          )}

          {/* Lyrics toggle */}
          {hasLyrics && (
            <div>
              <button
                onClick={() => setShowLyrics(v => !v)}
                className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-wider text-white/40 hover:text-white/70 transition-colors"
              >
                {showLyrics ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                {showLyrics ? 'Hide Lyrics' : 'Show Lyrics'}
              </button>

              {showLyrics && (
                <div
                  className="mt-2 max-h-72 overflow-y-auto rounded-2xl p-4 text-[9px] leading-relaxed text-white/50 whitespace-pre-wrap font-mono"
                  style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  {anthem!.lyrics}
                </div>
              )}
            </div>
          )}

          {/* Wikipedia link */}
          {anthem?.wikiUrl && (
            <div className="pt-1">
              <a
                href={anthem.wikiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-wider text-white/50 hover:text-white border border-white/10 hover:border-white/25 transition-all"
              >
                <ExternalLink size={8} />
                Wikipedia
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AnthemPlayer;
