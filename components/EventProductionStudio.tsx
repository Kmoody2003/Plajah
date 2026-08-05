/**
 * EventProductionStudio — Comprehensive event production hub.
 * Aria is the Executive Producer: she plans, researches, finds vendors,
 * builds marketing strategies (even $0 budget), manages team roles,
 * creates setlists, and runs the event.
 *
 * Tabs: Dashboard · Setup · Setlist · Team · Tickets · Check-In · Merch · Stream · Marketing
 * Roles: Artist, Music Director, Sound Engineer, Lighting Director, Stage Manager,
 *        Tour Manager, Merch Manager, Security, Photographer, Videographer, PR/Promoter
 * Geofence auto check-in via browser Geolocation API + Haversine distance
 * Demo project: "The Underground Sessions Vol. 3" pre-populated
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles, Users, Music2, MapPin, Calendar, Clock, Mic, Volume2,
  Lightbulb, Camera, Video, Shield, Package, Megaphone, DollarSign,
  CheckCircle2, XCircle, QrCode, Wifi, Navigation2, Plus, Trash2,
  ArrowLeft, ArrowRight, Edit2, Send, Printer, Radio, Eye, Star,
  BarChart2, TrendingUp, Zap, AlertCircle, ChevronDown, GripVertical,
  PlayCircle, StopCircle, Ticket, ShoppingBag, Globe, Lock, Layers,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type EPS_Tab = 'dashboard' | 'setup' | 'setlist' | 'team' | 'tickets' | 'checkin' | 'merch' | 'stream' | 'marketing';

type EventType = 'CONCERT' | 'FESTIVAL' | 'INTIMATE_SHOW' | 'CLUB_NIGHT' | 'CORPORATE' | 'LISTENING_PARTY' | 'VIRTUAL' | 'HYBRID';
type EventStatus = 'PLANNING' | 'TICKETS_LIVE' | 'SOLD_OUT' | 'LIVE' | 'COMPLETED';
type TeamRole = 'MUSIC_DIRECTOR' | 'SOUND_ENGINEER' | 'LIGHTING_DIRECTOR' | 'STAGE_MANAGER' | 'TOUR_MANAGER' | 'MERCH_MANAGER' | 'SECURITY' | 'PHOTOGRAPHER' | 'VIDEOGRAPHER' | 'PR_PROMOTER' | 'HOSPITALITY' | 'OTHER';
type MerchItem_Status = 'PRE_ORDER' | 'IN_STOCK' | 'SOLD_OUT';
type MerchFulfillment = 'PICKUP' | 'SHIP' | 'BOTH';
type AttendeeStatus = 'CONFIRMED' | 'WAITLIST' | 'CANCELLED' | 'CHECKED_IN' | 'WILL_CALL';

interface EventSetup {
  id: string;
  title: string;
  artistName: string;
  type: EventType;
  status: EventStatus;
  date: string;
  doorsTime: string;
  showTime: string;
  venue: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
  capacity: number;
  description: string;
  ticketPrice: number;
  vipPrice: number;
  marketingBudget: number;
  geofenceEnabled: boolean;
  geofenceRadius: number;
  isPPV: boolean;
  ppvPrice: number;
  streamUrl: string;
  coverImageUrl: string;
  createdAt: number;
}

interface SetlistTrack {
  id: string;
  title: string;
  artist: string;
  duration: string;
  notes: string;
  key?: string;
  tempo?: number;
  order: number;
}

interface TeamMember {
  id: string;
  name: string;
  role: TeamRole;
  email: string;
  phone: string;
  confirmed: boolean;
  notes: string;
}

interface MerchItem {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  inventory: number;
  sold: number;
  status: MerchItem_Status;
  fulfillment: MerchFulfillment;
  sizes: string[];
}

interface Attendee {
  id: string;
  name: string;
  email: string;
  ticketTier: string;
  ticketNumber: string;
  status: AttendeeStatus;
  checkedInAt?: number;
  checkedInMethod?: 'QR' | 'MANUAL' | 'GEOFENCE';
}

interface EventProduction {
  setup: EventSetup;
  setlist: SetlistTrack[];
  team: TeamMember[];
  merch: MerchItem[];
  attendees: Attendee[];
}

interface Props {
  onBack?: () => void;
  onOpenTicketDesigner?: (eventId: string) => void;
  onOpenBoards?: () => void;
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const EPS_KEY = 'plajah_eps_v1';
function loadProductions(): EventProduction[] { try { return JSON.parse(localStorage.getItem(EPS_KEY) || '[]'); } catch { return []; } }
function saveProductions(p: EventProduction[]) { try { localStorage.setItem(EPS_KEY, JSON.stringify(p)); } catch {} }
function uuid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
function fmtCurrency(n: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n); }

// ─── Haversine distance (km) ──────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Demo project ─────────────────────────────────────────────────────────────

const DEMO_PRODUCTION: EventProduction = {
  setup: {
    id: 'demo-event-001', title: 'The Underground Sessions Vol. 3', artistName: 'Marcus & The Collective',
    type: 'CONCERT', status: 'TICKETS_LIVE', date: '2026-08-22',
    doorsTime: '7:00 PM', showTime: '8:00 PM',
    venue: 'The Shelter', address: '431 W Canfield St',
    city: 'Detroit', state: 'MI', zip: '48201',
    lat: 42.3520, lng: -83.0598,
    capacity: 400, description: 'An intimate evening of jazz-infused hip-hop with Marcus & The Collective. Limited capacity. First come, first served for GA. VIP includes meet & greet.',
    ticketPrice: 25, vipPrice: 75, marketingBudget: 500,
    geofenceEnabled: false, geofenceRadius: 200,
    isPPV: false, ppvPrice: 9.99, streamUrl: '',
    coverImageUrl: '', createdAt: Date.now() - 86400000 * 5,
  },
  setlist: [
    { id: 's1', title: 'Open Space', artist: 'Marcus & The Collective', duration: '5:20', notes: 'Intro — let the room breathe', key: 'Cm', tempo: 72, order: 1 },
    { id: 's2', title: 'Midnight Oil', artist: 'Marcus & The Collective', duration: '4:45', notes: 'Bring energy up slowly — drummer leads in', key: 'Fm', tempo: 88, order: 2 },
    { id: 's3', title: 'Detroit Red', artist: 'Marcus & The Collective', duration: '6:10', notes: 'Crowd favorite — expect singalong', key: 'Bb', tempo: 95, order: 3 },
    { id: 's4', title: 'Intermission Groove (Improv)', artist: 'Band', duration: '3:00', notes: 'Free improv — cue from Marcus', key: 'Any', tempo: 0, order: 4 },
    { id: 's5', title: 'Glass City', artist: 'Marcus & The Collective', duration: '7:30', notes: 'Peak energy — lights go full. Sound team: max room fill', key: 'Dm', tempo: 108, order: 5 },
    { id: 's6', title: 'Letter to Nobody', artist: 'Marcus & The Collective', duration: '4:15', notes: 'Emotional valley — house lights dim to 10%', key: 'Em', tempo: 65, order: 6 },
    { id: 's7', title: 'The Return (Encore)', artist: 'Marcus & The Collective', duration: '5:45', notes: 'Encore only if standing ovation — start with just keys', key: 'Cm', tempo: 80, order: 7 },
  ],
  team: [
    { id: 't1', name: 'James Okafor', role: 'MUSIC_DIRECTOR', email: 'james@collective.com', phone: '(313) 555-0101', confirmed: true, notes: 'Has the full score and setlist keys' },
    { id: 't2', name: 'Sofia Rodriguez', role: 'SOUND_ENGINEER', email: 'sofia@soundco.com', phone: '(313) 555-0102', confirmed: true, notes: 'Arrive 3hrs before doors. Needs 30min soundcheck per act.' },
    { id: 't3', name: 'Derek Wu', role: 'LIGHTING_DIRECTOR', email: 'derek@lightsmith.com', phone: '(313) 555-0103', confirmed: false, notes: 'Following color cues doc shared in Boards' },
    { id: 't4', name: 'Tamara Ellis', role: 'STAGE_MANAGER', email: 'tamara@gmail.com', phone: '(313) 555-0104', confirmed: true, notes: 'Point of contact for all vendors day-of' },
    { id: 't5', name: 'Rico James', role: 'MERCH_MANAGER', email: 'rico@gmail.com', phone: '(313) 555-0105', confirmed: true, notes: 'Set up merch table by 6:30 PM. Has inventory sheet.' },
  ],
  merch: [
    { id: 'm1', name: '"Underground Sessions" Tour Tee', description: 'Limited edition screen-printed tee. 100% heavy cotton.', price: 35, imageUrl: '', inventory: 100, sold: 23, status: 'IN_STOCK', fulfillment: 'BOTH', sizes: ['S','M','L','XL','XXL'] },
    { id: 'm2', name: 'Signed Vinyl — Vol. 2', description: 'Hand-signed LP. Previous volume — only 20 left.', price: 45, imageUrl: '', inventory: 20, sold: 8, status: 'IN_STOCK', fulfillment: 'BOTH', sizes: [] },
    { id: 'm3', name: 'VIP Exclusive Hoodie (Pre-Order)', description: 'Premium embroidered hoodie. Ships 30 days after show.', price: 65, imageUrl: '', inventory: 50, sold: 12, status: 'PRE_ORDER', fulfillment: 'SHIP', sizes: ['S','M','L','XL'] },
  ],
  attendees: [
    { id: 'a1', name: 'Alexis Jordan', email: 'alexis@email.com', ticketTier: 'VIP', ticketNumber: 'TKT-0001', status: 'CONFIRMED' },
    { id: 'a2', name: 'Marcus Bell', email: 'mbell@email.com', ticketTier: 'General Admission', ticketNumber: 'TKT-0002', status: 'CONFIRMED' },
    { id: 'a3', name: 'Priya Nair', email: 'priya@email.com', ticketTier: 'General Admission', ticketNumber: 'TKT-0003', status: 'WILL_CALL' },
    { id: 'a4', name: 'Devon Taylor', email: 'devon@email.com', ticketTier: 'VIP', ticketNumber: 'TKT-0004', status: 'CONFIRMED' },
    { id: 'a5', name: 'Jade Williamson', email: 'jade@email.com', ticketTier: 'General Admission', ticketNumber: 'TKT-0005', status: 'CONFIRMED' },
  ],
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_META: Record<TeamRole, { label: string; icon: React.ReactNode; color: string }> = {
  MUSIC_DIRECTOR:   { label: 'Music Director',   icon: <Music2 size={12} />,     color: '#FF8C00' },
  SOUND_ENGINEER:   { label: 'Sound Engineer',   icon: <Volume2 size={12} />,    color: '#3b82f6' },
  LIGHTING_DIRECTOR:{ label: 'Lighting Director',icon: <Lightbulb size={12} />,  color: '#f59e0b' },
  STAGE_MANAGER:    { label: 'Stage Manager',    icon: <Layers size={12} />,     color: '#a855f7' },
  TOUR_MANAGER:     { label: 'Tour Manager',     icon: <MapPin size={12} />,     color: '#10b981' },
  MERCH_MANAGER:    { label: 'Merch Manager',    icon: <ShoppingBag size={12} />,color: '#ec4899' },
  SECURITY:         { label: 'Security',         icon: <Shield size={12} />,     color: '#ef4444' },
  PHOTOGRAPHER:     { label: 'Photographer',     icon: <Camera size={12} />,     color: '#6366f1' },
  VIDEOGRAPHER:     { label: 'Videographer',     icon: <Video size={12} />,      color: '#8b5cf6' },
  PR_PROMOTER:      { label: 'PR / Promoter',    icon: <Megaphone size={12} />,  color: '#f97316' },
  HOSPITALITY:      { label: 'Hospitality',      icon: <Star size={12} />,       color: '#14b8a6' },
  OTHER:            { label: 'Other',             icon: <Users size={12} />,      color: '#6b7280' },
};

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  CONCERT: 'Concert', FESTIVAL: 'Festival', INTIMATE_SHOW: 'Intimate Show',
  CLUB_NIGHT: 'Club Night', CORPORATE: 'Corporate', LISTENING_PARTY: 'Listening Party',
  VIRTUAL: 'Virtual', HYBRID: 'Hybrid',
};

const STATUS_STYLE: Record<EventStatus, { bg: string; text: string; label: string }> = {
  PLANNING:      { bg: 'bg-white/5',        text: 'text-white/40',    label: 'Planning' },
  TICKETS_LIVE:  { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Tickets Live' },
  SOLD_OUT:      { bg: 'bg-orange-500/15',  text: 'text-orange-400',  label: 'Sold Out' },
  LIVE:          { bg: 'bg-red-500/15',     text: 'text-red-400',     label: '● LIVE' },
  COMPLETED:     { bg: 'bg-white/5',        text: 'text-white/30',    label: 'Completed' },
};

// ─── Aria prompt library ──────────────────────────────────────────────────────

function ariaPrompt(type: string, setup: EventSetup, extra?: string): string {
  const ctx = `Event: "${setup.title}" by ${setup.artistName}. Type: ${EVENT_TYPE_LABELS[setup.type]}. Venue: ${setup.venue}, ${setup.city}, ${setup.state}. Date: ${setup.date}. Capacity: ${setup.capacity}. Ticket price: $${setup.ticketPrice}. Marketing budget: $${setup.marketingBudget}.`;

  const prompts: Record<string, string> = {
    execProducer: `Act as Aria, the Executive Producer for this event. ${ctx}\n\nGive me:\n1. Top 5 ACTION ITEMS I need to do in the next 72 hours\n2. What am I most likely to forget or overlook?\n3. 3 things that separate a professional show from an amateur one at this venue type\n4. One bold creative idea that would make this event unforgettable\nBe specific. Be a real executive producer, not generic advice.`,

    marketingPlan: `Act as Aria, my event marketing director and financial planner. ${ctx}\n\nMarketing budget: $${setup.marketingBudget}.\n\n${setup.marketingBudget === 0
      ? 'Budget is $0. Give me the 10 best FREE marketing strategies for this event type in this market. Include social media angles, community outreach, press, playlist pitching, influencer partnerships, and any free tools. Be tactical and specific.'
      : `Allocate the $${setup.marketingBudget} marketing budget across channels. Give me:\n1. Channel breakdown with specific $ amounts and expected reach/ROI\n2. Timeline: what goes out when, in what order\n3. The single highest-ROI move for this budget size\n4. 3 free supplementary tactics to layer on top`}\nBe specific. Include actual platforms, hashtags, timing windows, and any free tools.`,

    vendorSearch: `Act as Aria, my event production coordinator. ${ctx}\n\nI need to find local vendors in ${setup.city}, ${setup.state} for this event. Research and suggest:\n1. Sound companies (3-4 options with approximate pricing)\n2. Lighting companies (3-4 options)\n3. Photography/videography (2-3 options)\n4. Catering/hospitality (if applicable)\n5. Any specialty vendors this event type needs\nFor each, give me the search term and platform to find them (Google, Yelp, local FB groups, etc.). Also tell me what to look for in contracts with each vendor type.`,

    setlistFlow: `Act as Aria, my music director and performance coach. ${ctx}\n\nHelp me build the perfect show flow:\n1. Ideal set length for a ${setup.capacity}-person room at this price point\n2. Energy arc strategy — when to peak, when to pull back, how to close\n3. How many songs for a ${EVENT_TYPE_LABELS[setup.type]}\n4. Should we have an encore? At what energy level should it be triggered?\n5. Technical cues: when does lighting change, when does the MD signal the band\nBe specific. Think like a music director who has run 100+ shows.`,

    teamBriefing: `Act as Aria, my event stage manager. ${ctx}\n\nWrite a production brief for my team. Include:\n1. Day-of timeline with specific hours (load-in, soundcheck, doors, showtime, close)\n2. Role-specific checklist for: Music Director, Sound Engineer, Lighting Director, Stage Manager, Merch Manager\n3. 5 most common day-of problems and how to prevent them\n4. Communication protocol: who calls who, in what order, for what issues\n5. Backup plans for: sound failure, no-show performer, venue issue\nFormat it like a real production callsheet.`,

    ticketStrategy: `Act as Aria, my ticketing and revenue strategist. ${ctx}\n\nOptimize my ticketing strategy:\n1. Is my $${setup.ticketPrice} GA price right for this market and venue size? What should it be?\n2. Should I have a VIP tier? What should VIP include at $${setup.vipPrice}?\n3. How many tickets should I hold back for will-call and press?\n4. Pre-sale vs. day-of pricing strategy\n5. Should I enable pay-per-view at $${setup.ppvPrice}? What's the revenue potential?\n6. How to create urgency to sell out the remaining capacity\nBe a real ticket strategist, not general advice.`,

    budget: `Act as Aria, my event financial planner and accountant. ${ctx}\n\nBuild me a complete event P&L projection:\n1. Revenue scenarios: 50%, 75%, 100% capacity with ticket prices\n2. Estimated costs breakdown: venue, production, marketing, team, merch COGS, misc\n3. Break-even analysis: how many tickets to cover costs\n4. Profit projection at 75% capacity\n5. Cash flow: what costs hit before tickets are sold vs. after\n6. Top 3 ways to reduce costs without hurting the show quality\nBe specific. Use real numbers based on the ${setup.city} market for a ${setup.capacity}-person room.`,
  };

  return prompts[type] || prompts.execProducer;
}

// ─── Sub-tabs ─────────────────────────────────────────────────────────────────

// Dashboard Tab
const DashboardTab: React.FC<{ prod: EventProduction; onSwitchTab: (t: EPS_Tab) => void }> = ({ prod, onSwitchTab }) => {
  const { setup, setlist, team, merch, attendees } = prod;
  const checkedIn = attendees.filter(a => a.status === 'CHECKED_IN').length;
  const totalMerchRevenue = merch.reduce((s, m) => s + m.sold * m.price, 0);
  const totalTicketRevenue = attendees.filter(a => a.status !== 'CANCELLED').length * setup.ticketPrice;

  const openAria = (type: string) => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt: ariaPrompt(type, setup) } }));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      {/* Aria Executive Producer panel */}
      <div className="p-5 rounded-3xl border border-amber-500/25 bg-amber-500/5 relative overflow-hidden">
        <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(ellipse at top right, rgba(245,158,11,0.15) 0%, transparent 60%)' }} />
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <Sparkles size={16} className="text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-black text-amber-300">Aria — Executive Producer</p>
              <p className="text-[10px] text-amber-400/60">Co-producer · Art Director · Financial Planner · Manager</p>
            </div>
          </div>
          <p className="text-xs text-white/60 leading-relaxed mb-4">
            I'm your personal orchestrator for <span className="text-amber-300 font-bold">"{setup.title}"</span>. Ask me anything — I'll research vendors, build your marketing strategy (even with $0), plan your setlist flow, brief your team, or project your P&L.
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Full Production Brief', type: 'execProducer' },
              { label: 'Marketing Strategy', type: 'marketingPlan' },
              { label: 'Find Local Vendors', type: 'vendorSearch' },
              { label: 'Setlist Flow', type: 'setlistFlow' },
              { label: 'Team Briefing', type: 'teamBriefing' },
              { label: 'Budget & P&L', type: 'budget' },
            ].map(a => (
              <button key={a.type} onClick={() => openAria(a.type)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[10px] font-black uppercase tracking-widest hover:bg-amber-500/20 transition-all">
                <Sparkles size={9} /> {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Event status */}
      <div className="flex items-center justify-between gap-4 p-5 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
        <div>
          <h2 className="text-xl font-black text-white mb-0.5">{setup.title}</h2>
          <p className="text-sm text-white/50">{setup.artistName} · {setup.venue}, {setup.city}</p>
          <p className="text-xs text-white/35 mt-1 flex items-center gap-2">
            <Calendar size={11} />{setup.date} · <Clock size={11} />{setup.showTime}
          </p>
        </div>
        <div className="shrink-0">
          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${STATUS_STYLE[setup.status].bg} ${STATUS_STYLE[setup.status].text}`}>
            {STATUS_STYLE[setup.status].label}
          </span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Tickets Sold', value: attendees.filter(a => a.status !== 'CANCELLED').length, sub: `/ ${setup.capacity} cap`, color: '#FF8C00' },
          { label: 'Checked In', value: checkedIn, sub: `${Math.round(checkedIn / Math.max(1, attendees.length) * 100)}% arrived`, color: '#10b981' },
          { label: 'Merch Revenue', value: fmtCurrency(totalMerchRevenue), sub: `${merch.reduce((s, m) => s + m.sold, 0)} units sold`, color: '#a855f7' },
          { label: 'Team Confirmed', value: `${team.filter(t => t.confirmed).length}/${team.length}`, sub: 'crew members', color: '#3b82f6' },
        ].map(s => (
          <div key={s.label} className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/30">{s.label}</p>
            <p className="text-xl font-black text-white mt-1" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] text-white/30 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Quick access */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30 mb-3">Production Areas</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {([
            ['setup','Event Setup', <Calendar size={14} />, '#FF8C00'],
            ['setlist','Setlist', <Music2 size={14} />, '#a855f7'],
            ['team','Team', <Users size={14} />, '#3b82f6'],
            ['tickets','Tickets', <Ticket size={14} />, '#10b981'],
            ['checkin','Check-In', <CheckCircle2 size={14} />, '#f59e0b'],
            ['merch','Merch', <ShoppingBag size={14} />, '#ec4899'],
            ['stream','Stream/PPV', <Radio size={14} />, '#ef4444'],
            ['marketing','Marketing', <Megaphone size={14} />, '#6366f1'],
          ] as [EPS_Tab, string, React.ReactNode, string][]).map(([tab, label, icon, color]) => (
            <button key={tab} onClick={() => onSwitchTab(tab)}
              className="flex items-center gap-2.5 p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:border-white/15 hover:bg-white/[0.06] transition-all group text-left">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all" style={{ background: `${color}20`, color }}>
                {icon}
              </div>
              <span className="text-xs font-black text-white/60 group-hover:text-white transition-colors">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

// Setlist Tab
const SetlistTab: React.FC<{ setlist: SetlistTrack[]; setup: EventSetup; onUpdate: (s: SetlistTrack[]) => void }> = ({ setlist, setup, onUpdate }) => {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', artist: setup.artistName, duration: '', notes: '', key: '', tempo: '' });

  const addTrack = () => {
    if (!form.title) return;
    const newTrack: SetlistTrack = { id: uuid(), ...form, tempo: parseInt(form.tempo) || 0, order: setlist.length + 1 };
    onUpdate([...setlist, newTrack]);
    setForm({ title: '', artist: setup.artistName, duration: '', notes: '', key: '', tempo: '' });
    setAdding(false);
  };

  const removeTrack = (id: string) => onUpdate(setlist.filter(t => t.id !== id));
  const totalMinutes = setlist.reduce((s, t) => {
    const [m, ss] = (t.duration || '0:00').split(':').map(Number);
    return s + m + (ss || 0) / 60;
  }, 0);

  const sendToMD = () => {
    window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: {
      prompt: `Act as Aria, my Music Director assistant. Here is my setlist for "${setup.title}":\n\n${setlist.map((t, i) => `${i + 1}. "${t.title}" — Key: ${t.key || '?'}, Tempo: ${t.tempo || '?'} BPM, Duration: ${t.duration}${t.notes ? ` [${t.notes}]` : ''}`).join('\n')}\n\nPlease:\n1. Analyze the energy flow — is this arc optimal for a ${setup.capacity}-cap room?\n2. Suggest any reordering to improve energy dynamics\n3. Flag any key or tempo transitions that might be jarring\n4. Write a brief for the Music Director on what to watch for\n5. Generate the sheet music cue list for the band (what each member should know per track)\nFormat it as a professional production document.`,
    }}));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black uppercase tracking-widest text-white">Setlist</h3>
          <p className="text-xs text-white/35 mt-0.5">{setlist.length} tracks · ~{Math.round(totalMinutes)}min total runtime</p>
        </div>
        <div className="flex gap-2">
          <button onClick={sendToMD}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-black uppercase tracking-widest hover:bg-amber-500/20 transition-all">
            <Sparkles size={11} /> Aria MD Review
          </button>
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF8C00]/15 border border-[#FF8C00]/30 text-[#FF8C00] text-xs font-black uppercase tracking-widest hover:bg-[#FF8C00]/25 transition-all">
            <Plus size={13} /> Add Track
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {setlist.sort((a, b) => a.order - b.order).map((track, i) => (
          <div key={track.id} className="flex items-start gap-3 p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl group hover:border-white/10 transition-all">
            <div className="w-8 h-8 rounded-xl bg-[#FF8C00]/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-xs font-black text-[#FF8C00]">{i + 1}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-white">{track.title}</p>
              <p className="text-xs text-white/40">{track.artist}</p>
              {track.notes && <p className="text-xs text-white/30 mt-1 italic">↳ {track.notes}</p>}
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                {track.key && <span className="text-[10px] font-black text-purple-400/70 uppercase">Key: {track.key}</span>}
                {track.tempo > 0 && <span className="text-[10px] font-black text-blue-400/70">{track.tempo} BPM</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-black text-white/50">{track.duration}</p>
            </div>
            <button onClick={() => removeTrack(track.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/15 text-white/30 hover:text-red-400 transition-all shrink-0">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-5 bg-white/[0.04] border border-white/10 rounded-2xl space-y-3">
            <p className="text-sm font-black text-white">Add to Setlist</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">Track Title</label>
                <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Track name"
                  className="w-full px-3 py-2.5 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold focus:border-[#FF8C00]/40 transition-all" />
              </div>
              {[
                { key: 'artist', label: 'Artist', placeholder: setup.artistName },
                { key: 'duration', label: 'Duration', placeholder: '4:30' },
                { key: 'key', label: 'Key', placeholder: 'Cm / F#m / Bb' },
                { key: 'tempo', label: 'BPM', placeholder: '95' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">{f.label}</label>
                  <input value={form[f.key as keyof typeof form]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                    className="w-full px-3 py-2.5 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold focus:border-[#FF8C00]/40 transition-all" />
                </div>
              ))}
              <div className="col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">Cue Notes</label>
                <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Production cues, lighting notes, MD instructions…"
                  className="w-full px-3 py-2.5 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold focus:border-[#FF8C00]/40 transition-all" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addTrack} className="px-5 py-2.5 rounded-xl bg-[#FF8C00] text-black text-xs font-black uppercase tracking-widest hover:bg-[#FF8C00]/80 transition-all">Add Track</button>
              <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl bg-white/5 text-white/50 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// Team Tab
const TeamTab: React.FC<{ team: TeamMember[]; setup: EventSetup; onUpdate: (t: TeamMember[]) => void }> = ({ team, setup, onUpdate }) => {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', role: 'SOUND_ENGINEER' as TeamRole, email: '', phone: '', notes: '' });

  const save = (t: TeamMember[]) => onUpdate(t);
  const addMember = () => {
    if (!form.name) return;
    save([...team, { id: uuid(), ...form, confirmed: false }]);
    setForm({ name: '', role: 'SOUND_ENGINEER', email: '', phone: '', notes: '' });
    setAdding(false);
  };
  const toggleConfirmed = (id: string) => save(team.map(m => m.id === id ? { ...m, confirmed: !m.confirmed } : m));
  const remove = (id: string) => save(team.filter(m => m.id !== id));

  const briefAria = () => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt: ariaPrompt('teamBriefing', setup) } }));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black uppercase tracking-widest text-white">Production Team</h3>
          <p className="text-xs text-white/35 mt-0.5">{team.filter(t => t.confirmed).length}/{team.length} confirmed</p>
        </div>
        <div className="flex gap-2">
          <button onClick={briefAria} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-black uppercase tracking-widest hover:bg-amber-500/20 transition-all">
            <Sparkles size={11} /> Team Brief
          </button>
          <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 text-xs font-black uppercase tracking-widest hover:bg-blue-500/25 transition-all">
            <Plus size={13} /> Add Role
          </button>
        </div>
      </div>

      {/* Role legend */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(ROLE_META) as TeamRole[]).filter(r => !team.some(t => t.role === r)).map(r => {
          const m = ROLE_META[r];
          return (
            <button key={r} onClick={() => { setForm(f => ({ ...f, role: r })); setAdding(true); }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-dashed border-white/10 text-[10px] font-black text-white/30 hover:border-white/30 hover:text-white/60 transition-all uppercase tracking-widest">
              <Plus size={9} /> {m.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {team.map(member => {
          const meta = ROLE_META[member.role];
          return (
            <div key={member.id} className="flex items-center gap-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl group">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-base font-black" style={{ background: `${meta.color}15`, color: meta.color }}>
                {member.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-white">{member.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5" style={{ color: meta.color }}>
                  {meta.icon}<p className="text-[10px] font-black uppercase tracking-widest">{meta.label}</p>
                </div>
                {member.email && <p className="text-[10px] text-white/30 mt-0.5">{member.email} {member.phone ? `· ${member.phone}` : ''}</p>}
                {member.notes && <p className="text-[10px] text-white/25 mt-1 italic">{member.notes}</p>}
              </div>
              <button onClick={() => toggleConfirmed(member.id)}>
                {member.confirmed
                  ? <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-black uppercase tracking-widest"><CheckCircle2 size={10} /> Confirmed</span>
                  : <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 text-white/30 text-[10px] font-black uppercase tracking-widest"><Clock size={10} /> Pending</span>
                }
              </button>
              <button onClick={() => remove(member.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/15 text-white/30 hover:text-red-400 transition-all">
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-5 bg-white/[0.04] border border-white/10 rounded-2xl space-y-3">
            <p className="text-sm font-black text-white">Add Team Member</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">Role</label>
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as TeamRole }))}
                  className="w-full px-3 py-2.5 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none font-bold">
                  {(Object.keys(ROLE_META) as TeamRole[]).map(r => <option key={r} value={r}>{ROLE_META[r].label}</option>)}
                </select>
              </div>
              {[
                { key: 'name',  label: 'Name',  placeholder: 'Full name' },
                { key: 'email', label: 'Email', placeholder: 'email@example.com' },
                { key: 'phone', label: 'Phone', placeholder: '(313) 555-0100' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">{f.label}</label>
                  <input value={form[f.key as keyof typeof form]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                    className="w-full px-3 py-2.5 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold focus:border-blue-500/40 transition-all" />
                </div>
              ))}
              <div className="col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">Notes</label>
                <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Special instructions or requirements…"
                  className="w-full px-3 py-2.5 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold focus:border-blue-500/40 transition-all" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addMember} className="px-5 py-2.5 rounded-xl bg-blue-500 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-400 transition-all">Add Member</button>
              <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl bg-white/5 text-white/50 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// Check-In Tab
const CheckInTab: React.FC<{ attendees: Attendee[]; setup: EventSetup; onUpdate: (a: Attendee[]) => void }> = ({ attendees, setup, onUpdate }) => {
  const [search, setSearch] = useState('');
  const [geofenceActive, setGeofenceActive] = useState(false);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'watching' | 'error'>('idle');
  const [nearbyCount, setNearbyCount] = useState(0);
  const watchRef = useRef<number | null>(null);
  const [filter, setFilter] = useState<AttendeeStatus | 'ALL'>('ALL');

  const checkIn = (id: string, method: 'MANUAL' | 'QR' | 'GEOFENCE') => {
    onUpdate(attendees.map(a => a.id === id && a.status !== 'CHECKED_IN'
      ? { ...a, status: 'CHECKED_IN', checkedInAt: Date.now(), checkedInMethod: method }
      : a
    ));
  };

  const toggleGeofence = () => {
    if (geofenceActive) {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      setGeofenceActive(false);
      setGeoStatus('idle');
    } else if (setup.lat && setup.lng) {
      setGeoStatus('watching');
      setGeofenceActive(true);
      watchRef.current = navigator.geolocation.watchPosition(
        pos => {
          const d = haversineKm(pos.coords.latitude, pos.coords.longitude, setup.lat!, setup.lng!) * 1000;
          if (d <= setup.geofenceRadius) setNearbyCount(n => n + 1);
        },
        () => setGeoStatus('error'),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  };

  useEffect(() => () => { if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current); }, []);

  const checkedIn  = attendees.filter(a => a.status === 'CHECKED_IN').length;
  const willCall   = attendees.filter(a => a.status === 'WILL_CALL').length;
  const pending    = attendees.filter(a => a.status === 'CONFIRMED').length;

  const visible = attendees.filter(a =>
    (filter === 'ALL' || a.status === filter) &&
    (!search || `${a.name} ${a.ticketNumber} ${a.email}`.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black uppercase tracking-widest text-white">Check-In</h3>
          <p className="text-xs text-white/35 mt-0.5">{checkedIn} checked in · {willCall} will call · {pending} confirmed</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Checked In', value: checkedIn, pct: Math.round(checkedIn / Math.max(1, attendees.length) * 100), color: '#10b981' },
          { label: 'Will Call', value: willCall, pct: Math.round(willCall / Math.max(1, attendees.length) * 100), color: '#f59e0b' },
          { label: 'Not Arrived', value: pending, pct: Math.round(pending / Math.max(1, attendees.length) * 100), color: '#6b7280' },
        ].map(s => (
          <div key={s.label} className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/30">{s.label}</p>
            <p className="text-xl font-black mt-1" style={{ color: s.color }}>{s.value}</p>
            <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${s.pct}%`, background: s.color }} />
            </div>
          </div>
        ))}
      </div>

      {/* Geofence toggle */}
      <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${geofenceActive ? 'bg-emerald-500/20' : 'bg-white/5'}`}>
            <Navigation2 size={15} className={geofenceActive ? 'text-emerald-400' : 'text-white/30'} />
          </div>
          <div>
            <p className="text-sm font-black text-white">Auto Check-In (Geofence)</p>
            <p className="text-xs text-white/40">Auto check-in attendees within {setup.geofenceRadius}m of {setup.venue}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {geofenceActive && geoStatus === 'watching' && (
            <span className="text-[10px] font-black text-emerald-400 flex items-center gap-1"><Wifi size={10} /> Active</span>
          )}
          {geoStatus === 'error' && (
            <span className="text-[10px] font-black text-red-400 flex items-center gap-1"><AlertCircle size={10} /> Location error</span>
          )}
          <button onClick={toggleGeofence}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${geofenceActive ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30' : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10'}`}>
            {geofenceActive ? 'Stop' : 'Enable'}
          </button>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, ticket #, or email…"
          className="flex-1 px-3 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-white outline-none placeholder-white/25 font-bold focus:border-white/20 transition-all" />
        <select value={filter} onChange={e => setFilter(e.target.value as any)}
          className="px-3 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-xs text-white/60 outline-none font-black">
          {['ALL','CONFIRMED','CHECKED_IN','WILL_CALL','WAITLIST'].map(f => <option key={f} value={f}>{f === 'ALL' ? 'All Attendees' : f.replace('_',' ')}</option>)}
        </select>
      </div>

      {/* Attendee list */}
      <div className="space-y-2">
        {visible.map(att => (
          <div key={att.id} className="flex items-center gap-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl group hover:border-white/10 transition-all">
            <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
              <span className="text-sm font-black text-white/50">{att.name[0]?.toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-white">{att.name}</p>
              <p className="text-xs text-white/35">{att.ticketTier} · #{att.ticketNumber}</p>
              {att.checkedInAt && (
                <p className="text-[10px] text-emerald-400/70 mt-0.5">✓ {att.checkedInMethod} · {new Date(att.checkedInAt).toLocaleTimeString()}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {att.status === 'WILL_CALL' && <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-black uppercase tracking-widest">Will Call</span>}
              {att.status === 'CHECKED_IN'
                ? <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-black"><CheckCircle2 size={10} /> In</span>
                : <button onClick={() => checkIn(att.id, 'MANUAL')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-emerald-500/15 text-white/40 hover:text-emerald-400 text-[10px] font-black uppercase tracking-widest transition-all">
                    Check In
                  </button>
              }
            </div>
          </div>
        ))}
        {visible.length === 0 && <p className="text-center text-sm text-white/25 py-8">No attendees match your search.</p>}
      </div>
    </motion.div>
  );
};

// Merch Tab
const MerchTab: React.FC<{ merch: MerchItem[]; setup: EventSetup; onUpdate: (m: MerchItem[]) => void }> = ({ merch, setup, onUpdate }) => {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', price: '', inventory: '', fulfillment: 'BOTH' as MerchFulfillment, sizes: '' });

  const addItem = () => {
    if (!form.name) return;
    const newItem: MerchItem = {
      id: uuid(), name: form.name, description: form.description,
      price: parseFloat(form.price) || 0, imageUrl: '',
      inventory: parseInt(form.inventory) || 0, sold: 0,
      status: 'IN_STOCK', fulfillment: form.fulfillment,
      sizes: form.sizes.split(',').map(s => s.trim()).filter(Boolean),
    };
    onUpdate([...merch, newItem]);
    setForm({ name: '', description: '', price: '', inventory: '', fulfillment: 'BOTH', sizes: '' });
    setAdding(false);
  };

  const sellOne = (id: string) => onUpdate(merch.map(m => m.id === id && m.sold < m.inventory ? { ...m, sold: m.sold + 1 } : m));
  const remove = (id: string) => onUpdate(merch.filter(m => m.id !== id));

  const totalRevenue = merch.reduce((s, m) => s + m.sold * m.price, 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black uppercase tracking-widest text-white">Merch</h3>
          <p className="text-xs text-white/35 mt-0.5">Revenue: {fmtCurrency(totalRevenue)} · {merch.reduce((s, m) => s + m.sold, 0)} units sold</p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-pink-500/15 border border-pink-500/30 text-pink-400 text-xs font-black uppercase tracking-widest hover:bg-pink-500/25 transition-all">
          <Plus size={13} /> Add Item
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {merch.map(item => (
          <div key={item.id} className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl group hover:border-white/10 transition-all">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center shrink-0">
                <ShoppingBag size={16} className="text-pink-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-white">{item.name}</p>
                <p className="text-xs text-white/40 leading-relaxed">{item.description}</p>
              </div>
              <button onClick={() => remove(item.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/15 text-white/30 hover:text-red-400 transition-all">
                <Trash2 size={13} />
              </button>
            </div>

            {item.sizes.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {item.sizes.map(s => <span key={s} className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-black text-white/40">{s}</span>)}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 mb-3 text-center">
              <div>
                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Price</p>
                <p className="text-sm font-black text-white">{fmtCurrency(item.price)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Sold</p>
                <p className="text-sm font-black text-pink-400">{item.sold}/{item.inventory}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Revenue</p>
                <p className="text-sm font-black text-emerald-400">{fmtCurrency(item.sold * item.price)}</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${item.status === 'PRE_ORDER' ? 'bg-blue-500/15 text-blue-400' : item.status === 'IN_STOCK' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                  {item.status === 'PRE_ORDER' ? 'Pre-Order' : item.status === 'IN_STOCK' ? 'In Stock' : 'Sold Out'}
                </span>
                <span className="text-[9px] font-black text-white/25 uppercase tracking-widest">{item.fulfillment === 'BOTH' ? 'Pickup + Ship' : item.fulfillment === 'PICKUP' ? 'Pickup Only' : 'Ship Only'}</span>
              </div>
              <button onClick={() => sellOne(item.id)} className="text-[10px] font-black text-white/30 hover:text-pink-400 transition-colors uppercase tracking-widest">+ Sale</button>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-5 bg-white/[0.04] border border-white/10 rounded-2xl space-y-3">
            <p className="text-sm font-black text-white">New Merch Item</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'name', label: 'Item Name', placeholder: 'Tour Tee', span: 2 },
                { key: 'description', label: 'Description', placeholder: 'Limited edition screen-printed tee', span: 2 },
                { key: 'price', label: 'Price ($)', placeholder: '35' },
                { key: 'inventory', label: 'Inventory', placeholder: '100' },
                { key: 'sizes', label: 'Sizes (comma-separated)', placeholder: 'S, M, L, XL, XXL', span: 2 },
              ].map(f => (
                <div key={f.key} className={f.span ? `col-span-${f.span}` : ''}>
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">{f.label}</label>
                  <input value={form[f.key as keyof typeof form]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                    className="w-full px-3 py-2.5 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold focus:border-pink-500/40 transition-all" />
                </div>
              ))}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">Fulfillment</label>
                <select value={form.fulfillment} onChange={e => setForm(p => ({ ...p, fulfillment: e.target.value as MerchFulfillment }))}
                  className="w-full px-3 py-2.5 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none font-bold">
                  <option value="BOTH">Pickup + Ship</option>
                  <option value="PICKUP">Pickup at Event Only</option>
                  <option value="SHIP">Ship to Customer</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addItem} className="px-5 py-2.5 rounded-xl bg-pink-500 text-white text-xs font-black uppercase tracking-widest hover:bg-pink-400 transition-all">Add Item</button>
              <button onClick={() => setAdding(false)} className="px-5 py-2.5 rounded-xl bg-white/5 text-white/50 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// Marketing Tab
const MarketingTab: React.FC<{ setup: EventSetup; onOpenBoards?: () => void }> = ({ setup, onOpenBoards }) => {
  const strategies = [
    { label: 'Full Marketing Strategy', type: 'marketingPlan', color: '#FF8C00', icon: <Megaphone size={14} /> },
    { label: 'Find Local Vendors', type: 'vendorSearch', color: '#10b981', icon: <MapPin size={14} /> },
    { label: 'Ticket Pricing Strategy', type: 'ticketStrategy', color: '#a855f7', icon: <Ticket size={14} /> },
    { label: 'Event Budget & P&L', type: 'budget', color: '#3b82f6', icon: <DollarSign size={14} /> },
  ];

  const platforms = [
    { name: 'Instagram Reels', tip: '15-sec teaser + venue walkthrough. Post 3 weeks, 1 week, 3 days, day-of.', free: true },
    { name: 'TikTok', tip: 'Behind the scenes: rehearsal, setlist writing, venue setup. Authentic content converts.', free: true },
    { name: 'Facebook Events', tip: 'Create event page, invite followers, share in local music groups.', free: true },
    { name: 'Email List', tip: 'Send 3 emails: announce, 1-week reminder, day-before. Highest conversion rate.', free: true },
    { name: 'Spotify Playlist', tip: 'Submit to editorial playlists and independent curators 2-3 weeks before.', free: true },
    { name: 'Local Press', tip: 'Email Detroit music blogs, alternative weeklies, and culture editors. 80% free coverage.', free: true },
    { name: 'Venue Cross-Promo', tip: 'Ask the venue to promote you on their social channels and email list.', free: true },
    { name: 'Instagram / Meta Ads', tip: 'Even $5/day for 7 days = strong local reach. Target music fans in zip codes around venue.', free: false },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      {/* Budget display */}
      <div className="p-5 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30">Marketing Budget</p>
            <p className="text-3xl font-black text-white mt-1">{fmtCurrency(setup.marketingBudget)}</p>
          </div>
          {setup.marketingBudget === 0 && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl">
              <p className="text-xs font-black text-emerald-400">$0 Budget</p>
              <p className="text-[10px] text-emerald-400/60 mt-0.5">Aria has free strategies for you</p>
            </div>
          )}
        </div>
      </div>

      {/* Aria marketing buttons */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30 mb-3">Aria Marketing Intelligence</p>
        <div className="grid grid-cols-2 gap-3">
          {strategies.map(s => (
            <button key={s.type}
              onClick={() => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt: ariaPrompt(s.type, setup) } }))}
              className="flex items-center gap-3 p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl hover:border-white/15 hover:bg-white/[0.06] transition-all text-left group">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all" style={{ background: `${s.color}20`, color: s.color }}>
                {s.icon}
              </div>
              <span className="text-sm font-black text-white/70 group-hover:text-white transition-colors">{s.label}</span>
              <Sparkles size={11} className="ml-auto text-amber-400/40 group-hover:text-amber-400 transition-colors shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* Visual boards */}
      {onOpenBoards && (
        <button onClick={onOpenBoards}
          className="w-full flex items-center justify-between p-4 bg-white/[0.03] border border-dashed border-white/15 rounded-2xl hover:border-[#FF8C00]/40 hover:bg-[#FF8C00]/5 transition-all group">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FF8C00]/10 flex items-center justify-center">
              <Layers size={16} className="text-[#FF8C00]" />
            </div>
            <div className="text-left">
              <p className="text-sm font-black text-white">Open Artist Boards</p>
              <p className="text-xs text-white/40">Poster concepts, stage design, marketing art</p>
            </div>
          </div>
          <ArrowRight size={14} className="text-white/20 group-hover:text-[#FF8C00] transition-colors" />
        </button>
      )}

      {/* Platform strategies */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30 mb-4">Channel Playbook</p>
        <div className="space-y-2">
          {platforms.map(p => (
            <div key={p.name} className="flex items-start gap-3 p-3.5 bg-white/[0.03] border border-white/[0.04] rounded-xl">
              <span className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${p.free ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/15 text-blue-400'}`}>
                {p.free ? 'FREE' : 'PAID'}
              </span>
              <div>
                <p className="text-xs font-black text-white">{p.name}</p>
                <p className="text-[10px] text-white/40 leading-relaxed mt-0.5">{p.tip}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

// Stream/PPV Tab
const StreamTab: React.FC<{ setup: EventSetup; onUpdate: (s: EventSetup) => void }> = ({ setup, onUpdate }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
    <div>
      <h3 className="text-base font-black uppercase tracking-widest text-white">Stream & Pay-Per-View</h3>
      <p className="text-xs text-white/35 mt-0.5">Monetize beyond the room — stream or charge for remote access</p>
    </div>

    <div className="p-5 bg-white/[0.03] border border-white/[0.06] rounded-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-black text-white">Pay-Per-View</p>
          <p className="text-xs text-white/40">Charge remote viewers to watch your event live</p>
        </div>
        <button onClick={() => onUpdate({ ...setup, isPPV: !setup.isPPV })}
          className={`w-12 h-6 rounded-full transition-all relative ${setup.isPPV ? 'bg-[#FF8C00]' : 'bg-white/10'}`}>
          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${setup.isPPV ? 'left-7' : 'left-1'}`} />
        </button>
      </div>

      {setup.isPPV && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3 pt-3 border-t border-white/5">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">PPV Price ($)</label>
            <input value={setup.ppvPrice} onChange={e => onUpdate({ ...setup, ppvPrice: parseFloat(e.target.value) || 0 })} type="number"
              className="w-full px-3 py-2.5 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none font-bold focus:border-[#FF8C00]/40 transition-all" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">Stream URL (optional)</label>
            <input value={setup.streamUrl} onChange={e => onUpdate({ ...setup, streamUrl: e.target.value })} placeholder="Your streaming endpoint or platform link"
              className="w-full px-3 py-2.5 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold focus:border-[#FF8C00]/40 transition-all" />
          </div>
          <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
            <p className="text-xs font-black text-emerald-400 mb-1">PPV Revenue Projection</p>
            <p className="text-xs text-white/50">At 100 PPV viewers: <span className="text-emerald-400 font-black">{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(setup.ppvPrice * 100)}</span></p>
            <p className="text-xs text-white/50">At 500 PPV viewers: <span className="text-emerald-400 font-black">{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(setup.ppvPrice * 500)}</span></p>
          </div>
        </motion.div>
      )}
    </div>

    <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
      <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt: ariaPrompt('ticketStrategy', setup) } }))}
        className="flex items-center gap-2 text-amber-400 text-xs font-black uppercase tracking-widest hover:text-amber-300 transition-colors">
        <Sparkles size={11} /> Ask Aria: Should I stream this event and at what price?
      </button>
    </div>
  </motion.div>
);

// Setup Tab
const SetupTab: React.FC<{ setup: EventSetup; onUpdate: (s: EventSetup) => void }> = ({ setup, onUpdate }) => {
  const upd = (key: keyof EventSetup, val: any) => onUpdate({ ...setup, [key]: val });
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <h3 className="text-base font-black uppercase tracking-widest text-white">Event Setup</h3>
      <div className="grid grid-cols-2 gap-4">
        {[
          { key: 'title',       label: 'Event Title',         placeholder: 'The Underground Sessions Vol. 3', span: 2 },
          { key: 'artistName',  label: 'Artist / Act Name',   placeholder: 'Marcus & The Collective', span: 2 },
          { key: 'date',        label: 'Date',                placeholder: '2026-08-22', type: 'date' },
          { key: 'showTime',    label: 'Show Time',           placeholder: '8:00 PM' },
          { key: 'doorsTime',   label: 'Doors Time',          placeholder: '7:00 PM' },
          { key: 'capacity',    label: 'Capacity',            placeholder: '400', type: 'number' },
          { key: 'venue',       label: 'Venue Name',          placeholder: 'The Shelter', span: 2 },
          { key: 'address',     label: 'Street Address',      placeholder: '431 W Canfield St', span: 2 },
          { key: 'city',        label: 'City',                placeholder: 'Detroit' },
          { key: 'state',       label: 'State',               placeholder: 'MI' },
          { key: 'ticketPrice', label: 'GA Ticket Price ($)', placeholder: '25', type: 'number' },
          { key: 'vipPrice',    label: 'VIP Price ($)',       placeholder: '75', type: 'number' },
          { key: 'marketingBudget', label: 'Marketing Budget ($)', placeholder: '500', type: 'number' },
          { key: 'geofenceRadius',  label: 'Geofence Radius (meters)', placeholder: '200', type: 'number' },
        ].map((f: any) => (
          <div key={f.key} className={f.span ? `col-span-${f.span}` : ''}>
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">{f.label}</label>
            <input type={f.type || 'text'} value={(setup as any)[f.key]} placeholder={f.placeholder}
              onChange={e => upd(f.key as keyof EventSetup, f.type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value)}
              className="w-full px-3 py-2.5 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold focus:border-[#FF8C00]/40 transition-all" />
          </div>
        ))}
        <div className="col-span-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">Event Type</label>
          <select value={setup.type} onChange={e => upd('type', e.target.value)}
            className="w-full px-3 py-2.5 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none font-bold">
            {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1">Event Description</label>
          <textarea value={setup.description} onChange={e => upd('description', e.target.value)} rows={3}
            className="w-full px-3 py-2.5 bg-black/20 border border-white/10 rounded-xl text-sm text-white outline-none placeholder-white/20 font-bold resize-none focus:border-[#FF8C00]/40 transition-all" />
        </div>
      </div>
    </motion.div>
  );
};

// ─── Main EventProductionStudio ───────────────────────────────────────────────

const EPS_TABS: { id: EPS_Tab; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'dashboard',  label: 'Dashboard',  icon: <BarChart2 size={12} />,    color: '#FF8C00' },
  { id: 'setup',      label: 'Setup',      icon: <Edit2 size={12} />,        color: '#6b7280' },
  { id: 'setlist',    label: 'Setlist',    icon: <Music2 size={12} />,       color: '#a855f7' },
  { id: 'team',       label: 'Team',       icon: <Users size={12} />,        color: '#3b82f6' },
  { id: 'tickets',    label: 'Tickets',    icon: <Ticket size={12} />,       color: '#10b981' },
  { id: 'checkin',    label: 'Check-In',   icon: <CheckCircle2 size={12} />, color: '#f59e0b' },
  { id: 'merch',      label: 'Merch',      icon: <ShoppingBag size={12} />,  color: '#ec4899' },
  { id: 'stream',     label: 'Stream',     icon: <Radio size={12} />,        color: '#ef4444' },
  { id: 'marketing',  label: 'Marketing',  icon: <Megaphone size={12} />,    color: '#6366f1' },
];

const EventProductionStudio: React.FC<Props> = ({ onBack, onOpenTicketDesigner, onOpenBoards }) => {
  const [productions, setProductions] = useState<EventProduction[]>(() => {
    const stored = loadProductions();
    return stored.length > 0 ? stored : [DEMO_PRODUCTION];
  });
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<EPS_Tab>('dashboard');

  const prod = productions[activeIdx] || DEMO_PRODUCTION;

  const updateProd = (updated: EventProduction) => {
    const next = productions.map((p, i) => i === activeIdx ? updated : p);
    setProductions(next);
    saveProductions(next);
  };

  const updateSetup    = (s: EventSetup)     => updateProd({ ...prod, setup: s });
  const updateSetlist  = (s: SetlistTrack[]) => updateProd({ ...prod, setlist: s });
  const updateTeam     = (t: TeamMember[])   => updateProd({ ...prod, team: t });
  const updateMerch    = (m: MerchItem[])    => updateProd({ ...prod, merch: m });
  const updateAttendees= (a: Attendee[])     => updateProd({ ...prod, attendees: a });

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard':  return <DashboardTab prod={prod} onSwitchTab={setActiveTab} />;
      case 'setup':      return <SetupTab setup={prod.setup} onUpdate={updateSetup} />;
      case 'setlist':    return <SetlistTab setlist={prod.setlist} setup={prod.setup} onUpdate={updateSetlist} />;
      case 'team':       return <TeamTab team={prod.team} setup={prod.setup} onUpdate={updateTeam} />;
      case 'tickets':    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          <h3 className="text-base font-black uppercase tracking-widest text-white">Tickets & Invites</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button onClick={() => onOpenTicketDesigner?.(prod.setup.id)}
              className="flex flex-col items-center justify-center gap-3 p-8 bg-white/[0.03] border border-dashed border-white/15 rounded-2xl hover:border-[#FF8C00]/40 hover:bg-[#FF8C00]/5 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-[#FF8C00]/10 flex items-center justify-center">
                <Ticket size={22} className="text-[#FF8C00]" />
              </div>
              <div className="text-center">
                <p className="text-sm font-black text-white">Open Ticket Designer</p>
                <p className="text-xs text-white/40 mt-0.5">6 templates · Digital · Print · QR · Animated</p>
              </div>
              <ArrowRight size={14} className="text-white/20 group-hover:text-[#FF8C00] transition-colors" />
            </button>
            <div className="p-5 bg-white/[0.03] border border-white/[0.06] rounded-2xl space-y-3">
              <p className="text-xs font-black text-white/60">Attendees</p>
              <p className="text-2xl font-black text-white">{prod.attendees.length}<span className="text-sm text-white/40 font-bold"> / {prod.setup.capacity}</span></p>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-[#FF8C00] rounded-full" style={{ width: `${Math.min(100, prod.attendees.length / prod.setup.capacity * 100)}%` }} />
              </div>
              <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_ARIA', { detail: { prompt: ariaPrompt('ticketStrategy', prod.setup) } }))}
                className="flex items-center gap-2 text-amber-400 text-[10px] font-black uppercase tracking-widest hover:text-amber-300 transition-colors">
                <Sparkles size={10} /> Aria: Ticket strategy
              </button>
            </div>
          </div>
        </motion.div>
      );
      case 'checkin':    return <CheckInTab attendees={prod.attendees} setup={prod.setup} onUpdate={updateAttendees} />;
      case 'merch':      return <MerchTab merch={prod.merch} setup={prod.setup} onUpdate={updateMerch} />;
      case 'stream':     return <StreamTab setup={prod.setup} onUpdate={updateSetup} />;
      case 'marketing':  return <MarketingTab setup={prod.setup} onOpenBoards={onOpenBoards} />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-transparent text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/90 backdrop-blur-2xl border-b border-white/[0.06] px-6 py-4 shrink-0">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          {onBack && (
            <button onClick={onBack} className="text-white/40 hover:text-white transition-colors">
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="w-9 h-9 rounded-xl bg-[#FF8C00]/15 flex items-center justify-center border border-[#FF8C00]/25 shrink-0">
            <Mic size={15} className="text-[#FF8C00]" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black uppercase tracking-widest text-white truncate">{prod.setup.title}</h1>
            <p className="text-[10px] text-white/35">{prod.setup.venue} · {prod.setup.city} · {prod.setup.date}</p>
          </div>
          <span className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${STATUS_STYLE[prod.setup.status].bg} ${STATUS_STYLE[prod.setup.status].text}`}>
            {STATUS_STYLE[prod.setup.status].label}
          </span>
        </div>
      </div>

      {/* Tab nav */}
      <div className="sticky top-[69px] z-10 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/[0.05] shrink-0">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto no-scrollbar py-1.5">
            {EPS_TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === tab.id ? 'text-black' : 'bg-transparent text-white/40 hover:text-white/70 hover:bg-white/5'}`}
                style={activeTab === tab.id ? { background: tab.color } : {}}>
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab}>{renderTab()}</motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default EventProductionStudio;
