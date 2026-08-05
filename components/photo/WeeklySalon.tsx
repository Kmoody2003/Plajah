/**
 * WeeklySalon — Part 3C of the Experience Expansion.
 *
 * "Themed challenges ('Shadow', 'Blue hour') with community exhibitions — the
 *  photographic equivalent of Reello trends."
 *
 * Three surfaces in one:
 *   1. The current theme — brief, three concrete prompts, a countdown to closing.
 *   2. Submit — pick one frame from your own library (one entry per photographer, swappable).
 *   3. The exhibition — every entry, ranked by applause, opening into the Portfolio Room.
 *
 * A salon is derived from the ISO week (see services/photoSalons.ts) so one is always
 * running with no admin action. Everything degrades silently: signed out → read-only
 * exhibition; Firestore down → "no entries yet"; empty library → an honest empty state.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trophy, Clock, Sparkles, Upload, Check, X, Heart, Images, ChevronLeft, ChevronRight, Aperture,
} from 'lucide-react';
import { Photo } from '../../types';
import { auth, fetchUserPhotos } from '../../services/backendService';
import {
  type Salon, type SalonEntry,
  currentSalon, recentSalons, timeLeft, formatTimeLeft,
  fetchSalonEntries, fetchMyEntry, submitToSalon, withdrawFromSalon,
  toggleApplause, rankEntries,
} from '../../services/photoSalons';
import PortfolioRoom from './PortfolioRoom';

const FOCUS_ACCENT: Record<Salon['theme']['focus'], string> = {
  light: '#f59e0b',
  composition: '#38bdf8',
  story: '#a855f7',
};

const WeeklySalon: React.FC = () => {
  const salons = useMemo(() => recentSalons(8), []);
  const [salonIndex, setSalonIndex] = useState(0);
  const salon = salons[salonIndex] || currentSalon();
  const accent = FOCUS_ACCENT[salon.theme.focus] || '#f59e0b';

  const [entries, setEntries] = useState<SalonEntry[]>([]);
  const [myEntry, setMyEntry] = useState<SalonEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [myPhotos, setMyPhotos] = useState<Photo[] | null>(null);
  const [chosen, setChosen] = useState<Photo | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [roomStart, setRoomStart] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(() => timeLeft(salon));

  const uid = auth.currentUser?.uid || '';

  // ── Load the salon's exhibition ─────────────────────────────────────────────
  const load = useCallback(async (id: string) => {
    setLoading(true);
    const [list, mine] = await Promise.all([fetchSalonEntries(id), fetchMyEntry(id)]);
    setEntries(list);
    setMyEntry(mine);
    setLoading(false);
  }, []);

  useEffect(() => { load(salon.id); }, [salon.id, load]);

  // Countdown ticks once a minute — a second-by-second clock here would be noise.
  useEffect(() => {
    setCountdown(timeLeft(salon));
    const id = window.setInterval(() => setCountdown(timeLeft(salon)), 60_000);
    return () => window.clearInterval(id);
  }, [salon]);

  // ── Submission ──────────────────────────────────────────────────────────────
  const openPicker = useCallback(async () => {
    setPickerOpen(true);
    setChosen(null);
    setNote(myEntry?.note || '');
    if (myPhotos === null && uid) {
      const list = await fetchUserPhotos(uid);
      setMyPhotos(list.filter(p => p?.url && p.mediaType !== 'VIDEO'));
    }
  }, [uid, myPhotos, myEntry?.note]);

  const handleSubmit = useCallback(async () => {
    if (!chosen || submitting) return;
    setSubmitting(true);
    const saved = await submitToSalon(salon, {
      photoId: chosen.id,
      photoUrl: chosen.url,
      title: chosen.title || '',
      note,
      ownerName: auth.currentUser?.displayName || '',
    });
    setSubmitting(false);
    if (saved) {
      setPickerOpen(false);
      await load(salon.id);
    }
  }, [chosen, note, salon, submitting, load]);

  const handleWithdraw = useCallback(async () => {
    if (!myEntry) return;
    const ok = await withdrawFromSalon(salon.id);
    if (ok) { setMyEntry(null); await load(salon.id); }
  }, [myEntry, salon.id, load]);

  // ── Applause ────────────────────────────────────────────────────────────────
  const handleApplause = useCallback(async (entry: SalonEntry) => {
    if (!uid) return;
    const on = !entry.applause.includes(uid);
    // Optimistic — the exhibition should feel instant.
    setEntries(prev => prev.map(e => e.id === entry.id
      ? { ...e, applause: on ? [...e.applause, uid] : e.applause.filter(u => u !== uid) }
      : e));
    await toggleApplause(salon.id, entry.id, on);
  }, [uid, salon.id]);

  const ranked = useMemo(() => rankEntries(entries), [entries]);

  // The exhibition doubles as a Portfolio Room — the same works, presented properly.
  const roomPhotos = useMemo<Photo[]>(
    () => ranked.map(e => ({
      id: e.id,
      url: e.photoUrl,
      title: e.title || '',
      description: e.note || '',
      timestamp: e.createdAt,
      ownerId: e.ownerId,
      mediaType: 'PHOTO' as const,
    })),
    [ranked],
  );

  // `salon.status` is frozen at construction; the ticking countdown is what actually
  // closes the salon for a session that was left open across the boundary.
  const isOpen = salon.status === 'OPEN' && countdown > 0;

  return (
    <div className="max-w-6xl mx-auto space-y-10">

      {/* ── Week selector ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSalonIndex(i => Math.min(salons.length - 1, i + 1))}
            disabled={salonIndex >= salons.length - 1}
            className="w-9 h-9 rounded-full bg-white/5 border border-white/10 text-white/40 hover:text-white disabled:opacity-20 flex items-center justify-center transition-all"
            title="Previous salon"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            onClick={() => setSalonIndex(i => Math.max(0, i - 1))}
            disabled={salonIndex === 0}
            className="w-9 h-9 rounded-full bg-white/5 border border-white/10 text-white/40 hover:text-white disabled:opacity-20 flex items-center justify-center transition-all"
            title="Next salon"
          >
            <ChevronRight size={15} />
          </button>
          <p className="ml-2 text-[9px] font-black uppercase tracking-[0.3em] text-white/25 font-mono">
            {salon.isoYear} · Week {String(salon.isoWeek).padStart(2, '0')}
          </p>
        </div>

        <div
          className="flex items-center gap-2 px-4 py-2 rounded-2xl border"
          style={{ borderColor: `${accent}33`, background: `${accent}12`, color: accent }}
        >
          <Clock size={12} />
          <span className="text-[9px] font-black uppercase tracking-widest">
            {isOpen ? `${formatTimeLeft(countdown)} left` : 'Closed'}
          </span>
        </div>
      </div>

      {/* ── The theme ── */}
      <motion.div
        key={salon.id}
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/[0.03] p-8 lg:p-12"
      >
        <div
          className="absolute -top-32 -right-24 w-80 h-80 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ background: accent }}
        />
        <div className="relative">
          <div className="flex items-center gap-3 mb-5">
            <Trophy size={16} style={{ color: accent }} />
            <span className="text-[9px] font-black uppercase tracking-[0.45em] text-white/35">
              Weekly Salon
            </span>
            <span
              className="px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border"
              style={{ borderColor: `${accent}33`, color: accent }}
            >
              {salon.theme.focus}
            </span>
          </div>

          <h2 className="text-5xl lg:text-7xl font-black uppercase tracking-tighter text-white mb-5">
            {salon.theme.title}
          </h2>
          <p className="text-base lg:text-lg font-medium italic text-white/45 max-w-2xl leading-relaxed">
            {salon.theme.brief}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-10">
            {salon.theme.prompts.map((prompt, i) => (
              <div key={i} className="p-5 rounded-2xl bg-black/30 border border-white/10">
                <p className="text-[8px] font-black uppercase tracking-[0.3em] mb-3" style={{ color: accent }}>
                  Try {String(i + 1).padStart(2, '0')}
                </p>
                <p className="text-xs font-bold text-white/55 leading-relaxed">{prompt}</p>
              </div>
            ))}
          </div>

          {/* Submit / entered state */}
          <div className="mt-10 flex flex-wrap items-center gap-3">
            {!uid ? (
              <p className="text-[10px] font-black uppercase tracking-widest text-white/25">
                Sign in to enter this salon
              </p>
            ) : !isOpen ? (
              <p className="text-[10px] font-black uppercase tracking-widest text-white/25">
                This salon has closed — the exhibition stays up
              </p>
            ) : myEntry ? (
              <>
                <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25">
                  <Check size={14} className="text-emerald-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300">
                    Your frame is hanging
                  </span>
                </div>
                <button onClick={openPicker}
                  className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-all">
                  Swap my pick
                </button>
                <button onClick={handleWithdraw}
                  className="px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/25 hover:text-red-400 transition-all">
                  Withdraw
                </button>
              </>
            ) : (
              <button onClick={openPicker}
                className="flex items-center gap-3 px-7 py-4 rounded-2xl bg-white text-black text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] transition-all shadow-xl">
                <Upload size={14} />
                Enter this salon
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── The exhibition ── */}
      <div>
        <div className="flex items-center gap-3 mb-6">
          <Images size={14} className="text-white/30" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/35">
            The Exhibition
          </h3>
          <div className="flex-1 h-px bg-white/5" />
          <span className="text-[9px] font-black uppercase tracking-widest text-white/20 font-mono">
            {ranked.length} {ranked.length === 1 ? 'work' : 'works'}
          </span>
        </div>

        {loading ? (
          <div className="py-24 flex justify-center">
            <div className="w-10 h-10 border-2 border-white/15 border-t-white/60 rounded-full animate-spin" />
          </div>
        ) : ranked.length === 0 ? (
          <div className="py-28 text-center">
            <Aperture size={48} className="mx-auto mb-6 text-white/8" />
            <p className="text-sm font-black uppercase tracking-[0.4em] text-white/15">
              No work hung yet
            </p>
            <p className="mt-3 text-[11px] font-medium italic text-white/25">
              {isOpen ? 'Be the first frame on the wall.' : 'Nobody entered this week.'}
            </p>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-5 space-y-5">
            {ranked.map((entry, i) => {
              const applauded = uid ? entry.applause.includes(uid) : false;
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.4) }}
                  className="break-inside-avoid rounded-3xl overflow-hidden border border-white/10 bg-black/40 group"
                >
                  <button onClick={() => setRoomStart(i)} className="block w-full text-left">
                    <img
                      src={entry.photoUrl}
                      alt={entry.title || ''}
                      loading="lazy"
                      decoding="async"
                      className="w-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
                    />
                  </button>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white truncate">
                          {entry.title || 'Untitled'}
                        </p>
                        <p className="text-[8px] font-black uppercase tracking-[0.25em] text-white/30 mt-1 truncate">
                          {entry.ownerName}
                        </p>
                      </div>
                      <button
                        onClick={() => handleApplause(entry)}
                        disabled={!uid}
                        title={uid ? 'Applaud this frame' : 'Sign in to applaud'}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-full shrink-0 transition-all border disabled:opacity-30 ${
                          applauded
                            ? 'bg-small-orange/15 border-small-orange/40 text-small-orange'
                            : 'bg-white/5 border-white/10 text-white/35 hover:text-white'
                        }`}
                      >
                        <Heart size={12} fill={applauded ? 'currentColor' : 'none'} />
                        <span className="text-[9px] font-black">{entry.applause.length}</span>
                      </button>
                    </div>
                    {entry.note && (
                      <p className="mt-3 text-[11px] font-medium italic text-white/35 leading-relaxed line-clamp-3">
                        {entry.note}
                      </p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Submission picker ── */}
      <AnimatePresence>
        {pickerOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-4 lg:p-16"
            onClick={e => { if (e.target === e.currentTarget) setPickerOpen(false); }}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
              className="w-full max-w-4xl max-h-full flex flex-col bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-3xl"
            >
              <div className="flex items-start justify-between gap-4 p-8 border-b border-white/10">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[0.4em] text-white/25 mb-2">
                    Enter · {salon.theme.title}
                  </p>
                  <h3 className="text-2xl font-black uppercase tracking-tight text-white">
                    Choose one frame
                  </h3>
                  <p className="mt-2 text-[11px] font-medium italic text-white/30 max-w-lg">
                    One entry per photographer. You can swap it any time before the salon closes.
                  </p>
                </div>
                <button onClick={() => setPickerOpen(false)}
                  className="w-10 h-10 rounded-full bg-white/5 border border-white/10 text-white/40 hover:text-white flex items-center justify-center transition-all shrink-0">
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-black/40">
                {myPhotos === null ? (
                  <div className="py-24 flex justify-center">
                    <div className="w-9 h-9 border-2 border-white/15 border-t-white/60 rounded-full animate-spin" />
                  </div>
                ) : myPhotos.length === 0 ? (
                  <div className="py-24 text-center">
                    <Sparkles size={40} className="mx-auto mb-5 text-white/10" />
                    <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/20">
                      No photos in your library yet
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                    {myPhotos.map(photo => {
                      const selected = chosen?.id === photo.id;
                      return (
                        <button
                          key={photo.id}
                          onClick={() => setChosen(photo)}
                          className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition-all ${
                            selected ? 'border-small-orange scale-[0.97]' : 'border-white/5 hover:border-white/25'
                          }`}
                        >
                          <img src={photo.url} alt="" loading="lazy" decoding="async"
                            className="w-full h-full object-cover" />
                          {selected && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <Check size={22} className="text-small-orange" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="p-8 border-t border-white/10 bg-[#050505] space-y-4">
                <div>
                  <label className="block text-[8px] font-black uppercase tracking-[0.3em] text-white/25 mb-2">
                    What were you after? (optional)
                  </label>
                  <input
                    value={note}
                    onChange={e => setNote(e.target.value.slice(0, 400))}
                    placeholder={`One line on how this answers "${salon.theme.title}"`}
                    className="w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-xs font-medium text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-all"
                  />
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={!chosen || submitting}
                  className="w-full py-4 rounded-2xl bg-white text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-25 hover:scale-[1.01] transition-all"
                >
                  {submitting ? 'Hanging your frame…' : chosen ? 'Hang it in the salon' : 'Pick a frame first'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── The exhibition, presented ── */}
      {roomStart !== null && roomPhotos.length > 0 && (
        <PortfolioRoom
          photos={roomPhotos}
          photographerName={`Salon · ${salon.theme.title}`}
          statement={salon.theme.brief}
          initialIndex={roomStart}
          onClose={() => setRoomStart(null)}
        />
      )}
    </div>
  );
};

export default WeeklySalon;
