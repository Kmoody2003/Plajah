import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Ticket, Users, BarChart3, QrCode, Package, Printer,
  Plus, ExternalLink, Calendar, MapPin, Globe, Edit,
  ChevronRight, Download, Search, CheckCircle2, XCircle,
  Clock, RefreshCw, Tv, Copy, Check, Eye,
} from 'lucide-react';
import { fetchCreatorEvents, fetchEventAttendees } from '../services/backendService';
import { UserProfile, PlajahEvent } from '../types';

interface Props {
  currentUser: UserProfile;
  onCreateEvent: () => void;
  onEditEvent: (eventId: string) => void;
  onViewEvent: (eventId: string) => void;
  onLaunchKiosk: (eventId: string) => void;
  onLaunchScanner: (eventId: string) => void;
}

const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmt = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:     { label: 'Draft',     color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
  PUBLISHED: { label: 'Published', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  ON_SALE:   { label: 'On Sale',   color: '#34d399', bg: 'rgba(52,211,153,0.1)' },
  SOLD_OUT:  { label: 'Sold Out',  color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
  CANCELLED: { label: 'Cancelled', color: '#94a3b8', bg: 'rgba(148,163,184,0.07)' },
  COMPLETED: { label: 'Completed', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
};

const EventTicketingDashboard: React.FC<Props> = ({ currentUser, onCreateEvent, onEditEvent, onViewEvent, onLaunchKiosk, onLaunchScanner }) => {
  const [events, setEvents]           = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [attendees, setAttendees]     = useState<any[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [searchQ, setSearchQ]         = useState('');
  const [copied, setCopied]           = useState('');

  useEffect(() => {
    fetchCreatorEvents(currentUser.uid).then(e => { setEvents(e); setLoading(false); });
  }, [currentUser.uid]);

  const selectEvent = async (eventId: string) => {
    setSelectedEvent(eventId);
    setLoadingAttendees(true);
    const list = await fetchEventAttendees(eventId);
    setAttendees(list);
    setLoadingAttendees(false);
  };

  const copyEventLink = (eventId: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/event/${eventId}`);
    setCopied(eventId);
    setTimeout(() => setCopied(''), 2000);
  };

  const downloadCSV = () => {
    if (!attendees.length) return;
    const headers = ['Name','Email','Tier','Qty','Status','Checked In','Physical','Order Date'];
    const rows = attendees.map(a => [a.holderName, a.holderEmail, a.tierName, a.quantity, a.status, a.checkedInAt ? new Date(a.checkedInAt).toLocaleString() : '', a.physicalRequested ? 'Yes' : 'No', new Date(a.createdAt).toLocaleString()]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `attendees-${selectedEvent}.csv`; a.click();
  };

  const activeEvent = selectedEvent ? events.find(e => e.id === selectedEvent) : null;
  const checkedIn = attendees.filter(a => a.status === 'USED').length;
  const totalTickets = attendees.reduce((s, a) => s + (a.quantity || 1), 0);
  const filteredAttendees = attendees.filter(a =>
    !searchQ || a.holderName?.toLowerCase().includes(searchQ.toLowerCase()) || a.holderEmail?.toLowerCase().includes(searchQ.toLowerCase())
  );

  return (
    <div className="min-h-screen text-white p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">My Events</h1>
          <p className="text-[10px] text-white/30 uppercase tracking-widest">Ticketing & Event Management</p>
        </div>
        <button onClick={onCreateEvent} className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl font-black text-xs uppercase tracking-widest hover:brightness-110 transition-all">
          <Plus size={14} /> Create Event
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Event list */}
        <div className="lg:col-span-2 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center h-32"><RefreshCw size={18} className="animate-spin text-white/20" /></div>
          ) : events.length === 0 ? (
            <div className="text-center py-16 text-white/25">
              <Ticket size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm font-black">No events yet</p>
              <button onClick={onCreateEvent} className="mt-3 text-xs text-[#c084fc] hover:underline">Create your first event →</button>
            </div>
          ) : events.map(event => {
            const badge = STATUS_BADGE[event.status] ?? STATUS_BADGE.DRAFT;
            const isSelected = selectedEvent === event.id;
            return (
              <div key={event.id} onClick={() => selectEvent(event.id)} className={`p-4 rounded-2xl border cursor-pointer transition-all ${isSelected ? 'border-[#6B0099]/50 bg-[#6B0099]/10' : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.05]'}`}>
                <div className="flex items-start gap-3">
                  {event.coverImage
                    ? <img src={event.coverImage} className="w-12 h-12 rounded-xl object-cover shrink-0" alt="" />
                    : <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0"><Ticket size={18} className="text-white/30" /></div>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-black text-white truncate">{event.title}</p>
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0" style={{ color: badge.color, background: badge.bg }}>{badge.label}</span>
                    </div>
                    <p className="text-[10px] text-white/30 mt-0.5">{fmtDate(event.startDate)}</p>
                    {event.venueName && <p className="text-[10px] text-white/25 flex items-center gap-1 mt-0.5"><MapPin size={9} />{event.venueName}</p>}
                    <p className="text-[10px] text-white/40 mt-1">{event.totalSold ?? 0} / {event.totalCapacity ?? '∞'} tickets sold</p>
                  </div>
                </div>
                {isSelected && (
                  <div className="flex gap-1.5 mt-3 flex-wrap">
                    <button onClick={e => { e.stopPropagation(); onViewEvent(event.id); }} className="flex items-center gap-1 px-2.5 py-1.5 bg-white/8 rounded-lg text-[9px] font-black uppercase text-white/60 hover:text-white transition-colors"><Eye size={10} />View Page</button>
                    <button onClick={e => { e.stopPropagation(); onEditEvent(event.id); }} className="flex items-center gap-1 px-2.5 py-1.5 bg-white/8 rounded-lg text-[9px] font-black uppercase text-white/60 hover:text-white transition-colors"><Edit size={10} />Edit</button>
                    <button onClick={e => { e.stopPropagation(); copyEventLink(event.id); }} className="flex items-center gap-1 px-2.5 py-1.5 bg-white/8 rounded-lg text-[9px] font-black uppercase text-white/60 hover:text-white transition-colors">
                      {copied === event.id ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
                      {copied === event.id ? 'Copied!' : 'Link'}
                    </button>
                    {event.kioskEnabled && <button onClick={e => { e.stopPropagation(); onLaunchKiosk(event.id); }} className="flex items-center gap-1 px-2.5 py-1.5 bg-[#60a5fa]/10 border border-[#60a5fa]/20 rounded-lg text-[9px] font-black uppercase text-[#60a5fa] hover:brightness-125 transition-all"><Tv size={10} />Kiosk</button>}
                    <button onClick={e => { e.stopPropagation(); onLaunchScanner(event.id); }} className="flex items-center gap-1 px-2.5 py-1.5 bg-[#34d399]/10 border border-[#34d399]/20 rounded-lg text-[9px] font-black uppercase text-[#34d399] hover:brightness-125 transition-all"><QrCode size={10} />Scan</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Attendee panel */}
        <div className="lg:col-span-3">
          {!selectedEvent ? (
            <div className="flex flex-col items-center justify-center h-64 text-white/20">
              <Users size={32} className="mb-3 opacity-30" />
              <p className="text-sm">Select an event to manage attendees</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Total Tickets', value: totalTickets, icon: Ticket, color: '#a78bfa' },
                  { label: 'Checked In', value: checkedIn, icon: CheckCircle2, color: '#34d399' },
                  { label: 'Remaining', value: totalTickets - checkedIn, icon: Clock, color: '#fbbf24' },
                ].map(stat => {
                  const Icon = stat.icon;
                  return (
                    <div key={stat.label} className="p-4 bg-white/[0.04] border border-white/8 rounded-2xl">
                      <Icon size={16} style={{ color: stat.color }} className="mb-2" />
                      <p className="text-xl font-black text-white">{stat.value}</p>
                      <p className="text-[9px] text-white/30 uppercase tracking-widest">{stat.label}</p>
                    </div>
                  );
                })}
              </div>

              {/* Check-in progress bar */}
              {totalTickets > 0 && (
                <div className="p-4 bg-white/[0.03] border border-white/8 rounded-2xl">
                  <div className="flex justify-between mb-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Check-in Progress</p>
                    <p className="text-[10px] font-black text-white">{Math.round((checkedIn / totalTickets) * 100)}%</p>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${(checkedIn / totalTickets) * 100}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} className="h-full rounded-full bg-gradient-to-r from-[#34d399] to-[#6B0099]" />
                  </div>
                </div>
              )}

              {/* Attendee list header */}
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <Search size={13} className="absolute left-3 top-2.5 text-white/25" />
                  <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search attendees…" className="w-full pl-8 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-white/20" />
                </div>
                <button onClick={downloadCSV} className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase text-white/50 hover:text-white transition-all">
                  <Download size={11} /> CSV
                </button>
              </div>

              {/* Attendee rows */}
              {loadingAttendees ? (
                <div className="flex justify-center py-8"><RefreshCw size={16} className="animate-spin text-white/20" /></div>
              ) : (
                <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
                  {filteredAttendees.length === 0 ? (
                    <p className="text-center text-white/25 text-sm py-8">No attendees yet</p>
                  ) : filteredAttendees.map(a => (
                    <div key={a.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${a.status === 'USED' ? 'border-[#34d399]/20 bg-[#34d399]/5' : 'border-white/6 bg-white/[0.02]'}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${a.status === 'USED' ? 'bg-[#34d399]/20' : 'bg-white/8'}`}>
                        {a.status === 'USED' ? <CheckCircle2 size={14} className="text-[#34d399]" /> : <Ticket size={12} className="text-white/30" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-white truncate">{a.holderName}</p>
                        <p className="text-[9px] text-white/30 truncate">{a.holderEmail}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ color: a.tierColor ?? '#a78bfa', background: `${a.tierColor ?? '#a78bfa'}15` }}>{a.tierName}</span>
                        {a.physicalRequested && <div className="mt-1 text-[8px] text-[#60a5fa]/70 flex items-center gap-0.5 justify-end"><Package size={8} />Physical</div>}
                        {a.checkedInAt && <div className="mt-0.5 text-[8px] text-[#34d399]/60">{new Date(a.checkedInAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>}
                      </div>
                      <div className="text-[10px] text-white/20 shrink-0">×{a.quantity}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EventTicketingDashboard;
