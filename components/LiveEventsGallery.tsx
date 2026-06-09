/**
 * LiveEventsGallery — Public discovery feed for live events on the platform.
 * Shows events happening locally and globally across all types:
 * Music, Art, Comedy, Film, Dance, Sports, Community, Literary, and more.
 * Includes demo events pre-populated to showcase the platform.
 * Artists with events connected to Plajah appear here automatically.
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MapPin, Calendar, Clock, Users, Ticket, Star, Music2, Palette,
  Mic, Camera, Film, Gamepad2, Heart, Globe, Search, ChevronRight,
  Radio, Zap, TrendingUp, Filter, X, ExternalLink, Play,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type EventCategory = 'ALL' | 'MUSIC' | 'ART' | 'COMEDY' | 'FILM' | 'DANCE' | 'COMMUNITY' | 'LITERARY' | 'SPORTS' | 'FESTIVAL';
type EventFormat = 'IN_PERSON' | 'VIRTUAL' | 'HYBRID';

interface LiveEvent {
  id: string;
  title: string;
  artist: string;
  artistVerified: boolean;
  category: EventCategory;
  format: EventFormat;
  date: string;
  time: string;
  doorsTime?: string;
  venue: string;
  city: string;
  state: string;
  country: string;
  price: number;
  priceLabel: string;
  capacity: number;
  soldCount: number;
  coverEmoji: string;
  coverGradient: string;
  accentColor: string;
  description: string;
  tags: string[];
  isFeatured: boolean;
  isHot: boolean;
  isPPV: boolean;
  ppvPrice?: number;
  ageRestriction?: string;
}

// ─── Demo events ─────────────────────────────────────────────────────────────

const DEMO_EVENTS: LiveEvent[] = [
  {
    id: 'evt-001',
    title: 'The Underground Sessions Vol. 3',
    artist: 'Marcus & The Collective',
    artistVerified: true,
    category: 'MUSIC',
    format: 'IN_PERSON',
    date: 'Aug 22, 2026',
    time: '8:00 PM',
    doorsTime: '7:00 PM',
    venue: 'The Shelter',
    city: 'Detroit',
    state: 'MI',
    country: 'US',
    price: 25,
    priceLabel: '$25 GA · $75 VIP',
    capacity: 400,
    soldCount: 287,
    coverEmoji: '🎷',
    coverGradient: 'linear-gradient(135deg, #0a0a0a 0%, #1a0a0a 60%, #0f0f0f 100%)',
    accentColor: '#FF8C00',
    description: 'An intimate evening of jazz-infused hip-hop. Limited capacity. First come, first served for GA. VIP includes meet & greet backstage.',
    tags: ['Jazz', 'Hip-Hop', 'Intimate', 'Live Band'],
    isFeatured: true,
    isHot: true,
    isPPV: false,
  },
  {
    id: 'evt-002',
    title: 'Midtown Art Fair & Market',
    artist: 'Detroit Cultural Arts Collective',
    artistVerified: true,
    category: 'ART',
    format: 'IN_PERSON',
    date: 'Aug 16, 2026',
    time: '10:00 AM',
    venue: 'Midtown Detroit / Willis St',
    city: 'Detroit',
    state: 'MI',
    country: 'US',
    price: 0,
    priceLabel: 'Free Entry',
    capacity: 2000,
    soldCount: 1240,
    coverEmoji: '🎨',
    coverGradient: 'linear-gradient(135deg, #0d0519 0%, #190532 60%, #0a0a18 100%)',
    accentColor: '#a855f7',
    description: '80+ local artists. Live painting, sculpture, photography, ceramics. Live music stages, food trucks, and community workshops all day.',
    tags: ['Art', 'Community', 'Market', 'Free', 'Family Friendly'],
    isFeatured: true,
    isHot: false,
    isPPV: false,
  },
  {
    id: 'evt-003',
    title: 'Jazz at the Garden — Summer Series',
    artist: 'Nina Rochelle Trio',
    artistVerified: false,
    category: 'MUSIC',
    format: 'IN_PERSON',
    date: 'Aug 19, 2026',
    time: '6:30 PM',
    venue: 'Detroit Garden Center',
    city: 'Detroit',
    state: 'MI',
    country: 'US',
    price: 15,
    priceLabel: '$15 · Bring a blanket',
    capacity: 300,
    soldCount: 189,
    coverEmoji: '🌿',
    coverGradient: 'linear-gradient(135deg, #0f0c06 0%, #1c1408 60%, #110e05 100%)',
    accentColor: '#7c9a6b',
    description: 'Outdoor jazz in one of Detroit\'s most beautiful garden spaces. Bring a blanket and a bottle. BYO picnic welcome.',
    tags: ['Jazz', 'Outdoor', 'Picnic', 'Trio'],
    isFeatured: false,
    isHot: false,
    isPPV: false,
  },
  {
    id: 'evt-004',
    title: 'Detroit International Film Festival — Opening Night',
    artist: 'DIFF 2026',
    artistVerified: true,
    category: 'FILM',
    format: 'HYBRID',
    date: 'Sep 4, 2026',
    time: '7:00 PM',
    venue: 'Detroit Film Theatre',
    city: 'Detroit',
    state: 'MI',
    country: 'US',
    price: 35,
    priceLabel: '$35 In-Person · $9.99 Stream',
    capacity: 500,
    soldCount: 421,
    coverEmoji: '🎬',
    coverGradient: 'linear-gradient(135deg, #0d0d0d 0%, #1a1a2e 60%, #0d0d0d 100%)',
    accentColor: '#d4af37',
    description: 'Opening night of DIFF 2026. World premiere screening + director Q&A + after-party. Hybrid streaming available for remote attendees.',
    tags: ['Film', 'Festival', 'Premiere', 'Hybrid', 'Q&A'],
    isFeatured: false,
    isHot: true,
    isPPV: true,
    ppvPrice: 9.99,
    ageRestriction: '18+',
  },
  {
    id: 'evt-005',
    title: 'Open Mic Night — No Cover, All Welcome',
    artist: 'The Shelter Detroit',
    artistVerified: true,
    category: 'MUSIC',
    format: 'IN_PERSON',
    date: 'Aug 14, 2026',
    time: '8:00 PM',
    venue: 'The Shelter',
    city: 'Detroit',
    state: 'MI',
    country: 'US',
    price: 0,
    priceLabel: 'Free · $5 suggested donation',
    capacity: 150,
    soldCount: 67,
    coverEmoji: '🎤',
    coverGradient: 'linear-gradient(135deg, #020718 0%, #0a1628 60%, #050e22 100%)',
    accentColor: '#00f2fe',
    description: 'Every Thursday. Poets, comedians, musicians, spoken word, and surprise performers. Sign up at the door. Doors at 7, show at 8.',
    tags: ['Open Mic', 'Free', 'Weekly', 'Multi-Genre'],
    isFeatured: false,
    isHot: false,
    isPPV: false,
  },
  {
    id: 'evt-006',
    title: 'Electronic Night — VOLT Series',
    artist: 'DJ Khalil × Mara Nova',
    artistVerified: true,
    category: 'MUSIC',
    format: 'IN_PERSON',
    date: 'Aug 29, 2026',
    time: '10:00 PM',
    venue: 'TV Lounge',
    city: 'Detroit',
    state: 'MI',
    country: 'US',
    price: 20,
    priceLabel: '$20 Advance · $25 Door',
    capacity: 600,
    soldCount: 412,
    coverEmoji: '⚡',
    coverGradient: 'linear-gradient(135deg, #020718 0%, #05071a 60%, #020510 100%)',
    accentColor: '#ff006e',
    description: 'Detroit electronic music goes deep. Techno, house, and ambient electronic. 4 hours. No phones on dance floor.',
    tags: ['Techno', 'House', 'Electronic', 'Club Night'],
    isFeatured: false,
    isHot: true,
    isPPV: false,
    ageRestriction: '21+',
  },
  {
    id: 'evt-007',
    title: 'Community Dance Battle: Vol. 7',
    artist: 'Detroit Break Community',
    artistVerified: false,
    category: 'DANCE',
    format: 'IN_PERSON',
    date: 'Aug 23, 2026',
    time: '2:00 PM',
    venue: 'Campus Martius Park',
    city: 'Detroit',
    state: 'MI',
    country: 'US',
    price: 10,
    priceLabel: '$10 · Kids under 12 free',
    capacity: 800,
    soldCount: 340,
    coverEmoji: '🕺',
    coverGradient: 'linear-gradient(135deg, #0a0a0a 0%, #1a0a0a 60%, #0f0f0f 100%)',
    accentColor: '#f97316',
    description: 'Breakdancing, popping, locking, and house. Open battles in all styles. Community judges. Prizes for top crews. All ages, all styles welcome.',
    tags: ['Dance', 'Battle', 'Community', 'All Ages', 'Outdoor'],
    isFeatured: false,
    isHot: false,
    isPPV: false,
  },
  {
    id: 'evt-008',
    title: 'Youth Symphony — Season Opening Night',
    artist: 'Detroit Youth Symphony',
    artistVerified: true,
    category: 'MUSIC',
    format: 'IN_PERSON',
    date: 'Sep 13, 2026',
    time: '7:30 PM',
    venue: 'Orchestra Hall',
    city: 'Detroit',
    state: 'MI',
    country: 'US',
    price: 35,
    priceLabel: '$35–$85 · Student Rush $15',
    capacity: 1800,
    soldCount: 1560,
    coverEmoji: '🎻',
    coverGradient: 'linear-gradient(135deg, #0d0d0d 0%, #1a1a2e 60%, #0d0d0d 100%)',
    accentColor: '#d4af37',
    description: 'Opening night of the 2026–27 season. Featuring works by Beethoven, Coltrane (orchestral arrangements), and world premiere by composer Alicia Keys.',
    tags: ['Classical', 'Orchestra', 'Symphonic', 'Premiere'],
    isFeatured: true,
    isHot: false,
    isPPV: true,
    ppvPrice: 14.99,
  },
  {
    id: 'evt-009',
    title: 'Comedy Night at The Filmore',
    artist: 'Laughter Factory Presents',
    artistVerified: false,
    category: 'COMEDY',
    format: 'IN_PERSON',
    date: 'Aug 20, 2026',
    time: '8:00 PM',
    venue: 'The Filmore',
    city: 'Detroit',
    state: 'MI',
    country: 'US',
    price: 25,
    priceLabel: '$25 · 2 drink minimum',
    capacity: 350,
    soldCount: 198,
    coverEmoji: '😂',
    coverGradient: 'linear-gradient(135deg, #0a0a0a 0%, #1a0f00 60%, #0f0a00 100%)',
    accentColor: '#f59e0b',
    description: '5 comedians. 90 minutes. Local headliners and one surprise national touring act. Late-night vibes.',
    tags: ['Comedy', 'Stand-Up', 'Showcase', 'Late Night'],
    isFeatured: false,
    isHot: false,
    isPPV: false,
    ageRestriction: '18+',
  },
  {
    id: 'evt-010',
    title: 'Spoken Word & Poetry Night — Voices Uncut',
    artist: 'Detroit Voices Collective',
    artistVerified: false,
    category: 'LITERARY',
    format: 'IN_PERSON',
    date: 'Aug 27, 2026',
    time: '7:00 PM',
    venue: 'Café Detroit',
    city: 'Detroit',
    state: 'MI',
    country: 'US',
    price: 0,
    priceLabel: 'Free · Tips encouraged',
    capacity: 80,
    soldCount: 54,
    coverEmoji: '📖',
    coverGradient: 'linear-gradient(135deg, #0f0c06 0%, #1c1408 60%, #110e05 100%)',
    accentColor: '#7c9a6b',
    description: 'Monthly spoken word showcase. 12 featured poets. Open mic slots available after the main show. Intimate setting. Coffee and wine bar.',
    tags: ['Poetry', 'Spoken Word', 'Free', 'Intimate', 'Literary'],
    isFeatured: false,
    isHot: false,
    isPPV: false,
  },
  {
    id: 'evt-011',
    title: 'Gospel Brunch Concert — Sunday Morning Soul',
    artist: 'Greater Grace Mass Choir',
    artistVerified: false,
    category: 'MUSIC',
    format: 'IN_PERSON',
    date: 'Aug 24, 2026',
    time: '11:00 AM',
    venue: 'The Westin Ballroom',
    city: 'Detroit',
    state: 'MI',
    country: 'US',
    price: 45,
    priceLabel: '$45 · Includes full brunch',
    capacity: 250,
    soldCount: 210,
    coverEmoji: '🙏',
    coverGradient: 'linear-gradient(135deg, #0a0500 0%, #1a0e00 60%, #0f0800 100%)',
    accentColor: '#c9a84c',
    description: 'Live gospel performance with a full Sunday brunch spread. 3-hour experience. Choir, soloists, and praise band. All faiths welcome.',
    tags: ['Gospel', 'Brunch', 'Soul', 'All Ages'],
    isFeatured: false,
    isHot: false,
    isPPV: false,
  },
  {
    id: 'evt-012',
    title: 'Hip-Hop Cipher & Freestyle Battle',
    artist: 'Detroit Lyricist Alliance',
    artistVerified: false,
    category: 'MUSIC',
    format: 'IN_PERSON',
    date: 'Aug 15, 2026',
    time: '7:00 PM',
    venue: 'Avalon International Breads (Courtyard)',
    city: 'Detroit',
    state: 'MI',
    country: 'US',
    price: 10,
    priceLabel: '$10 · Cash preferred',
    capacity: 200,
    soldCount: 143,
    coverEmoji: '🔥',
    coverGradient: 'linear-gradient(135deg, #0a0a0a 0%, #180a00 60%, #0f0f0f 100%)',
    accentColor: '#ef4444',
    description: 'Monthly cipher in the courtyard. Open freestyle battles, beat sessions, and cypher circles. Bring your bars. All skill levels welcome.',
    tags: ['Hip-Hop', 'Freestyle', 'Battle', 'Outdoor', 'Community'],
    isFeatured: false,
    isHot: false,
    isPPV: false,
  },
  {
    id: 'evt-013',
    title: 'Global Jazz Summit — Virtual Showcase',
    artist: 'International Jazz Collective',
    artistVerified: true,
    category: 'MUSIC',
    format: 'VIRTUAL',
    date: 'Aug 30, 2026',
    time: '3:00 PM EST',
    venue: 'Plajah Live',
    city: 'Global',
    state: '',
    country: 'Global',
    price: 9.99,
    priceLabel: '$9.99 · Stream worldwide',
    capacity: 10000,
    soldCount: 3241,
    coverEmoji: '🌍',
    coverGradient: 'linear-gradient(135deg, #020718 0%, #0a1628 60%, #050e22 100%)',
    accentColor: '#00b4d8',
    description: 'Live streaming event featuring jazz ensembles from Detroit, New Orleans, Lagos, Tokyo, and São Paulo performing simultaneously. Curated by Plajah.',
    tags: ['Jazz', 'Global', 'Virtual', 'Multi-City', 'Stream'],
    isFeatured: true,
    isHot: true,
    isPPV: true,
    ppvPrice: 9.99,
  },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<EventCategory, { label: string; icon: React.ReactNode; color: string }> = {
  ALL:       { label: 'All Events',  icon: <Globe size={13} />,    color: '#FF8C00' },
  MUSIC:     { label: 'Music',       icon: <Music2 size={13} />,   color: '#FF8C00' },
  ART:       { label: 'Art',         icon: <Palette size={13} />,  color: '#a855f7' },
  COMEDY:    { label: 'Comedy',      icon: <Mic size={13} />,      color: '#f59e0b' },
  FILM:      { label: 'Film',        icon: <Film size={13} />,     color: '#d4af37' },
  DANCE:     { label: 'Dance',       icon: <Zap size={13} />,      color: '#f97316' },
  COMMUNITY: { label: 'Community',   icon: <Users size={13} />,    color: '#10b981' },
  LITERARY:  { label: 'Literary',    icon: <Heart size={13} />,    color: '#7c9a6b' },
  SPORTS:    { label: 'Sports',      icon: <TrendingUp size={13} />,color: '#3b82f6' },
  FESTIVAL:  { label: 'Festival',    icon: <Star size={13} />,     color: '#ff006e' },
};

// ─── Event Card ───────────────────────────────────────────────────────────────

const EventCard: React.FC<{ event: LiveEvent; onOpen: (e: LiveEvent) => void; featured?: boolean }> = ({ event, onOpen, featured }) => {
  const soldPct = Math.round((event.soldCount / event.capacity) * 100);
  const catMeta = CATEGORY_META[event.category];

  return (
    <motion.button
      onClick={() => onOpen(event)}
      whileHover={{ scale: 1.015 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`group relative text-left rounded-2xl overflow-hidden border border-white/[0.07] hover:border-white/20 transition-all w-full ${featured ? 'md:col-span-2' : ''}`}
      style={{ background: event.coverGradient }}
    >
      {/* Badges */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
        {event.isHot && (
          <span className="px-2.5 py-1 rounded-full bg-red-500 text-white text-[9px] font-black uppercase tracking-widest">🔥 Hot</span>
        )}
        {event.isPPV && (
          <span className="px-2.5 py-1 rounded-full bg-purple-500/80 text-white text-[9px] font-black uppercase tracking-widest">PPV</span>
        )}
        {event.format === 'VIRTUAL' && (
          <span className="px-2.5 py-1 rounded-full bg-blue-500/80 text-white text-[9px] font-black uppercase tracking-widest">Virtual</span>
        )}
        {event.format === 'HYBRID' && (
          <span className="px-2.5 py-1 rounded-full bg-teal-500/80 text-white text-[9px] font-black uppercase tracking-widest">Hybrid</span>
        )}
      </div>

      {/* Age restriction */}
      {event.ageRestriction && (
        <div className="absolute top-3 right-3 z-10">
          <span className="px-2 py-1 rounded-full bg-black/60 text-white/60 text-[9px] font-black uppercase tracking-widest">{event.ageRestriction}</span>
        </div>
      )}

      {/* Cover art area */}
      <div className={`relative flex items-center justify-center ${featured ? 'h-48' : 'h-32'}`}
        style={{ background: `radial-gradient(ellipse at 30% 40%, ${event.accentColor}25 0%, transparent 60%)` }}>
        <span className={`${featured ? 'text-6xl' : 'text-4xl'}`}>{event.coverEmoji}</span>
      </div>

      {/* Info */}
      <div className="p-4 pt-0">
        {/* Category */}
        <div className="flex items-center gap-1.5 mb-2" style={{ color: event.accentColor }}>
          {catMeta.icon}
          <p className="text-[10px] font-black uppercase tracking-widest">{catMeta.label}</p>
        </div>

        <h3 className={`font-black text-white leading-tight mb-1 ${featured ? 'text-lg' : 'text-sm'}`}>{event.title}</h3>
        <p className="text-xs font-bold mb-3" style={{ color: event.accentColor }}>
          {event.artist}
          {event.artistVerified && <span className="ml-1 text-[9px]">✓</span>}
        </p>

        {/* Details */}
        <div className="space-y-1.5 mb-3">
          <div className="flex items-center gap-1.5 text-[10px] text-white/50">
            <Calendar size={9} className="shrink-0" />
            <span className="font-bold">{event.date}</span>
            <Clock size={9} className="shrink-0 ml-1" />
            <span>{event.time}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-white/50">
            <MapPin size={9} className="shrink-0" />
            <span className="truncate">{event.venue}, {event.city}{event.state ? `, ${event.state}` : ''}</span>
          </div>
        </div>

        {/* Sold bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[9px] text-white/30 font-black uppercase tracking-widest">{event.soldCount.toLocaleString()} attending</p>
            <p className="text-[9px] font-black" style={{ color: soldPct > 85 ? '#ef4444' : soldPct > 60 ? '#f59e0b' : '#10b981' }}>
              {soldPct}%
            </p>
          </div>
          <div className="h-1 bg-white/8 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${soldPct}%`, background: soldPct > 85 ? '#ef4444' : event.accentColor }} />
          </div>
        </div>

        {/* Price + CTA */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-black" style={{ color: event.price === 0 ? '#10b981' : 'rgba(255,255,255,0.7)' }}>
            {event.price === 0 ? 'Free' : event.priceLabel}
          </p>
          <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest transition-colors group-hover:text-white"
            style={{ color: event.accentColor }}>
            {soldPct >= 100 ? 'Sold Out' : 'Get Tickets'} <ChevronRight size={10} />
          </span>
        </div>
      </div>
    </motion.button>
  );
};

// ─── Event Detail Modal ────────────────────────────────────────────────────────

const EventModal: React.FC<{ event: LiveEvent; onClose: () => void }> = ({ event, onClose }) => {
  const soldPct = Math.round((event.soldCount / event.capacity) * 100);
  const catMeta = CATEGORY_META[event.category];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}>
      <motion.div initial={{ y: 40, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 40, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-3xl overflow-hidden"
        style={{ background: event.coverGradient, border: `1px solid ${event.accentColor}30` }}>

        {/* Hero */}
        <div className="relative h-48 flex items-center justify-center"
          style={{ background: `radial-gradient(ellipse at 30% 40%, ${event.accentColor}30 0%, transparent 70%)` }}>
          <span className="text-7xl">{event.coverEmoji}</span>
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <X size={14} />
          </button>
          <div className="absolute bottom-4 left-4 flex gap-1.5">
            {event.isHot && <span className="px-2.5 py-1 rounded-full bg-red-500 text-white text-[9px] font-black uppercase">🔥 Hot</span>}
            {event.isPPV && <span className="px-2.5 py-1 rounded-full bg-purple-500/80 text-white text-[9px] font-black uppercase">PPV</span>}
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Artist/category */}
          <div className="flex items-center gap-2" style={{ color: event.accentColor }}>
            {catMeta.icon}
            <p className="text-[10px] font-black uppercase tracking-widest">{catMeta.label}</p>
            {event.format !== 'IN_PERSON' && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-white/10 text-white/50 text-[9px] font-black uppercase">
                {event.format === 'VIRTUAL' ? 'Virtual' : 'Hybrid'}
              </span>
            )}
          </div>

          <div>
            <h2 className="text-xl font-black text-white leading-tight">{event.title}</h2>
            <p className="text-sm font-bold mt-1" style={{ color: event.accentColor }}>
              {event.artist}{event.artistVerified && <span className="ml-1.5 text-[10px]">✓ Verified on Plajah</span>}
            </p>
          </div>

          <p className="text-sm text-white/55 leading-relaxed">{event.description}</p>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: <Calendar size={12} />, label: 'Date', value: event.date },
              { icon: <Clock size={12} />,    label: 'Show Time', value: `${event.time}${event.doorsTime ? ` (Doors ${event.doorsTime})` : ''}` },
              { icon: <MapPin size={12} />,   label: 'Venue', value: `${event.venue}` },
              { icon: <Globe size={12} />,    label: 'Location', value: `${event.city}${event.state ? `, ${event.state}` : ''}, ${event.country}` },
            ].map(({ icon, label, value }) => (
              <div key={label}>
                <div className="flex items-center gap-1.5 mb-0.5 text-white/40">{icon}<p className="text-[10px] font-black uppercase tracking-widest">{label}</p></div>
                <p className="text-xs font-black text-white">{value}</p>
              </div>
            ))}
          </div>

          {event.ageRestriction && (
            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Age: {event.ageRestriction}</p>
          )}

          {/* Sold bar */}
          <div>
            <div className="flex justify-between mb-1">
              <p className="text-[10px] font-black text-white/40">{event.soldCount.toLocaleString()} / {event.capacity.toLocaleString()} attending</p>
              <p className="text-[10px] font-black" style={{ color: soldPct > 85 ? '#ef4444' : '#10b981' }}>{soldPct}% filled</p>
            </div>
            <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${soldPct}%`, background: soldPct > 85 ? '#ef4444' : event.accentColor }} />
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {event.tags.map(tag => (
              <span key={tag} className="px-2.5 py-1 rounded-full bg-white/5 text-[10px] font-black text-white/40">{tag}</span>
            ))}
          </div>

          {/* CTA */}
          <div className="flex gap-2 pt-2">
            <button className="flex-1 py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-all hover:opacity-80"
              style={{ background: event.accentColor, color: '#000' }}>
              {soldPct >= 100 ? 'Join Waitlist' : event.price === 0 ? 'RSVP Free' : `Get Tickets — ${event.priceLabel}`}
            </button>
            {event.isPPV && (
              <button className="py-3 px-4 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 font-black text-xs uppercase tracking-widest">
                <Radio size={14} />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── Main LiveEventsGallery ───────────────────────────────────────────────────

interface Props {
  onBack?: () => void;
}

const LiveEventsGallery: React.FC<Props> = ({ onBack }) => {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<EventCategory>('ALL');
  const [formatFilter, setFormatFilter] = useState<EventFormat | 'ALL'>('ALL');
  const [selectedEvent, setSelectedEvent] = useState<LiveEvent | null>(null);
  const [priceFilter, setPriceFilter] = useState<'ALL' | 'FREE' | 'PAID'>('ALL');

  const filtered = useMemo(() => DEMO_EVENTS.filter(ev => {
    if (activeCategory !== 'ALL' && ev.category !== activeCategory) return false;
    if (formatFilter !== 'ALL' && ev.format !== formatFilter) return false;
    if (priceFilter === 'FREE' && ev.price !== 0) return false;
    if (priceFilter === 'PAID' && ev.price === 0) return false;
    if (search && !`${ev.title} ${ev.artist} ${ev.city} ${ev.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [activeCategory, formatFilter, priceFilter, search]);

  const featured = filtered.filter(e => e.isFeatured);
  const rest = filtered.filter(e => !e.isFeatured);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 bg-[#0a0a0a]/90 backdrop-blur-2xl border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-lg font-black uppercase tracking-widest text-white flex items-center gap-2">
                <span className="text-xl">🎟️</span> Live Events
              </h1>
              <p className="text-xs text-white/35 mt-0.5">{DEMO_EVENTS.length} events happening locally & globally</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search events, artists, or cities…"
              className="w-full pl-9 pr-4 py-2.5 bg-white/[0.04] border border-white/[0.08] focus:border-[#FF8C00]/40 rounded-xl text-sm text-white outline-none placeholder-white/25 font-bold transition-all" />
          </div>

          {/* Category filter */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {(Object.keys(CATEGORY_META) as EventCategory[]).map(cat => {
              const meta = CATEGORY_META[cat];
              return (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${activeCategory === cat ? 'text-black border-transparent' : 'bg-white/[0.03] border-white/[0.06] text-white/40 hover:text-white/70'}`}
                  style={activeCategory === cat ? { background: meta.color, borderColor: 'transparent' } : {}}>
                  {meta.icon} {meta.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sub-filters */}
      <div className="shrink-0 px-6 py-2 border-b border-white/[0.04] flex items-center gap-3">
        <div className="max-w-5xl mx-auto w-full flex items-center gap-2 flex-wrap">
          {([['ALL','All Formats'],['IN_PERSON','In Person'],['VIRTUAL','Virtual'],['HYBRID','Hybrid']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFormatFilter(v as any)}
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${formatFilter === v ? 'bg-white/20 text-white' : 'text-white/35 hover:text-white/60'}`}>
              {l}
            </button>
          ))}
          <div className="ml-auto flex gap-1.5">
            {([['ALL','All Prices'],['FREE','Free'],['PAID','Paid']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setPriceFilter(v as any)}
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${priceFilter === v ? 'bg-[#FF8C00]/20 text-[#FF8C00]' : 'text-white/35 hover:text-white/60'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Events grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">
          {/* Featured */}
          {featured.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30 mb-4 flex items-center gap-2">
                <Star size={10} /> Featured Events
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {featured.map((ev, i) => (
                  <EventCard key={ev.id} event={ev} onOpen={setSelectedEvent} featured={i === 0 && featured.length >= 2} />
                ))}
              </div>
            </div>
          )}

          {/* All others */}
          {rest.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30 mb-4">
                {activeCategory === 'ALL' ? 'All Events' : CATEGORY_META[activeCategory].label}
                <span className="ml-2 text-white/20 normal-case tracking-normal">({rest.length})</span>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {rest.map(ev => <EventCard key={ev.id} event={ev} onOpen={setSelectedEvent} />)}
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <p className="text-4xl">🎟️</p>
              <p className="text-sm font-black text-white/30 uppercase tracking-widest">No events found</p>
              <button onClick={() => { setSearch(''); setActiveCategory('ALL'); setPriceFilter('ALL'); setFormatFilter('ALL'); }}
                className="text-xs text-[#FF8C00] font-black hover:text-[#FF8C00]/70 transition-colors">
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Event detail modal */}
      <AnimatePresence>
        {selectedEvent && <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
      </AnimatePresence>
    </div>
  );
};

export default LiveEventsGallery;
