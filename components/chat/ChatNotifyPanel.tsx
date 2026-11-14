import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Moon, X, Check } from 'lucide-react';
import Portal from '../Portal';
import { setRoomMute, getQuietHours, saveQuietHours } from '../../services/chat/chatActions';
import {
  MUTE_OPTIONS, isRoomMuted, muteLabel, muteUntilFor, isQuietNow, DEFAULT_QUIET_HOURS,
  type RoomPrefs, type QuietHours,
} from '../../services/chat/chatCore';

interface Props {
  roomId: string;
  roomName: string;
  prefs: RoomPrefs | null;
  onClose: () => void;
}

/**
 * Notifications for one conversation (mute) plus your quiet hours for all chat.
 * Muted rooms still notify on an @mention; quiet hours silence every chat push.
 */
const ChatNotifyPanel: React.FC<Props> = ({ roomId, roomName, prefs, onClose }) => {
  const muted = isRoomMuted(prefs);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [quiet, setQuiet] = useState<QuietHours>(DEFAULT_QUIET_HOURS);
  const [quietSaved, setQuietSaved] = useState(false);

  useEffect(() => { getQuietHours().then(setQuiet).catch(() => {}); }, []);

  const mute = async (id: string, ms: number | null) => {
    setBusy(id);
    setError('');
    try {
      await setRoomMute(roomId, ms === null ? null : muteUntilFor(ms));
    } catch (e: any) {
      setError(e?.message || 'Could not change notifications. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const saveQuiet = async (next: QuietHours) => {
    setQuiet(next);
    setQuietSaved(false);
    setError('');
    try {
      await saveQuietHours(next);
      setQuietSaved(true);
    } catch (e: any) {
      setError(e?.message || 'Could not save quiet hours. Try again.');
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[320] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Chat notifications">
        <div className="w-full max-w-sm rounded-2xl bg-[#121212] border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
            {muted ? <BellOff size={15} className="text-white/60" /> : <Bell size={15} className="text-small-orange" />}
            <h2 className="text-xs font-black uppercase tracking-widest text-white flex-1 truncate">Notifications · {roomName}</h2>
            <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg hover:bg-white/10"><X size={15} /></button>
          </div>

          <div className="p-4 flex flex-col gap-4">
            <section className="flex flex-col gap-2">
              <p className="text-[12px] text-white/70">
                {muted ? `${muteLabel(prefs)}. You'll still hear about @mentions.` : 'You get a notification for every new message here.'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {MUTE_OPTIONS.map(o => (
                  <button key={o.id} onClick={() => mute(o.id, o.ms)} disabled={!!busy}
                    className={`px-3 py-2 rounded-xl text-[11px] font-semibold text-left transition-colors disabled:opacity-50 ${o.id === 'forever' ? 'col-span-2' : ''} bg-white/[0.06] hover:bg-white/[0.12] text-white`}>
                    {busy === o.id ? 'Saving…' : `Mute ${o.label.toLowerCase()}`}
                  </button>
                ))}
              </div>
              {muted && (
                <button onClick={() => mute('unmute', null)} disabled={!!busy}
                  className="px-3 py-2 rounded-xl text-[11px] font-bold bg-small-orange text-white hover:bg-small-orange/80 disabled:opacity-50">
                  {busy === 'unmute' ? 'Saving…' : 'Unmute'}
                </button>
              )}
            </section>

            <section className="flex flex-col gap-2 pt-3 border-t border-white/10">
              <label className="flex items-center gap-2 text-[12px] font-semibold text-white" htmlFor="quiet-enabled">
                <Moon size={13} className="text-white/60" />
                <span className="flex-1">Quiet hours for all chats</span>
                <input id="quiet-enabled" type="checkbox" checked={quiet.enabled}
                  onChange={e => saveQuiet({ ...quiet, enabled: e.target.checked })} className="w-4 h-4 accent-[var(--small-orange,#f97316)]" />
              </label>
              <div className="flex items-center gap-2 text-[11px] text-white/60">
                <label htmlFor="quiet-start">From</label>
                <input id="quiet-start" type="time" value={quiet.start} onChange={e => e.target.value && saveQuiet({ ...quiet, start: e.target.value })}
                  className="bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1 text-white" />
                <label htmlFor="quiet-end">to</label>
                <input id="quiet-end" type="time" value={quiet.end} onChange={e => e.target.value && saveQuiet({ ...quiet, end: e.target.value })}
                  className="bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1 text-white" />
                {quietSaved && <Check size={13} className="text-green-400" aria-label="Saved" />}
              </div>
              <p className="text-[10px] text-white/40">
                {quiet.enabled
                  ? `No chat pushes during these hours${isQuietNow(quiet) ? ' (on now)' : ''}. Messages still wait in your inbox.`
                  : 'Pause chat pushes overnight or during focus time. Messages still wait in your inbox.'}
              </p>
            </section>

            {error && <p className="text-[11px] text-red-400">{error}</p>}
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default ChatNotifyPanel;
