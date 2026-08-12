import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Radio, Music2, Users, Clock, Plus, Trash2, Check,
  Loader2, Zap, Star, Volume2, Calendar,
} from 'lucide-react';
import { fetchUserAlbums, fetchUserProfile, updateUserProfile, auth } from '../services/backendService';
import type { Album, Track, UserProfile } from '../types';
import FastChannelManager from './FastChannelManager';
import { createPortal } from 'react-dom';

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  user?: UserProfile;
}

export default function ArtistRadioBuilder({ user }: Props) {
  const [profile, setProfile]       = useState<UserProfile | null>(user ?? null);
  const [albums, setAlbums]         = useState<Album[]>([]);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [loading, setLoading]       = useState(true);

  // Radio settings state
  const [enabled, setEnabled]           = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [stationName, setStationName]   = useState('');
  const [stingerFreq, setStingerFreq]   = useState(4);
  const [adFreq, setAdFreq]             = useState(6);
  const [eligibleIds, setEligibleIds]   = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!auth.currentUser) return;
    Promise.all([
      fetchUserAlbums(auth.currentUser.uid),
      user ? Promise.resolve(user) : fetchUserProfile(auth.currentUser.uid),
    ]).then(([albs, prof]) => {
      setAlbums(albs.filter(a => a.type === 'MUSIC' || !a.type));
      if (prof) {
        setProfile(prof);
        const rs = prof.radioSettings;
        if (rs) {
          setEnabled(rs.enabled ?? false);
          setStationName(rs.stationName ?? '');
          setStingerFreq(rs.stingerFrequency ?? 4);
          setAdFreq(rs.adFrequency ?? 6);
        }
        // Build set of radio-eligible track IDs from all albums
        const ids = new Set<string>();
        albs.forEach(a => (a.tracks ?? []).forEach(t => { if (t.isRadioEligible) ids.add(t.id); }));
        setEligibleIds(ids);
      }
      setLoading(false);
    });
  }, []);

  const allTracks: (Track & { albumTitle: string })[] = albums.flatMap(a =>
    (a.tracks ?? []).map(t => ({ ...t, albumTitle: a.title }))
  );

  const toggleTrack = (id: string) => {
    setEligibleIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!auth.currentUser || saving) return;
    setSaving(true);
    const radioSettings = {
      enabled,
      stationName: stationName.trim() || (profile?.displayName ?? 'My Radio'),
      stingers: profile?.radioSettings?.stingers ?? [],
      ads: profile?.radioSettings?.ads ?? [],
      stingerFrequency: stingerFreq,
      adFrequency: adFreq,
      otherCreators: profile?.radioSettings?.otherCreators ?? [],
      exclusiveContentIds: profile?.radioSettings?.exclusiveContentIds ?? [],
      scheduledEvents: profile?.radioSettings?.scheduledEvents ?? [],
    };
    await updateUserProfile(auth.currentUser.uid, { radioSettings } as any);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const inputCls = 'w-full bg-white/5 border border-white/8 rounded-2xl px-5 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-all';
  const labelCls = 'block text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-2';

  if (loading) return <div className="py-24 flex items-center justify-center"><div className="w-8 h-8 border-2 border-white/15 border-t-white rounded-full animate-spin" /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none text-white">Artist<br />Radio</h1>
          <p className="text-white/30 text-sm font-bold uppercase tracking-widest mt-2">Run your own 24/7 radio station — tracks, stingers, ads, shows</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-7 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 disabled:opacity-40 flex-shrink-0"
          style={{ background: saved ? '#22c55e' : '#FF8C00', color: '#000' }}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <><Check size={14} /> Saved!</> : 'Save Station'}
        </button>
      </div>

      {/* Enable / disable toggle */}
      <button onClick={() => setEnabled(!enabled)}
        className="flex items-center gap-4 p-5 rounded-2xl border transition-all w-full text-left"
        style={{
          background:  enabled ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.02)',
          borderColor: enabled ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.07)',
        }}>
        <div className={`p-3 rounded-2xl ${enabled ? 'bg-green-500/15' : 'bg-white/5'}`}>
          <Radio size={20} className={enabled ? 'text-green-400' : 'text-white/25'} />
        </div>
        <div className="flex-1">
          <p className={`text-base font-black uppercase tracking-widest ${enabled ? 'text-white' : 'text-white/35'}`}>
            {enabled ? 'Radio Station — LIVE' : 'Radio Station — Disabled'}
          </p>
          <p className="text-[10px] text-white/25">
            {enabled ? 'Your station is active and playing to listeners' : 'Enable to start broadcasting to your fans'}
          </p>
        </div>
        <div className={`w-12 h-6 rounded-full transition-all flex items-center px-1 ${enabled ? 'bg-green-500' : 'bg-white/10'}`}>
          <div className={`w-4 h-4 rounded-full bg-white transition-all shadow ${enabled ? 'translate-x-6' : ''}`} />
        </div>
      </button>

      {/* Program Scheduler — the linear playout timeline for THIS station (taps the same radio
          settings: eligible tracks, stingers, ads) plus live audio breaks (Reello / Live Talk / podcast). */}
      <button onClick={() => setShowScheduler(true)}
        className="w-full flex items-center gap-4 p-5 rounded-2xl border border-[#FF8C00]/25 bg-[#FF8C00]/[0.06] hover:bg-[#FF8C00]/[0.1] transition-all text-left">
        <div className="p-3 rounded-2xl bg-[#FF8C00]/15"><Clock size={20} className="text-[#FF8C00]" /></div>
        <div className="flex-1">
          <p className="text-base font-black uppercase tracking-widest text-white">Program Scheduler</p>
          <p className="text-[10px] text-white/30">Build a linear line-up — drag tracks, stingers, ads & live audio breaks; per-day schedules; as-run reports</p>
        </div>
        <span className="px-4 py-2 rounded-xl bg-[#FF8C00] text-black text-[10px] font-black uppercase tracking-widest shrink-0">Open</span>
      </button>

      {showScheduler && profile && createPortal(
        <div className="fixed inset-0 z-[300] bg-black overflow-y-auto">
          <FastChannelManager user={profile} initialTab="SCHEDULE" initialStation="radio" onBack={() => setShowScheduler(false)} />
        </div>,
        document.body,
      )}

      {/* Station settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className={labelCls}>Station name</label>
          <input value={stationName} onChange={e => setStationName(e.target.value)}
            placeholder={`${profile?.displayName ?? 'Artist'} Radio`} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Stinger frequency (every N songs)</label>
          <input type="number" min="1" max="20" value={stingerFreq}
            onChange={e => setStingerFreq(parseInt(e.target.value) || 4)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Ad break frequency (every N songs)</label>
          <input type="number" min="1" max="30" value={adFreq}
            onChange={e => setAdFreq(parseInt(e.target.value) || 6)} className={inputCls} />
        </div>
      </div>

      {/* Station stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Eligible Tracks',   value: eligibleIds.size,                                    icon: Music2, color: 'text-[#FF8C00]',  bg: 'bg-[#FF8C00]/15' },
          { label: 'Total Tracks',      value: allTracks.length,                                    icon: Volume2,color: 'text-sky-400',    bg: 'bg-sky-400/15'   },
          { label: 'Stinger Frequency', value: `Every ${stingerFreq} songs`,                        icon: Zap,    color: 'text-violet-400', bg: 'bg-violet-400/15'},
          { label: 'Ad Frequency',      value: `Every ${adFreq} songs`,                             icon: Star,   color: 'text-green-400',  bg: 'bg-green-400/15' },
        ].map(s => (
          <div key={s.label} className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-5">
            <div className={`p-2.5 ${s.bg} rounded-xl w-fit mb-3`}><s.icon className={s.color} size={16} /></div>
            <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-1">{s.label}</p>
            <p className="text-lg font-black text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Track eligibility manager */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <p className={labelCls}>Radio-Eligible Tracks</p>
          <div className="flex gap-2">
            <button onClick={() => setEligibleIds(new Set(allTracks.map(t => t.id)))}
              className="text-[8px] font-black uppercase tracking-widest text-white/25 hover:text-white transition-all">
              Select All
            </button>
            <span className="text-white/15">·</span>
            <button onClick={() => setEligibleIds(new Set())}
              className="text-[8px] font-black uppercase tracking-widest text-white/25 hover:text-white transition-all">
              Clear All
            </button>
          </div>
        </div>

        {allTracks.length === 0 ? (
          <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-[2rem]">
            <Music2 size={22} className="text-white/12 mx-auto mb-2" />
            <p className="text-[9px] font-black uppercase tracking-widest text-white/20">No tracks found</p>
            <p className="text-[8px] text-white/12 mt-1">Upload music albums first</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
            {allTracks.map(track => {
              const on = eligibleIds.has(track.id);
              return (
                <button key={track.id} onClick={() => toggleTrack(track.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border transition-all text-left"
                  style={{
                    background:  on ? 'rgba(255,140,0,0.06)' : 'rgba(255,255,255,0.02)',
                    borderColor: on ? 'rgba(255,140,0,0.25)' : 'rgba(255,255,255,0.06)',
                  }}>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${on ? 'border-[#FF8C00] bg-[#FF8C00]' : 'border-white/15'}`}>
                    {on && <Check size={9} className="text-black" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-black uppercase tracking-widest truncate ${on ? 'text-white' : 'text-white/35'}`}>{track.title}</p>
                    <p className="text-[8px] text-white/20">{track.albumTitle} · {track.artist}</p>
                  </div>
                  {track.duration && (
                    <span className="text-[8px] text-white/20 flex-shrink-0">
                      {Math.floor(track.duration / 60)}:{String(Math.floor(track.duration % 60)).padStart(2,'0')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </motion.div>
  );
}
