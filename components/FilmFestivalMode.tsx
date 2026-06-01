import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Star, Film, Ticket, Calendar, Plus, Trash2, Check, X,
  ChevronRight, Loader2, Globe, Lock, Users, Play,
} from 'lucide-react';
import {
  createClub, createClubEvent, fetchUserAlbums,
  purchasePPVEvent, auth,
} from '../services/backendService';
import type { Album } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Screening {
  id: string;
  albumId: string;
  albumTitle: string;
  coverImage?: string;
  screeningAt: string;  // datetime-local string
  ticketPrice: string;
  isExclusive: boolean;
  note: string;
}

function newScreening(album?: Album): Screening {
  return {
    id: `scr_${Date.now()}`,
    albumId: album?.id ?? '',
    albumTitle: album?.title ?? '',
    coverImage: album?.coverImage,
    screeningAt: '',
    ticketPrice: '0',
    isExclusive: false,
    note: '',
  };
}

// ── Screening row ─────────────────────────────────────────────────────────────

function ScreeningRow({ s, albums, onChange, onDelete }: {
  s: Screening;
  albums: Album[];
  onChange: (updated: Screening) => void;
  onDelete: () => void;
}) {
  const inputCls = 'bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-all';
  const labelCls = 'block text-[8px] font-black uppercase tracking-[0.3em] text-white/25 mb-1.5';

  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {s.coverImage ? (
            <img src={s.coverImage} alt={s.albumTitle} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
              <Film size={16} className="text-white/20" />
            </div>
          )}
          <p className="text-xs font-black uppercase tracking-widest text-white">{s.albumTitle || 'Select a film'}</p>
        </div>
        <button onClick={onDelete} className="p-1.5 text-white/20 hover:text-red-400 transition-all">
          <Trash2 size={13} />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="col-span-2">
          <label className={labelCls}>Film</label>
          <select value={s.albumId}
            onChange={e => {
              const a = albums.find(x => x.id === e.target.value);
              onChange({ ...s, albumId: e.target.value, albumTitle: a?.title ?? '', coverImage: a?.coverImage });
            }}
            className={`${inputCls} w-full appearance-none`}>
            <option value="">Select film…</option>
            {albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Screening date & time</label>
          <input type="datetime-local" value={s.screeningAt}
            onChange={e => onChange({ ...s, screeningAt: e.target.value })}
            className={`${inputCls} w-full`} />
        </div>
        <div>
          <label className={labelCls}>Ticket price (USD)</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
            <input type="number" min="0" step="0.01" value={s.ticketPrice}
              onChange={e => onChange({ ...s, ticketPrice: e.target.value })}
              className={`${inputCls} w-full pl-7`} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Notes (shown to attendees)</label>
          <input value={s.note} onChange={e => onChange({ ...s, note: e.target.value })}
            placeholder="e.g. Followed by director Q&A" className={`${inputCls} w-full`} />
        </div>
        <div className="flex items-end">
          <button onClick={() => onChange({ ...s, isExclusive: !s.isExclusive })}
            className="flex items-center gap-2 p-3 rounded-2xl border transition-all w-full"
            style={{
              background:  s.isExclusive ? 'rgba(244,114,182,0.06)' : 'rgba(255,255,255,0.02)',
              borderColor: s.isExclusive ? 'rgba(244,114,182,0.25)' : 'rgba(255,255,255,0.07)',
            }}>
            {s.isExclusive ? <Lock size={12} className="text-pink-400" /> : <Globe size={12} className="text-white/20" />}
            <span className={`text-[9px] font-black uppercase tracking-widest ${s.isExclusive ? 'text-white' : 'text-white/35'}`}>
              {s.isExclusive ? 'Members only' : 'Public screening'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FilmFestivalMode() {
  const [albums, setAlbums]           = useState<Album[]>([]);
  const [festName, setFestName]       = useState('');
  const [festDesc, setFestDesc]       = useState('');
  const [festStartDate, setFestStartDate] = useState('');
  const [festEndDate, setFestEndDate]   = useState('');
  const [isPrivate, setIsPrivate]     = useState(false);
  const [passPrice, setPassPrice]     = useState('0');
  const [screenings, setScreenings]   = useState<Screening[]>([]);
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [done, setDone]               = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;
    fetchUserAlbums(auth.currentUser.uid).then(a => {
      setAlbums(a.filter(x => x.type === 'VIDEO'));
      setLoading(false);
    });
  }, []);

  const addScreening = () => setScreenings(prev => [...prev, newScreening(albums[0])]);

  const handlePublish = async () => {
    if (!festName.trim() || screenings.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      // 1. Create a festival Club
      const club = await createClub({
        name: festName.trim(),
        description: festDesc.trim(),
        category: 'Film Festival',
        tags: ['Film Festival', 'Cinema'],
        isPrivate,
        joinProcess: 'AUTO',
        type: 'CLUB',
        allowedAssetTypes: ['VIDEO', 'PHOTO', 'LINK'],
        linksAllowed: true,
        hasLiveChat: true,
        hasMerchStore: false,
        hasExclusiveEvents: true,
        monthlyPrice: parseFloat(passPrice) > 0 ? parseFloat(passPrice) : undefined,
        memberCount: 1,
      });

      if (club) {
        // 2. Create a ClubEvent (WATCH_PARTY) for each screening
        for (const s of screenings) {
          if (!s.albumId || !s.screeningAt) continue;
          await createClubEvent({
            clubId: club.id,
            hostId: auth.currentUser!.uid,
            title: s.albumTitle || 'Film Screening',
            description: s.note || undefined,
            type: 'WATCH_PARTY',
            scheduledAt: new Date(s.screeningAt).getTime(),
            isExclusive: s.isExclusive,
            isActive: false,
            attendeeIds: [],
          });
        }
        setDone(true);
      }
    } catch (err) {
      console.error('[FilmFestivalMode]', err);
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full bg-white/5 border border-white/8 rounded-2xl px-5 py-3.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-all';
  const labelCls = 'block text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-2';

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div>
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none text-white">Festival<br />Circuit</h1>
        <p className="text-white/30 text-sm font-bold uppercase tracking-widest mt-2">Program a virtual film festival — screenings, passes, and community</p>
      </div>

      {done ? (
        <div className="py-16 flex flex-col items-center gap-5 text-center">
          <div className="w-16 h-16 rounded-full bg-yellow-500/15 flex items-center justify-center">
            <Star size={28} className="text-yellow-400" />
          </div>
          <p className="text-lg font-black uppercase tracking-tight text-white">{festName}</p>
          <p className="text-[10px] text-white/30">Festival club created with {screenings.length} scheduled screening{screenings.length !== 1 ? 's' : ''}. Fans can RSVP from the Clubs page.</p>
          <button onClick={() => { setDone(false); setFestName(''); setFestDesc(''); setScreenings([]); }}
            className="px-7 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-yellow-400 text-black hover:scale-105 transition-all">
            Create Another Festival
          </button>
        </div>
      ) : (
        <>
          {/* Festival details */}
          <section className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={labelCls}>Festival name *</label>
                <input value={festName} onChange={e => setFestName(e.target.value)}
                  placeholder="e.g. Plajah Indie Film Fest 2026" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Festival pass price (0 = free)</label>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
                  <input type="number" min="0" step="0.01" value={passPrice}
                    onChange={e => setPassPrice(e.target.value)}
                    className={`${inputCls} pl-9`} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Start date</label>
                <input type="date" value={festStartDate} onChange={e => setFestStartDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>End date</label>
                <input type="date" value={festEndDate} onChange={e => setFestEndDate(e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className={labelCls}>Description</label>
                <textarea value={festDesc} onChange={e => setFestDesc(e.target.value)}
                  rows={2} placeholder="What's this festival about?" className={`${inputCls} resize-none`} />
              </div>
              <div className="flex items-end col-span-1">
                <button onClick={() => setIsPrivate(!isPrivate)}
                  className="flex items-center gap-3 p-4 rounded-2xl border transition-all w-full"
                  style={{
                    background:  isPrivate ? 'rgba(244,114,182,0.06)' : 'rgba(255,255,255,0.02)',
                    borderColor: isPrivate ? 'rgba(244,114,182,0.25)' : 'rgba(255,255,255,0.07)',
                  }}>
                  {isPrivate ? <Lock size={14} className="text-pink-400" /> : <Globe size={14} className="text-white/20" />}
                  <div className="flex-1 text-left">
                    <p className={`text-xs font-black uppercase tracking-widest ${isPrivate ? 'text-white' : 'text-white/35'}`}>
                      {isPrivate ? 'Private Festival' : 'Public Festival'}
                    </p>
                    <p className="text-[9px] text-white/20">{isPrivate ? 'Invite-only attendance' : 'Open to all Plajah users'}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isPrivate ? 'border-pink-400 bg-pink-400' : 'border-white/15'}`}>
                    {isPrivate && <Check size={9} className="text-black" />}
                  </div>
                </button>
              </div>
            </div>
          </section>

          {/* Screenings */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <p className={labelCls}>Screenings ({screenings.length})</p>
              <button onClick={addScreening}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-yellow-400/12 text-yellow-400 hover:bg-yellow-400/18 transition-all border border-yellow-400/25">
                <Plus size={12} /> Add Screening
              </button>
            </div>

            {screenings.length === 0 ? (
              <div className="py-10 flex flex-col items-center gap-3 border-2 border-dashed border-white/5 rounded-[2.5rem] text-center">
                <Film size={24} className="text-white/12" />
                <p className="text-[9px] font-black uppercase tracking-widest text-white/20">Add your first screening above</p>
              </div>
            ) : (
              screenings.map((s, i) => (
                <ScreeningRow
                  key={s.id} s={s} albums={albums}
                  onChange={updated => setScreenings(prev => prev.map((x, xi) => xi === i ? updated : x))}
                  onDelete={() => setScreenings(prev => prev.filter((_, xi) => xi !== i))}
                />
              ))
            )}
          </section>

          {/* Publish */}
          <div className="flex items-center justify-end gap-4 pt-2">
            <p className="text-[9px] text-white/20">
              {screenings.length} screening{screenings.length !== 1 ? 's' : ''} · {screenings.filter(s => parseFloat(s.ticketPrice) > 0).length} ticketed
            </p>
            <button onClick={handlePublish}
              disabled={!festName.trim() || screenings.length === 0 || submitting}
              className="flex items-center gap-2 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
              style={{ background: '#f59e0b', color: '#000' }}>
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <><Star size={14} /> Publish Festival</>}
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}
