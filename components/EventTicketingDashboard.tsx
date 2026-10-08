import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Ticket, Users, BarChart3, QrCode, Package, Printer,
  Plus, ExternalLink, Calendar, MapPin, Globe, Edit,
  ChevronRight, Download, Search, CheckCircle2, XCircle,
  Clock, RefreshCw, Tv, Copy, Check, Eye, Palette,
  Disc, Film, Sparkles, Share2, Camera, Navigation2,
  Sliders, Mail, Send, Trash2, DollarSign, Maximize2,
  ShieldCheck, Radio, AlertCircle, Wine, Utensils, Award, Beer
} from 'lucide-react';
import {
  fetchCreatorEvents, fetchEventAttendees, createOrUpdateEvent,
  subscribeToPhotoPool, uploadPhoto, createEventPhotoPool,
  DEFAULT_VENUE_PACKAGES, redeemTicketPackage
} from '../services/backendService';
import { TELA_STYLE_ERAS } from '../services/telaStyleEraLibrary';
import { UserProfile, PlajahEvent, TicketTier, TelaTicketDesign, AlbumArtTransform, EventEviteGuest, Photo, EventPackageAddon, TicketPurchasedPackage } from '../types';
import TelaTicketPass from './tela/TelaTicketPass';

interface Props {
  currentUser: UserProfile;
  onCreateEvent: () => void;
  onEditEvent: (eventId: string) => void;
  onViewEvent: (eventId: string) => void;
  onLaunchKiosk: (eventId: string) => void;
  onLaunchScanner: (eventId: string) => void;
  onOpenPhotoPool?: (poolId: string) => void;
}

type DashboardTab = 'overview' | 'tela_designer' | 'packages_fb' | 'evites' | 'photopool' | 'door_ops';

const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtMoney = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:     { label: 'Draft',     color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
  PUBLISHED: { label: 'Published', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  ON_SALE:   { label: 'On Sale',   color: '#34d399', bg: 'rgba(52,211,153,0.1)' },
  SOLD_OUT:  { label: 'Sold Out',  color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
  CANCELLED: { label: 'Cancelled', color: '#94a3b8', bg: 'rgba(148,163,184,0.07)' },
  COMPLETED: { label: 'Completed', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
};

const ALBUM_TRANSFORMS: { id: AlbumArtTransform; label: string; icon: React.ComponentType<any> }[] = [
  { id: 'VINYL_RECORD', label: '12" Vinyl Disc', icon: Disc },
  { id: 'HOLOGRAPHIC_FOIL', label: 'Holographic Foil', icon: Sparkles },
  { id: 'CASSETTE_TAPE', label: 'Cassette Tape', icon: Radio },
  { id: 'NEON_CYBERPUNK', label: 'Neon Cyberpunk', icon: Tv },
  { id: 'GOLD_EMBOSSED', label: 'VIP Gold Leaf', icon: ShieldCheck },
  { id: 'CRT_GLITCH', label: 'Analog CRT', icon: Film },
  { id: 'MATTE_EDITORIAL', label: 'Matte Minimal', icon: Palette },
];

const EventTicketingDashboard: React.FC<Props> = ({
  currentUser,
  onCreateEvent,
  onEditEvent,
  onViewEvent,
  onLaunchKiosk,
  onLaunchScanner,
  onOpenPhotoPool
}) => {
  const [events, setEvents]                     = useState<any[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [selectedEventId, setSelectedEventId]   = useState<string | null>(null);
  const [activeTab, setActiveTab]               = useState<DashboardTab>('overview');

  // Attendees state
  const [attendees, setAttendees]               = useState<any[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [searchQ, setSearchQ]                   = useState('');
  const [copiedLink, setCopiedLink]             = useState(false);

  // Evites state
  const [guests, setGuests]                     = useState<EventEviteGuest[]>([]);
  const [newGuestName, setNewGuestName]         = useState('');
  const [newGuestEmail, setNewGuestEmail]       = useState('');
  const [newGuestPlusOnes, setNewGuestPlusOnes] = useState(0);
  const [showAddGuest, setShowAddGuest]         = useState(false);

  // Photo pool state
  const [poolMedia, setPoolMedia]               = useState<Photo[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [projectorMode, setProjectorMode]       = useState(false);
  const [projectorIndex, setProjectorIndex]     = useState(0);

  // Tela Ticket Designer local state
  const [telaDesign, setTelaDesign]             = useState<TelaTicketDesign>({
    eraId: 'art-deco',
    eraName: 'Art Deco',
    palette: ['#101820', '#D4AF37', '#FF8C00', '#F4E8D0'],
    typography: 'Geometric display capitals',
    albumArtTransform: 'VINYL_RECORD',
  });
  const [savingDesign, setSavingDesign]         = useState(false);
  const [designSavedNotice, setDesignSavedNotice] = useState(false);

  // F&B Packages state (Drink & Dining package model)
  const [eventPackages, setEventPackages]             = useState<EventPackageAddon[]>(DEFAULT_VENUE_PACKAGES);
  const [savingPackages, setSavingPackages]           = useState(false);
  const [packagesSavedNotice, setPackagesSavedNotice] = useState(false);
  const [selectedAttendeeForBar, setSelectedAttendeeForBar] = useState<any | null>(null);
  const [barAttendeeSearch, setBarAttendeeSearch]     = useState('');
  const [barItemName, setBarItemName]                 = useState('Craft Draft Beer');
  const [barStation, setBarStation]                   = useState('Main Stage Bar');
  const [pouringDrink, setPouringDrink]               = useState(false);
  const [showAddCustomModal, setShowAddCustomModal]   = useState(false);
  const [newPkgName, setNewPkgName]                   = useState('');
  const [newPkgPrice, setNewPkgPrice]                 = useState(35);
  const [newPkgCategory, setNewPkgCategory]           = useState<'ALCOHOL' | 'DRINK' | 'FOOD_AND_BEVERAGE' | 'CUSTOM'>('ALCOHOL');
  const [newPkgType, setNewPkgType]                   = useState<'UNLIMITED' | 'QUANTITY_CREDITS' | 'VALUE_ALLOWANCE'>('QUANTITY_CREDITS');
  const [newPkgUnits, setNewPkgUnits]                 = useState(5);
  const [newPkgUnitName, setNewPkgUnitName]           = useState('Pours');

  // Load events on mount
  useEffect(() => {
    fetchCreatorEvents(currentUser.uid).then(e => {
      setEvents(e);
      setLoading(false);
      if (e.length > 0 && !selectedEventId) {
        setSelectedEventId(e[0].id);
      }
    });
  }, [currentUser.uid]);

  const activeEvent = useMemo(() => {
    return events.find(e => e.id === selectedEventId) || null;
  }, [events, selectedEventId]);

  // Sync attendees, guests, photo pool, packages, and ticket design when activeEvent changes
  useEffect(() => {
    if (!selectedEventId) return;

    setLoadingAttendees(true);
    fetchEventAttendees(selectedEventId).then(list => {
      setAttendees(list);
      setLoadingAttendees(false);
    });

    if (activeEvent) {
      if (activeEvent.ticketDesign) {
        setTelaDesign(activeEvent.ticketDesign);
      }
      if (activeEvent.guests) {
        setGuests(activeEvent.guests);
      }
      if (activeEvent.packages && activeEvent.packages.length > 0) {
        setEventPackages(activeEvent.packages);
      } else {
        setEventPackages(DEFAULT_VENUE_PACKAGES);
      }

      // Subscribe to real-time event photo pool
      const poolId = activeEvent.photoPoolId || `pool_${activeEvent.id}`;
      const unsub = subscribeToPhotoPool(poolId, (photos) => {
        setPoolMedia(photos);
      });
      return () => unsub();
    }
  }, [selectedEventId, activeEvent]);

  // Auto rotate projector mode
  useEffect(() => {
    if (!projectorMode || poolMedia.length <= 1) return;
    const interval = setInterval(() => {
      setProjectorIndex(i => (i + 1) % poolMedia.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [projectorMode, poolMedia.length]);

  const copyEventLink = () => {
    if (!activeEvent) return;
    navigator.clipboard.writeText(`${window.location.origin}/event/${activeEvent.id}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const downloadCSV = () => {
    if (!attendees.length) return;
    const headers = ['Name', 'Email', 'Tier', 'Qty', 'Status', 'Checked In At', 'Order Date'];
    const rows = attendees.map(a => [
      a.holderName,
      a.holderEmail,
      a.tierName,
      a.quantity,
      a.status,
      a.checkedInAt ? new Date(a.checkedInAt).toLocaleString() : '',
      new Date(a.createdAt).toLocaleString(),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendees-${activeEvent?.id || 'event'}.csv`;
    a.click();
  };

  // Save Tela ticket design to event in Firestore
  const handleSaveTelaDesign = async () => {
    if (!activeEvent) return;
    setSavingDesign(true);
    try {
      await createOrUpdateEvent({
        ...activeEvent,
        ticketDesign: telaDesign,
      });
      setEvents(evs => evs.map(e => e.id === activeEvent.id ? { ...e, ticketDesign: telaDesign } : e));
      setDesignSavedNotice(true);
      setTimeout(() => setDesignSavedNotice(false), 2500);
    } catch (err: any) {
      alert(err.message || 'Error saving design');
    } finally {
      setSavingDesign(false);
    }
  };

  // Add Evite Guest
  const handleAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuestName.trim() || !newGuestEmail.trim() || !activeEvent) return;

    const newGuest: EventEviteGuest = {
      id: `gst_${Date.now()}`,
      name: newGuestName.trim(),
      email: newGuestEmail.trim(),
      plusOnes: newGuestPlusOnes,
      status: 'INVITED',
      invitedAt: Date.now(),
      tierName: 'VIP Evite Pass',
    };

    const updated = [newGuest, ...guests];
    setGuests(updated);
    setNewGuestName('');
    setNewGuestEmail('');
    setNewGuestPlusOnes(0);
    setShowAddGuest(false);

    try {
      await createOrUpdateEvent({
        ...activeEvent,
        guests: updated,
      });
    } catch {}
  };

  // Handle Photo Pool manual upload by staff/artist
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeEvent) return;

    setIsUploadingPhoto(true);
    const poolId = activeEvent.photoPoolId || `pool_${activeEvent.id}`;

    try {
      for (let i = 0; i < files.length; i++) {
        await uploadPhoto(files[i], {
          albumId: poolId,
          isPublic: true,
          title: `Show Live Capture ${Date.now()}`,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Sound synthesizer for staff counter POS
  const playPosChime = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1046.5, ctx.currentTime);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1318.5, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.12);
      osc2.start(ctx.currentTime + 0.08);
      osc2.stop(ctx.currentTime + 0.35);
    } catch {}
  };

  // Package & F&B Management Handlers
  const handleSavePackages = async () => {
    if (!activeEvent) return;
    setSavingPackages(true);
    try {
      await createOrUpdateEvent({
        ...activeEvent,
        packages: eventPackages,
      });
      setEvents(evs => evs.map(e => e.id === activeEvent.id ? { ...e, packages: eventPackages } : e));
      setPackagesSavedNotice(true);
      setTimeout(() => setPackagesSavedNotice(false), 2500);
    } catch (err: any) {
      alert(err.message || 'Error saving packages');
    } finally {
      setSavingPackages(false);
    }
  };

  const handleTogglePackageActive = (pkgId: string) => {
    setEventPackages(prev => prev.map(p => p.id === pkgId ? { ...p, isActive: !p.isActive } : p));
  };

  const handleUpdatePackagePrice = (pkgId: string, priceCents: number) => {
    setEventPackages(prev => prev.map(p => p.id === pkgId ? { ...p, priceCents } : p));
  };

  const handleAddCustomPackage = () => {
    if (!newPkgName.trim()) return;
    const newPkg: EventPackageAddon = {
      id: `pkg_custom_${Date.now()}`,
      name: newPkgName.trim(),
      category: newPkgCategory,
      type: newPkgType,
      description: 'Custom attendee package addon',
      priceCents: Math.round(newPkgPrice * 100),
      totalUnits: newPkgType === 'UNLIMITED' ? -1 : newPkgUnits,
      unitName: newPkgUnitName,
      eligibleItems: ['Any Craft Beer', 'Signature Cocktail', 'Appetizer'],
      eligibleItemsDescription: 'Valid across participating venue bars',
      stations: ['Main Stage Bar', 'Patio Lounge'],
      isActive: true,
    };
    setEventPackages(prev => [...prev, newPkg]);
    setShowAddCustomModal(false);
    setNewPkgName('');
  };

  const handleCounterPour = async (pkg: any) => {
    if (!selectedAttendeeForBar) return;
    setPouringDrink(true);
    try {
      const res = await redeemTicketPackage({
        ticketId: selectedAttendeeForBar.id,
        packageId: pkg.id,
        units: 1,
        itemName: barItemName,
        stationName: barStation,
        staffName: currentUser.displayName || 'Counter Staff',
      });
      if (res.success && res.package) {
        playPosChime();
        setAttendees(prev => prev.map(a => {
          if (a.id === selectedAttendeeForBar.id) {
            const pkgs = (a.packages || []).map((p: any) => p.id === res.package.id ? res.package : p);
            return { ...a, packages: pkgs };
          }
          return a;
        }));
        setSelectedAttendeeForBar((prev: any) => {
          if (!prev) return null;
          const pkgs = (prev.packages || []).map((p: any) => p.id === res.package.id ? res.package : p);
          return { ...prev, packages: pkgs };
        });
      } else {
        alert(res.reason || 'Could not redeem package');
      }
    } catch (e: any) {
      alert(e.message || 'Error processing redemption');
    } finally {
      setPouringDrink(false);
    }
  };

  // KPIs
  const checkedInCount = attendees.filter(a => a.status === 'USED').length;
  const totalTicketsSold = activeEvent?.totalSold || attendees.reduce((s, a) => s + (a.quantity || 1), 0);
  const totalCapacity = activeEvent?.totalCapacity || 500;
  const grossRevenueCents = attendees.reduce((sum, a) => sum + (a.totalPriceCents || 0), 0);
  const checkInRate = totalTicketsSold > 0 ? Math.round((checkedInCount / totalTicketsSold) * 100) : 0;

  // F&B Package KPIs
  const totalPackagesSold = attendees.reduce((acc, a) => acc + (a.packages?.length || 0), 0);
  const totalPoursRedeemed = attendees.reduce((acc, a) => {
    const pkgRedemptions = (a.packages || []).reduce((pSum: number, p: any) => pSum + (p.redemptions?.length || 0), 0);
    return acc + pkgRedemptions;
  }, 0);
  const grossPackageRevenueCents = attendees.reduce((acc, a) => {
    const pkgTotal = (a.packages || []).reduce((pSum: number, p: any) => pSum + (p.priceCents || 0), 0);
    return acc + pkgTotal;
  }, 0);

  // All bar redemptions across attendees for live audit stream
  const allRedemptionsLedger = useMemo(() => {
    const list: Array<{ id: string; holderName: string; itemName: string; stationName: string; timestamp: number; units: number }> = [];
    attendees.forEach(a => {
      (a.packages || []).forEach((p: any) => {
        (p.redemptions || []).forEach((r: any) => {
          list.push({
            id: r.id,
            holderName: a.holderName || 'Guest',
            itemName: r.itemName || p.name,
            stationName: r.stationName || 'Main Bar',
            timestamp: r.timestamp,
            units: r.unitsRedeemed || 1,
          });
        });
      });
    });
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [attendees]);

  const filteredAttendees = attendees.filter(a =>
    !searchQ ||
    a.holderName?.toLowerCase().includes(searchQ.toLowerCase()) ||
    a.holderEmail?.toLowerCase().includes(searchQ.toLowerCase())
  );

  const barFilteredAttendees = attendees.filter(a =>
    !barAttendeeSearch ||
    a.holderName?.toLowerCase().includes(barAttendeeSearch.toLowerCase()) ||
    a.holderEmail?.toLowerCase().includes(barAttendeeSearch.toLowerCase()) ||
    a.id?.toLowerCase().includes(barAttendeeSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#070707] text-white flex flex-col font-sans pb-16">
      {/* Top Navigation Bar */}
      <header className="px-6 py-4 border-b border-white/10 bg-black/60 backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#6B0099] to-[#D40055] flex items-center justify-center shadow-lg shadow-purple-900/30">
            <Ticket size={20} className="text-white" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black uppercase tracking-tight">Plajah Event Management Stack</h1>
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Unified Box Office
              </span>
            </div>
            <p className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5">
              Ticketing · Tela Design Engine · Evites · Real-Time Photo Pool · Auto Check-In
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Event Switcher Dropdown */}
          {events.length > 0 && (
            <select
              value={selectedEventId || ''}
              onChange={e => setSelectedEventId(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-black text-white focus:outline-none focus:border-purple-400 uppercase tracking-wider"
            >
              {events.map(ev => (
                <option key={ev.id} value={ev.id} className="bg-neutral-900 text-white">
                  {ev.title}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={onCreateEvent}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl font-black text-xs uppercase tracking-wider hover:brightness-110 transition-all shadow-lg shadow-purple-900/20"
          >
            <Plus size={14} /> New Event
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[60vh]">
          <RefreshCw size={24} className="animate-spin text-white/30" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
          <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <Ticket size={36} className="text-white/30" />
          </div>
          <h2 className="text-xl font-black uppercase text-white">No Events Yet</h2>
          <p className="text-xs text-white/40 max-w-sm mt-1 mb-6">
            Create your first live show, art opening, or listening party. Sell tickets, send animated Tela evites, and crowdsource live event photos.
          </p>
          <button
            onClick={onCreateEvent}
            className="px-6 py-3.5 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-2xl font-black text-xs uppercase tracking-wider hover:brightness-110 transition-all shadow-xl shadow-purple-900/30"
          >
            Create Your First Event →
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {/* Active Event Summary Header */}
          {activeEvent && (
            <div className="px-6 py-4 bg-[#0c0c0c] border-b border-white/5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                {activeEvent.coverImage ? (
                  <img src={activeEvent.coverImage} className="w-14 h-14 rounded-2xl object-cover shrink-0 border border-white/10" alt="" />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    <Ticket size={24} className="text-white/30" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black text-white uppercase tracking-tight truncate">
                      {activeEvent.title}
                    </h2>
                    {activeEvent.status && (
                      <span
                        className="text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full"
                        style={{
                          color: STATUS_BADGE[activeEvent.status]?.color || '#34d399',
                          background: STATUS_BADGE[activeEvent.status]?.bg || 'rgba(52,211,153,0.1)',
                        }}
                      >
                        {STATUS_BADGE[activeEvent.status]?.label || activeEvent.status}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-white/40 mt-1">
                    <span className="flex items-center gap-1"><Calendar size={12} /> {fmtDate(activeEvent.startDate)}</span>
                    {activeEvent.venueName && (
                      <span className="flex items-center gap-1"><MapPin size={12} /> {activeEvent.venueName}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Launch Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => onViewEvent(activeEvent.id)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-black uppercase text-white/70 hover:text-white transition-all"
                >
                  <Eye size={12} /> View Page
                </button>
                <button
                  onClick={() => onEditEvent(activeEvent.id)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-black uppercase text-white/70 hover:text-white transition-all"
                >
                  <Edit size={12} /> Edit Details
                </button>
                <button
                  onClick={copyEventLink}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-black uppercase text-white/70 hover:text-white transition-all"
                >
                  {copiedLink ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  {copiedLink ? 'Copied!' : 'Copy Link'}
                </button>
                <button
                  onClick={() => onLaunchScanner(activeEvent.id)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-black uppercase hover:bg-emerald-500/25 transition-all shadow-lg shadow-emerald-900/20"
                >
                  <QrCode size={13} /> Optical Scanner
                </button>
                {activeEvent.kioskEnabled && (
                  <button
                    onClick={() => onLaunchKiosk(activeEvent.id)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/15 border border-blue-500/30 text-blue-400 rounded-xl text-xs font-black uppercase hover:bg-blue-500/25 transition-all"
                  >
                    <Tv size={13} /> Kiosk Mode
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Unified Tab Bar */}
          <div className="px-6 border-b border-white/10 bg-black/40 flex gap-2 overflow-x-auto custom-scrollbar">
            {[
              { id: 'overview', label: '1. Overview & Sales', icon: BarChart3 },
              { id: 'tela_designer', label: '2. Tela Ticket Studio', icon: Palette },
              { id: 'packages_fb', label: '3. F&B & Drink Packages', icon: Wine },
              { id: 'evites', label: '4. Evites & Guestlist', icon: Mail },
              { id: 'photopool', label: '5. Live Photo Pool', icon: Camera },
              { id: 'door_ops', label: '6. Door Ops & Check-In', icon: Navigation2 },
            ].map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 py-3 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all shrink-0 ${
                    active
                      ? 'border-pink-500 text-white bg-white/[0.03]'
                      : 'border-transparent text-white/40 hover:text-white/80 hover:bg-white/[0.01]'
                  }`}
                >
                  <Icon size={14} className={active ? 'text-pink-400' : ''} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab 1: Overview & Sales */}
          {activeTab === 'overview' && (
            <div className="p-6 max-w-6xl mx-auto w-full space-y-6">
              {/* Stat Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  { label: 'Gross Revenue', value: fmtMoney(grossRevenueCents), icon: DollarSign, color: '#34d399' },
                  { label: 'Tickets Sold', value: `${totalTicketsSold} / ${totalCapacity}`, icon: Ticket, color: '#60a5fa' },
                  { label: 'Checked In', value: `${checkedInCount} (${checkInRate}%)`, icon: CheckCircle2, color: '#a78bfa' },
                  { label: 'Live Crowd Photos', value: poolMedia.length, icon: Camera, color: '#f472b6' },
                ].map(stat => {
                  const Icon = stat.icon;
                  return (
                    <div key={stat.label} className="p-5 rounded-2xl bg-white/[0.03] border border-white/8">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{ background: `${stat.color}15`, color: stat.color }}>
                        <Icon size={16} />
                      </div>
                      <p className="text-2xl font-black text-white">{stat.value}</p>
                      <p className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5">{stat.label}</p>
                    </div>
                  );
                })}
              </div>

              {/* Check-In Progress Bar */}
              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/8 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-white/60">
                    Live Door Velocity & Attendance
                  </span>
                  <span className="text-xs font-mono font-black text-emerald-400">
                    {checkedInCount} of {totalTicketsSold} Admitted ({checkInRate}%)
                  </span>
                </div>
                <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${checkInRate}%` }}
                    transition={{ duration: 0.8 }}
                    className="h-full bg-gradient-to-r from-emerald-500 to-[#6B0099] rounded-full"
                  />
                </div>
              </div>

              {/* Ticket Tiers Breakdown */}
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                  Ticket Tiers & Inventory
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {activeEvent?.tiers?.map((tier: TicketTier) => (
                    <div key={tier.id} className="p-4 rounded-2xl bg-white/[0.02] border border-white/6 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-black text-white">{tier.name}</span>
                          <span className="text-xs font-black" style={{ color: tier.color || '#a78bfa' }}>
                            {tier.priceCents === 0 ? 'Free' : `$${(tier.priceCents / 100).toFixed(0)}`}
                          </span>
                        </div>
                        <p className="text-[10px] text-white/40 line-clamp-2">{tier.description || 'Access pass'}</p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-white/40">
                        <span>Sold: {tier.sold || 0} / {tier.quantity}</span>
                        <span>{Math.round(((tier.sold || 0) / (tier.quantity || 1)) * 100)}% sold</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Tela Ticket Studio */}
          {activeTab === 'tela_designer' && (
            <div className="p-6 max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Designer Controls */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black uppercase tracking-tight text-white">Tela Design Studio</h3>
                    <p className="text-xs text-white/40">Custom styling, 3D album art treatments, video & audio loops.</p>
                  </div>
                  <button
                    onClick={handleSaveTelaDesign}
                    disabled={savingDesign}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white text-xs font-black uppercase rounded-xl hover:brightness-110 disabled:opacity-40 transition-all shadow-lg shadow-purple-900/20"
                  >
                    {savingDesign ? <RefreshCw size={13} className="animate-spin" /> : designSavedNotice ? <Check size={13} className="text-emerald-400" /> : <SaveIcon />}
                    {designSavedNotice ? 'Saved!' : 'Save Design'}
                  </button>
                </div>

                {/* 1. Pick Tela Era */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/50 block">
                    1. Select Design Era
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {TELA_STYLE_ERAS.slice(0, 9).map(era => {
                      const isSel = telaDesign.eraId === era.id;
                      return (
                        <button
                          key={era.id}
                          onClick={() => setTelaDesign(d => ({
                            ...d,
                            eraId: era.id,
                            eraName: era.name,
                            palette: era.palette,
                            typography: era.typography,
                          }))}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            isSel
                              ? 'border-pink-500 bg-pink-500/10'
                              : 'border-white/8 bg-white/[0.02] hover:bg-white/5'
                          }`}
                        >
                          <p className="text-xs font-black text-white truncate">{era.name}</p>
                          <div className="flex gap-1 mt-1.5">
                            {era.palette.map((c, i) => (
                              <span key={i} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Pick Album Art Transform */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/50 block">
                    2. Transform Album Art
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ALBUM_TRANSFORMS.map(t => {
                      const Icon = t.icon;
                      const isSel = telaDesign.albumArtTransform === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setTelaDesign(d => ({ ...d, albumArtTransform: t.id }))}
                          className={`p-3 rounded-xl border flex items-center gap-2 text-left transition-all ${
                            isSel
                              ? 'border-purple-400 bg-purple-500/10'
                              : 'border-white/8 bg-white/[0.02] hover:bg-white/5'
                          }`}
                        >
                          <Icon size={16} className={isSel ? 'text-purple-400' : 'text-white/40'} />
                          <span className="text-xs font-black text-white truncate">{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Looping Video & Audio Stream */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/8 space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/50 block">
                    3. Integrated Video Loop (Optional)
                  </label>
                  <input
                    value={telaDesign.videoUrl || ''}
                    onChange={e => setTelaDesign(d => ({ ...d, videoUrl: e.target.value }))}
                    placeholder="https://.../ambient_visuals.mp4"
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-white/30"
                  />
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/50 block pt-1">
                    Audio Preview Track Title & Stream URL
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={telaDesign.audioTrackTitle || ''}
                      onChange={e => setTelaDesign(d => ({ ...d, audioTrackTitle: e.target.value }))}
                      placeholder="Track title"
                      className="px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-white/30"
                    />
                    <input
                      value={telaDesign.audioPreviewUrl || ''}
                      onChange={e => setTelaDesign(d => ({ ...d, audioPreviewUrl: e.target.value }))}
                      placeholder="Audio stream URL (.mp3)"
                      className="px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-white/30"
                    />
                  </div>
                </div>
              </div>

              {/* Live Ticket Pass Preview */}
              <div className="flex flex-col items-center justify-center p-4 bg-[#0a0a0a] rounded-3xl border border-white/10">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40 mb-4">
                  Live Ticket Pass Render
                </p>
                <TelaTicketPass
                  eventTitle={activeEvent.title}
                  artistName={activeEvent.creatorName}
                  date={fmtDate(activeEvent.startDate)}
                  venue={activeEvent.venueName || 'Venue'}
                  city={activeEvent.city || ''}
                  coverImage={activeEvent.coverImage}
                  design={telaDesign}
                  interactive={true}
                  geofenceNearby={true}
                />
              </div>
            </div>
          )}

          {/* Tab 3: F&B & Drink Packages Management */}
          {activeTab === 'packages_fb' && (
            <div className="p-6 max-w-6xl mx-auto w-full space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight text-white flex items-center gap-2">
                    <Wine className="text-pink-400" size={18} />
                    Food & Beverage Packages
                  </h3>
                  <p className="text-xs text-white/40">
                    Smart drink & dining packages with automatic cooldown pacing, visual token gauges, and countertop instant POS pours.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAddCustomModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 text-white text-xs font-black uppercase rounded-xl hover:bg-white/10 transition-all"
                  >
                    <Plus size={14} /> Custom Package
                  </button>
                  <button
                    onClick={handleSavePackages}
                    disabled={savingPackages}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-pink-500 to-rose-600 text-white text-xs font-black uppercase rounded-xl hover:brightness-110 disabled:opacity-50 transition-all shadow-lg shadow-pink-900/20"
                  >
                    <SaveIcon />
                    {savingPackages ? 'Saving...' : packagesSavedNotice ? 'Saved!' : 'Save Menu Packages'}
                  </button>
                </div>
              </div>

              {/* F&B KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Package Revenue', value: fmtMoney(grossPackageRevenueCents), icon: DollarSign, color: '#ec4899' },
                  { label: 'Packages Sold', value: `${totalPackagesSold}`, icon: Package, color: '#3b82f6' },
                  { label: 'Total Pours / Dispersals', value: `${totalPoursRedeemed}`, icon: Beer, color: '#f59e0b' },
                  { label: 'Active Menu Add-ons', value: `${eventPackages.filter(p => p.isActive).length} Packages`, icon: Utensils, color: '#10b981' },
                ].map((s, idx) => {
                  const Icon = s.icon;
                  return (
                    <div key={idx} className="p-4 rounded-2xl bg-white/[0.03] border border-white/8">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-white/40">{s.label}</span>
                        <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${s.color}15`, color: s.color }}>
                          <Icon size={14} />
                        </div>
                      </div>
                      <p className="text-xl font-black text-white tracking-tight">{s.value}</p>
                    </div>
                  );
                })}
              </div>

              {/* Main Content: Left Column (Package Configurator) + Right Column (Countertop Bar POS) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left: Package Configurator */}
                <div className="lg:col-span-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                      <Wine size={14} className="text-pink-400" />
                      Add-on Packages on Offer
                    </h4>
                    <span className="text-[10px] text-white/40 font-mono">
                      {eventPackages.filter(p => p.isActive).length} of {eventPackages.length} enabled
                    </span>
                  </div>

                  <div className="space-y-3">
                    {eventPackages.map(pkg => (
                      <div
                        key={pkg.id}
                        className={`p-4 rounded-2xl border transition-all ${
                          pkg.isActive
                            ? 'bg-white/[0.03] border-white/10'
                            : 'bg-white/[0.01] border-white/5 opacity-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-white">{pkg.name}</span>
                              <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-white/5 border border-white/10 text-white/60">
                                {pkg.category}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-pink-500/10 border border-pink-500/20 text-pink-300">
                                {pkg.type === 'UNLIMITED' ? 'Unlimited' : `${pkg.totalUnits} ${pkg.unitName}`}
                              </span>
                            </div>
                            <p className="text-[11px] text-white/50 mt-1">{pkg.description}</p>
                          </div>

                          <button
                            onClick={() => handleTogglePackageActive(pkg.id)}
                            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all ${
                              pkg.isActive
                                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                : 'bg-white/5 border-white/10 text-white/40'
                            }`}
                          >
                            {pkg.isActive ? 'Active' : 'Disabled'}
                          </button>
                        </div>

                        {/* Price and Cooldown controls */}
                        <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase font-bold text-white/40">Price:</span>
                            <div className="relative w-24">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/40 font-mono text-xs">$</span>
                              <input
                                type="number"
                                value={pkg.priceCents / 100}
                                onChange={e => handleUpdatePackagePrice(pkg.id, Math.round(parseFloat(e.target.value || '0') * 100))}
                                className="w-full pl-5 pr-2 py-1 bg-black/40 border border-white/10 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-pink-500"
                              />
                            </div>
                          </div>

                          {pkg.cooldownMinutes && pkg.cooldownMinutes > 0 ? (
                            <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1">
                              <Clock size={11} /> {pkg.cooldownMinutes}m anti-stacking timer
                            </span>
                          ) : (
                            <span className="text-[10px] text-white/30 font-mono">No cooldown</span>
                          )}
                        </div>

                        <div className="mt-2 text-[10px] text-white/30 flex items-center gap-1.5 truncate">
                          <MapPin size={10} /> Valid at: {pkg.stations.join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: Zero-Hardware Countertop Bar POS */}
                <div className="lg:col-span-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                      <Award size={14} className="text-emerald-400" />
                      Zero-Hardware Countertop POS
                    </h4>
                    <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Ready to Pour
                    </span>
                  </div>

                  <div className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-4 shadow-xl">
                    {/* Attendee search */}
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/50 block mb-1.5">
                        Step 1: Lookup Guest
                      </label>
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                        <input
                          value={barAttendeeSearch}
                          onChange={e => setBarAttendeeSearch(e.target.value)}
                          placeholder="Search guest name, email, or ticket ID..."
                          className="w-full pl-9 pr-3 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                        />
                      </div>

                      {/* Attendee Quick Results */}
                      {barAttendeeSearch.trim() && (
                        <div className="mt-2 max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                          {barFilteredAttendees.slice(0, 5).map(att => (
                            <button
                              key={att.id}
                              onClick={() => {
                                setSelectedAttendeeForBar(att);
                                setBarAttendeeSearch('');
                              }}
                              className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                                selectedAttendeeForBar?.id === att.id
                                  ? 'bg-pink-500/15 border-pink-500/40 text-white'
                                  : 'bg-white/[0.02] border-white/5 text-white/80 hover:bg-white/5'
                              }`}
                            >
                              <div>
                                <p className="text-xs font-bold text-white">{att.holderName}</p>
                                <p className="text-[10px] text-white/40">{att.holderEmail} · {att.tierName}</p>
                              </div>
                              <span className="text-[10px] font-bold text-pink-400">
                                {att.packages?.length || 0} packages
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Selected Guest Card */}
                    {selectedAttendeeForBar ? (
                      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/8 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-black text-sm">
                              {selectedAttendeeForBar.holderName?.charAt(0) || 'G'}
                            </div>
                            <div>
                              <p className="text-xs font-black text-white">{selectedAttendeeForBar.holderName}</p>
                              <p className="text-[10px] text-white/40">{selectedAttendeeForBar.tierName} · {selectedAttendeeForBar.holderEmail}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setSelectedAttendeeForBar(null)}
                            className="text-[10px] text-white/40 hover:text-white uppercase font-bold"
                          >
                            Clear
                          </button>
                        </div>

                        {/* Station and Item Selectors */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                          <div>
                            <label className="text-[9px] font-black uppercase text-white/40 block mb-1">Serving Station</label>
                            <select
                              value={barStation}
                              onChange={e => setBarStation(e.target.value)}
                              className="w-full px-2 py-1.5 bg-black border border-white/10 rounded-lg text-xs text-white focus:outline-none"
                            >
                              <option value="Main Stage Bar">Main Stage Bar</option>
                              <option value="VIP Lounge Bar">VIP Lounge Bar</option>
                              <option value="Patio Beer Garden">Patio Beer Garden</option>
                              <option value="Food Truck Station">Food Truck Station</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[9px] font-black uppercase text-white/40 block mb-1">Item Being Poured</label>
                            <input
                              value={barItemName}
                              onChange={e => setBarItemName(e.target.value)}
                              placeholder="e.g. Craft IPA, Gin & Tonic"
                              className="w-full px-2 py-1.5 bg-black border border-white/10 rounded-lg text-xs text-white focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Packages List for selected attendee */}
                        <div className="space-y-2 pt-2">
                          <label className="text-[9px] font-black uppercase text-white/40 block">
                            Attached Living Pass Packages
                          </label>

                          {(!selectedAttendeeForBar.packages || selectedAttendeeForBar.packages.length === 0) ? (
                            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5 text-center text-[11px] text-white/40">
                              Guest has no active packages attached.
                            </div>
                          ) : (
                            selectedAttendeeForBar.packages.map((pkg: any) => {
                              const isUnlimited = pkg.type === 'UNLIMITED';
                              const remaining = pkg.remainingUnits ?? pkg.totalUnits;
                              const isDepleted = !isUnlimited && remaining <= 0;
                              const lastRedeemed = pkg.lastRedeemedAt;
                              const cooldownMs = (pkg.cooldownMinutes || 0) * 60 * 1000;
                              const inCooldown = isUnlimited && lastRedeemed && (Date.now() - lastRedeemed < cooldownMs);
                              const secondsLeft = inCooldown ? Math.ceil((cooldownMs - (Date.now() - lastRedeemed)) / 1000) : 0;

                              return (
                                <div key={pkg.id} className="p-3 rounded-xl bg-black/60 border border-white/10 flex items-center justify-between gap-3">
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs font-bold text-white">{pkg.name}</span>
                                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300">
                                        {isUnlimited ? 'Unlimited Pass' : `${remaining} left`}
                                      </span>
                                    </div>
                                    {inCooldown && (
                                      <p className="text-[10px] text-amber-400 font-mono mt-0.5 flex items-center gap-1">
                                        <Clock size={10} /> Cooldown: {secondsLeft}s remaining
                                      </p>
                                    )}
                                  </div>

                                  <button
                                    onClick={() => handleCounterPour(pkg)}
                                    disabled={pouringDrink || isDepleted}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md ${
                                      isDepleted
                                        ? 'bg-white/5 text-white/30 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:brightness-110'
                                    }`}
                                  >
                                    <Beer size={13} />
                                    {isDepleted ? 'Depleted' : 'Pour / Dispense'}
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-6 rounded-xl border border-dashed border-white/10 text-center space-y-1">
                        <Users size={20} className="mx-auto text-white/20" />
                        <p className="text-xs font-bold text-white/40">No guest currently selected</p>
                        <p className="text-[10px] text-white/30">Search above or click any guest to open counter dispense controls.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom: Live Venue Bar Audit Stream */}
              <div className="space-y-3 pt-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                    <Clock size={14} className="text-pink-400" />
                    Live Bar & Station Dispense Ledger
                  </h4>
                  <span className="text-[10px] text-white/40 font-mono">
                    {allRedemptionsLedger.length} total redemptions recorded
                  </span>
                </div>

                <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.02]">
                  {allRedemptionsLedger.length === 0 ? (
                    <div className="p-8 text-center text-xs text-white/40">
                      No package items redeemed yet. Dispensals will appear here in real-time.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="bg-white/[0.03] text-white/40 font-black uppercase tracking-widest text-[10px] border-b border-white/10">
                        <tr>
                          <th className="py-2.5 px-4">Time</th>
                          <th className="py-2.5 px-4">Guest</th>
                          <th className="py-2.5 px-4">Item Poured / Dispersed</th>
                          <th className="py-2.5 px-4">Bar / Station</th>
                          <th className="py-2.5 px-4">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-white/80">
                        {allRedemptionsLedger.slice(0, 15).map(log => (
                          <tr key={log.id} className="hover:bg-white/[0.02]">
                            <td className="py-2 px-4 font-mono text-[10px] text-white/40">
                              {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </td>
                            <td className="py-2 px-4 font-bold text-white">{log.holderName}</td>
                            <td className="py-2 px-4 text-emerald-400 font-semibold">{log.itemName}</td>
                            <td className="py-2 px-4 text-white/50">{log.stationName}</td>
                            <td className="py-2 px-4 font-mono text-[11px] text-white/70">-{log.units} Unit</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Modal: Create Custom Package */}
          <AnimatePresence>
            {showAddCustomModal && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
              >
                <div className="bg-[#121214] border border-white/10 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                      <Wine size={16} className="text-pink-400" />
                      Add Custom Package
                    </h3>
                    <button
                      onClick={() => setShowAddCustomModal(false)}
                      className="p-1 rounded-lg hover:bg-white/10 text-white/50 hover:text-white"
                    >
                      <XCircle size={16} />
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="text-[10px] font-black uppercase text-white/50 block mb-1">Package Name</label>
                      <input
                        value={newPkgName}
                        onChange={e => setNewPkgName(e.target.value)}
                        placeholder="e.g. VIP Tequila Tasting Pass"
                        className="w-full px-3 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-pink-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-black uppercase text-white/50 block mb-1">Category</label>
                        <select
                          value={newPkgCategory}
                          onChange={e => setNewPkgCategory(e.target.value as any)}
                          className="w-full px-3 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                        >
                          <option value="ALCOHOL">Alcohol</option>
                          <option value="DRINK">Zero-Proof / Drink</option>
                          <option value="FOOD_AND_BEVERAGE">Food & Beverage</option>
                          <option value="CUSTOM">Custom Perks</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase text-white/50 block mb-1">Tracking Type</label>
                        <select
                          value={newPkgType}
                          onChange={e => setNewPkgType(e.target.value as any)}
                          className="w-full px-3 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                        >
                          <option value="QUANTITY_CREDITS">Token Credits</option>
                          <option value="UNLIMITED">Unlimited (Paced)</option>
                          <option value="VALUE_ALLOWANCE">Dollar Allowance</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-black uppercase text-white/50 block mb-1">Price ($ USD)</label>
                        <input
                          type="number"
                          value={newPkgPrice}
                          onChange={e => setNewPkgPrice(parseFloat(e.target.value || '0'))}
                          className="w-full px-3 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                        />
                      </div>
                      {newPkgType !== 'UNLIMITED' && (
                        <div>
                          <label className="text-[10px] font-black uppercase text-white/50 block mb-1">Total Units</label>
                          <input
                            type="number"
                            value={newPkgUnits}
                            onChange={e => setNewPkgUnits(parseInt(e.target.value || '1', 10))}
                            className="w-full px-3 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase text-white/50 block mb-1">Unit Label</label>
                      <input
                        value={newPkgUnitName}
                        onChange={e => setNewPkgUnitName(e.target.value)}
                        placeholder="Pours, Drinks, Tastings, Meals"
                        className="w-full px-3 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
                    <button
                      onClick={() => setShowAddCustomModal(false)}
                      className="px-4 py-2 rounded-xl text-xs font-black uppercase text-white/60 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddCustomPackage}
                      disabled={!newPkgName.trim()}
                      className="px-4 py-2 rounded-xl text-xs font-black uppercase bg-pink-500 hover:bg-pink-600 text-white disabled:opacity-50 transition-all"
                    >
                      Add to Menu
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tab 4: Evites & Guest List (RSVP) */}
          {activeTab === 'evites' && (
            <div className="p-6 max-w-6xl mx-auto w-full space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight text-white">Guest List & Digital Evites</h3>
                  <p className="text-xs text-white/40">Send animated VIP passes, track RSVPs, and manage complimentary guest lists.</p>
                </div>
                <button
                  onClick={() => setShowAddGuest(v => !v)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white text-xs font-black uppercase rounded-xl hover:brightness-110 transition-all"
                >
                  <Plus size={14} /> Invite Guest
                </button>
              </div>

              {/* Add Guest Modal / Drawer */}
              {showAddGuest && (
                <form onSubmit={handleAddGuest} className="p-5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-white">Send Digital VIP Evite</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      value={newGuestName}
                      onChange={e => setNewGuestName(e.target.value)}
                      placeholder="Guest full name"
                      required
                      className="px-3 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-white/30"
                    />
                    <input
                      type="email"
                      value={newGuestEmail}
                      onChange={e => setNewGuestEmail(e.target.value)}
                      placeholder="Guest email address"
                      required
                      className="px-3 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-white/30"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-white/40 uppercase font-black">Plus-Ones:</span>
                      <input
                        type="number"
                        min="0"
                        max="5"
                        value={newGuestPlusOnes}
                        onChange={e => setNewGuestPlusOnes(parseInt(e.target.value) || 0)}
                        className="w-16 px-3 py-2 bg-black/60 border border-white/10 rounded-xl text-xs text-white"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddGuest(false)}
                      className="px-4 py-2 rounded-xl bg-white/5 text-xs font-black text-white/50 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-emerald-500 text-black text-xs font-black uppercase tracking-wider hover:brightness-110"
                    >
                      Send Evite & Issue Pass
                    </button>
                  </div>
                </form>
              )}

              {/* Guest Table */}
              <div className="rounded-2xl border border-white/10 overflow-hidden bg-black/40">
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-white/60">
                    Invited Guests ({guests.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-emerald-400 font-black">
                      {guests.filter(g => g.status === 'ATTENDING').length} Attending
                    </span>
                  </div>
                </div>

                {guests.length === 0 ? (
                  <div className="text-center py-16 text-white/30">
                    <Mail size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-xs">No evites sent yet. Click "Invite Guest" to begin.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {guests.map(guest => (
                      <div key={guest.id} className="p-4 flex items-center justify-between gap-4 hover:bg-white/[0.02]">
                        <div className="min-w-0">
                          <p className="text-xs font-black text-white truncate">{guest.name}</p>
                          <p className="text-[10px] text-white/40">{guest.email}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] font-mono text-white/40">
                            +{guest.plusOnes} guest{guest.plusOnes !== 1 ? 's' : ''}
                          </span>
                          <span className={`text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                            guest.status === 'ATTENDING'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-white/10 text-white/60'
                          }`}>
                            {guest.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 4: Live Photo Pool */}
          {activeTab === 'photopool' && (
            <div className="p-6 max-w-6xl mx-auto w-full space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight text-white">Live Crowd Photo Pool</h3>
                  <p className="text-xs text-white/40">
                    Attendees scan the pass to upload concert photos and videos in real time.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setProjectorMode(true)}
                    disabled={poolMedia.length === 0}
                    className="flex items-center gap-1.5 px-4 py-2 bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-black uppercase rounded-xl hover:bg-purple-500/30 transition-all disabled:opacity-40"
                  >
                    <Maximize2 size={13} /> Stage Projector Mode
                  </button>
                  <label className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white text-xs font-black uppercase rounded-xl cursor-pointer hover:brightness-110 transition-all">
                    <Camera size={13} />
                    {isUploadingPhoto ? 'Uploading…' : 'Add Photo / Video'}
                    <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handlePhotoUpload} />
                  </label>
                </div>
              </div>

              {/* Photo Pool Grid */}
              {poolMedia.length === 0 ? (
                <div className="p-16 rounded-3xl border border-white/10 bg-white/[0.02] text-center space-y-3">
                  <Camera size={40} className="mx-auto text-white/20" />
                  <h4 className="text-sm font-black uppercase text-white">Photo Stream is Ready</h4>
                  <p className="text-xs text-white/40 max-w-sm mx-auto">
                    Photos taken by ticket holders via their living pass will appear here instantly.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {poolMedia.map((photo, i) => (
                    <div key={photo.id || i} className="group relative aspect-square rounded-2xl overflow-hidden bg-black/40 border border-white/10">
                      <img src={photo.url} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                        <span className="text-[9px] text-white/70 font-mono truncate">{photo.title || 'Live Capture'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 5: Door Ops & Check-In */}
          {activeTab === 'door_ops' && (
            <div className="p-6 max-w-6xl mx-auto w-full space-y-6">
              {/* Geofence & Auto Check-in Settings */}
              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                    <Navigation2 size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-tight text-white">Geofence Auto Check-In</h4>
                    <p className="text-xs text-white/40">
                      Detects ticket holders within venue perimeter (default 250m) and marks passes ready at the door.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onLaunchScanner(activeEvent.id)}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-500 text-black text-xs font-black uppercase tracking-wider rounded-xl hover:brightness-110 transition-all shadow-lg shadow-emerald-500/20"
                  >
                    <QrCode size={14} /> Open Camera Scanner
                  </button>
                </div>
              </div>

              {/* Attendee Search & List */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 relative">
                    <Search size={14} className="absolute left-3.5 top-3 text-white/30" />
                    <input
                      value={searchQ}
                      onChange={e => setSearchQ(e.target.value)}
                      placeholder="Search ticket holders by name or email…"
                      className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-white/25 focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <button
                    onClick={downloadCSV}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs font-black uppercase text-white/60 hover:text-white"
                  >
                    <Download size={13} /> Export CSV
                  </button>
                </div>

                <div className="rounded-2xl border border-white/10 overflow-hidden bg-black/40">
                  {loadingAttendees ? (
                    <div className="py-12 flex justify-center"><RefreshCw size={18} className="animate-spin text-white/30" /></div>
                  ) : filteredAttendees.length === 0 ? (
                    <p className="text-center py-12 text-xs text-white/30">No attendees match your query.</p>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {filteredAttendees.map(a => (
                        <div key={a.id} className="p-3.5 flex items-center justify-between gap-4 hover:bg-white/[0.02]">
                          <div className="min-w-0">
                            <p className="text-xs font-black text-white truncate">{a.holderName}</p>
                            <p className="text-[10px] text-white/40">{a.holderEmail}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full" style={{ color: a.tierColor || '#a78bfa', background: `${a.tierColor || '#a78bfa'}15` }}>
                              {a.tierName}
                            </span>
                            <span className={`text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                              a.status === 'USED'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-white/10 text-white/60'
                            }`}>
                              {a.status === 'USED' ? 'Admitted ✓' : 'Unchecked'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fullscreen Stage Projector Presentation Mode Modal */}
      <AnimatePresence>
        {projectorMode && poolMedia.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999999] bg-black flex flex-col items-center justify-center p-8 select-none"
          >
            <button
              onClick={() => setProjectorMode(false)}
              className="absolute top-6 right-6 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black uppercase tracking-wider text-white"
            >
              Exit Projector (ESC)
            </button>

            <motion.img
              key={projectorIndex}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              src={poolMedia[projectorIndex].url}
              alt=""
              className="max-h-[85vh] max-w-[90vw] object-contain rounded-3xl shadow-2xl border border-white/20"
            />

            <div className="absolute bottom-6 flex items-center gap-4 text-xs font-black uppercase tracking-widest text-white/60 bg-black/60 backdrop-blur-md px-6 py-2.5 rounded-full border border-white/10">
              <Camera size={14} className="text-pink-400" />
              <span>Live Crowd Photo Stream · {projectorIndex + 1} of {poolMedia.length}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

function SaveIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

export default EventTicketingDashboard;
