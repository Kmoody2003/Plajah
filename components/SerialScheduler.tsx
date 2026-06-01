import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Calendar, Clock, Check, ChevronDown, Loader2, BookOpen,
  Lock, Globe, Plus, Trash2, AlarmClock,
} from 'lucide-react';
import { fetchUserAlbums, updateAlbum, auth } from '../services/backendService';
import type { Album, BookChapter } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

type Interval = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'CUSTOM';

interface ChapterSchedule {
  chapterId: string;
  title: string;
  releaseAt: string;   // datetime-local string
  isPaywalled: boolean;
  price: number;
}

// ── Auto-schedule generator ───────────────────────────────────────────────────

function buildAutoSchedule(
  chapters: BookChapter[],
  startDate: string,
  interval: Interval
): ChapterSchedule[] {
  const start  = startDate ? new Date(startDate) : new Date();
  const days   = interval === 'WEEKLY' ? 7 : interval === 'BIWEEKLY' ? 14 : interval === 'MONTHLY' ? 30 : 7;

  return chapters.map((ch, i) => {
    const d = new Date(start.getTime() + i * days * 86_400_000);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    return {
      chapterId: ch.id,
      title: ch.title,
      releaseAt: local,
      isPaywalled: ch.isPaywalled ?? false,
      price: ch.price ?? 0,
    };
  });
}

function toISO(localStr: string): string {
  return localStr ? new Date(localStr).toISOString() : '';
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SerialScheduler() {
  const [albums, setAlbums]         = useState<Album[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [schedule, setSchedule]     = useState<ChapterSchedule[]>([]);
  const [interval, setInterval]     = useState<Interval>('WEEKLY');
  const [startDate, setStartDate]   = useState('');
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;
    fetchUserAlbums(auth.currentUser.uid).then(a => {
      const books = a.filter(x => x.type === 'BOOK' && (x.bookChapters ?? []).length > 0);
      setAlbums(books);
      if (books.length > 0) {
        setSelectedId(books[0].id);
        setSchedule(buildAutoSchedule(books[0].bookChapters ?? [], '', 'WEEKLY'));
      }
      setLoading(false);
    });
  }, []);

  const album = albums.find(a => a.id === selectedId);

  const handleAlbumChange = (id: string) => {
    setSelectedId(id);
    const a = albums.find(x => x.id === id);
    if (a) setSchedule(buildAutoSchedule(a.bookChapters ?? [], startDate, interval));
  };

  const handleAutoSchedule = () => {
    if (!album) return;
    setSchedule(buildAutoSchedule(album.bookChapters ?? [], startDate, interval));
  };

  const updateRow = (i: number, patch: Partial<ChapterSchedule>) =>
    setSchedule(prev => prev.map((r, ri) => ri === i ? { ...r, ...patch } : r));

  const handleSave = async () => {
    if (!album || saving) return;
    setSaving(true);
    const updatedChapters: BookChapter[] = (album.bookChapters ?? []).map(ch => {
      const row = schedule.find(r => r.chapterId === ch.id);
      if (!row) return ch;
      return {
        ...ch,
        isPaywalled: row.isPaywalled,
        price: row.price,
        // Store release timestamp in description as a workaround (no scheduledAt field yet)
        description: row.releaseAt ? `RELEASE:${new Date(row.releaseAt).getTime()}|${ch.description ?? ''}` : ch.description,
      };
    });
    await updateAlbum(album.id, {
      bookChapters: updatedChapters,
      isScheduled: true,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const inputCls = 'bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-all';
  const labelCls = 'block text-[8px] font-black uppercase tracking-[0.3em] text-white/25 mb-1.5';

  if (loading) return <div className="py-24 flex items-center justify-center"><div className="w-8 h-8 border-2 border-white/15 border-t-white rounded-full animate-spin" /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none text-white">Serial<br />Scheduler</h1>
          <p className="text-white/30 text-sm font-bold uppercase tracking-widest mt-2">Schedule chapter drops — weekly, bi-weekly, or custom</p>
        </div>
        <button onClick={handleSave} disabled={saving || !album}
          className="flex items-center gap-2 px-7 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 disabled:opacity-40 flex-shrink-0"
          style={{ background: saved ? '#22c55e' : '#f59e0b', color: '#000' }}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <><Check size={14} /> Saved!</> : 'Save Schedule'}
        </button>
      </div>

      {albums.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-4 border-2 border-dashed border-white/5 rounded-[2.5rem] text-center">
          <BookOpen size={28} className="text-white/12" />
          <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No books with chapters found</p>
          <p className="text-[9px] text-white/12">Create a book with chapters in the Book Creator first</p>
        </div>
      ) : (
        <>
          {/* Book selector + auto-schedule controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>Book</label>
              <div className="relative">
                <select value={selectedId} onChange={e => handleAlbumChange(e.target.value)}
                  className={`${inputCls} w-full appearance-none pr-10`}>
                  {albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className={labelCls}>Drop interval</label>
              <div className="flex gap-2">
                {(['WEEKLY','BIWEEKLY','MONTHLY','CUSTOM'] as Interval[]).map(iv => (
                  <button key={iv} onClick={() => { setInterval(iv); }}
                    className="flex-1 py-2.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all"
                    style={{
                      background:  interval === iv ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)',
                      color:       interval === iv ? '#f59e0b' : 'rgba(255,255,255,0.3)',
                      border:      `1px solid ${interval === iv ? 'rgba(245,158,11,0.35)' : 'rgba(255,255,255,0.07)'}`,
                    }}>
                    {iv === 'BIWEEKLY' ? 'Bi-wk' : iv === 'MONTHLY' ? 'Monthly' : iv === 'CUSTOM' ? 'Custom' : 'Weekly'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={labelCls}>First drop date</label>
              <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)}
                className={`${inputCls} w-full`} />
            </div>

            <div className="flex items-end">
              <button onClick={handleAutoSchedule} disabled={!album}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-amber-400/12 text-amber-400 hover:bg-amber-400/18 transition-all border border-amber-400/25 disabled:opacity-30">
                <AlarmClock size={12} /> Auto-generate Schedule
              </button>
            </div>
          </div>

          {/* Chapter schedule grid */}
          {schedule.length > 0 && (
            <div className="space-y-3">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20">Chapter Drop Schedule ({schedule.length} chapters)</p>
              {schedule.map((row, i) => (
                <motion.div key={row.chapterId || i} layout
                  className="flex items-center gap-3 p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                  <span className="text-[10px] font-black text-white/20 w-5 text-right flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black uppercase tracking-widest text-white truncate">{row.title || `Chapter ${i + 1}`}</p>
                    {row.releaseAt && (
                      <p className="text-[9px] text-white/30 mt-0.5 flex items-center gap-1">
                        <Calendar size={9} /> {new Date(row.releaseAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                  <input type="datetime-local" value={row.releaseAt}
                    onChange={e => updateRow(i, { releaseAt: e.target.value })}
                    className="hidden md:block bg-white/5 border border-white/8 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-white/20 transition-all w-44" />
                  <button onClick={() => updateRow(i, { isPaywalled: !row.isPaywalled })}
                    className="p-2 rounded-xl transition-all"
                    style={{ color: row.isPaywalled ? '#f59e0b' : 'rgba(255,255,255,0.2)' }}
                    title={row.isPaywalled ? 'Paywalled' : 'Free'}>
                    {row.isPaywalled ? <Lock size={13} /> : <Globe size={13} />}
                  </button>
                  {row.isPaywalled && (
                    <div className="relative w-20 flex-shrink-0">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 text-xs">$</span>
                      <input type="number" min="0" step="0.01" value={row.price || ''}
                        onChange={e => updateRow(i, { price: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-white/5 border border-white/8 rounded-xl pl-5 pr-2 py-2 text-xs text-white outline-none"
                        placeholder="0.99" />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}

          {album && (album.bookChapters ?? []).length === 0 && (
            <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-[2rem]">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/20">This book has no chapters yet</p>
              <p className="text-[8px] text-white/12 mt-1">Add chapters in the Creator then return here to schedule drops</p>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
