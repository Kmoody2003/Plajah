import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Calendar, Clock, Film, Sparkles, Radio, Check, Volume2,
  AlertCircle, ChevronRight, Play, Eye, Share2
} from 'lucide-react';
import { Video, PremiereConfig, PremiereCountdownTheme } from '../../types';
import { scheduleVideoPremiere, cancelVideoPremiere, STOCK_PRE_ROLLS } from '../../services/premiereService';
import { notifyFollowers } from '../../services/backendService';

interface ReelloPremiereSchedulerModalProps {
  video: Video;
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: (updatedVideo: Video) => void;
  currentUser?: any;
}

export const ReelloPremiereSchedulerModal: React.FC<ReelloPremiereSchedulerModalProps> = ({
  video,
  isOpen,
  onClose,
  onUpdated,
  currentUser,
}) => {
  const currentConfig = video.premiereConfig;

  // Form state
  const [startTimeDate, setStartTimeDate] = useState(() => {
    const defaultTime = currentConfig?.premiereStartTime || (Date.now() + 15 * 60 * 1000);
    const d = new Date(defaultTime);
    // Format YYYY-MM-DDTHH:mm
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  const [countdownDurationSec, setCountdownDurationSec] = useState<number>(
    currentConfig?.countdownDurationSec || 120
  );
  const [countdownTheme, setCountdownTheme] = useState<PremiereCountdownTheme>(
    currentConfig?.countdownTheme || 'cinematic'
  );
  const [selectedPreRollId, setSelectedPreRollId] = useState<string>(() => {
    const match = STOCK_PRE_ROLLS.find(p => p.url === currentConfig?.preRollUrl);
    return match ? match.id : (currentConfig?.preRollUrl ? 'custom' : 'none');
  });
  const [customPreRollUrl, setCustomPreRollUrl] = useState<string>(
    currentConfig?.preRollUrl || ''
  );
  const [chatEnabled, setChatEnabled] = useState<boolean>(
    currentConfig?.chatEnabled ?? true
  );
  const [notifyFollowersChecked, setNotifyFollowersChecked] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Preset quick triggers
  const setQuickStart = (offsetMs: number) => {
    const target = new Date(Date.now() + offsetMs);
    const pad = (n: number) => n.toString().padStart(2, '0');
    setStartTimeDate(`${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const parsedTime = new Date(startTimeDate).getTime();
      if (isNaN(parsedTime) || parsedTime <= Date.now() - 60000) {
        throw new Error('Please select a future premiere date and time');
      }

      let resolvedPreRollUrl: string | undefined = undefined;
      let resolvedPreRollTitle: string | undefined = undefined;

      if (selectedPreRollId !== 'none') {
        if (selectedPreRollId === 'custom') {
          resolvedPreRollUrl = customPreRollUrl.trim() || undefined;
          resolvedPreRollTitle = 'Custom Intro';
        } else {
          const stock = STOCK_PRE_ROLLS.find(p => p.id === selectedPreRollId);
          if (stock) {
            resolvedPreRollUrl = stock.url;
            resolvedPreRollTitle = stock.title;
          }
        }
      }

      const newConfig: PremiereConfig = {
        isPremiere: true,
        premiereStartTime: parsedTime,
        countdownDurationSec,
        countdownTheme,
        preRollUrl: resolvedPreRollUrl,
        preRollTitle: resolvedPreRollTitle,
        chatEnabled,
        allowSeekAhead: false,
        status: 'SCHEDULED',
      };

      await scheduleVideoPremiere(video.id, newConfig);

      if (notifyFollowersChecked && currentUser?.uid) {
        notifyFollowers(
          currentUser.uid,
          'CONTENT',
          'Upcoming Live Premiere',
          `${currentUser.displayName || 'A creator'} scheduled a Live Premiere: ${video.title}`,
          'VIDEO',
          video.id,
          { highlight: true }
        ).catch(() => {});
      }

      const updated: Video = {
        ...video,
        isPremiere: true,
        premiereStartTime: parsedTime,
        premiereConfig: newConfig,
        isScheduled: true,
      };

      onUpdated?.(updated);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to schedule premiere');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelPremiere = async () => {
    setSaving(true);
    try {
      await cancelVideoPremiere(video.id);
      const updated: Video = {
        ...video,
        isPremiere: false,
        isScheduled: false,
      };
      onUpdated?.(updated);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to cancel premiere');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-[#0f0e15] border border-white/15 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-500">
              <Radio size={18} className="animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                Live Premiere Studio
              </h2>
              <p className="text-[11px] text-white/50 truncate max-w-md">
                {video.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center gap-3 text-red-400 text-xs">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Date & Time Selection */}
          <div className="space-y-3">
            <label className="text-xs font-black uppercase tracking-widest text-white/80 flex items-center gap-2">
              <Calendar size={14} className="text-orange-400" />
              <span>Premiere Date & Time</span>
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setQuickStart(30 * 1000)}
                className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs font-bold transition-all"
              >
                In 30s (Instant Test)
              </button>
              <button
                type="button"
                onClick={() => setQuickStart(5 * 60 * 1000)}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-xs font-bold transition-all"
              >
                In 5 Mins
              </button>
              <button
                type="button"
                onClick={() => setQuickStart(60 * 60 * 1000)}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-xs font-bold transition-all"
              >
                In 1 Hour
              </button>
              <button
                type="button"
                onClick={() => setQuickStart(24 * 60 * 60 * 1000)}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-xs font-bold transition-all"
              >
                Tomorrow
              </button>
            </div>

            <input
              type="datetime-local"
              value={startTimeDate}
              onChange={(e) => setStartTimeDate(e.target.value)}
              className="w-full bg-black/50 border border-white/15 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-orange-500/80 transition-colors"
            />
          </div>

          {/* 2. Countdown Duration */}
          <div className="space-y-3">
            <label className="text-xs font-black uppercase tracking-widest text-white/80 flex items-center gap-2">
              <Clock size={14} className="text-orange-400" />
              <span>Countdown Duration</span>
            </label>
            <div className="grid grid-cols-4 gap-2.5">
              {[
                { sec: 10, label: '10s (Test)' },
                { sec: 30, label: '30s' },
                { sec: 60, label: '1 Min' },
                { sec: 120, label: '2 Mins' },
              ].map(opt => (
                <button
                  key={opt.sec}
                  type="button"
                  onClick={() => setCountdownDurationSec(opt.sec)}
                  className={`p-3 rounded-2xl border text-xs font-bold transition-all text-center ${
                    countdownDurationSec === opt.sec
                      ? 'bg-orange-500 text-black border-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.4)]'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/70'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Countdown Visual Theme */}
          <div className="space-y-3">
            <label className="text-xs font-black uppercase tracking-widest text-white/80 flex items-center gap-2">
              <Sparkles size={14} className="text-orange-400" />
              <span>Countdown Theme</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { id: 'cinematic', label: 'Cinematic HUD', desc: 'Sleek orange rings & telemetry' },
                { id: 'classic', label: '35mm Film Leader', desc: 'Rotating projector sweep' },
                { id: 'cyber', label: 'Cyberpunk Neon', desc: 'Electric grid & glitch pulse' },
                { id: 'gold', label: 'Gold Horizon', desc: 'Luxury film festival shimmer' },
              ].map(th => (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => setCountdownTheme(th.id as PremiereCountdownTheme)}
                  className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                    countdownTheme === th.id
                      ? 'bg-orange-500/15 border-orange-500 text-white shadow-lg'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/60'
                  }`}
                >
                  <span className="text-xs font-black text-white">{th.label}</span>
                  <span className="text-[10px] text-white/40 mt-1">{th.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 4. Pre-Roll Video Selection */}
          <div className="space-y-3">
            <label className="text-xs font-black uppercase tracking-widest text-white/80 flex items-center gap-2">
              <Film size={14} className="text-orange-400" />
              <span>Pre-Roll Video (Intro / Teaser / Trailer)</span>
            </label>
            <div className="space-y-2">
              <div
                onClick={() => setSelectedPreRollId('none')}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                  selectedPreRollId === 'none'
                    ? 'bg-white/10 border-white/30 text-white'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/60'
                }`}
              >
                <span className="text-xs font-bold">No Pre-Roll (Visual Countdown Only)</span>
                {selectedPreRollId === 'none' && <Check size={16} className="text-emerald-400" />}
              </div>

              {STOCK_PRE_ROLLS.map(st => (
                <div
                  key={st.id}
                  onClick={() => setSelectedPreRollId(st.id)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
                    selectedPreRollId === st.id
                      ? 'bg-orange-500/15 border-orange-500 text-white'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/70'
                  }`}
                >
                  <img src={st.thumbnailUrl} alt="" className="w-16 h-10 rounded-lg object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{st.title}</p>
                    <p className="text-[10px] text-white/40 truncate">{st.description} ({st.durationSec}s)</p>
                  </div>
                  {selectedPreRollId === st.id && <Check size={16} className="text-orange-400 shrink-0" />}
                </div>
              ))}

              <div
                onClick={() => setSelectedPreRollId('custom')}
                className={`p-3 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                  selectedPreRollId === 'custom'
                    ? 'bg-orange-500/15 border-orange-500 text-white'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">Custom Pre-Roll Video URL</span>
                  {selectedPreRollId === 'custom' && <Check size={16} className="text-orange-400" />}
                </div>
                {selectedPreRollId === 'custom' && (
                  <input
                    type="url"
                    placeholder="https://.../teaser.mp4"
                    value={customPreRollUrl}
                    onChange={(e) => setCustomPreRollUrl(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                )}
              </div>
            </div>
          </div>

          {/* 5. Live Chat & Followers Notify Toggles */}
          <div className="space-y-3 pt-2 border-t border-white/10">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={chatEnabled}
                onChange={(e) => setChatEnabled(e.target.checked)}
                className="w-4 h-4 rounded text-orange-500 bg-black/50 border-white/20"
              />
              <span className="text-xs font-bold text-white">Enable Real-Time Premiere Live Chat & Reactions</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyFollowersChecked}
                onChange={(e) => setNotifyFollowersChecked(e.target.checked)}
                className="w-4 h-4 rounded text-orange-500 bg-black/50 border-white/20"
              />
              <span className="text-xs font-bold text-white">Send Notification to Followers Upon Scheduling</span>
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-white/10 bg-black/60 flex items-center justify-between gap-4">
          {video.isPremiere ? (
            <button
              type="button"
              onClick={handleCancelPremiere}
              disabled={saving}
              className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors uppercase tracking-wider"
            >
              Cancel Premiere (Revert to VOD)
            </button>
          ) : (
            <span className="text-xs text-white/40">Ready to go live together</span>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold transition-all"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-red-600/30 transition-all active:scale-95 disabled:opacity-50"
            >
              <Radio size={14} />
              <span>{saving ? 'Scheduling...' : 'Schedule Live Premiere'}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ReelloPremiereSchedulerModal;
