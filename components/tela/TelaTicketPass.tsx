import { ticketQrSvg } from '../../services/tela/ticketQr';
import TelaEventTemplateArtwork from './TelaEventTemplateArtwork';
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar, Clock, MapPin, Ticket, Music2, Play, Pause,
  Volume2, VolumeX, Sparkles, QrCode, Camera, ShieldCheck,
  Disc, Film, Radio, ExternalLink, Check, Copy, AlertCircle,
  Share2, ChevronRight, Zap, CheckCircle2, Navigation2
} from 'lucide-react';
import { TelaTicketDesign, AlbumArtTransform } from '../../types';

export interface TelaTicketPassProps {
  eventTitle: string;
  artistName?: string;
  date?: string;
  time?: string;
  doorsTime?: string;
  venue?: string;
  city?: string;
  tierName?: string;
  priceCents?: number;
  holderName?: string;
  ticketNumber?: string;
  coverImage?: string;
  design?: Partial<TelaTicketDesign>;
  interactive?: boolean;
  mode?: 'digital' | 'print' | 'evite';
  qrData?: string;
  isCheckedIn?: boolean;
  onJoinPhotoPool?: () => void;
  onAutoCheckIn?: () => void;
  geofenceNearby?: boolean;
  packages?: any[];
  onOpenPackages?: () => void;
  className?: string;
}

// Default fallback styling
const DEFAULT_PALETTE: [string, string, string, string] = ['#101820', '#F4E8D0', '#FF8C00', '#D4AF37'];

export const TelaTicketPass: React.FC<TelaTicketPassProps> = ({
  eventTitle,
  artistName = 'Featured Artist',
  date = 'Friday, Nov 14, 2026',
  time = '8:00 PM',
  doorsTime = '7:00 PM',
  venue = 'The Grand Soundstage',
  city = 'Detroit, MI',
  tierName = 'General Admission',
  priceCents = 2500,
  holderName = 'Guest Attendee',
  ticketNumber = 'PLJ-882194',
  coverImage,
  design,
  interactive = true,
  mode = 'digital',
  qrData,
  isCheckedIn = false,
  onJoinPhotoPool,
  onAutoCheckIn,
  geofenceNearby = false,
  packages = [],
  onOpenPackages,
  className = '',
}) => {
  const palette = design?.palette || DEFAULT_PALETTE;
  const [bgDark, textLight, accentColor, secondaryColor] = palette;
  const transformType: AlbumArtTransform = design?.albumArtTransform || 'VINYL_RECORD';
  const videoUrl = design?.videoUrl;

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTimeStr, setCurrentTimeStr] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Time-stamped security shimmer string updated every 10s
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeStr(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  const qrCodeSvg = ticketQrSvg(qrData || `plajah://${ticketNumber}`, 90);

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play().then(() => setIsPlayingAudio(true)).catch(() => {});
    }
  };

  const copyShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Render album art transformations
  const renderArtwork = () => {
    const imgUrl = coverImage || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80';

    switch (transformType) {
      case 'VINYL_RECORD':
        return (
          <div className="relative w-full h-48 md:h-52 bg-[#080808] overflow-hidden flex items-center justify-center p-4">
            {/* Record Jacket Sleeve */}
            <div className="relative z-10 w-36 h-36 md:w-40 md:h-40 rounded-xl overflow-hidden shadow-2xl border border-white/20 -translate-x-6 transition-transform duration-500 hover:-translate-x-8">
              <img src={imgUrl} alt={eventTitle} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-tr from-black/50 via-transparent to-white/10 pointer-events-none" />
              <div className="absolute top-2 left-2 text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-white border border-white/10">
                12" LP Plajah
              </div>
            </div>

            {/* Spinning Vinyl Record Disc emerging */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
              className="absolute z-0 w-36 h-36 md:w-40 md:h-40 rounded-full shadow-2xl flex items-center justify-center translate-x-12"
              style={{
                background: 'radial-gradient(circle, #2a2a2a 0%, #0d0d0d 40%, #171717 60%, #080808 100%)',
                boxShadow: `0 0 25px rgba(0,0,0,0.8), inset 0 0 20px rgba(255,255,255,0.05)`,
                border: '2px solid rgba(255,255,255,0.1)'
              }}
            >
              {/* Vinyl Grooves concentric rings */}
              <div className="absolute inset-2 rounded-full border border-white/[0.04]" />
              <div className="absolute inset-4 rounded-full border border-white/[0.05]" />
              <div className="absolute inset-6 rounded-full border border-white/[0.06]" />
              <div className="absolute inset-8 rounded-full border border-white/[0.05]" />
              <div className="absolute inset-10 rounded-full border border-white/[0.04]" />

              {/* Vinyl Center Label with mini cover art */}
              <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-white/20 flex items-center justify-center">
                <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                <div className="absolute w-3.5 h-3.5 rounded-full bg-black border border-white/40 z-10" />
              </div>
            </motion.div>
          </div>
        );

      case 'HOLOGRAPHIC_FOIL':
        return (
          <div className="relative w-full h-48 md:h-52 overflow-hidden flex items-center justify-center group">
            <img src={imgUrl} alt={eventTitle} className="w-full h-full object-cover filter contrast-125 saturate-110" />
            {/* Iridescent Rainbow Foil Shimmer Overlay */}
            <motion.div
              animate={{
                backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
                opacity: [0.45, 0.7, 0.45],
              }}
              transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute inset-0 pointer-events-none mix-blend-color-dodge"
              style={{
                backgroundImage: 'linear-gradient(135deg, rgba(255,0,128,0.4) 0%, rgba(0,255,200,0.4) 25%, rgba(255,255,0,0.4) 50%, rgba(138,43,226,0.4) 75%, rgba(255,0,128,0.4) 100%)',
                backgroundSize: '300% 300%',
              }}
            />
            {/* Hologram Badge */}
            <div className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/30 text-[9px] font-black uppercase tracking-widest text-cyan-200">
              <Sparkles size={11} className="text-pink-400 animate-spin" /> Holographic Security Pass
            </div>
          </div>
        );

      case 'CASSETTE_TAPE':
        return (
          <div className="relative w-full h-48 md:h-52 bg-[#121212] overflow-hidden flex items-center justify-center p-4">
            {/* Cassette Shell */}
            <div className="relative w-full max-w-sm h-36 rounded-2xl bg-white/[0.04] border-2 border-white/20 backdrop-blur-md p-3 shadow-2xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-mono tracking-widest text-white/50">TELA STEREO CASSETTE · TYPE II</span>
                <span className="text-[8px] font-black uppercase text-amber-400">SIDE A</span>
              </div>
              {/* Tape Window with spools */}
              <div className="relative h-16 rounded-xl bg-black/70 border border-white/10 flex items-center justify-around px-6 overflow-hidden">
                <div className="absolute inset-0 opacity-20">
                  <img src={imgUrl} alt="" className="w-full h-full object-cover filter blur-sm" />
                </div>
                {/* Spool 1 */}
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: 'linear' }} className="relative z-10 w-9 h-9 rounded-full border-2 border-white/30 flex items-center justify-center bg-black/90">
                  <div className="w-3 h-3 rounded-full bg-white/20 border border-white/40" />
                </motion.div>
                {/* Center tape bridge */}
                <div className="w-20 h-2 bg-amber-950/80 rounded border border-amber-800/40 relative z-10" />
                {/* Spool 2 */}
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: 'linear' }} className="relative z-10 w-9 h-9 rounded-full border-2 border-white/30 flex items-center justify-center bg-black/90">
                  <div className="w-3 h-3 rounded-full bg-white/20 border border-white/40" />
                </motion.div>
              </div>
              {/* Handwritten strip */}
              <div className="bg-amber-100/90 text-stone-900 px-3 py-1 rounded font-mono text-[9px] font-bold tracking-tight truncate">
                ▶ {eventTitle} — {artistName}
              </div>
            </div>
          </div>
        );

      case 'NEON_CYBERPUNK':
        return (
          <div className="relative w-full h-48 md:h-52 overflow-hidden flex items-center justify-center bg-black">
            <img src={imgUrl} alt={eventTitle} className="w-full h-full object-cover filter hue-rotate-15 contrast-150 saturate-150" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-purple-950/40 to-cyan-950/30 mix-blend-overlay" />
            {/* CRT Scanline pattern */}
            <div className="absolute inset-0 pointer-events-none opacity-30" style={{
              backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.8) 0px, transparent 1px, transparent 2px, rgba(0,0,0,0.8) 3px)'
            }} />
            {/* Neon Border Glow */}
            <div className="absolute inset-2 border border-cyan-400/40 rounded-xl pointer-events-none shadow-[0_0_15px_rgba(0,242,254,0.3)]" />
            <div className="absolute top-3 left-3 px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-400 text-cyan-300 font-mono text-[8px] font-black uppercase tracking-widest">
              CYBER_PASS v2.0
            </div>
          </div>
        );

      case 'GOLD_EMBOSSED':
        return (
          <div className="relative w-full h-48 md:h-52 overflow-hidden flex items-center justify-center bg-[#151008] p-3">
            <div className="relative w-full h-full rounded-xl overflow-hidden border-2 border-[#D4AF37] shadow-[0_0_30px_rgba(212,175,55,0.25)]">
              <img src={imgUrl} alt={eventTitle} className="w-full h-full object-cover filter sepia-[0.35] brightness-90" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#151008] via-transparent to-[#D4AF37]/20" />
              {/* Ornate Gold Corners */}
              {['top-2 left-2', 'top-2 right-2', 'bottom-2 left-2', 'bottom-2 right-2'].map((pos, i) => (
                <div key={i} className={`absolute ${pos} w-4 h-4 border-[#D4AF37] ${i === 0 ? 'border-t-2 border-l-2' : i === 1 ? 'border-t-2 border-r-2' : i === 2 ? 'border-b-2 border-l-2' : 'border-b-2 border-r-2'}`} />
              ))}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-[#151008]/90 border border-[#D4AF37] text-[#D4AF37] font-serif text-[9px] font-black uppercase tracking-[0.25em] shadow-lg">
                VIP LUXURY EMBOSSED
              </div>
            </div>
          </div>
        );

      case 'CRT_GLITCH':
        return (
          <div className="relative w-full h-48 md:h-52 overflow-hidden flex items-center justify-center bg-black">
            <img src={imgUrl} alt={eventTitle} className="w-full h-full object-cover filter contrast-125" />
            {/* Scanlines + Phosphor overlay */}
            <div className="absolute inset-0 pointer-events-none" style={{
              background: 'repeating-linear-gradient(0deg, rgba(0,255,0,0.06) 0px, transparent 1px, transparent 3px, rgba(0,255,0,0.06) 4px)'
            }} />
            <motion.div
              animate={{ opacity: [0.8, 1, 0.7, 0.9] }}
              transition={{ duration: 0.15, repeat: Infinity, repeatType: 'reverse' }}
              className="absolute top-3 right-3 px-2 py-0.5 rounded bg-red-600/80 text-white font-mono text-[8px] font-black uppercase tracking-widest"
            >
              ● REC · VHS
            </motion.div>
          </div>
        );

      case 'MATTE_EDITORIAL':
      default:
        return (
          <div className="relative w-full h-48 md:h-52 overflow-hidden bg-neutral-900">
            <img src={imgUrl} alt={eventTitle} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
          </div>
        );
    }
  };

  return (
    <div className={`w-full max-w-md mx-auto select-none font-sans ${className}`}>
      {/* Audio player if audio preview is attached */}
      {design?.audioPreviewUrl && (
        <audio ref={audioRef} src={design.audioPreviewUrl} onEnded={() => setIsPlayingAudio(false)} />
      )}

      {/* Main Ticket Shell */}
      {design?.templateId && <TelaEventTemplateArtwork templateId={design.templateId} eventTitle={eventTitle} date={date} time={time} venue={venue} mode={mode} motionEnabled={interactive && mode !== 'print'} />}
      <div
        className="relative rounded-3xl overflow-hidden shadow-2xl border transition-all duration-300"
        style={{
          background: `linear-gradient(145deg, ${bgDark || '#0d0d0d'} 0%, #050505 100%)`,
          borderColor: `${accentColor || '#FF8C00'}40`,
          boxShadow: `0 20px 50px rgba(0,0,0,0.8), 0 0 25px ${accentColor || '#FF8C00'}15`,
        }}
      >
        {/* Anti-Scalp Shimmer Security Banner (Real-time dynamic pulse) */}
        <div
          className="relative px-4 py-2 flex items-center justify-between text-[8px] font-black uppercase tracking-widest overflow-hidden"
          style={{
            background: `linear-gradient(90deg, ${accentColor || '#FF8C00'}25, ${secondaryColor || '#D4AF37'}40, ${accentColor || '#FF8C00'}25)`,
            color: textLight || '#fff',
            borderBottom: `1px solid ${accentColor || '#FF8C00'}30`,
          }}
        >
          {/* Animated beam */}
          <motion.div
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 pointer-events-none"
          />
          <div className="flex items-center gap-1.5 z-10">
            <ShieldCheck size={11} style={{ color: accentColor || '#FF8C00' }} />
            <span>TELA LIVING PASS · {design?.eraName || 'ART DECO'}</span>
          </div>
          <div className="flex items-center gap-1.5 z-10 font-mono text-[9px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span>{currentTimeStr || 'SECURE'}</span>
          </div>
        </div>

        {/* Video Background / Hero Video Layer if attached */}
        {videoUrl && (
          <div className="relative w-full h-36 bg-black overflow-hidden border-b border-white/10">
            <video
              ref={videoRef}
              src={videoUrl}
              autoPlay
              loop
              muted={isMuted}
              playsInline
              className="w-full h-full object-cover opacity-85"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black pointer-events-none" />
            <button
              onClick={() => setIsMuted(m => !m)}
              className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/60 backdrop-blur-md text-white/70 hover:text-white border border-white/20"
            >
              {isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
            </button>
            <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[8px] font-black uppercase tracking-widest text-white/80 border border-white/10">
              <Film size={10} className="text-amber-400" /> Integrated Video
            </div>
          </div>
        )}

        {/* Transformed Artwork Section (Vinyl, Holo, Cassette, Cyberpunk, Gold, etc.) */}
        {!videoUrl && renderArtwork()}

        {/* Ticket Header & Event Meta */}
        <div className="px-6 pt-5 pb-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <span
                className="text-[9px] font-black uppercase tracking-[0.25em] px-2.5 py-0.5 rounded-full inline-block mb-1.5"
                style={{
                  background: `${accentColor || '#FF8C00'}20`,
                  color: accentColor || '#FF8C00',
                  border: `1px solid ${accentColor || '#FF8C00'}40`,
                }}
              >
                {tierName}
              </span>
              <h1
                className="text-2xl font-black leading-tight text-white tracking-tight uppercase"
                style={{ fontFamily: design?.typography?.includes('serif') ? 'Georgia, serif' : 'inherit' }}
              >
                {eventTitle}
              </h1>
              <p className="text-sm font-bold mt-0.5" style={{ color: secondaryColor || '#a08040' }}>
                {artistName}
              </p>
            </div>

            {/* Price Badge */}
            <div className="text-right shrink-0">
              <p className="text-xl font-black" style={{ color: accentColor || '#FF8C00' }}>
                {priceCents === 0 ? 'Free' : `$${(priceCents / 100).toFixed(0)}`}
              </p>
              <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Official Pass</p>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-white/[0.03] border border-white/8">
            <div className="flex items-center gap-2">
              <Calendar size={13} style={{ color: accentColor || '#FF8C00' }} className="shrink-0" />
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Date</p>
                <p className="text-xs font-bold text-white truncate">{date}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Clock size={13} style={{ color: accentColor || '#FF8C00' }} className="shrink-0" />
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Show Time</p>
                <p className="text-xs font-bold text-white truncate">{time} {doorsTime ? `(Doors ${doorsTime})` : ''}</p>
              </div>
            </div>

            <div className="col-span-2 flex items-center gap-2 pt-1 border-t border-white/5">
              <MapPin size={13} style={{ color: accentColor || '#FF8C00' }} className="shrink-0" />
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Venue</p>
                <p className="text-xs font-bold text-white truncate">{venue}{city ? ` · ${city}` : ''}</p>
              </div>
            </div>
          </div>

          {/* Audio Preview Widget if attached */}
          {design?.audioPreviewUrl && (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.04] border border-white/10">
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleAudio}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-black font-black hover:scale-105 transition-all shadow-md"
                  style={{ background: accentColor || '#FF8C00' }}
                >
                  {isPlayingAudio ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                </button>
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/40">Artist Audio Preview</p>
                  <p className="text-xs font-black text-white truncate">{design.audioTrackTitle || 'Official Track'}</p>
                </div>
              </div>
              {/* Waveform indicator */}
              <div className="flex items-center gap-0.5 h-4">
                {[12, 18, 8, 22, 14, 19, 10, 16].map((h, i) => (
                  <motion.div
                    key={i}
                    animate={isPlayingAudio ? { height: [4, h, 6] } : { height: 6 }}
                    transition={{ duration: 0.5, repeat: isPlayingAudio ? Infinity : 0, delay: i * 0.08 }}
                    className="w-1 rounded-full"
                    style={{ background: accentColor || '#FF8C00' }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* SeaPass Beverage & Dining Package Ribbon */}
          {packages && packages.length > 0 && (
            <button
              onClick={onOpenPackages}
              className="w-full mb-3 p-2.5 rounded-2xl bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-pink-600/20 border border-blue-400/30 flex items-center justify-between text-left hover:brightness-125 transition-all shadow-md group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-xl bg-blue-500/30 border border-blue-400/40 text-blue-200 flex items-center justify-center text-xs shrink-0 shadow-inner">
                  ⚓
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-blue-300">SeaPass™ Perks</span>
                    <span className="px-1.5 py-0.2 bg-blue-500/20 text-blue-200 text-[7px] font-black uppercase rounded">
                      {packages.length} Active
                    </span>
                  </div>
                  <p className="text-[11px] font-black text-white truncate">
                    {packages.map((p: any) => p.name).join(' · ')}
                  </p>
                </div>
              </div>
              <span className="text-[9px] font-black uppercase text-blue-300 flex items-center gap-0.5 shrink-0 pl-2 group-hover:translate-x-0.5 transition-transform">
                Live Tally →
              </span>
            </button>
          )}

          {/* Attendee Info & Scannable QR */}
          <div className="flex items-end justify-between gap-4 pt-1">
            <div className="space-y-1">
              <p className="text-[8px] font-black uppercase tracking-widest text-white/40">Ticket Holder</p>
              <p className="text-sm font-black text-white">{holderName}</p>
              <p className="text-[9px] font-mono text-white/35">ID: {ticketNumber}</p>

              {/* Status Pill */}
              <div className="pt-1 flex items-center gap-1.5">
                {isCheckedIn ? (
                  <span className="flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    <CheckCircle2 size={10} /> Checked In
                  </span>
                ) : geofenceNearby ? (
                  <span className="flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/40 animate-pulse">
                    <Navigation2 size={10} /> At Venue · Ready
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                    Valid Pass
                  </span>
                )}
              </div>
            </div>

            {/* Clean QR code block */}
            <div className="rounded-2xl p-2 bg-white shadow-xl flex items-center justify-center shrink-0">
              <div dangerouslySetInnerHTML={{ __html: qrCodeSvg }} className="w-20 h-20" />
            </div>
          </div>
        </div>

        {/* Perforated Stub Tear Line */}
        <div className="relative h-6 flex items-center justify-between px-2">
          {/* Left cutout notch */}
          <div className="w-5 h-5 rounded-full bg-black -ml-4 border-r border-white/10" />
          {/* Dotted tear line */}
          <div className="flex-1 border-t-2 border-dashed border-white/15 mx-2" />
          {/* Right cutout notch */}
          <div className="w-5 h-5 rounded-full bg-black -mr-4 border-l border-white/10" />
        </div>

        {/* Bottom Interactive Actions Bar */}
        <div className="px-6 py-4 bg-black/60 border-t border-white/5 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {/* Action 1: Live Crowd Photo Pool */}
            {onJoinPhotoPool && (
              <button
                onClick={onJoinPhotoPool}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-gradient-to-r from-purple-900/40 to-pink-900/40 border border-purple-500/30 text-white font-black text-[10px] uppercase tracking-wider hover:brightness-125 transition-all"
              >
                <Camera size={12} className="text-pink-400" />
                Live Photo Pool
              </button>
            )}

            {/* Action 2: Geofence Auto Check-in */}
            {onAutoCheckIn && !isCheckedIn && (
              <button
                onClick={onAutoCheckIn}
                className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all ${
                  geofenceNearby
                    ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/30 hover:brightness-110 animate-pulse'
                    : 'bg-white/5 border border-white/10 text-white/70 hover:text-white'
                }`}
              >
                <Navigation2 size={12} />
                {geofenceNearby ? 'Check In Now' : 'Auto Check-In'}
              </button>
            )}

            {/* Action 3: Share Pass */}
            <button
              onClick={copyShare}
              className="col-span-2 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white/[0.03] border border-white/8 text-white/50 text-[9px] font-black uppercase tracking-wider hover:text-white transition-all"
            >
              {copiedLink ? <Check size={11} className="text-emerald-400" /> : <Share2 size={11} />}
              {copiedLink ? 'Link Copied!' : 'Share Event Pass'}
            </button>
          </div>

          {/* Plajah ecosystem stamp */}
          <div className="flex items-center justify-between text-[8px] text-white/25 uppercase tracking-widest pt-1">
            <span>POWERED BY PLAJAH & TELA</span>
            <span>NO FEES · NO SCALPING</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TelaTicketPass;

