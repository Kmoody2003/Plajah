import { startVoiceSoundscape } from '../services/voiceSoundscapeEngine';
import { validAlignment, activeCueIndex } from '../services/vaultAccuracy';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ArchiveTrack, enrichSpeechTrack } from '../services/archiveContentService';
import { Album, Track } from '../types';
import { useGlobalPlayerState, useGlobalPlayerProgress } from '../contexts/GlobalPlayerContext';
import {
  ArrowLeft, Play, Pause, RotateCcw, FastForward, Maximize2, Minimize2,
  Globe, Clock, FileText, Info, ShieldCheck, X, BookOpen, Mic2, Radio,
  Quote, Sparkles, Image as ImageIcon, Layers, Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { thumb, onThumbError, THUMB } from '../src/lib/imageThumb';

export interface VaultSpeechViewProps {
  track: ArchiveTrack;
  album?: Album | null;
  onBack: () => void;
  onNavigate?: (view: string) => void;
}

type ContextTab = 'WHY_EXISTS' | 'BACKDROP' | 'RHETORIC' | 'ACOUSTICS' | 'KEY_QUOTES';
type ArtifactFilter = 'ALL' | 'PHOTO' | 'DOCUMENT' | 'PRESS' | 'GEAR';

export const VaultSpeechView: React.FC<VaultSpeechViewProps> = ({
  track: initialTrack,
  album,
  onBack,
  onNavigate,
}) => {
  // Ensure track is fully enriched with speech metadata, authentic LoC photos & transcripts
  const track = useMemo(() => {
    return enrichSpeechTrack(initialTrack);
  }, [initialTrack]);

  const [liveTranscript, setLiveTranscript] = useState(track.transcript || []);
  const [activeContextTab, setActiveContextTab] = useState<ContextTab>('WHY_EXISTS');
  const [artifactFilter, setArtifactFilter] = useState<ArtifactFilter>('ALL');

  useEffect(() => {
    setLiveTranscript(track.transcript || []);
  }, [track.id, track.transcript]);

  const {
    currentTrack,
    isPlaying: globalIsPlaying,
    playTrack,
    togglePlay,
    analyser,
    playbackRate,
    setPlaybackRate,
    skipSeconds,
  } = useGlobalPlayerState();

  const { currentTime, duration, seek } = useGlobalPlayerProgress();

  const isCurrentPlaying = currentTrack?.id === track.id || (!!track.url && currentTrack?.url === track.url);
  const isPlaying = isCurrentPlaying && globalIsPlaying;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<{
    title: string;
    url: string;
    type: string;
    caption?: string;
    sourceCredit?: string;
    year?: string | number;
  } | null>(null);
  const [selectedLang, setSelectedLang] = useState<'ORIGINAL' | 'es' | 'fr' | 'yo'>('ORIGINAL');
  const [activeTimelineIdx, setActiveTimelineIdx] = useState<number>(() => {
    const act = (track.timeline || []).findIndex(t => t.active);
    return act >= 0 ? act : 1;
  });

  useEffect(() => { setSelectedArtifact(null); }, [track.id]);

  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Start speech playback if not already playing
  const handlePlaySpeech = () => {
    if (isCurrentPlaying) {
      togglePlay();
    } else {
      const vTrack: Track = {
        id: track.id,
        title: track.title,
        artist: track.artist,
        url: track.url,
        albumCover: track.thumbnailUrl,
        images: [track.thumbnailUrl],
        genre: 'Speech',
        kind: 'SPEECH',
        isGlobalArchive: true,
      };
      const vAlbum: Album = album || {
        id: `vault_speech_${track.id}`,
        title: track.title,
        artist: track.artist,
        coverImage: track.thumbnailUrl,
        tracks: [vTrack],
        createdAt: Date.now(),
        themeColor: '#d97706',
        type: 'BOOK',
        subType: 'AUDIOBOOK',
        genre: 'Speech',
        description: track.whyItExists || track.description,
      };
      playTrack(vTrack, vAlbum, 'LIBRARY');
    }
  };

  // Find active transcript line based on currentTime
  const hasVerifiedTiming = validAlignment(track.audioAlignment, track.url);
  const transcriptLines = hasVerifiedTiming
    ? track.audioAlignment!.cues.map(c => ({ time: c.start, text: c.text, speaker: c.speaker || track.artist, translatedText: undefined as Record<string, string> | undefined }))
    : liveTranscript;
  const activeLineIdx = hasVerifiedTiming && isCurrentPlaying ? activeCueIndex(track.audioAlignment!.cues, currentTime) : -1;

  // Auto-scroll teleprompter transcript
  useEffect(() => {
    if (!transcriptScrollRef.current) return;
    const activeEl = transcriptScrollRef.current.querySelector(`[data-line-idx="${activeLineIdx}"]`) as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeLineIdx]);

  // Audio-reactive voice visualizer canvas (Historic Oratory Resonance)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startVoiceSoundscape(canvas, analyser, isPlaying, {
      theme: 'speech',
      heightScale: 0.85,
    });
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
    date: track.year || 'Historic Era',
    location: track.location || 'United States',
    interviewer: 'Joint Session / Public Assembly',
    equipment: 'RCA / Western Electric Broadcast Microphones',
    collection: track.collection || 'Library of Congress Recorded Sound Section',
    accessionNo: (track.id.replace(/^vault-speech-/, '').replace(/^loc-/, '') || 'RECORDED SOUND').toUpperCase(),
  };

  const timeline = track.timeline || [];
  const allArtifacts = track.companionArtifacts || [];
  const filteredArtifacts = useMemo(() => {
    if (artifactFilter === 'ALL') return allArtifacts;
    return allArtifacts.filter(a => a.type === artifactFilter);
  }, [allArtifacts, artifactFilter]);

  return (
    <div className={`min-h-screen text-white bg-[#06040A] selection:bg-[#00DAF3]/30 ${isFullscreen ? 'fixed inset-0 z-[1100] overflow-y-auto p-4 sm:p-8' : 'px-4 sm:px-8 py-6'}`}>
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── TOP NAV BAR ── */}
        <div className="flex items-center justify-between gap-4 pb-2 border-b border-white/10">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest"
          >
            <ArrowLeft size={14} /> The Vault Speeches
          </button>

          <div className="flex items-center gap-3">
            {track.crowdAndBroadcastReach && (
              <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[8.5px] font-mono text-amber-300">
                <Radio size={11} className="text-amber-400" /> {track.crowdAndBroadcastReach.split(';')[0]}
              </span>
            )}

            <span className="hidden sm:inline-block text-[9px] font-mono text-white/40 uppercase tracking-widest">
              Catalog Ref: {recordingDetails.accessionNo}
            </span>

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                isFullscreen
                  ? 'bg-amber-500 text-black font-black shadow-lg'
                  : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10'
              }`}
            >
              {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              <span>{isFullscreen ? 'Exit Fullscreen' : 'Enter Exhibition Pavilion'}</span>
            </button>
          </div>
        </div>

        {/* ── 1. THE GATEFOLD ORATORY HEADER ── */}
        <section className="relative rounded-[2.5rem] overflow-hidden border border-white/10 bg-[#140D20]/90 backdrop-blur-3xl shadow-[0_12px_48px_rgba(0,0,0,0.6)] p-6 sm:p-8">
          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[#d97706]/25 to-[#b45309]/20 blur-[100px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#00DAF3]/10 blur-[100px] pointer-events-none" />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            
            {/* Left: Archival Portrait & Provenance Badge */}
            <div className="lg:col-span-4 flex flex-col items-center sm:items-start">
              <div className="relative w-full aspect-square max-w-[280px] rounded-3xl overflow-hidden border border-white/15 shadow-2xl group bg-black/40">
                <img
                  src={thumb(track.thumbnailUrl, THUMB.large) || 'https://tile.loc.gov/storage-services/service/pnp/ppmsca/03100/03128r.jpg'}
                  onError={onThumbError(track.thumbnailUrl)}
                  alt={track.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                
                {/* Amber Provenance Tag */}
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-black/70 backdrop-blur-md border border-amber-500/40 shadow-lg">
                  <span className="text-[8px] font-black uppercase tracking-widest text-amber-400 truncate">
                    {track.source === 'LIBRARY_OF_CONGRESS' ? 'Library of Congress' : 'National Archives'}
                  </span>
                  <span className="text-[8px] font-mono text-white/70">
                    {recordingDetails.date}
                  </span>
                </div>
              </div>
              <h1 className="text-xl sm:text-2xl font-black italic tracking-tight text-white mt-4 text-center sm:text-left leading-tight">
                {track.title}
              </h1>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 bg-clip-text text-transparent mt-1">
                {track.artist}
              </p>
            </div>

            {/* Center: Chronological History Timeline Ribbon */}
            <div className="lg:col-span-5 flex flex-col justify-center space-y-4 px-2">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 flex items-center gap-1.5">
                  <Clock size={11} className="text-amber-400" /> Historic Oratory Timeline
                </span>
                <span className="text-[8px] font-mono text-amber-300 uppercase">
                  Epoch: {timeline[activeTimelineIdx]?.year || recordingDetails.date}
                </span>
              </div>

              {/* Connected Timeline Nodes */}
              <div className="relative py-4">
                <div className="absolute top-1/2 left-4 right-4 h-[2px] -translate-y-1/2 bg-gradient-to-r from-amber-500 via-rose-500 to-[#00DAF3] rounded-full opacity-60" />

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
                              ? 'bg-white ring-4 ring-amber-500/40 shadow-[0_0_16px_#f59e0b]'
                              : 'bg-[#140D20] border-2 border-white/40 group-hover:border-white'
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-black' : 'bg-white/60'}`} />
                        </div>
                        <span className={`text-[8.5px] font-mono font-bold mt-2 ${isSelected ? 'text-amber-400' : 'text-white/40'}`}>
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
                <span className="text-[8px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Oratory Resonance
                </span>
                <span className="text-[8px] font-mono text-white/30">
                  {isPlaying ? 'ACTIVE FREQUENCIES' : 'IDLE'}
                </span>
              </div>

              <div className="w-full h-32 relative flex items-center justify-center">
                <canvas ref={canvasRef} className="w-full h-full" />
              </div>

              <p className="text-[7.5px] font-black uppercase tracking-widest text-white/30 text-center mt-2">
                Cadence & Acoustic Presence
              </p>
            </div>

          </div>
        </section>

        {/* ── 2. DUAL EXHIBITION DECKS ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── LEFT DECK: Curatorial Dossier & Archival Documents ── */}
          <section className="lg:col-span-5 flex flex-col space-y-5 rounded-[2.5rem] border border-white/10 bg-[#140D20]/90 backdrop-blur-3xl p-6 sm:p-8">
            
            {/* Context Navigation Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-white/5 rounded-2xl border border-white/10 overflow-x-auto custom-scrollbar">
              <button
                onClick={() => setActiveContextTab('WHY_EXISTS')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[8.5px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                  activeContextTab === 'WHY_EXISTS' ? 'bg-amber-500 text-black shadow-md' : 'text-white/50 hover:text-white'
                }`}
              >
                <BookOpen size={11} /> Why It Exists
              </button>
              {track.historicalBackdrop && (
                <button
                  onClick={() => setActiveContextTab('BACKDROP')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[8.5px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                    activeContextTab === 'BACKDROP' ? 'bg-amber-500 text-black shadow-md' : 'text-white/50 hover:text-white'
                  }`}
                >
                  <Clock size={11} /> The Crisis
                </button>
              )}
              {track.rhetoricalAnalysis && (
                <button
                  onClick={() => setActiveContextTab('RHETORIC')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[8.5px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                    activeContextTab === 'RHETORIC' ? 'bg-amber-500 text-black shadow-md' : 'text-white/50 hover:text-white'
                  }`}
                >
                  <Sparkles size={11} /> Rhetoric
                </button>
              )}
              {track.acousticEngineering && (
                <button
                  onClick={() => setActiveContextTab('ACOUSTICS')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[8.5px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                    activeContextTab === 'ACOUSTICS' ? 'bg-amber-500 text-black shadow-md' : 'text-white/50 hover:text-white'
                  }`}
                >
                  <Mic2 size={11} /> Acoustics
                </button>
              )}
              {track.keyQuotes && track.keyQuotes.length > 0 && (
                <button
                  onClick={() => setActiveContextTab('KEY_QUOTES')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[8.5px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                    activeContextTab === 'KEY_QUOTES' ? 'bg-amber-500 text-black shadow-md' : 'text-white/50 hover:text-white'
                  }`}
                >
                  <Quote size={11} /> Quotes
                </button>
              )}
            </div>

            {/* Context Content Area */}
            <div className="min-h-[160px] flex flex-col justify-start">
              {activeContextTab === 'WHY_EXISTS' && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                  <h4 className="text-sm font-black italic tracking-tight text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400" /> Curatorial Exhibition Essay
                  </h4>
                  <p className="text-xs text-white/70 leading-relaxed font-normal">
                    {track.whyItExists}
                  </p>
                </motion.div>
              )}

              {activeContextTab === 'BACKDROP' && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                  <h4 className="text-sm font-black italic tracking-tight text-amber-300 flex items-center gap-2">
                    <Clock size={13} className="text-amber-400" /> Historical Crisis & The 48 Hours Before
                  </h4>
                  <p className="text-xs text-white/80 leading-relaxed font-normal bg-white/[0.02] p-3.5 rounded-2xl border border-white/5">
                    {track.historicalBackdrop}
                  </p>
                </motion.div>
              )}

              {activeContextTab === 'RHETORIC' && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                  <h4 className="text-sm font-black italic tracking-tight text-amber-300 flex items-center gap-2">
                    <Sparkles size={13} className="text-amber-400" /> Rhetorical Architecture & Cadences
                  </h4>
                  <p className="text-xs text-white/80 leading-relaxed font-normal bg-white/[0.02] p-3.5 rounded-2xl border border-white/5">
                    {track.rhetoricalAnalysis}
                  </p>
                </motion.div>
              )}

              {activeContextTab === 'ACOUSTICS' && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                  <h4 className="text-sm font-black italic tracking-tight text-amber-300 flex items-center gap-2">
                    <Mic2 size={13} className="text-amber-400" /> Microphones, Disc Lathes & Broadcast Relays
                  </h4>
                  <p className="text-xs text-white/80 leading-relaxed font-normal bg-white/[0.02] p-3.5 rounded-2xl border border-white/5">
                    {track.acousticEngineering}
                  </p>
                </motion.div>
              )}

              {activeContextTab === 'KEY_QUOTES' && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  <h4 className="text-sm font-black italic tracking-tight text-white flex items-center gap-2">
                    <Quote size={13} className="text-amber-400" /> Iconic Historic Passages
                  </h4>
                  <div className="space-y-2.5">
                    {(track.keyQuotes || []).map((kq, idx) => (
                      <div key={idx} className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
                        <p className="text-xs italic text-amber-200 font-medium">"{kq.quote}"</p>
                        <p className="text-[8px] text-white/50 uppercase tracking-wider font-mono">{kq.context}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Speech Oratory Details Card */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
              <h5 className="text-[9px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                <Info size={11} /> Historic Provenance Card
              </h5>
              <div className="grid grid-cols-2 gap-2 text-[8.5px]">
                <div>
                  <span className="text-white/40 block">Delivered Date:</span>
                  <span className="font-mono text-white/90">{recordingDetails.date}</span>
                </div>
                <div>
                  <span className="text-white/40 block">Venue / Forum:</span>
                  <span className="text-white/90 truncate block">{recordingDetails.location}</span>
                </div>
                <div>
                  <span className="text-white/40 block">Occasion / Body:</span>
                  <span className="text-white/90 truncate block">{recordingDetails.interviewer}</span>
                </div>
                <div>
                  <span className="text-white/40 block">Preserving Archive:</span>
                  <span className="text-white/90 truncate block">{recordingDetails.collection}</span>
                </div>
              </div>
            </div>

            {/* Archival Companion Documents / Photos with Filter Pills */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h5 className="text-[9px] font-black uppercase tracking-widest text-white/70 flex items-center gap-1.5">
                  <FileText size={11} className="text-amber-400" /> Primary Source Gallery ({allArtifacts.length})
                </h5>
                <span className="text-[8px] font-mono text-white/30">Click to Enlarge</span>
              </div>

              {/* Artifact Category Filter */}
              <div className="flex items-center gap-1 pb-1">
                {(['ALL', 'PHOTO', 'DOCUMENT'] as const).map(flt => (
                  <button
                    key={flt}
                    onClick={() => setArtifactFilter(flt)}
                    className={`px-2 py-0.5 rounded-lg text-[7.5px] font-bold uppercase tracking-wider transition-all ${
                      artifactFilter === flt ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    {flt === 'ALL' ? 'All Artifacts' : flt === 'PHOTO' ? 'Photographs' : 'Manuscripts & Drafts'}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-3">
                {filteredArtifacts.map((art, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedArtifact(art)}
                    className="group cursor-pointer rounded-2xl overflow-hidden border border-white/10 bg-black/40 hover:border-amber-500/60 transition-all p-1.5 flex flex-col space-y-1.5"
                  >
                    <div className="aspect-[4/3] rounded-xl overflow-hidden relative bg-black/40 flex items-center justify-center">
                      {art.url.endsWith('.pdf') ? (
                        <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-gradient-to-br from-amber-500/10 to-white/[0.02]">
                          <FileText size={22} className="text-amber-400 mb-1.5" />
                          <span className="text-[7.5px] font-black uppercase tracking-wider text-white/90">Official PDF</span>
                          <span className="text-[6.5px] font-mono text-white/50">Reading Copy</span>
                        </div>
                      ) : (
                        <img
                          src={art.url}
                          alt={art.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          loading="lazy"
                        />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-amber-500 text-black shadow-md flex items-center gap-1">
                          <Eye size={10} /> View
                        </span>
                      </div>
                    </div>
                    <span className="text-[8px] font-bold text-white/80 truncate block px-0.5">
                      {art.title}
                    </span>
                    <span className="text-[6.5px] font-mono text-white/40 block px-0.5 truncate">
                      {art.type === 'PHOTO' ? 'Archival Photograph' : 'Historical Document'} · {art.year || recordingDetails.date}
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
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/80">{hasVerifiedTiming ? 'Synchronized transcript' : 'Transcript reference'}</h3>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-[7.5px] font-mono font-bold text-amber-400 flex items-center gap-1 w-fit">
                  <ShieldCheck size={10} /> {hasVerifiedTiming ? 'Recording timing reviewed' : 'Audio timing not verified'}
                </span>
              </div>

              {/* Translation Selector Pill */}
              <div className="flex items-center gap-1.5 p-1 bg-white/5 rounded-xl border border-white/10 self-start sm:self-auto">
                <Globe size={12} className="text-white/40 ml-1.5" />
                <button
                  onClick={() => setSelectedLang('ORIGINAL')}
                  className={`px-2.5 py-1 rounded-lg text-[8.5px] font-black uppercase tracking-wider transition-all ${
                    selectedLang === 'ORIGINAL' ? 'bg-amber-400 text-black shadow-md' : 'text-white/40 hover:text-white'
                  }`}
                >
                  Original
                </button>
                <button
                  onClick={() => setSelectedLang('es')}
                  className={`px-2.5 py-1 rounded-lg text-[8.5px] font-black uppercase tracking-wider transition-all ${
                    selectedLang === 'es' ? 'bg-amber-400 text-black shadow-md' : 'text-white/40 hover:text-white'
                  }`}
                >
                  Español
                </button>
                <button
                  onClick={() => setSelectedLang('fr')}
                  className={`px-2.5 py-1 rounded-lg text-[8.5px] font-black uppercase tracking-wider transition-all ${
                    selectedLang === 'fr' ? 'bg-amber-400 text-black shadow-md' : 'text-white/40 hover:text-white'
                  }`}
                >
                  Français
                </button>
                <button
                  onClick={() => setSelectedLang('yo')}
                  className={`px-2.5 py-1 rounded-lg text-[8.5px] font-black uppercase tracking-wider transition-all ${
                    selectedLang === 'yo' ? 'bg-amber-400 text-black shadow-md' : 'text-white/40 hover:text-white'
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
                    onClick={() => { if (hasVerifiedTiming) seek(line.time); }}
                    whileHover={{ scale: 1.005 }}
                    className={`p-4 rounded-2xl transition-all cursor-pointer border ${
                      isActive
                        ? 'bg-amber-500/10 border-amber-500/40 shadow-[0_0_24px_rgba(245,158,11,0.2)]'
                        : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/15'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black bg-amber-400 text-black">
                          {line.speaker[0]}
                        </div>
                        <span className={`text-[9px] font-black uppercase tracking-widest ${
                          isActive ? 'text-amber-400' : 'text-white/50'
                        }`}>
                          {line.speaker}
                        </span>
                      </div>
                      <span className="text-[8.5px] font-mono text-white/30 tabular-nums">
                        {hasVerifiedTiming ? Math.floor(line.time / 60) + ':' + (line.time % 60).toString().padStart(2, '0') : 'Reference'}
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
                onClick={handlePlaySpeech}
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

      {/* ── ARTIFACT ENLARGED LIGHTBOX MODAL WITH FULL CONTEXT ── */}
      <AnimatePresence>
        {selectedArtifact && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedArtifact(null)}
            className="fixed inset-0 z-[1200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 sm:p-8"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="relative max-w-4xl w-full rounded-3xl overflow-hidden bg-[#140D20] border border-white/20 p-6 shadow-3xl flex flex-col space-y-4"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <h4 className="text-sm font-black uppercase tracking-widest text-white">
                    {selectedArtifact.title}
                  </h4>
                  <p className="text-[9px] font-mono text-amber-400 mt-0.5">
                    {selectedArtifact.sourceCredit || 'Library of Congress Prints & Photographs Division'} · {selectedArtifact.year || recordingDetails.date}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedArtifact(null)}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-white/60 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="max-h-[55vh] h-[55vh] overflow-hidden rounded-2xl border border-white/10 flex items-center justify-center bg-black/60">
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
                    className="max-h-[55vh] w-auto object-contain"
                  />
                )}
              </div>

              {/* Deep Curatorial Caption Card */}
              {selectedArtifact.caption && (
                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-[8px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1">
                    <Info size={10} /> Archival Photograph Context
                  </span>
                  <p className="text-xs text-white/80 leading-relaxed font-normal">
                    {selectedArtifact.caption}
                  </p>
                </div>
              )}

              <p className="text-[9.5px] font-mono text-white/40 uppercase tracking-widest text-center">
                National Archives & Library of Congress Recorded Sound Section · Primary Source Historical Preservation
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VaultSpeechView;
