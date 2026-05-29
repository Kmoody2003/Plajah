import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Bell, Share2, Copy, Check, ChevronRight, Lock } from 'lucide-react';
import type { Album } from '../types';
import { redeemReviewCode, checkEarlyAccess, fetchAlbumById } from '../services/backendService';

// ─── Image brightness analysis ────────────────────────────────────────────────
// Samples a remote image via canvas and returns 0–255 average brightness.

async function analyseImageBrightness(url: string): Promise<number> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 32; // downsample to 32×32 for speed
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let total = 0;
        for (let i = 0; i < data.length; i += 4) {
          // Perceived luminance formula
          total += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        }
        resolve(total / (size * size));
      } catch { resolve(80); } // default: treat as dark
    };
    img.onerror = () => resolve(80);
    img.src = url;
  });
}

// ─── Countdown logic ──────────────────────────────────────────────────────────

interface TimeLeft {
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number; // ms
}

function calcTimeLeft(targetMs: number): TimeLeft {
  const diff = Math.max(0, targetMs - Date.now());
  if (diff === 0) return { months: 0, days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };

  const now = new Date();
  const target = new Date(targetMs);
  let months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  const afterMonths = new Date(now);
  afterMonths.setMonth(afterMonths.getMonth() + months);
  const remainingMs = target.getTime() - afterMonths.getTime();
  if (remainingMs < 0) { months--; }

  const days = Math.floor((diff % (30 * 24 * 3600_000)) / (24 * 3600_000));
  const hours = Math.floor((diff % (24 * 3600_000)) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1_000);
  return { months: Math.max(0, months), days, hours, minutes, seconds, total: diff };
}

// ─── Font style types ─────────────────────────────────────────────────────────

type FontStyle = 'SLENDER' | 'BOLD';

function fontClasses(style: FontStyle): { number: string; label: string; title: string } {
  if (style === 'SLENDER') {
    return {
      number: 'font-thin tracking-tight leading-none',
      label:  'font-light tracking-[0.4em] uppercase text-[10px]',
      title:  'font-thin tracking-widest uppercase',
    };
  }
  return {
    number: 'font-black tracking-tighter leading-none',
    label:  'font-black tracking-[0.25em] uppercase text-[9px]',
    title:  'font-black tracking-tighter uppercase',
  };
}

// ─── Countdown digit ──────────────────────────────────────────────────────────

function Digit({ value, label, fontStyle, accentColor }: {
  value: number; label: string; fontStyle: FontStyle; accentColor: string;
}) {
  const { number, label: labelClass } = fontClasses(fontStyle);
  const str = String(value).padStart(2, '0');

  return (
    <div className="flex flex-col items-center relative">
      {/* Number — gradient fade at bottom into nothing (album art shows through) */}
      <div className="relative">
        <span
          className={`${number} select-none`}
          style={{
            fontSize: 'clamp(4rem, 12vw, 9rem)',
            color: '#fff',
            // Gradient mask: full opacity top → transparent bottom
            WebkitMaskImage: 'linear-gradient(to bottom, white 40%, transparent 100%)',
            maskImage: 'linear-gradient(to bottom, white 40%, transparent 100%)',
            display: 'block',
            lineHeight: 1,
          }}
        >
          {str}
        </span>
        {/* Subtle glow that matches album accent */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${accentColor}22 0%, transparent 70%)`,
          }}
        />
      </div>
      <span className={`${labelClass} mt-1 opacity-50 text-white`}>{label}</span>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface Props {
  albumId: string;
  /** If album already loaded (e.g. from album card preview), pass it directly */
  initialAlbum?: Album;
  onClose?: () => void;
  onUnlock?: (album: Album) => void; // called when early access is granted
}

export default function ReleaseCountdownPage({ albumId, initialAlbum, onClose, onUnlock }: Props) {
  const [album, setAlbum] = useState<Album | null>(initialAlbum ?? null);
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ months: 0, days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 });
  const [fontStyle, setFontStyle] = useState<FontStyle>('BOLD');
  const [accentColor, setAccentColor] = useState('#ff8c00');
  const [bgIndex, setBgIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showCodeEntry, setShowCodeEntry] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [codeSuccess, setCodeSuccess] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(!initialAlbum);
  const slideTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load album if not provided
  useEffect(() => {
    if (initialAlbum) return;
    setLoading(true);
    fetchAlbumById(albumId).then(a => {
      if (a) setAlbum(a);
      setLoading(false);
    });
  }, [albumId]);

  // Check existing access
  useEffect(() => {
    checkEarlyAccess(albumId).then(setHasAccess);
  }, [albumId]);

  // Countdown tick
  useEffect(() => {
    if (!album?.releaseDate) return;
    const tick = () => setTimeLeft(calcTimeLeft(album.releaseDate!));
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [album?.releaseDate]);

  // Image brightness → font style
  useEffect(() => {
    const url = album?.coverImage;
    if (!url) return;
    analyseImageBrightness(url).then(brightness => {
      setFontStyle(brightness > 115 ? 'SLENDER' : 'BOLD');
    });
  }, [album?.coverImage]);

  // Accent color from themeColor or fallback
  useEffect(() => {
    if (album?.themeColor) setAccentColor(album.themeColor);
  }, [album?.themeColor]);

  // Slideshow
  const images = [album?.coverImage, ...(album?.slideshow ?? [])].filter(Boolean) as string[];
  useEffect(() => {
    if (images.length < 2) return;
    slideTimer.current = setInterval(() => setBgIndex(i => (i + 1) % images.length), 5_000);
    return () => clearInterval(slideTimer.current);
  }, [images.length]);

  // Redeem code
  const handleRedeem = async () => {
    if (!codeInput.trim() || redeeming) return;
    setRedeeming(true);
    setCodeError('');
    const ok = await redeemReviewCode(codeInput.trim(), albumId);
    setRedeeming(false);
    if (ok) {
      setCodeSuccess(true);
      setHasAccess(true);
      setTimeout(() => {
        if (album && onUnlock) onUnlock(album);
      }, 1_800);
    } else {
      setCodeError('Invalid, expired, or already used code. Try again.');
    }
  };

  const shareUrl = `${window.location.origin}/release/${albumId}`;
  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: album?.title, url: shareUrl });
    } else {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    }
  };

  const handleCalendar = () => {
    if (!album?.releaseDate) return;
    const d = new Date(album.releaseDate);
    const fmt = (n: number) => String(n).padStart(2, '0');
    const dt = `${d.getFullYear()}${fmt(d.getMonth() + 1)}${fmt(d.getDate())}T${fmt(d.getHours())}${fmt(d.getMinutes())}00`;
    const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(album.title + ' — Release')}&dates=${dt}/${dt}&details=${encodeURIComponent(shareUrl)}`;
    window.open(url, '_blank');
  };

  const fc = fontClasses(fontStyle);
  const released = timeLeft.total === 0 && !!album?.releaseDate;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-[300]">
        <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!album) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-[300] text-white/40 text-sm uppercase tracking-widest">
        Release not found.
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[300] overflow-hidden select-none">

      {/* ── Background slideshow ── */}
      <AnimatePresence>
        <motion.div key={bgIndex}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 1.8 }}
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${images[bgIndex] ?? ''})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(2px) brightness(0.38) saturate(1.4)',
            transform: 'scale(1.08)',
          }}
        />
      </AnimatePresence>

      {/* Dark overlay gradient — stronger at top/bottom */}
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 45%, rgba(0,0,0,0.72) 100%)' }} />

      {/* ── Content ── */}
      <div className="relative h-full flex flex-col items-center justify-between px-6 py-10 overflow-y-auto">

        {/* Close (if embedded) */}
        {onClose && (
          <button onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full text-white/40 hover:text-white transition-all"
            style={{ background: 'rgba(0,0,0,0.3)' }}>
            ✕
          </button>
        )}

        {/* Top — artist + genre tag */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="flex flex-col items-center gap-2 text-center">
          {album.genre && (
            <span className="text-[9px] font-black uppercase tracking-[0.4em] px-3 py-1 rounded-full"
              style={{ background: `${accentColor}25`, color: accentColor, border: `1px solid ${accentColor}40` }}>
              {album.genre}
            </span>
          )}
          <p className="text-white/50 text-sm font-medium tracking-widest uppercase">{album.artist}</p>
        </motion.div>

        {/* Center — album title + countdown */}
        <div className="flex flex-col items-center gap-10 w-full max-w-5xl">
          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, scale: 0.93 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35 }}
            className={`${fc.title} text-white text-center`}
            style={{ fontSize: 'clamp(2.5rem, 8vw, 7rem)', lineHeight: 1 }}
          >
            {album.title}
          </motion.h1>

          {/* Countdown or "Out Now" */}
          {released ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className={`${fontStyle === 'SLENDER' ? 'font-thin' : 'font-black'} text-white text-6xl uppercase tracking-widest text-center`}>
              Out Now
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="flex items-start justify-center gap-4 md:gap-8 w-full">
              {[
                { value: timeLeft.months,  label: 'Mo' },
                { value: timeLeft.days,    label: 'Days' },
                { value: timeLeft.hours,   label: 'Hrs' },
                { value: timeLeft.minutes, label: 'Min' },
                { value: timeLeft.seconds, label: 'Sec' },
              ].filter(({ value, label }) => !(label === 'Mo' && value === 0 && timeLeft.total < 30 * 24 * 3600_000))
               .map(({ value, label }) => (
                <Digit key={label} value={value} label={label} fontStyle={fontStyle} accentColor={accentColor} />
              ))}
            </motion.div>
          )}

          {/* Description snippet */}
          {album.description && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
              className="text-white/40 text-sm text-center max-w-lg leading-relaxed font-light tracking-wide">
              {album.description.slice(0, 160)}{album.description.length > 160 ? '…' : ''}
            </motion.p>
          )}
        </div>

        {/* Bottom — actions + early access */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
          className="flex flex-col items-center gap-4 w-full max-w-sm">

          {/* CTA row */}
          <div className="flex items-center gap-3">
            <button onClick={handleCalendar}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95"
              style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.15)' }}>
              <Calendar size={13} /> Add to Calendar
            </button>
            <button onClick={handleShare}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95"
              style={{ background: `${accentColor}22`, color: accentColor, backdropFilter: 'blur(12px)', border: `1px solid ${accentColor}40` }}>
              {copied ? <Check size={13} /> : <Share2 size={13} />}
              {copied ? 'Copied!' : 'Share'}
            </button>
          </div>

          {/* Early Access / Review Code */}
          {!released && album.earlyAccessEnabled && !hasAccess && (
            <div className="w-full">
              {!showCodeEntry ? (
                <button onClick={() => setShowCodeEntry(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02]"
                  style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)' }}>
                  <Lock size={11} /> Have a Review Code? Enter it here
                </button>
              ) : (
                <AnimatePresence>
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        value={codeInput}
                        onChange={e => { setCodeInput(e.target.value.toUpperCase()); setCodeError(''); }}
                        onKeyDown={e => e.key === 'Enter' && handleRedeem()}
                        placeholder="ENTER CODE"
                        maxLength={12}
                        className="flex-1 bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-sm font-black tracking-[0.3em] text-white placeholder:text-white/20 outline-none focus:border-white/40 backdrop-blur-md transition-all text-center"
                      />
                      <button onClick={handleRedeem} disabled={!codeInput.trim() || redeeming}
                        className="flex items-center gap-2 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 disabled:opacity-40"
                        style={{ background: accentColor, color: '#000' }}>
                        <ChevronRight size={13} />
                      </button>
                    </div>
                    {codeError && <p className="text-[9px] text-red-400 text-center font-bold">{codeError}</p>}
                    {codeSuccess && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="text-[9px] text-green-400 text-center font-black uppercase tracking-widest">
                        ✓ Access granted — loading…
                      </motion.p>
                    )}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          )}

          {/* Access granted badge */}
          {hasAccess && !released && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl"
              style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)' }}>
              <Check size={11} className="text-green-400" />
              <span className="text-[9px] font-black uppercase tracking-widest text-green-400">Early Access Granted</span>
              {onUnlock && (
                <button onClick={() => onUnlock(album)}
                  className="ml-2 text-[9px] font-black uppercase tracking-widest text-green-300 underline">
                  Listen Now →
                </button>
              )}
            </div>
          )}

          {/* Tiny branding */}
          <p className="text-[8px] text-white/15 uppercase tracking-[0.4em]">Plajah · Release Page</p>
        </motion.div>
      </div>
    </div>
  );
}
