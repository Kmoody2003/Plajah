import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ArchiveTrack, enrichInterviewTrack, fetchAndParseLocTranscript } from '../services/archiveContentService';
import { Album, Track } from '../types';
import { useGlobalPlayerState, useGlobalPlayerProgress } from '../contexts/GlobalPlayerContext';
import {
  ArrowLeft, Play, Pause, RotateCcw, FastForward, Rewind, Maximize2, Minimize2,
  Globe, Clock, Sparkles, BookOpen, Share2, Layers, Volume2, Search, X, Check,
  ChevronRight, ChevronLeft, FileText, Image as ImageIcon, Headphones, Info, ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { thumb, onThumbError, THUMB } from '../src/lib/imageThumb';

export interface VaultInterviewViewProps {
  track: ArchiveTrack;
  album?: Album | null;
  onBack: () => void;
  onNavigate?: (view: string) => void;
}

export const VaultInterviewView: React.FC<VaultInterviewViewProps> = ({
  track: initialTrack,
  album,
  onBack,
  onNavigate,
}) => {
  // Ensure track is enriched with full oral history metadata
  const track = useMemo(() => {
    return initialTrack.whyItExists ? initialTrack : enrichInterviewTrack(initialTrack);
  }, [initialTrack]);

  const [liveTranscript, setLiveTranscript] = useState(track.transcript || []);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);

  // Dynamically load authentic Library of Congress XML transcript if available
  useEffect(() => {
    setLiveTranscript(track.transcript || []);
    if (track.fulltextUrl && (!track.transcript || track.transcript.length <= 4)) {
      setIsLoadingTranscript(true);
      fetchAndParseLocTranscript(track.fulltextUrl)
        .then(lines => {
          if (lines && lines.length > 0) {
            setLiveTranscript(lines);
          }
        })
        .finally(() => setIsLoadingTranscript(false));
    }
  }, [track.id, track.fulltextUrl]);

  const {
    currentTrack,
    isPlaying: globalIsPlaying,
    playTrack,
    pause,
    resume,
    togglePlay,
    analyser,
    playbackRate,
    setPlaybackRate,
    skipSeconds,
  } = useGlobalPlayerState();

  const { currentTime, duration, seek } = useGlobalPlayerProgress();

  const isCurrentPlaying = currentTrack?.id === track.id || currentTrack?.url === track.url;
  const isPlaying = isCurrentPlaying && globalIsPlaying;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<{ title: string; url: string; type: string } | null>(null);
  const [selectedLang, setSelectedLang] = useState<'ORIGINAL' | 'es' | 'fr' | 'yo'>('ORIGINAL');
  const [activeTimelineIdx, setActiveTimelineIdx] = useState<number>(() => {
    const act = (track.timeline || []).findIndex(t => t.active);
    return act >= 0 ? act : 3;
  });

  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Start playback if not already active
  const handlePlayRecording = () => {
    if (isCurrentPlaying) {
      togglePlay();
    } else {
      const activeLines = liveTranscript.length > 0 ? liveTranscript : (track.transcript || []);
      const formattedLyrics = activeLines.map(l => {
        const m = Math.floor(l.time / 60);
        const s = Math.floor(l.time % 60);
        return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.00] ${l.speaker}: ${l.text}`;
      }).join('\n');

      const vTrack: Track = {
        id: track.id,
        title: track.title,
        artist: track.artist,
        url: track.url,
        albumCover: track.thumbnailUrl,
        images: [track.thumbnailUrl],
        genre: 'Interview',
        kind: 'INTERVIEW',
        isGlobalArchive: true,
        lyrics: formattedLyrics,
      };
      const vAlbum: Album = album || {
        id: `vault_interview_${track.id}`,
        title: track.title,
        artist: track.artist,
        coverImage: track.thumbnailUrl,
        tracks: [vTrack],
        createdAt: Date.now(),
        themeColor: '#ff8c00',
        type: 'BOOK',
        subType: 'AUDIOBOOK',
        genre: 'Interview',
      };
      playTrack(vTrack, vAlbum, 'LIBRARY');
    }
  };

  // Find active transcript line based on currentTime (prioritizing authentic live transcript)
  const transcriptLines = liveTranscript.length > 0 ? liveTranscript : (track.transcript || []);
  const activeLineIdx = useMemo(() => {
    if (!isCurrentPlaying || !transcriptLines.length) return 0;
    for (let i = transcriptLines.length - 1; i >= 0; i--) {
      if (currentTime >= transcriptLines[i].time) return i;
    }
    return 0;
  }, [currentTime, isCurrentPlaying, transcriptLines]);

  // Auto-scroll teleprompter transcript
  useEffect(() => {
    if (!transcriptScrollRef.current) return;
    const activeEl = transcriptScrollRef.current.querySelector(`[data-line-idx="${activeLineIdx}"]`) as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeLineIdx]);

  // Audio-reactive voice visualizer canvas (amber to magenta to purple wave)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const bufferLength = analyser?.frequencyBinCount || 256;
    const dataArray = new Uint8Array(bufferLength);
    let phase = 0;

    const render = () => {
      animId = requestAnimationFrame(render);
      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(dataArray);
      }

      const width = (canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1));
      const height = (canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1));
      ctx.clearRect(0, 0, width, height);

      // Average voice energy
      let sum = 0;
      for (let i = 0; i < 40; i++) sum += dataArray[i] || 0;
      const avg = sum / 40;
      const energy = isPlaying ? Math.max(0.15, avg / 180) : 0.08;

      phase += isPlaying ? 0.04 : 0.015;

      // Draw 3 layered gradient waves
      const waves = [
        { color: 'rgba(255, 140, 0, 0.7)', speed: 1, amp: 28 * energy, freq: 0.008, offset: 0 },
        { color: 'rgba(212, 0, 85, 0.55)', speed: 0.7, amp: 38 * energy, freq: 0.006, offset: 2 },
        { color: 'rgba(107, 0, 153, 0.45)', speed: 0.5, amp: 48 * energy, freq: 0.004, offset: 4 },
      ];

      waves.forEach(w => {
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        for (let x = 0; x < width; x += 3) {
          const y =
            height / 2 +
            Math.sin(x * w.freq + phase * w.speed + w.offset) *
              w.amp *
              Math.sin((x / width) * Math.PI); // Pin to ends
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = w.color;
        ctx.lineWidth = 3.5;
        ctx.shadowColor = w.color;
        ctx.shadowBlur = 14;
        ctx.stroke();
      });
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [analyser, isPlaying]);

  // Speed rate cycle options
  const speeds = [0.75, 1, 1.25, 1.5, 2];
  const cycleSpeed = () => {
    const curr = playbackRate || 1;
    const idx = speeds.indexOf(curr);
    const nextSpeed = speeds[(idx + 1) % speeds.length];
    setPlaybackRate(nextSpeed);
  };

  const recordingDetails = track.recordingDetails || {
    date: track.year || '1935',
    location: 'Southern United States',
    interviewer: 'Library of Congress Field Worker',
    equipment: 'Instantaneous Disc Recorder (Aluminum/Acetate)',
    collection: track.collection || 'American Folklife Center',
    accessionNo: (track.id.replace(/^loc-/, '') || 'AFS-00342A').toUpperCase(),
  };

  const timeline = track.timeline || [];
  const artifacts = track.companionArtifacts || [];

  return (
    <div className={`min-h-screen text-white bg-[#06040A] selection:bg-[#00DAF3]/30 ${isFullscreen ? 'fixed inset-0 z-[1100] overflow-y-auto p-4 sm:p-8' : 'px-4 sm:px-8 py-6'}`}>
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── TOP NAV BAR ── */}
        <div className="flex items-center justify-between gap-4 pb-2 border-b border-white/10">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest"
          >
            <ArrowLeft size={14} /> The Vault Interviews
          </button>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-block text-[9px] font-mono text-white/40 uppercase tracking-widest">
              Catalog Ref: {recordingDetails.accessionNo}
            </span>

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                isFullscreen
                  ? 'bg-small-orange text-black font-black shadow-lg'
                  : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10'
              }`}
            >
              {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              <span>{isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen Pavilion'}</span>
            </button>
          </div>
        </div>

        {/* ── 1. THE GATEFOLD MUSEUM HEADER ── */}
        <section className="relative rounded-[2.5rem] overflow-hidden border border-white/10 bg-[#140D20]/90 backdrop-blur-3xl shadow-[0_12px_48px_rgba(0,0,0,0.6)] p-6 sm:p-8">
          {/* Plajah Ambient Brand Glow */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[#6B0099]/30 to-[#D40055]/20 blur-[100px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#FF8C00]/15 blur-[100px] pointer-events-none" />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            
            {/* Left: Archival Portrait & Provenance Badge */}
            <div className="lg:col-span-4 flex flex-col items-center sm:items-start">
              <div className="relative w-full aspect-square max-w-[280px] rounded-3xl overflow-hidden border border-white/15 shadow-2xl group bg-black/40">
                <img
                  src={thumb(track.thumbnailUrl, THUMB.large) || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&q=80'}
                  onError={onThumbError(track.thumbnailUrl)}
                  alt={track.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                
                {/* Amber Provenance Tag */}
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-black/70 backdrop-blur-md border border-[#FF8C00]/40 shadow-lg">
                  <span className="text-[8px] font-black uppercase tracking-widest text-[#FF8C00] truncate">
                    {track.source === 'LIBRARY_OF_CONGRESS' ? 'Library of Congress' : 'The Vault Archive'}
                  </span>
                  <span className="text-[8px] font-mono text-white/70">
                    {recordingDetails.date}
                  </span>
                </div>
              </div>
              <h1 className="text-xl sm:text-2xl font-black italic tracking-tight text-white mt-4 text-center sm:text-left leading-tight">
                {track.title}
              </h1>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] bg-gradient-to-r from-[#FF8C00] via-[#D40055] to-[#6B0099] bg-clip-text text-transparent mt-1">
                {track.artist}
              </p>
            </div>

            {/* Center: Chronological History Timeline Ribbon */}
            <div className="lg:col-span-5 flex flex-col justify-center space-y-4 px-2">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 flex items-center gap-1.5">
                  <Clock size={11} className="text-[#FF8C00]" /> Plajah Chronological History Timeline
                </span>
                <span className="text-[8px] font-mono text-cyan-300 uppercase">
                  Active Epoch: {timeline[activeTimelineIdx]?.year || recordingDetails.date}
                </span>
              </div>

              {/* Connected Timeline Nodes */}
              <div className="relative py-4">
                {/* Horizontal Connector Line */}
                <div className="absolute top-1/2 left-4 right-4 h-[2px] -translate-y-1/2 bg-gradient-to-r from-[#FF8C00] via-[#D40055] to-[#00DAF3] rounded-full opacity-60" />

                <div className="relative flex items-center justify-between gap-2">
                  {timeline.map((node, i) => {
                    const isSelected = activeTimelineIdx === i;
                    return (
                      <button
                        key={i}
                        onClick={() => setActiveTimelineIdx(i)}
                        className="group flex flex-col items-center focus:outline-none transition-transform hover:scale-110"
                      >
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                            isSelected
                              ? 'bg-white ring-4 ring-[#FF8C00]/40 shadow-[0_0_16px_#FF8C00]'
                              : 'bg-[#140D20] border-2 border-white/40 group-hover:border-white'
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-black' : 'bg-white/60'}`} />
                        </div>
                        <span className={`text-[8.5px] font-mono font-bold mt-2 ${isSelected ? 'text-[#FF8C00]' : 'text-white/40'}`}>
                          {node.year}
                        </span>
                        <span className="text-[7.5px] font-black uppercase tracking-tight text-white/60 text-center max-w-[64px] truncate">
                          {node.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected Milestone Context Pill */}
              <div className="p-3 bg-white/[0.03] border border-white/10 rounded-2xl">
                <p className="text-[9px] font-black text-white/80 uppercase tracking-wide">
                  {timeline[activeTimelineIdx]?.label}
                </p>
                <p className="text-[8px] text-white/50 mt-0.5 leading-relaxed">
                  {timeline[activeTimelineIdx]?.description}
                </p>
              </div>
            </div>

            {/* Right: Audio-Reactive Voice Visualizer */}
            <div className="lg:col-span-3 flex flex-col items-center justify-center p-4 bg-black/40 rounded-3xl border border-white/10 relative overflow-hidden">
              <div className="w-full flex items-center justify-between mb-2">
                <span className="text-[8px] font-black uppercase tracking-widest text-[#00DAF3] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00DAF3] animate-pulse" /> Voice Soundscape
                </span>
                <span className="text-[8px] font-mono text-white/30">
                  {isPlaying ? 'ACTIVE FREQUENCIES' : 'IDLE'}
                </span>
              </div>

              <div className="w-full h-32 relative flex items-center justify-center">
                <canvas ref={canvasRef} className="w-full h-full" />
              </div>

              <p className="text-[7.5px] font-black uppercase tracking-widest text-white/30 text-center mt-2">
                Real-Time Voice Cadence & Resonance
              </p>
            </div>

          </div>
        </section>

        {/* ── 2. DUAL EXHIBITION DECKS ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── LEFT DECK: Curatorial Dossier & Archival Documents ── */}
          <section className="lg:col-span-5 flex flex-col space-y-5 rounded-[2.5rem] border border-white/10 bg-[#140D20]/90 backdrop-blur-3xl p-6 sm:p-8">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#FF8C00]" />
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/80">Curatorial Essay</h3>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[8px] font-mono text-white/50">
                Provenance Documented
              </span>
            </div>

            {/* "Why This Exists" Essay */}
            <div>
              <h4 className="text-base font-black italic tracking-tight text-white mb-2">Why This Exists</h4>
              <p className="text-xs text-white/70 leading-relaxed font-normal">
                {track.whyItExists}
              </p>
            </div>

            {/* Recording Details Card */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
              <h5 className="text-[9px] font-black uppercase tracking-widest text-[#FF8C00] flex items-center gap-1.5">
                <Info size={11} /> Field Recording Details
              </h5>
              <div className="grid grid-cols-2 gap-2 text-[8.5px]">
                <div>
                  <span className="text-white/40 block">Recorded Date:</span>
                  <span className="font-mono text-white/90">{recordingDetails.date}</span>
                </div>
                <div>
                  <span className="text-white/40 block">Location:</span>
                  <span className="text-white/90 truncate block">{recordingDetails.location}</span>
                </div>
                <div>
                  <span className="text-white/40 block">Interviewer:</span>
                  <span className="text-white/90 truncate block">{recordingDetails.interviewer}</span>
                </div>
                <div>
                  <span className="text-white/40 block">Recording Apparatus:</span>
                  <span className="text-white/90 truncate block">{recordingDetails.equipment}</span>
                </div>
              </div>
            </div>

            {/* Archival Companion Documents / Photos */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h5 className="text-[9px] font-black uppercase tracking-widest text-white/60 flex items-center gap-1.5">
                  <FileText size={11} /> Archival Document Scans ({artifacts.length})
                </h5>
                <span className="text-[8px] font-mono text-white/30">Click to Enlarge</span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {artifacts.map((art, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedArtifact(art)}
                    className="group cursor-pointer rounded-2xl overflow-hidden border border-white/10 bg-black/40 hover:border-small-orange/60 transition-all p-1.5 flex flex-col space-y-1.5"
                  >
                    <div className="aspect-[4/3] rounded-xl overflow-hidden relative bg-black/40 flex items-center justify-center">
                      {art.url.endsWith('.pdf') ? (
                        <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-gradient-to-br from-[#FF8C00]/10 to-white/[0.02]">
                          <FileText size={22} className="text-[#FF8C00] mb-1.5" />
                          <span className="text-[7.5px] font-black uppercase tracking-wider text-white/90">Official PDF</span>
                          <span className="text-[6.5px] font-mono text-white/50">Field Session Log</span>
                        </div>
                      ) : (
                        <img
                          src={art.url}
                          alt={art.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          loading="lazy"
                        />
                      )}
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-black/80 text-white">
                          {art.url.endsWith('.pdf') ? 'Open PDF' : 'View'}
                        </span>
                      </div>
                    </div>
                    <span className="text-[8px] font-bold text-white/70 truncate block px-0.5">
                      {art.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── RIGHT DECK: Synchronized Teleprompter & Translation ── */}
          <section className="lg:col-span-7 flex flex-col space-y-4 rounded-[2.5rem] border border-white/10 bg-[#140D20]/90 backdrop-blur-3xl p-6 sm:p-8 relative">
            
            {/* Teleprompter Header & Translation Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#00DAF3] animate-pulse" />
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/80">Synchronized Transcript</h3>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-[#00DAF3]/10 border border-[#00DAF3]/30 text-[7.5px] font-mono font-bold text-[#00DAF3] flex items-center gap-1 w-fit">
                  <ShieldCheck size={10} /> Archival Record Verified
                </span>
                {isLoadingTranscript && (
                  <span className="text-[8px] font-mono text-[#FF8C00] animate-pulse">
                    Loading LoC XML...
                  </span>
                )}
              </div>

              {/* Translation Selector Pill */}
              <div className="flex items-center gap-1.5 p-1 bg-white/5 rounded-xl border border-white/10 self-start sm:self-auto">
                <Globe size={12} className="text-white/40 ml-1.5" />
                <button
                  onClick={() => setSelectedLang('ORIGINAL')}
                  className={`px-2.5 py-1 rounded-lg text-[8.5px] font-black uppercase tracking-wider transition-all ${
                    selectedLang === 'ORIGINAL' ? 'bg-[#00DAF3] text-black shadow-md' : 'text-white/40 hover:text-white'
                  }`}
                >
                  Original Dialect
                </button>
                <button
                  onClick={() => setSelectedLang('es')}
                  className={`px-2.5 py-1 rounded-lg text-[8.5px] font-black uppercase tracking-wider transition-all ${
                    selectedLang === 'es' ? 'bg-[#00DAF3] text-black shadow-md' : 'text-white/40 hover:text-white'
                  }`}
                >
                  Español
                </button>
                <button
                  onClick={() => setSelectedLang('fr')}
                  className={`px-2.5 py-1 rounded-lg text-[8.5px] font-black uppercase tracking-wider transition-all ${
                    selectedLang === 'fr' ? 'bg-[#00DAF3] text-black shadow-md' : 'text-white/40 hover:text-white'
                  }`}
                >
                  Français
                </button>
                <button
                  onClick={() => setSelectedLang('yo')}
                  className={`px-2.5 py-1 rounded-lg text-[8.5px] font-black uppercase tracking-wider transition-all ${
                    selectedLang === 'yo' ? 'bg-[#00DAF3] text-black shadow-md' : 'text-white/40 hover:text-white'
                  }`}
                >
                  Yorùbá
                </button>
              </div>
            </div>

            {/* Scrollable Teleprompter Feed */}
            <div
              ref={transcriptScrollRef}
              className="flex-1 max-h-[380px] overflow-y-auto space-y-3.5 pr-2 custom-scrollbar"
            >
              {transcriptLines.map((line, idx) => {
                const isActive = idx === activeLineIdx;
                const displayText =
                  selectedLang === 'ORIGINAL'
                    ? line.text
                    : (line.translatedText && line.translatedText[selectedLang]) || line.text;

                return (
                  <motion.div
                    key={idx}
                    data-line-idx={idx}
                    onClick={() => seek(line.time)}
                    whileHover={{ scale: 1.005 }}
                    className={`p-4 rounded-2xl transition-all cursor-pointer border ${
                      isActive
                        ? 'bg-[#00DAF3]/10 border-[#00DAF3]/40 shadow-[0_0_24px_rgba(0,218,243,0.15)]'
                        : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/15'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black ${
                          line.speaker === 'Interviewer' ? 'bg-white/10 text-white/70' : 'bg-small-orange text-black'
                        }`}>
                          {line.speaker[0]}
                        </div>
                        <span className={`text-[9px] font-black uppercase tracking-widest ${
                          isActive ? 'text-[#00DAF3]' : 'text-white/50'
                        }`}>
                          {line.speaker}
                        </span>
                      </div>
                      <span className="text-[8.5px] font-mono text-white/30 tabular-nums">
                        {Math.floor(line.time / 60)}:{(line.time % 60).toString().padStart(2, '0')}
                      </span>
                    </div>

                    <p className={`text-xs sm:text-sm font-normal leading-relaxed transition-colors ${
                      isActive ? 'text-white font-medium drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]' : 'text-white/60'
                    }`}>
                      {displayText}
                    </p>
                  </motion.div>
                );
              })}
            </div>

            {/* Spoken-Word Transport Bar */}
            <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => skipSeconds(-15)}
                  title="Rewind 15 seconds"
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all text-[9px] font-black uppercase tracking-wider"
                >
                  <RotateCcw size={13} /> -15s
                </button>
                <button
                  onClick={() => skipSeconds(15)}
                  title="Forward 15 seconds"
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all text-[9px] font-black uppercase tracking-wider"
                >
                  <FastForward size={13} /> +15s
                </button>
              </div>

              {/* Main Play / Pause Button */}
              <button
                onClick={handlePlayRecording}
                className="w-12 h-12 rounded-full bg-white text-black hover:scale-105 active:scale-95 transition-transform flex items-center justify-center shadow-[0_0_24px_rgba(255,255,255,0.4)]"
              >
                {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
              </button>

              {/* Speed Rate Pill */}
              <button
                onClick={cycleSpeed}
                title="Cycle Playback Speed"
                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest font-mono"
              >
                {playbackRate || 1}x Speed
              </button>
            </div>

          </section>

        </div>

      </div>

      {/* ── ARTIFACT ENLARGED LIGHTBOX MODAL ── */}
      <AnimatePresence>
        {selectedArtifact && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedArtifact(null)}
            className="fixed inset-0 z-[1200] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 sm:p-8"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="relative max-w-3xl w-full rounded-3xl overflow-hidden bg-[#140D20] border border-white/20 p-6 shadow-3xl flex flex-col space-y-4"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h4 className="text-sm font-black uppercase tracking-widest text-white">
                  {selectedArtifact.title}
                </h4>
                <button
                  onClick={() => setSelectedArtifact(null)}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-white/60 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="max-h-[65vh] h-[65vh] overflow-hidden rounded-2xl border border-white/10 flex items-center justify-center bg-black/60">
                {selectedArtifact.url.endsWith('.pdf') ? (
                  <iframe
                    src={selectedArtifact.url}
                    title={selectedArtifact.title}
                    className="w-full h-full border-0 rounded-2xl"
                  />
                ) : (
                  <img
                    src={selectedArtifact.url}
                    alt={selectedArtifact.title}
                    className="max-h-[65vh] w-auto object-contain"
                  />
                )}
              </div>

              <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest text-center">
                Library of Congress American Folklife Center · Archival Document Scan
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VaultInterviewView;
