import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar, MapPin, Globe, Video, Ticket, List, Image, Settings2,
  Plus, Trash2, ChevronDown, ChevronUp, X, Check, Upload,
  Zap, Clock, Users, DollarSign, Package, Printer, AlertCircle,
  Eye, Send, ArrowLeft, Tv, Heart, Info, RefreshCw,
} from 'lucide-react';
import { createOrUpdateEvent } from '../services/backendService';
import { UserProfile, PlajahEvent, TicketTier, ItineraryItem, EventType } from '../types';
import { uploadFile } from '../services/backendService';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  currentUser: UserProfile;
  editingEvent?: Partial<PlajahEvent>;
  onSaved: (eventId: string) => void;
  onBack: () => void;
}

type Section = 'basics' | 'datetime' | 'location' | 'tiers' | 'itinerary' | 'media' | 'advanced';

const SECTION_META: { key: Section; label: string; icon: React.ElementType; desc: string }[] = [
  { key: 'basics',    label: 'Event Basics',    icon: Calendar,  desc: 'Name, type, description' },
  { key: 'datetime',  label: 'Date & Time',     icon: Clock,     desc: 'When does it start?' },
  { key: 'location',  label: 'Location',        icon: MapPin,    desc: 'Venue, virtual, or hybrid' },
  { key: 'tiers',     label: 'Ticket Tiers',    icon: Ticket,    desc: 'Pricing and availability' },
  { key: 'itinerary', label: 'Itinerary',       icon: List,      desc: 'Schedule and lineup' },
  { key: 'media',     label: 'Media & Promo',   icon: Image,     desc: 'Cover art and promo video' },
  { key: 'advanced',  label: 'Advanced',        icon: Settings2, desc: 'Kiosk, printing, integrations' },
];

const TIER_COLORS = ['#a78bfa','#f472b6','#34d399','#60a5fa','#fbbf24','#f87171','#fb923c'];

const TIER_TYPES: { type: ItineraryItem['type']; label: string; emoji: string }[] = [
  { type: 'DOORS',       label: 'Doors Open',   emoji: '🚪' },
  { type: 'PERFORMANCE', label: 'Performance',  emoji: '🎤' },
  { type: 'WORKSHOP',    label: 'Workshop',     emoji: '🛠️' },
  { type: 'MEET_GREET',  label: 'Meet & Greet', emoji: '🤝' },
  { type: 'BREAK',       label: 'Break',        emoji: '⏸️' },
  { type: 'CEREMONY',    label: 'Ceremony',     emoji: '🏆' },
  { type: 'OTHER',       label: 'Other',        emoji: '📌' },
];

const newTier = (idx: number): TicketTier => ({
  id: `tier_${Date.now()}_${idx}`,
  name: idx === 0 ? 'General Admission' : idx === 1 ? 'VIP' : 'Tier',
  description: '',
  priceCents: idx === 0 ? 2000 : idx === 1 ? 5000 : 1000,
  quantity: 100,
  sold: 0,
  perOrderMin: 1,
  perOrderMax: 10,
  isVisible: true,
  benefits: [],
  color: TIER_COLORS[idx % TIER_COLORS.length],
  physicalTicketAvailable: false,
  customPackagingAvailable: false,
  customPackagingFeeCents: 500,
});

const newItineraryItem = (): ItineraryItem => ({
  id: `item_${Date.now()}`,
  time: '',
  title: '',
  type: 'PERFORMANCE',
  description: '',
  performer: '',
  durationMins: 30,
});

const fmt = (cents: number) => (cents / 100).toFixed(2);

// ── Main Component ─────────────────────────────────────────────────────────────

const EventCreationWizard: React.FC<Props> = ({ currentUser, editingEvent, onSaved, onBack }) => {
  const isEdit = !!editingEvent?.id;

  // Form state
  const [title, setTitle]             = useState(editingEvent?.title ?? '');
  const [subtitle, setSubtitle]       = useState(editingEvent?.subtitle ?? '');
  const [description, setDescription] = useState(editingEvent?.description ?? '');
  const [eventType, setEventType]     = useState<EventType>(editingEvent?.type ?? 'IN_PERSON');
  const [tags, setTags]               = useState<string[]>(editingEvent?.tags ?? []);
  const [tagInput, setTagInput]       = useState('');

  const [startDate, setStartDate]     = useState(editingEvent?.startDate ? new Date(editingEvent.startDate).toISOString().slice(0,16) : '');
  const [endDate, setEndDate]         = useState(editingEvent?.endDate ? new Date(editingEvent.endDate).toISOString().slice(0,16) : '');
  const [doorsOpen, setDoorsOpen]     = useState(editingEvent?.doorsOpenDate ? new Date(editingEvent.doorsOpenDate).toISOString().slice(0,16) : '');
  const [timezone, setTimezone]       = useState(editingEvent?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);

  const [venueName, setVenueName]     = useState(editingEvent?.venueName ?? '');
  const [venueAddress, setVenueAddress] = useState(editingEvent?.venueAddress ?? '');
  const [city, setCity]               = useState(editingEvent?.city ?? '');
  const [state, setState]             = useState(editingEvent?.state ?? '');
  const [country, setCountry]         = useState(editingEvent?.country ?? 'US');
  const [streamUrl, setStreamUrl]     = useState(editingEvent?.streamUrl ?? '');
  const [streamPassword, setStreamPassword] = useState(editingEvent?.streamPassword ?? '');

  const [tiers, setTiers]             = useState<TicketTier[]>(editingEvent?.tiers ?? [newTier(0)]);
  const [itinerary, setItinerary]     = useState<ItineraryItem[]>(editingEvent?.itinerary ?? []);

  const [coverImage, setCoverImage]   = useState(editingEvent?.coverImage ?? '');
  const [heroVideoUrl, setHeroVideoUrl] = useState(editingEvent?.heroVideoUrl ?? '');
  const [uploadingCover, setUploadingCover] = useState(false);

  const [kioskEnabled, setKioskEnabled] = useState(editingEvent?.kioskEnabled ?? false);
  const [printingEnabled, setPrintingEnabled] = useState(editingEvent?.printingEnabled ?? false);
  const [printNodePrinterId, setPrintNodePrinterId] = useState(editingEvent?.printNodePrinterId ?? '');
  const [refundPolicy, setRefundPolicy] = useState(editingEvent?.refundPolicy ?? 'NO_REFUND');
  const [ageRestriction, setAgeRestriction] = useState(editingEvent?.ageRestriction ?? '');
  const [dresscode, setDresscode]     = useState(editingEvent?.dresscode ?? '');
  const [accessibilityInfo, setAccessibilityInfo] = useState(editingEvent?.accessibilityInfo ?? '');
  const [sanctuaryOnly, setSanctuaryOnly] = useState(editingEvent?.sanctuaryMembersOnly ?? false);
  const [plajahPlusDiscount, setPlajahPlusDiscount] = useState(editingEvent?.plajahPlusDiscount ?? 0);
  const [linkedAlbumId, setLinkedAlbumId] = useState(editingEvent?.linkedAlbumId ?? '');

  const [openSection, setOpenSection] = useState<Section>('basics');
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState('');
  const [savedDraft, setSavedDraft]   = useState(false);

  const toggleSection = (s: Section) => setOpenSection(prev => prev === s ? 'basics' : s);

  // ── Cover image upload ────────────────────────────────────────────────────
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const url = await uploadFile(file, `events/${currentUser.uid}/${Date.now()}_cover`);
      setCoverImage(url);
    } catch { } finally { setUploadingCover(false); }
  };

  // ── Tier helpers ──────────────────────────────────────────────────────────
  const addTier = () => setTiers(prev => [...prev, newTier(prev.length)]);
  const removeTier = (id: string) => setTiers(prev => prev.filter(t => t.id !== id));
  const updateTier = (id: string, patch: Partial<TicketTier>) => setTiers(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  const addBenefit = (tierId: string, val: string) => { if (!val.trim()) return; updateTier(tierId, { benefits: [...(tiers.find(t => t.id === tierId)?.benefits ?? []), val.trim()] }); };
  const removeBenefit = (tierId: string, idx: number) => updateTier(tierId, { benefits: tiers.find(t => t.id === tierId)?.benefits.filter((_, i) => i !== idx) ?? [] });

  // ── Itinerary helpers ─────────────────────────────────────────────────────
  const addItem = () => setItinerary(prev => [...prev, newItineraryItem()]);
  const removeItem = (id: string) => setItinerary(prev => prev.filter(i => i.id !== id));
  const updateItem = (id: string, patch: Partial<ItineraryItem>) => setItinerary(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));

  // ── Save ──────────────────────────────────────────────────────────────────
  const buildPayload = (status: 'DRAFT' | 'ON_SALE') => ({
    id: editingEvent?.id,
    title, subtitle, description, type: eventType, tags,
    startDate: startDate ? new Date(startDate).getTime() : 0,
    endDate: endDate ? new Date(endDate).getTime() : 0,
    doorsOpenDate: doorsOpen ? new Date(doorsOpen).getTime() : undefined,
    timezone,
    venueName, venueAddress, city, state, country,
    streamUrl, streamPassword,
    tiers, itinerary,
    coverImage, heroVideoUrl,
    kioskEnabled, printingEnabled, printNodePrinterId,
    refundPolicy, ageRestriction, dresscode, accessibilityInfo,
    sanctuaryMembersOnly: sanctuaryOnly,
    plajahPlusDiscount: plajahPlusDiscount || undefined,
    linkedAlbumId: linkedAlbumId || undefined,
    totalCapacity: tiers.reduce((s, t) => s + t.quantity, 0),
    creatorName: currentUser.displayName,
    creatorPhotoURL: currentUser.photoURL,
    status,
  });

  const handleSave = async (status: 'DRAFT' | 'ON_SALE') => {
    if (!title.trim()) { setSaveError('Event title is required'); return; }
    if (!startDate) { setSaveError('Start date is required'); return; }
    setSaving(true); setSaveError('');
    try {
      const id = await createOrUpdateEvent(buildPayload(status));
      if (status === 'DRAFT') { setSavedDraft(true); setTimeout(() => setSavedDraft(false), 2000); }
      else onSaved(id);
    } catch (e: any) {
      setSaveError(e.message);
    } finally { setSaving(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen text-white max-w-3xl mx-auto px-4 py-8">

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-2 text-white/30 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">{isEdit ? 'Edit Event' : 'Create Event'}</h1>
          <p className="text-[10px] text-white/30 uppercase tracking-widest">All setup in one page</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => handleSave('DRAFT')} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:text-white transition-all disabled:opacity-40">
            {savedDraft ? <Check size={13} className="text-green-400" /> : saving ? <RefreshCw size={13} className="animate-spin" /> : null}
            {savedDraft ? 'Saved!' : 'Save Draft'}
          </button>
          <button onClick={() => handleSave('ON_SALE')} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl text-xs font-black uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-40">
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
            Publish & Go Live
          </button>
        </div>
      </div>

      {saveError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-xs text-red-400">
          <AlertCircle size={13} /> {saveError}
        </div>
      )}

      {/* Accordion sections */}
      <div className="space-y-2">
        {SECTION_META.map(sec => {
          const Icon = sec.icon;
          const isOpen = openSection === sec.key;
          return (
            <div key={sec.key} className={`border rounded-2xl overflow-hidden transition-all ${isOpen ? 'border-white/20 bg-white/[0.04]' : 'border-white/8 bg-white/[0.02]'}`}>
              <button onClick={() => toggleSection(sec.key)} className="w-full flex items-center gap-4 px-5 py-4 text-left">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${isOpen ? 'bg-[#6B0099]/30 border border-[#6B0099]/50' : 'bg-white/5 border border-white/10'}`}>
                  <Icon size={16} className={isOpen ? 'text-[#c084fc]' : 'text-white/40'} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-black text-white">{sec.label}</p>
                  <p className="text-[10px] text-white/30">{sec.desc}</p>
                </div>
                {isOpen ? <ChevronUp size={16} className="text-white/30" /> : <ChevronDown size={16} className="text-white/30" />}
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="px-5 pb-6 pt-1 space-y-4 border-t border-white/8">

                      {/* ── BASICS ── */}
                      {sec.key === 'basics' && <>
                        <div>
                          <label className="field-label">Event Title *</label>
                          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Summer Rooftop Concert" className="field-input" />
                        </div>
                        <div>
                          <label className="field-label">Subtitle / Tagline</label>
                          <input value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="e.g. An evening of jazz under the stars" className="field-input" />
                        </div>
                        <div>
                          <label className="field-label">Description</label>
                          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} placeholder="Tell fans what to expect — lineup, vibe, what's included..." className="field-input resize-none" />
                        </div>
                        <div>
                          <label className="field-label">Event Type</label>
                          <div className="flex gap-2">
                            {(['IN_PERSON','VIRTUAL','HYBRID'] as EventType[]).map(t => (
                              <button key={t} onClick={() => setEventType(t)} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${eventType === t ? 'bg-[#6B0099]/20 border-[#6B0099]/50 text-[#c084fc]' : 'bg-white/5 border-white/10 text-white/30 hover:text-white'}`}>
                                {t === 'IN_PERSON' ? '📍 In Person' : t === 'VIRTUAL' ? '💻 Virtual' : '🌐 Hybrid'}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="field-label">Tags</label>
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {tags.map(tag => <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-white/8 rounded-full text-[10px] text-white/60">{tag}<button onClick={() => setTags(prev => prev.filter(t => t !== tag))} className="text-white/30 hover:text-white"><X size={10} /></button></span>)}
                          </div>
                          <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); if (tagInput.trim()) { setTags(p => [...p, tagInput.trim()]); setTagInput(''); } } }} placeholder="Type a tag and press Enter" className="field-input" />
                        </div>
                      </>}

                      {/* ── DATETIME ── */}
                      {sec.key === 'datetime' && <>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="field-label">Start Date & Time *</label>
                            <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className="field-input" />
                          </div>
                          <div>
                            <label className="field-label">End Date & Time *</label>
                            <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className="field-input" />
                          </div>
                        </div>
                        <div>
                          <label className="field-label">Doors Open (optional)</label>
                          <input type="datetime-local" value={doorsOpen} onChange={e => setDoorsOpen(e.target.value)} className="field-input" />
                        </div>
                        <div>
                          <label className="field-label">Timezone</label>
                          <input value={timezone} onChange={e => setTimezone(e.target.value)} className="field-input" list="timezones-list" />
                        </div>
                      </>}

                      {/* ── LOCATION ── */}
                      {sec.key === 'location' && <>
                        {(eventType === 'IN_PERSON' || eventType === 'HYBRID') && <>
                          <div>
                            <label className="field-label">Venue Name</label>
                            <input value={venueName} onChange={e => setVenueName(e.target.value)} placeholder="e.g. Madison Square Garden" className="field-input" />
                          </div>
                          <div>
                            <label className="field-label">Street Address</label>
                            <input value={venueAddress} onChange={e => setVenueAddress(e.target.value)} placeholder="4 Pennsylvania Plaza" className="field-input" />
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div><label className="field-label">City</label><input value={city} onChange={e => setCity(e.target.value)} placeholder="New York" className="field-input" /></div>
                            <div><label className="field-label">State / Region</label><input value={state} onChange={e => setState(e.target.value)} placeholder="NY" className="field-input" /></div>
                            <div><label className="field-label">Country</label><input value={country} onChange={e => setCountry(e.target.value)} placeholder="US" className="field-input" /></div>
                          </div>
                        </>}
                        {(eventType === 'VIRTUAL' || eventType === 'HYBRID') && <>
                          <div>
                            <label className="field-label">Stream URL</label>
                            <input value={streamUrl} onChange={e => setStreamUrl(e.target.value)} placeholder="https://..." className="field-input" />
                            <p className="text-[9px] text-white/25 mt-1">Shown to ticket holders only after purchase</p>
                          </div>
                          <div>
                            <label className="field-label">Stream Password (optional)</label>
                            <input value={streamPassword} onChange={e => setStreamPassword(e.target.value)} placeholder="Optional password for the stream" className="field-input" />
                          </div>
                        </>}
                      </>}

                      {/* ── TIERS ── */}
                      {sec.key === 'tiers' && <>
                        <div className="space-y-4">
                          {tiers.map((tier, idx) => (
                            <div key={tier.id} className="p-4 bg-white/[0.03] border border-white/8 rounded-2xl space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: tier.color }} />
                                  <input value={tier.name} onChange={e => updateTier(tier.id, { name: e.target.value })} className="bg-transparent text-sm font-black text-white focus:outline-none border-b border-transparent focus:border-white/20 transition-all" placeholder="Tier name" />
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="flex gap-1">
                                    {TIER_COLORS.map(c => <button key={c} onClick={() => updateTier(tier.id, { color: c })} className="w-4 h-4 rounded-full border-2 transition-all" style={{ background: c, borderColor: tier.color === c ? 'white' : 'transparent' }} />)}
                                  </div>
                                  {tiers.length > 1 && <button onClick={() => removeTier(tier.id)} className="p-1 text-white/20 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>}
                                </div>
                              </div>
                              <input value={tier.description} onChange={e => updateTier(tier.id, { description: e.target.value })} placeholder="What's included (optional)" className="field-input text-xs" />
                              <div className="grid grid-cols-3 gap-3">
                                <div>
                                  <label className="field-label">Price (USD)</label>
                                  <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-white/30 text-sm">$</span>
                                    <input type="number" min="0" step="0.01" value={fmt(tier.priceCents)} onChange={e => updateTier(tier.id, { priceCents: Math.round(parseFloat(e.target.value || '0') * 100) })} className="field-input pl-6" placeholder="0.00" />
                                  </div>
                                </div>
                                <div><label className="field-label">Total Qty</label><input type="number" min="1" value={tier.quantity} onChange={e => updateTier(tier.id, { quantity: parseInt(e.target.value) || 1 })} className="field-input" /></div>
                                <div><label className="field-label">Max / Order</label><input type="number" min="1" value={tier.perOrderMax} onChange={e => updateTier(tier.id, { perOrderMax: parseInt(e.target.value) || 1 })} className="field-input" /></div>
                              </div>
                              {/* Benefits */}
                              <div>
                                <label className="field-label">Benefits</label>
                                <div className="flex flex-wrap gap-1 mb-1.5">
                                  {tier.benefits.map((b, i) => <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-white/8 rounded-full text-[9px] text-white/60">{b}<button onClick={() => removeBenefit(tier.id, i)} className="text-white/20 hover:text-white"><X size={9} /></button></span>)}
                                </div>
                                <input onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBenefit(tier.id, (e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ''; } }} placeholder="Add benefit and press Enter" className="field-input text-xs" />
                              </div>
                              {/* Physical ticket */}
                              <div className="flex items-center gap-3 pt-1">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={tier.physicalTicketAvailable} onChange={e => updateTier(tier.id, { physicalTicketAvailable: e.target.checked })} className="accent-[#6B0099]" />
                                  <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Physical ticket option</span>
                                </label>
                                {tier.physicalTicketAvailable && <>
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={tier.customPackagingAvailable} onChange={e => updateTier(tier.id, { customPackagingAvailable: e.target.checked })} className="accent-[#6B0099]" />
                                    <span className="text-[10px] text-white/40">Custom packaging (+$</span>
                                  </label>
                                  {tier.customPackagingAvailable && <input type="number" min="0" step="0.01" value={fmt(tier.customPackagingFeeCents)} onChange={e => updateTier(tier.id, { customPackagingFeeCents: Math.round(parseFloat(e.target.value || '0') * 100) })} className="w-20 field-input text-xs" />}
                                </>}
                              </div>
                            </div>
                          ))}
                        </div>
                        <button onClick={addTier} className="w-full py-3 border border-dashed border-white/15 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/30 hover:border-white/30 hover:text-white/60 transition-all flex items-center justify-center gap-2">
                          <Plus size={13} /> Add Ticket Tier
                        </button>
                      </>}

                      {/* ── ITINERARY ── */}
                      {sec.key === 'itinerary' && <>
                        <div className="space-y-3">
                          {itinerary.map((item) => (
                            <div key={item.id} className="p-4 bg-white/[0.03] border border-white/8 rounded-xl">
                              <div className="flex items-center gap-3 mb-3">
                                <select value={item.type} onChange={e => updateItem(item.id, { type: e.target.value as ItineraryItem['type'] })} className="field-input text-xs py-1.5 flex-shrink-0 w-40">
                                  {TIER_TYPES.map(t => <option key={t.type} value={t.type}>{t.emoji} {t.label}</option>)}
                                </select>
                                <input value={item.time} onChange={e => updateItem(item.id, { time: e.target.value })} placeholder="7:00 PM" className="field-input text-xs py-1.5 w-28" />
                                <input value={item.title} onChange={e => updateItem(item.id, { title: e.target.value })} placeholder="Set title or act name" className="field-input text-xs py-1.5 flex-1" />
                                <button onClick={() => removeItem(item.id)} className="p-1 text-white/20 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                              </div>
                              <input value={item.performer ?? ''} onChange={e => updateItem(item.id, { performer: e.target.value })} placeholder="Performer name (optional)" className="field-input text-xs mb-2" />
                              <input value={item.description ?? ''} onChange={e => updateItem(item.id, { description: e.target.value })} placeholder="Description (optional)" className="field-input text-xs" />
                            </div>
                          ))}
                        </div>
                        <button onClick={addItem} className="w-full py-3 border border-dashed border-white/15 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/30 hover:border-white/30 hover:text-white/60 transition-all flex items-center justify-center gap-2">
                          <Plus size={13} /> Add Itinerary Item
                        </button>
                      </>}

                      {/* ── MEDIA ── */}
                      {sec.key === 'media' && <>
                        <div>
                          <label className="field-label">Cover Art / Event Poster</label>
                          <div className="relative">
                            {coverImage ? (
                              <div className="relative group">
                                <img src={coverImage} alt="Cover" className="w-full h-48 object-cover rounded-xl" />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all rounded-xl flex items-center justify-center">
                                  <label className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-white/20 rounded-xl text-xs font-black uppercase text-white">
                                    <Upload size={13} /> Change
                                    <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
                                  </label>
                                </div>
                              </div>
                            ) : (
                              <label className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-white/15 rounded-xl cursor-pointer hover:border-white/30 transition-all">
                                {uploadingCover ? <RefreshCw size={20} className="animate-spin text-white/30" /> : <><Image size={24} className="text-white/20 mb-2" /><p className="text-xs text-white/30">Upload event poster (recommended 1200×630)</p></>}
                                <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" disabled={uploadingCover} />
                              </label>
                            )}
                          </div>
                          <p className="text-[9px] text-white/25 mt-1.5">This image appears as the social media preview when your event link is shared anywhere.</p>
                        </div>
                        <div>
                          <label className="field-label">Promo Video URL</label>
                          <input value={heroVideoUrl} onChange={e => setHeroVideoUrl(e.target.value)} placeholder="YouTube, Mux, or direct .mp4 URL" className="field-input" />
                          <p className="text-[9px] text-white/25 mt-1">Plays as an auto-muted hero on the event page</p>
                        </div>
                      </>}

                      {/* ── ADVANCED ── */}
                      {sec.key === 'advanced' && <>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="field-label">Refund Policy</label>
                            <select value={refundPolicy} onChange={e => setRefundPolicy(e.target.value as any)} className="field-input">
                              <option value="NO_REFUND">No Refunds</option>
                              <option value="24H">Refundable within 24 hours</option>
                              <option value="48H">Refundable within 48 hours</option>
                              <option value="7D">Refundable within 7 days</option>
                              <option value="30D">Refundable within 30 days</option>
                            </select>
                          </div>
                          <div>
                            <label className="field-label">Age Restriction</label>
                            <input value={ageRestriction} onChange={e => setAgeRestriction(e.target.value)} placeholder="e.g. 18+ · All Ages" className="field-input" />
                          </div>
                        </div>
                        <div>
                          <label className="field-label">Dress Code (optional)</label>
                          <input value={dresscode} onChange={e => setDresscode(e.target.value)} placeholder="e.g. Smart casual · Black tie" className="field-input" />
                        </div>
                        <div>
                          <label className="field-label">Accessibility Information</label>
                          <textarea value={accessibilityInfo} onChange={e => setAccessibilityInfo(e.target.value)} rows={2} placeholder="Wheelchair access, hearing loops, quiet room, etc." className="field-input resize-none text-sm" />
                        </div>

                        <div className="h-px bg-white/8 my-2" />
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Platform Integrations</p>

                        <label className="flex items-center justify-between p-3 bg-white/[0.03] border border-white/8 rounded-xl cursor-pointer">
                          <div className="flex items-center gap-3">
                            <Tv size={16} className="text-[#FF8C00]" />
                            <div><p className="text-xs font-black text-white">Merch Kiosk Mode</p><p className="text-[9px] text-white/30">Let attendees order merch at the event, shipped to home</p></div>
                          </div>
                          <input type="checkbox" checked={kioskEnabled} onChange={e => setKioskEnabled(e.target.checked)} className="w-5 h-5 accent-[#6B0099] cursor-pointer" />
                        </label>

                        <label className="flex items-center justify-between p-3 bg-white/[0.03] border border-white/8 rounded-xl cursor-pointer">
                          <div className="flex items-center gap-3">
                            <Printer size={16} className="text-[#60a5fa]" />
                            <div><p className="text-xs font-black text-white">Physical Ticket Printing</p><p className="text-[9px] text-white/30">Connect a real printer via PrintNode API for on-site / mailed tickets</p></div>
                          </div>
                          <input type="checkbox" checked={printingEnabled} onChange={e => setPrintingEnabled(e.target.checked)} className="w-5 h-5 accent-[#6B0099] cursor-pointer" />
                        </label>

                        {printingEnabled && (
                          <div className="pl-4 border-l-2 border-[#60a5fa]/30 space-y-2">
                            <div><label className="field-label">PrintNode Printer ID</label><input value={printNodePrinterId} onChange={e => setPrintNodePrinterId(e.target.value)} placeholder="12345" className="field-input" /></div>
                            <p className="text-[9px] text-white/25">Get your printer ID from printnode.com/app/printers after installing the PrintNode client. Your API key goes in PRINTNODE_API_KEY in .env.local.</p>
                          </div>
                        )}

                        <label className="flex items-center justify-between p-3 bg-white/[0.03] border border-white/8 rounded-xl cursor-pointer">
                          <div className="flex items-center gap-3">
                            <Heart size={16} className="text-[#f472b6]" />
                            <div><p className="text-xs font-black text-white">Sanctuary Members Only</p><p className="text-[9px] text-white/30">Restrict ticket purchasing to your Sanctuary members</p></div>
                          </div>
                          <input type="checkbox" checked={sanctuaryOnly} onChange={e => setSanctuaryOnly(e.target.checked)} className="w-5 h-5 accent-[#6B0099] cursor-pointer" />
                        </label>

                        <div>
                          <label className="field-label">Plajah+ Subscriber Discount (%)</label>
                          <input type="number" min="0" max="100" value={plajahPlusDiscount || ''} onChange={e => setPlajahPlusDiscount(parseInt(e.target.value) || 0)} placeholder="0 (disabled)" className="field-input" />
                        </div>

                        <div>
                          <label className="field-label">Linked Music Release (Album ID)</label>
                          <input value={linkedAlbumId} onChange={e => setLinkedAlbumId(e.target.value)} placeholder="Optional — shows the album on the event page" className="field-input" />
                        </div>
                      </>}

                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Bottom publish bar */}
      <div className="sticky bottom-0 mt-6 p-4 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black text-white">{title || 'Untitled Event'}</p>
          <p className="text-[9px] text-white/30">{tiers.length} tier{tiers.length !== 1 ? 's' : ''} · {tiers.reduce((s,t) => s + t.quantity, 0)} total tickets · {startDate ? new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date set'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleSave('DRAFT')} disabled={saving} className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-all disabled:opacity-40">
            Save Draft
          </button>
          <button onClick={() => handleSave('ON_SALE')} disabled={saving} className="px-5 py-2.5 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-40 flex items-center gap-2">
            {saving ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
            Publish Event
          </button>
        </div>
      </div>

      <style>{`
        .field-label { display: block; font-size: 9px; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 6px; }
        .field-input { width: 100%; padding: 10px 14px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; font-size: 13px; color: white; outline: none; transition: border-color 0.2s; }
        .field-input:focus { border-color: rgba(255,255,255,0.25); }
        .field-input::placeholder { color: rgba(255,255,255,0.25); }
        select.field-input option { background: #0d0d0d; color: white; }
      `}</style>
    </div>
  );
};

export default EventCreationWizard;
