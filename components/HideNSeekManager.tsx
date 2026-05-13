import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Trash2, Clock, Music, BarChart2, Eye, EyeOff, Upload, Check, AlertCircle, Shuffle } from 'lucide-react';
import { Album, Track, HideNSeekAlternate, HideNSeekConfig, HideNSeekTrackConfig, HideNSeekWindow } from '../types';
import {
  saveHideNSeekConfig,
  fetchHideNSeekAlternates,
  uploadHideNSeekAlternate,
  deleteHideNSeekAlternate,
  fetchHideNSeekStats,
} from '../services/backendService';
import { validateHideNSeekWindow } from '../hooks/useHideNSeek';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function defaultConfig(): HideNSeekConfig {
  return { isEnabled: false, globalEnabled: false, windows: [], trackConfigs: [] };
}

interface Props {
  album: Album;
  onClose: () => void;
  onSaved: (updated: Album) => void;
}

const HideNSeekManager: React.FC<Props> = ({ album, onClose, onSaved }) => {
  const [tab, setTab] = useState<'SCHEDULE' | 'TRACKS' | 'STATS'>('SCHEDULE');
  const [config, setConfig] = useState<HideNSeekConfig>(album.hideNSeekConfig ?? defaultConfig());
  const [alternates, setAlternates] = useState<HideNSeekAlternate[]>([]);
  const [stats, setStats] = useState<{ discoverers: number; byAlt: Record<string, number> } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New-window form state
  const [newWindowTime, setNewWindowTime] = useState('12:00');
  const [newWindowDays, setNewWindowDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon–Fri default

  // Uploading state: trackId → slot
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUpload = useRef<{ trackId: string; slot: 1 | 2; title: string; artist: string } | null>(null);

  useEffect(() => {
    fetchHideNSeekAlternates(album.id).then(setAlternates);
    fetchHideNSeekStats(album.id).then(s => {
      if (s) {
        setStats({
          discoverers: s.uniqueDiscovererIds?.length ?? 0,
          byAlt: s.discoveryCount ?? {},
        });
      }
    });
  }, [album.id]);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const updateConfig = (partial: Partial<HideNSeekConfig>) =>
    setConfig(prev => ({ ...prev, ...partial }));

  const trackConfig = (trackId: string): HideNSeekTrackConfig =>
    config.trackConfigs.find(tc => tc.trackId === trackId) ??
    { trackId, enabled: false };

  const setTrackConfig = (tc: HideNSeekTrackConfig) =>
    setConfig(prev => ({
      ...prev,
      trackConfigs: prev.trackConfigs.some(t => t.trackId === tc.trackId)
        ? prev.trackConfigs.map(t => (t.trackId === tc.trackId ? tc : t))
        : [...prev.trackConfigs, tc],
    }));

  const altForSlot = (trackId: string, slot: 1 | 2) =>
    alternates.find(a => a.parentTrackId === trackId && a.slot === slot);

  // ─── Schedule tab ─────────────────────────────────────────────────────────

  const addWindow = () => {
    const err = validateHideNSeekWindow(config, newWindowTime, newWindowDays);
    if (err) { setError(err); return; }
    setError(null);
    const w: HideNSeekWindow = {
      id: `w_${Date.now()}`,
      startTime: newWindowTime,
      daysOfWeek: newWindowDays,
    };
    updateConfig({ windows: [...config.windows, w] });
  };

  const removeWindow = (id: string) =>
    updateConfig({ windows: config.windows.filter(w => w.id !== id) });

  const toggleDay = (day: number) =>
    setNewWindowDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );

  // ─── Tracks tab ───────────────────────────────────────────────────────────

  const triggerUpload = (trackId: string, slot: 1 | 2, title: string, artist: string) => {
    pendingUpload.current = { trackId, slot, title, artist };
    fileInputRef.current?.click();
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingUpload.current) return;
    const { trackId, slot, title, artist } = pendingUpload.current;
    setUploading(`${trackId}_slot${slot}`);
    try {
      const alt = await uploadHideNSeekAlternate(album.id, trackId, slot, file, title, artist);
      setAlternates(prev => {
        const filtered = prev.filter(a => !(a.parentTrackId === trackId && a.slot === slot));
        return [...filtered, alt];
      });
      // Record slot ID in config
      const tc = trackConfig(trackId);
      setTrackConfig({ ...tc, ...(slot === 1 ? { slot1Id: alt.id } : { slot2Id: alt.id }) });
    } catch (err) {
      console.error('Upload failed', err);
      setError('Upload failed — check your connection and try again.');
    } finally {
      setUploading(null);
      e.target.value = '';
    }
  };

  const handleDeleteAlt = async (alt: HideNSeekAlternate) => {
    if (!window.confirm(`Remove "${alt.title}" from slot ${alt.slot}?`)) return;
    await deleteHideNSeekAlternate(album.id, alt.id);
    setAlternates(prev => prev.filter(a => a.id !== alt.id));
    const tc = trackConfig(alt.parentTrackId);
    setTrackConfig({
      ...tc,
      ...(alt.slot === 1 ? { slot1Id: undefined } : { slot2Id: undefined }),
    });
  };

  // ─── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveHideNSeekConfig(album.id, config);
      onSaved({ ...album, hideNSeekConfig: config });
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render helpers ───────────────────────────────────────────────────────

  const SlotRow = ({ track, slot }: { track: Track; slot: 1 | 2 }) => {
    const alt = altForSlot(track.id, slot);
    const key = `${track.id}_slot${slot}`;
    const isUp = uploading === key;

    const [altTitle, setAltTitle] = useState(alt?.title ?? `${track.title} (Alt ${slot})`);
    const [altArtist, setAltArtist] = useState(alt?.artist ?? track.artist);

    return (
      <div className="flex items-center gap-3 mt-2 pl-4 border-l-2 border-white/5">
        <span className="text-[9px] font-black uppercase tracking-widest opacity-30 w-10 shrink-0">
          Slot {slot}
        </span>
        {alt ? (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate">{alt.title}</p>
              <p className="text-[9px] opacity-30 truncate">{alt.artist}</p>
            </div>
            <Check size={12} className="text-green-400 shrink-0" />
            <button
              onClick={() => handleDeleteAlt(alt)}
              className="p-1 opacity-30 hover:opacity-100 hover:text-red-400 transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </>
        ) : (
          <>
            <input
              value={altTitle}
              onChange={e => setAltTitle(e.target.value)}
              placeholder="Title…"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[11px] font-bold focus:outline-none focus:border-primary placeholder:text-white/20"
            />
            <input
              value={altArtist}
              onChange={e => setAltArtist(e.target.value)}
              placeholder="Artist…"
              className="w-28 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[11px] font-bold focus:outline-none focus:border-primary placeholder:text-white/20"
            />
            <button
              disabled={isUp}
              onClick={() => triggerUpload(track.id, slot, altTitle, altArtist)}
              className="px-3 py-1.5 bg-primary/20 border border-primary/30 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-primary/40 transition-all flex items-center gap-1.5 disabled:opacity-40 shrink-0"
            >
              {isUp ? <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Upload size={11} />}
              {isUp ? 'Uploading…' : 'Upload'}
            </button>
          </>
        )}
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-2xl flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-white/5 shrink-0">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Shuffle size={18} className="text-primary" />
              <h2 className="text-xl font-black uppercase tracking-tight italic">Hide N Seek</h2>
            </div>
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{album.title}</p>
          </div>
          <div className="flex items-center gap-4">
            {/* Master enable toggle */}
            <button
              onClick={() => updateConfig({ isEnabled: !config.isEnabled })}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                config.isEnabled
                  ? 'bg-primary border-primary text-white'
                  : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20'
              }`}
            >
              {config.isEnabled ? <Eye size={12} /> : <EyeOff size={12} />}
              {config.isEnabled ? 'Active' : 'Inactive'}
            </button>
            <button onClick={onClose} className="p-2 text-white/30 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-8 pt-4 shrink-0">
          {(['SCHEDULE', 'TRACKS', 'STATS'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                tab === t ? 'bg-white text-black' : 'text-white/30 hover:text-white'
              }`}
            >
              {t === 'SCHEDULE' && <Clock size={11} className="inline mr-1.5" />}
              {t === 'TRACKS' && <Music size={11} className="inline mr-1.5" />}
              {t === 'STATS' && <BarChart2 size={11} className="inline mr-1.5" />}
              {t}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">

          {/* ── SCHEDULE ── */}
          {tab === 'SCHEDULE' && (
            <div className="space-y-6">
              <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest opacity-50">Global track mode</h3>
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="text-sm font-bold">All-tracks mode</p>
                    <p className="text-[10px] text-white/30 mt-0.5">Every track with uploaded alternates participates automatically.</p>
                  </div>
                  <div
                    onClick={() => updateConfig({ globalEnabled: !config.globalEnabled })}
                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${config.globalEnabled ? 'bg-primary' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${config.globalEnabled ? 'left-7' : 'left-1'}`} />
                  </div>
                </label>
                {!config.globalEnabled && (
                  <p className="text-[10px] text-white/20">Off — configure per-track in the Tracks tab.</p>
                )}
              </div>

              {/* Existing windows */}
              {config.windows.length > 0 && (
                <div className="space-y-3">
                  {config.windows.map(w => (
                    <div key={w.id} className="glass flex items-center gap-4 px-6 py-4 rounded-2xl border border-white/5">
                      <Clock size={14} className="text-primary shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-black">{w.startTime} – {(() => { const [h,m] = w.startTime.split(':').map(Number); const e = h*60+m+180; return `${String(Math.floor(e/60)%24).padStart(2,'0')}:${String(e%60).padStart(2,'0')}`; })()} <span className="text-[10px] font-bold text-white/30 ml-2">3 hrs</span></p>
                        <p className="text-[10px] text-white/30 mt-0.5">{w.daysOfWeek.map(d => DAYS[d]).join(', ')}</p>
                      </div>
                      <button onClick={() => removeWindow(w.id)} className="p-1.5 text-white/20 hover:text-red-400 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add window form */}
              {config.windows.length < 3 && (
                <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-widest opacity-50">Add window ({config.windows.length}/3)</h3>
                  <div className="flex items-center gap-4">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 shrink-0">Start time</label>
                    <input
                      type="time"
                      value={newWindowTime}
                      onChange={e => setNewWindowTime(e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:border-primary text-white"
                    />
                    <p className="text-[10px] text-white/20">Runs 3 hours</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-3">Days</label>
                    <div className="flex gap-2 flex-wrap">
                      {DAYS.map((day, i) => (
                        <button
                          key={i}
                          onClick={() => toggleDay(i)}
                          className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                            newWindowDays.includes(i)
                              ? 'bg-primary border-primary text-white'
                              : 'bg-white/5 border-white/10 text-white/40 hover:border-white/30'
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                  {error && (
                    <div className="flex items-center gap-2 text-red-400 text-[11px] font-bold">
                      <AlertCircle size={13} /> {error}
                    </div>
                  )}
                  <button
                    onClick={addWindow}
                    disabled={newWindowDays.length === 0}
                    className="flex items-center gap-2 px-6 py-3 bg-primary rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-40"
                  >
                    <Plus size={14} /> Add Window
                  </button>
                </div>
              )}
              {config.windows.length === 3 && (
                <p className="text-[10px] font-bold text-white/20 text-center py-4">Maximum 3 windows reached.</p>
              )}
            </div>
          )}

          {/* ── TRACKS ── */}
          {tab === 'TRACKS' && (
            <div className="space-y-4">
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
                Upload up to 2 alternate slots per track. Alternates are never public — only heard during active Hide N Seek windows.
              </p>
              {(album.tracks || []).map(track => {
                const tc = trackConfig(track.id);
                const hasAlt = !!(altForSlot(track.id, 1) || altForSlot(track.id, 2));
                return (
                  <div key={track.id} className="glass p-5 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black truncate">{track.title}</p>
                        <p className="text-[10px] text-white/30">{track.artist}</p>
                      </div>
                      {/* Per-track enable toggle (only relevant when globalEnabled is off) */}
                      {!config.globalEnabled && (
                        <button
                          onClick={() => setTrackConfig({ ...tc, enabled: !tc.enabled })}
                          disabled={!hasAlt}
                          className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all disabled:opacity-20 ${
                            tc.enabled
                              ? 'bg-primary/20 border-primary text-primary'
                              : 'bg-white/5 border-white/10 text-white/30 hover:border-white/30'
                          }`}
                        >
                          {tc.enabled ? 'On' : 'Off'}
                        </button>
                      )}
                      {config.globalEnabled && hasAlt && (
                        <span className="text-[9px] font-black uppercase tracking-widest text-primary opacity-60">Auto</span>
                      )}
                    </div>
                    <SlotRow track={track} slot={1} />
                    <SlotRow track={track} slot={2} />
                  </div>
                );
              })}
              {/* Hidden file input */}
              <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileChosen} />
            </div>
          )}

          {/* ── STATS ── */}
          {tab === 'STATS' && (
            <div className="space-y-6">
              {stats ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="glass p-6 rounded-2xl border border-white/5 text-center">
                      <p className="text-4xl font-black">{stats.discoverers}</p>
                      <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-1">Unique Discoverers</p>
                    </div>
                    <div className="glass p-6 rounded-2xl border border-white/5 text-center">
                      <p className="text-4xl font-black">{Object.values(stats.byAlt).reduce((s, n) => s + n, 0)}</p>
                      <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-1">Total Discoveries</p>
                    </div>
                  </div>

                  {/* Per-alternate breakdown */}
                  <div className="space-y-3">
                    {alternates.map(alt => {
                      const count = stats.byAlt[alt.id] ?? 0;
                      const maxCount = Math.max(...Object.values(stats.byAlt), 1);
                      return (
                        <div key={alt.id} className="glass p-4 rounded-2xl border border-white/5">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-xs font-black">{alt.title}</p>
                              <p className="text-[9px] text-white/30">Slot {alt.slot} · {alt.artist}</p>
                            </div>
                            <span className="text-sm font-black text-primary">{count}</span>
                          </div>
                          <div className="w-full bg-white/5 rounded-full h-1.5">
                            <div
                              className="bg-primary h-1.5 rounded-full transition-all"
                              style={{ width: `${(count / maxCount) * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Artist achievement progress */}
                  <div className="glass p-6 rounded-2xl border border-white/5">
                    <h3 className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-4">Artist Achievement Progress</h3>
                    {[{ label: 'Hidden Gem', target: 10 }, { label: 'Going Viral', target: 50 }].map(({ label, target }) => (
                      <div key={target} className="mb-4">
                        <div className="flex justify-between mb-1">
                          <span className="text-xs font-bold">{label}</span>
                          <span className="text-xs font-black text-primary">{Math.min(stats.discoverers, target)}/{target}</span>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{ width: `${Math.min((stats.discoverers / target) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-center text-[10px] font-black uppercase tracking-widest text-white/20 py-16">No discoveries yet. Activate Hide N Seek to start collecting data.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-white/5 flex items-center justify-between shrink-0">
          {error && tab !== 'SCHEDULE' && (
            <div className="flex items-center gap-2 text-red-400 text-[11px] font-bold">
              <AlertCircle size={13} /> {error}
            </div>
          )}
          <div className="flex gap-3 ml-auto">
            <button onClick={onClose} className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-8 py-3 bg-primary rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check size={14} />}
              {saving ? 'Saving…' : 'Save Config'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default HideNSeekManager;
