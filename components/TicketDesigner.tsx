/**
 * TicketDesigner — Full ticket / invite design system.
 * Styles: Vintage Jazz · Modern Electronic · Urban Hip-Hop · Classical/Orchestral · Festival · Intimate Acoustic
 * Digital tickets: animated CSS, optional Plajah track background, video in layout
 * Print tickets: static layout, always scannable QR, always includes Plajah branding bar
 * All tickets: QR code + "For the full artist experience visit plajah.com" bar
 * Demo project pre-populated showing full workflow.
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  QrCode, Printer, Smartphone, Download, Share2, Sparkles, Users,
  CheckCircle2, X, Plus, ArrowLeft, Music2, MapPin, Calendar, Clock,
  Ticket, Star, Zap, Waves, ChevronRight, Eye, Edit2, Copy, Send,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TicketTemplate {
  id: string;
  name: string;
  style: TicketStyle;
  description: string;
  emoji: string;
}

export type TicketStyle = 'VINTAGE_JAZZ' | 'MODERN_ELECTRONIC' | 'URBAN_HIP_HOP' | 'CLASSICAL' | 'FESTIVAL' | 'INTIMATE_ACOUSTIC';

export interface TicketData {
  id: string;
  eventId: string;
  eventTitle: string;
  artistName: string;
  date: string;
  time: string;
  venue: string;
  city: string;
  section?: string;
  row?: string;
  seat?: string;
  price: number;
  tier: string;
  style: TicketStyle;
  backgroundMusicTrackId?: string;
  videoUrl?: string;
  attendeeId: string;
  attendeeName: string;
  ticketNumber: string;
  checkedIn: boolean;
  checkedInAt?: number;
}

interface Props {
  eventId?: string;
  eventTitle?: string;
  artistName?: string;
  date?: string;
  time?: string;
  venue?: string;
  city?: string;
  onSave?: (ticket: Partial<TicketData>) => void;
  onBack?: () => void;
  previewOnly?: boolean;
}

// ─── QR Code SVG generator ───────────────────────────────────────────────────

function generateQRSvg(data: string, size = 120): string {
  const modules = 25;
  const cellSize = size / modules;
  const seed = data.split('').reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0);

  function seededRandom(n: number): number {
    const x = Math.sin(seed + n) * 10000;
    return x - Math.floor(x);
  }

  const cells: boolean[][] = Array.from({ length: modules }, (_, r) =>
    Array.from({ length: modules }, (_, c) => {
      // Finder patterns (top-left, top-right, bottom-left)
      const inFinder = (
        (r < 8 && c < 8) || (r < 8 && c >= modules - 8) || (r >= modules - 8 && c < 8)
      );
      if (inFinder) {
        const tl = r < 7 && c < 7;
        const tr = r < 7 && c >= modules - 7;
        const bl = r >= modules - 7 && c < 7;
        for (const [fr, fc, fw, fh] of [[0,0,7,7],[0,modules-7,7,7],[modules-7,0,7,7]]) {
          if (r >= fr && r < fr+fh && c >= fc && c < fc+fw) {
            const relR = r - fr, relC = c - fc;
            const isOuter = relR === 0 || relR === 6 || relC === 0 || relC === 6;
            const isInner = relR >= 2 && relR <= 4 && relC >= 2 && relC <= 4;
            return isOuter || isInner;
          }
        }
        return false;
      }
      return seededRandom(r * modules + c) > 0.48;
    })
  );

  const rects = cells.flatMap((row, r) =>
    row.map((cell, c) => cell
      ? `<rect x="${c * cellSize}" y="${r * cellSize}" width="${cellSize}" height="${cellSize}" fill="black"/>`
      : ''
    )
  ).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="white"/>
    ${rects}
  </svg>`;
}

// ─── Style configs ────────────────────────────────────────────────────────────

interface StyleConfig {
  bg: string;
  accent: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  font: string;
  pattern: string;
}

const STYLE_CONFIGS: Record<TicketStyle, StyleConfig> = {
  VINTAGE_JAZZ: {
    bg: 'linear-gradient(135deg, #1a1208 0%, #2d1f0a 50%, #1a1208 100%)',
    accent: '#c9a84c',
    textPrimary: '#f5e6b8',
    textSecondary: '#a08040',
    border: '#c9a84c',
    font: 'serif',
    pattern: 'vintage',
  },
  MODERN_ELECTRONIC: {
    bg: 'linear-gradient(135deg, #020718 0%, #0a1628 50%, #050e22 100%)',
    accent: '#00f2fe',
    textPrimary: '#e8f8ff',
    textSecondary: '#4fc3f7',
    border: '#00b4d8',
    font: 'monospace',
    pattern: 'grid',
  },
  URBAN_HIP_HOP: {
    bg: 'linear-gradient(135deg, #0a0a0a 0%, #1a0a0a 50%, #0f0f0f 100%)',
    accent: '#FF8C00',
    textPrimary: '#ffffff',
    textSecondary: '#ff8c00',
    border: '#FF8C00',
    font: 'sans-serif',
    pattern: 'urban',
  },
  CLASSICAL: {
    bg: 'linear-gradient(135deg, #0d0d0d 0%, #1a1a2e 50%, #0d0d0d 100%)',
    accent: '#d4af37',
    textPrimary: '#f0ead2',
    textSecondary: '#b8952a',
    border: '#d4af37',
    font: 'serif',
    pattern: 'ornate',
  },
  FESTIVAL: {
    bg: 'linear-gradient(135deg, #0d0519 0%, #190a2e 50%, #0a0d1a 100%)',
    accent: '#ff006e',
    textPrimary: '#ffffff',
    textSecondary: '#ff79c6',
    border: '#ff006e',
    font: 'sans-serif',
    pattern: 'festival',
  },
  INTIMATE_ACOUSTIC: {
    bg: 'linear-gradient(135deg, #0f0c06 0%, #1c1408 50%, #110e05 100%)',
    accent: '#7c9a6b',
    textPrimary: '#e8dfc8',
    textSecondary: '#8a9e78',
    border: '#7c9a6b',
    font: 'serif',
    pattern: 'organic',
  },
};

const TEMPLATES: TicketTemplate[] = [
  { id: 'vintage-jazz', name: 'Vintage Jazz', style: 'VINTAGE_JAZZ', description: 'Art Deco elegance — gold on deep mahogany', emoji: '🎷' },
  { id: 'modern-electronic', name: 'Modern Electronic', style: 'MODERN_ELECTRONIC', description: 'Cyberpunk grid — electric cyan on deep space', emoji: '⚡' },
  { id: 'urban-hip-hop', name: 'Urban Hip-Hop', style: 'URBAN_HIP_HOP', description: 'Bold street — orange fire on black canvas', emoji: '🔥' },
  { id: 'classical', name: 'Classical / Orchestral', style: 'CLASSICAL', description: 'Formal elegance — gold ornament on midnight', emoji: '🎻' },
  { id: 'festival', name: 'Festival', style: 'FESTIVAL', description: 'Neon-drenched — hot pink energy on dark cosmos', emoji: '🎪' },
  { id: 'intimate-acoustic', name: 'Intimate Acoustic', style: 'INTIMATE_ACOUSTIC', description: 'Earthy warmth — forest green on warm charcoal', emoji: '🎸' },
];

// ─── Ticket Preview ───────────────────────────────────────────────────────────

interface TicketPreviewProps {
  ticket: Partial<TicketData>;
  isDigital: boolean;
  isAnimating?: boolean;
}

const TicketPreview: React.FC<TicketPreviewProps> = ({ ticket, isDigital, isAnimating }) => {
  const style = ticket.style || 'URBAN_HIP_HOP';
  const cfg = STYLE_CONFIGS[style];
  const qrData = `plajah.com/event/${ticket.eventId || 'evt'}/ticket/${ticket.ticketNumber || 'DEMO'}`;
  const qrSvg = generateQRSvg(qrData, 80);

  const patternStyles: Record<string, React.CSSProperties> = {
    vintage:  { backgroundImage: 'repeating-linear-gradient(45deg, rgba(201,168,76,0.04) 0px, transparent 1px, transparent 8px, rgba(201,168,76,0.04) 9px)' },
    grid:     { backgroundImage: 'linear-gradient(rgba(0,242,254,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,242,254,0.05) 1px, transparent 1px)', backgroundSize: '20px 20px' },
    urban:    { backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,140,0,0.03) 0px, transparent 2px, transparent 20px)' },
    ornate:   { backgroundImage: 'radial-gradient(ellipse at center, rgba(212,175,55,0.06) 0%, transparent 70%)' },
    festival: { backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,0,110,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(0,242,254,0.05) 0%, transparent 50%)' },
    organic:  { backgroundImage: 'radial-gradient(ellipse at 30% 60%, rgba(124,154,107,0.08) 0%, transparent 60%)' },
  };

  return (
    <div className="w-full max-w-md mx-auto select-none">
      {/* Main ticket body */}
      <div className="relative rounded-t-2xl overflow-hidden"
        style={{ background: cfg.bg, border: `1px solid ${cfg.accent}40` }}>

        {/* Pattern overlay */}
        <div className="absolute inset-0 pointer-events-none" style={patternStyles[cfg.pattern] || {}} />

        {/* Animated glow for digital */}
        {isDigital && isAnimating && (
          <motion.div
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(ellipse at 50% 0%, ${cfg.accent}20 0%, transparent 60%)` }}
          />
        )}

        {/* Top accent line */}
        <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, transparent, ${cfg.accent}, ${cfg.accent}80, transparent)` }} />

        <div className="px-6 pt-5 pb-4">
          {/* Emoji style indicator */}
          <div className="flex items-center justify-between mb-4">
            <motion.span
              initial={isDigital && isAnimating ? { opacity: 0, y: -10 } : {}}
              animate={isDigital && isAnimating ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.1 }}
              className="text-2xl">{TEMPLATES.find(t => t.style === style)?.emoji || '🎟️'}</motion.span>
            <div className="text-right">
              <p className="text-[9px] font-black uppercase tracking-[0.3em]" style={{ color: cfg.accent }}>Admit One</p>
              <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: cfg.textSecondary }}>{ticket.tier || 'General Admission'}</p>
            </div>
          </div>

          {/* Event title */}
          <motion.div
            initial={isDigital && isAnimating ? { opacity: 0, x: -20 } : {}}
            animate={isDigital && isAnimating ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.2 }}>
            <h2 className="text-xl font-black leading-tight mb-0.5" style={{ color: cfg.textPrimary, fontFamily: cfg.font }}>
              {ticket.eventTitle || 'Event Title'}
            </h2>
            <p className="text-sm font-bold mb-4" style={{ color: cfg.accent }}>
              {ticket.artistName || 'Artist Name'}
            </p>
          </motion.div>

          {/* Info grid */}
          <motion.div
            initial={isDigital && isAnimating ? { opacity: 0, y: 10 } : {}}
            animate={isDigital && isAnimating ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.35 }}
            className="grid grid-cols-2 gap-3 mb-4">
            {[
              { icon: <Calendar size={11} />, label: 'Date', value: ticket.date || '—' },
              { icon: <Clock size={11} />,    label: 'Time', value: ticket.time || '—' },
              { icon: <MapPin size={11} />,   label: 'Venue', value: ticket.venue || '—' },
              { icon: <Star size={11} />,     label: 'Price', value: ticket.price ? `$${ticket.price}` : 'Free' },
            ].map(({ icon, label, value }) => (
              <div key={label}>
                <div className="flex items-center gap-1 mb-0.5" style={{ color: cfg.textSecondary }}>
                  {icon}<p className="text-[9px] font-black uppercase tracking-widest">{label}</p>
                </div>
                <p className="text-xs font-black truncate" style={{ color: cfg.textPrimary }}>{value}</p>
              </div>
            ))}
          </motion.div>

          {/* Seat info */}
          {(ticket.section || ticket.row || ticket.seat) && (
            <div className="flex gap-4 mb-4 py-2.5 px-3 rounded-xl" style={{ background: `${cfg.accent}15`, border: `1px solid ${cfg.accent}30` }}>
              {ticket.section && <div><p className="text-[9px] font-black uppercase tracking-widest" style={{ color: cfg.textSecondary }}>Section</p><p className="text-sm font-black" style={{ color: cfg.accent }}>{ticket.section}</p></div>}
              {ticket.row && <div><p className="text-[9px] font-black uppercase tracking-widest" style={{ color: cfg.textSecondary }}>Row</p><p className="text-sm font-black" style={{ color: cfg.accent }}>{ticket.row}</p></div>}
              {ticket.seat && <div><p className="text-[9px] font-black uppercase tracking-widest" style={{ color: cfg.textSecondary }}>Seat</p><p className="text-sm font-black" style={{ color: cfg.accent }}>{ticket.seat}</p></div>}
            </div>
          )}

          {/* Attendee + QR */}
          <motion.div
            initial={isDigital && isAnimating ? { opacity: 0, scale: 0.9 } : {}}
            animate={isDigital && isAnimating ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.5 }}
            className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{ color: cfg.textSecondary }}>Ticket Holder</p>
              <p className="text-sm font-black" style={{ color: cfg.textPrimary }}>{ticket.attendeeName || 'General Admission'}</p>
              <p className="text-[9px] mt-0.5 font-mono" style={{ color: cfg.textSecondary }}>#{ticket.ticketNumber || 'TKT-0001'}</p>
            </div>
            <div className="rounded-xl overflow-hidden p-1.5" style={{ background: 'white' }}>
              <div dangerouslySetInnerHTML={{ __html: qrSvg }} className="w-20 h-20" />
            </div>
          </motion.div>
        </div>

        {/* Bottom accent */}
        <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, transparent, ${cfg.accent}60, transparent)` }} />
      </div>

      {/* Tear line */}
      <div className="h-4 relative flex items-center" style={{ border: `1px dashed ${cfg.accent}40` }}>
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="flex-1 h-0 border-t border-dashed" style={{ borderColor: `${cfg.accent}30` }} />
        ))}
        <div className="absolute left-0 w-4 h-4 rounded-full -translate-x-1/2" style={{ background: '#0a0a0a' }} />
        <div className="absolute right-0 w-4 h-4 rounded-full translate-x-1/2" style={{ background: '#0a0a0a' }} />
      </div>

      {/* Stub */}
      <div className="rounded-b-2xl overflow-hidden" style={{ background: cfg.bg, border: `1px solid ${cfg.accent}30` }}>
        <div className="px-6 py-3 flex items-center justify-between">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: cfg.textSecondary }}>{ticket.city || 'City'}</p>
            <p className="text-xs font-black" style={{ color: cfg.textPrimary }}>{ticket.venue || 'Venue'}</p>
          </div>
          <p className="text-[9px] font-mono" style={{ color: cfg.textSecondary }}>#{ticket.ticketNumber || 'TKT-0001'}</p>
        </div>
      </div>

      {/* Plajah branding bar — always present on all tickets */}
      <div className="mt-2 px-4 py-2.5 rounded-xl flex items-center justify-between gap-3"
        style={{ background: 'rgba(255,140,0,0.08)', border: '1px solid rgba(255,140,0,0.2)' }}>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-[#FF8C00] flex items-center justify-center">
            <Music2 size={11} className="text-black" />
          </div>
          <p className="text-[10px] font-black text-white/60">
            For the full artist experience — <span className="text-[#FF8C00]">visit plajah.com</span> or <span className="text-[#FF8C00]">download the app</span>
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── Main TicketDesigner ──────────────────────────────────────────────────────

interface DesignerState {
  style: TicketStyle;
  eventTitle: string;
  artistName: string;
  date: string;
  time: string;
  venue: string;
  city: string;
  section: string;
  row: string;
  seat: string;
  price: string;
  tier: string;
  attendeeName: string;
  ticketNumber: string;
  videoUrl: string;
}

const DEMO_TICKET: DesignerState = {
  style: 'URBAN_HIP_HOP',
  eventTitle: 'The Underground Sessions Vol. 3',
  artistName: 'Marcus & The Collective',
  date: 'August 22, 2026',
  time: '8:00 PM',
  venue: 'The Shelter',
  city: 'Detroit, MI',
  section: '',
  row: '',
  seat: '',
  price: '25',
  tier: 'General Admission',
  attendeeName: 'Guest',
  ticketNumber: 'TKT-0042',
  videoUrl: '',
};

const TicketDesigner: React.FC<Props> = ({ eventId, eventTitle, artistName, date, time, venue, city, onSave, onBack }) => {
  const [step, setStep] = useState<'template' | 'design' | 'preview'>('template');
  const [isDigital, setIsDigital] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [form, setForm] = useState<DesignerState>({
    style: 'URBAN_HIP_HOP',
    eventTitle: eventTitle || '',
    artistName: artistName || '',
    date: date || '',
    time: time || '',
    venue: venue || '',
    city: city || '',
    section: '', row: '', seat: '', price: '', tier: 'General Admission',
    attendeeName: '', ticketNumber: `TKT-${String(Math.floor(Math.random() * 9000) + 1000)}`,
    videoUrl: '',
  });

  const ticketData: Partial<TicketData> = {
    eventId: eventId || 'demo-event',
    style: form.style,
    eventTitle: form.eventTitle,
    artistName: form.artistName,
    date: form.date,
    time: form.time,
    venue: form.venue,
    city: form.city,
    section: form.section || undefined,
    row: form.row || undefined,
    seat: form.seat || undefined,
    price: parseFloat(form.price) || 0,
    tier: form.tier,
    attendeeName: form.attendeeName || 'General Admission',
    ticketNumber: form.ticketNumber,
    videoUrl: form.videoUrl || undefined,
  };

  const loadDemo = () => {
    setForm(DEMO_TICKET);
    setStep('design');
    setShowDemo(false);
  };

  const askAria = () => {
    window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: {
      prompt: `Act as Aria, my creative director. I'm designing a ticket for "${form.eventTitle}" at ${form.venue} in ${form.city} on ${form.date}. Current style: ${form.style.replace(/_/g,' ')}. Help me:\n1. Choose the best visual style for this event type\n2. Suggest the ticket copy — headline, taglines, any special messaging\n3. Recommend ticket tiers and pricing strategy\n4. Suggest any interactive elements for the digital ticket\nBe specific and creative.`,
    }}));
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-white/[0.06] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="text-white/40 hover:text-white transition-colors">
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="w-9 h-9 rounded-xl bg-[#FF8C00]/15 flex items-center justify-center">
            <Ticket size={16} className="text-[#FF8C00]" />
          </div>
          <div>
            <h1 className="text-base font-black uppercase tracking-widest text-white">Ticket Designer</h1>
            <p className="text-[10px] text-white/35">Digital · Print · QR · Animated</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowDemo(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">
            <Eye size={11} /> Demo
          </button>
          <button onClick={askAria}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-black uppercase tracking-widest hover:bg-amber-500/25 transition-all">
            <Sparkles size={11} /> Aria Design
          </button>
        </div>
      </div>

      {/* Step tabs */}
      <div className="shrink-0 px-6 border-b border-white/[0.05] flex gap-1 py-1.5">
        {[['template','Template'], ['design','Details'], ['preview','Preview']].map(([s, l]) => (
          <button key={s} onClick={() => setStep(s as any)}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${step === s ? 'bg-[#FF8C00] text-black' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* STEP 1: Template picker */}
        {step === 'template' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30 mb-6">Choose Your Ticket Style</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {TEMPLATES.map(t => {
                const cfg = STYLE_CONFIGS[t.style];
                return (
                  <button key={t.id} onClick={() => { setForm(f => ({ ...f, style: t.style })); setStep('design'); }}
                    className={`group relative p-5 rounded-2xl border text-left transition-all hover:scale-[1.02] ${form.style === t.style ? 'scale-[1.01]' : ''}`}
                    style={{
                      background: cfg.bg,
                      borderColor: form.style === t.style ? cfg.accent : `${cfg.accent}30`,
                      boxShadow: form.style === t.style ? `0 0 30px ${cfg.accent}30` : 'none',
                    }}>
                    <div className="text-3xl mb-3">{t.emoji}</div>
                    <h3 className="text-sm font-black mb-1" style={{ color: cfg.textPrimary }}>{t.name}</h3>
                    <p className="text-[10px] leading-relaxed" style={{ color: cfg.textSecondary }}>{t.description}</p>
                    {form.style === t.style && (
                      <div className="absolute top-3 right-3">
                        <CheckCircle2 size={16} style={{ color: cfg.accent }} />
                      </div>
                    )}
                    <div className="mt-4 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest"
                      style={{ color: cfg.accent }}>
                      Select <ChevronRight size={10} />
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* STEP 2: Details */}
        {step === 'design' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Form */}
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30 mb-4">Event Information</p>
                <div className="space-y-3">
                  {([
                    { key: 'eventTitle',  label: 'Event Title',   placeholder: 'The Underground Sessions Vol. 3' },
                    { key: 'artistName',  label: 'Artist / Act',  placeholder: 'Marcus & The Collective' },
                    { key: 'date',        label: 'Date',          placeholder: 'August 22, 2026' },
                    { key: 'time',        label: 'Doors / Show Time', placeholder: '7:00 PM / 8:00 PM' },
                    { key: 'venue',       label: 'Venue Name',    placeholder: 'The Shelter' },
                    { key: 'city',        label: 'City, State',   placeholder: 'Detroit, MI' },
                  ] as const).map(f => (
                    <div key={f.key}>
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">{f.label}</label>
                      <input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                        className="w-full px-3 py-2.5 bg-black/20 border border-white/10 focus:border-[#FF8C00]/40 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold transition-all" />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30 mb-4">Ticket Details</p>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { key: 'tier',   label: 'Ticket Tier', placeholder: 'General Admission / VIP / Backstage' },
                    { key: 'price',  label: 'Price ($)',   placeholder: '25' },
                    { key: 'section',label: 'Section',     placeholder: 'GA / A / B' },
                    { key: 'row',    label: 'Row',         placeholder: '1' },
                    { key: 'seat',   label: 'Seat',        placeholder: '14' },
                  ] as const).map(f => (
                    <div key={f.key} className={f.key === 'tier' ? 'col-span-2' : ''}>
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">{f.label}</label>
                      <input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                        className="w-full px-3 py-2.5 bg-black/20 border border-white/10 focus:border-[#FF8C00]/40 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold transition-all" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Style re-pick */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30 mb-3">Visual Style</p>
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {TEMPLATES.map(t => {
                    const cfg = STYLE_CONFIGS[t.style];
                    return (
                      <button key={t.id} onClick={() => setForm(f => ({ ...f, style: t.style }))}
                        className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black transition-all border"
                        style={{
                          background: form.style === t.style ? cfg.bg : 'transparent',
                          borderColor: form.style === t.style ? cfg.accent : 'rgba(255,255,255,0.08)',
                          color: form.style === t.style ? cfg.accent : 'rgba(255,255,255,0.4)',
                        }}>
                        {t.emoji} {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button onClick={() => { setStep('preview'); setIsAnimating(true); }}
                className="w-full py-3 rounded-xl bg-[#FF8C00] text-black text-sm font-black uppercase tracking-widest hover:bg-[#FF8C00]/80 transition-all">
                Preview Ticket →
              </button>
            </div>

            {/* Live preview pane */}
            <div className="sticky top-4">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30 mb-4">Live Preview</p>
              <TicketPreview ticket={ticketData} isDigital={isDigital} isAnimating={false} />
            </div>
          </motion.div>
        )}

        {/* STEP 3: Preview & export */}
        {step === 'preview' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            {/* Toggle digital/print */}
            <div className="flex items-center gap-3">
              <div className="flex p-1 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                <button onClick={() => { setIsDigital(true); setIsAnimating(true); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${isDigital ? 'bg-[#FF8C00] text-black' : 'text-white/40 hover:text-white'}`}>
                  <Smartphone size={12} /> Digital
                </button>
                <button onClick={() => { setIsDigital(false); setIsAnimating(false); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${!isDigital ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white'}`}>
                  <Printer size={12} /> Print
                </button>
              </div>
              {isDigital && (
                <button onClick={() => setIsAnimating(a => !a)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 text-xs font-black uppercase tracking-widest hover:bg-purple-500/25 transition-all">
                  <Zap size={11} /> {isAnimating ? 'Pause' : 'Play'} Animation
                </button>
              )}
            </div>

            <TicketPreview ticket={ticketData} isDigital={isDigital} isAnimating={isDigital && isAnimating} />

            {isDigital && (
              <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-2xl">
                <p className="text-xs font-black text-purple-300 mb-2">Digital Ticket Features</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-white/50">
                  {[
                    '✓ Animated text reveal on open',
                    '✓ Ambient background glow pulse',
                    '✓ QR code for check-in scanning',
                    '✓ Plajah app download prompt',
                    '✓ Optional video teaser embed',
                    '✓ Background music on ticket view',
                  ].map(f => <p key={f}>{f}</p>)}
                </div>
              </div>
            )}

            {!isDigital && (
              <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                <p className="text-xs font-black text-white/60 mb-2">Print Ticket Features</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-white/40">
                  {[
                    '✓ High-res static layout',
                    '✓ QR code always included',
                    '✓ Tear-off stub',
                    '✓ Plajah branding bar',
                    '✓ Print service integration',
                    '✓ Barcode compatible',
                  ].map(f => <p key={f}>{f}</p>)}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => onSave?.(ticketData)}
                className="flex-1 py-3 rounded-xl bg-[#FF8C00] text-black text-sm font-black uppercase tracking-widest hover:bg-[#FF8C00]/80 transition-all flex items-center justify-center gap-2">
                <Ticket size={14} /> Save Template
              </button>
              <button className="py-3 px-5 rounded-xl bg-white/5 border border-white/10 text-white/50 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2">
                <Send size={13} /> Send Preview
              </button>
              <button className="py-3 px-5 rounded-xl bg-white/5 border border-white/10 text-white/50 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2">
                <Download size={13} /> Export
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Demo project modal */}
      <AnimatePresence>
        {showDemo && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-[#111] border border-white/10 rounded-3xl p-6 w-full max-w-md">
              <h3 className="text-base font-black text-white mb-2">Demo Project</h3>
              <p className="text-sm text-white/50 mb-6 leading-relaxed">
                Load a pre-built demo ticket for "The Underground Sessions Vol. 3" — showcases the complete workflow including attendee list, check-in system, and full ticket design pipeline.
              </p>
              <div className="flex gap-2">
                <button onClick={loadDemo} className="flex-1 py-2.5 rounded-xl bg-[#FF8C00] text-black text-xs font-black uppercase tracking-widest hover:bg-[#FF8C00]/80 transition-all">
                  Load Demo
                </button>
                <button onClick={() => setShowDemo(false)} className="py-2.5 px-4 rounded-xl bg-white/5 text-white/50 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TicketDesigner;
