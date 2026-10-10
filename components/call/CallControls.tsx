/**
 * Shared call chrome for every rtcCore call surface — meetings (VideoChat), Shuffle, and anything
 * else built on useRtcSession — so calls look and behave the same everywhere:
 *   <ReactionBar> + <ReactionFloats> (data-channel emoji), <CallControlBar> (mic / camera with
 *   device pickers, screen share, record, end) with an `extra` slot for surface-specific actions.
 * Moved out of VideoChat.tsx unchanged in look; each feature is opt-in per surface.
 */
import React, { useCallback, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, MonitorSpeaker, ChevronUp, Circle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { UseRtcSession } from '../../hooks/useRtcSession';

export const REACTIONS = ['❤️', '😂', '👍', '🔥', '👏', '🎉'];

export interface Float { id: string; emoji: string; x: number }

/** Local float state + a sender that also broadcasts over the data channel ('reaction'). */
export function useReactions(rtc: Pick<UseRtcSession, 'sendData'>) {
  const [floats, setFloats] = useState<Float[]>([]);
  const addFloat = useCallback((emoji: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setFloats(prev => [...prev, { id, emoji, x: 10 + Math.random() * 80 }]);
    setTimeout(() => setFloats(prev => prev.filter(f => f.id !== id)), 2600);
  }, []);
  const react = (emoji: string) => { addFloat(emoji); rtc.sendData('reaction', { emoji }); };
  return { floats, addFloat, react };
}

export function ReactionFloats({ floats }: { floats: Float[] }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      <AnimatePresence>
        {floats.map(f => (
          <motion.div key={f.id}
            initial={{ y: 0, opacity: 1, scale: 0.6 }}
            animate={{ y: -window.innerHeight * 0.5, opacity: 0, scale: 1.5 }}
            exit={{}} transition={{ duration: 2.5, ease: 'easeOut' }}
            className="absolute bottom-32 text-4xl" style={{ left: `${f.x}%` }}>
            {f.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function ReactionBar({ onReact, disabled }: { onReact: (emoji: string) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2 pb-1">
      {REACTIONS.map(e => (
        <button key={e} onClick={() => onReact(e)} disabled={disabled} aria-label={`React ${e}`}
          className="text-2xl hover:scale-125 active:scale-95 transition-transform p-1.5 rounded-full hover:bg-white/10 disabled:opacity-40">
          {e}
        </button>
      ))}
    </div>
  );
}

export interface CallControlBarProps {
  rtc: UseRtcSession;
  onEnd: () => void;
  endLabel?: string;
  /** Offer "Desktop / system audio" in the mic menu. */
  desktopAudio?: boolean;
  /** Offer screen share (camera menu + its own button on wider screens). */
  screenShare?: boolean;
  /** Show the record button (wired by the surface). */
  record?: { active: boolean; toggle: () => void };
  /** Surface-specific actions, rendered before the end button. */
  extra?: React.ReactNode;
  compact?: boolean;
  /** Overlay mode (over a full-screen stream): no gradient band, smaller padding. */
  overlay?: boolean;
  /** Overrides for surfaces whose audio/video graph sits between the devices and rtc
   *  (Reello guests: mixer + composer). Default = rtc's own mute / device switching. */
  mic?: { on: boolean; toggle: () => void };
  onPickMic?: (deviceId: string) => void;
  onPickCamera?: (deviceId: string) => void;
}

export function CallControlBar({ rtc, onEnd, endLabel = 'End call', desktopAudio = true, screenShare = true, record, extra, compact, overlay, mic, onPickMic, onPickCamera }: CallControlBarProps) {
  const [srcMenu, setSrcMenu] = useState<'mic' | 'cam' | null>(null);
  const micOn = mic ? mic.on : rtc.audioEnabled;
  const toggleMic = mic ? mic.toggle : rtc.toggleAudio;
  const pickMic = onPickMic ?? rtc.switchAudioDevice;
  const pickCamera = onPickCamera ?? rtc.switchVideoDevice;
  if (overlay) compact = true;
  const pad = compact ? 'p-3.5' : 'p-4 sm:p-6';
  const padSplit = compact ? 'py-3.5' : 'py-4 sm:py-6';
  const icon = compact ? 20 : 24;
  return (
    <div className={`${overlay ? 'px-2 py-1.5 rounded-[2rem] bg-black/55 backdrop-blur' : compact ? 'p-3 pt-2 bg-gradient-to-t from-black to-transparent' : 'p-3 sm:p-8 pt-2 bg-gradient-to-t from-black to-transparent'} flex items-center justify-center gap-2 sm:gap-4 flex-wrap`} style={overlay ? undefined : { paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
      {/* Mic + source dropdown */}
      <div className="relative flex items-center">
        <button onClick={toggleMic} aria-label={micOn ? 'Mute' : 'Unmute'}
          className={`${pad} rounded-l-full rounded-r-lg transition-all hover:scale-105 ${!micOn ? 'bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.3)]' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
          {!micOn ? <MicOff size={icon} /> : <Mic size={icon} />}
        </button>
        <button onClick={() => { setSrcMenu(m => m === 'mic' ? null : 'mic'); rtc.refreshDevices(); }} aria-label="Choose microphone"
          className={`px-1.5 ${padSplit} rounded-r-full rounded-l-lg bg-white/10 text-white/50 hover:bg-white/20 transition-all`}><ChevronUp size={14} /></button>
        <AnimatePresence>
          {srcMenu === 'mic' && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSrcMenu(null)} />
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                className="absolute bottom-full mb-3 left-0 z-50 w-64 bg-[#0c0c0f] border border-white/10 rounded-2xl shadow-2xl p-2">
                <div className="px-2 py-1.5 text-[9px] font-black uppercase tracking-widest text-white/40">Microphone</div>
                {rtc.devices.mics.length === 0 && <div className="px-2 py-2 text-[10px] text-white/30">No microphone found</div>}
                {rtc.devices.mics.map((d, i) => {
                  const active = rtc.activeDevices.micId === d.deviceId;
                  return (
                    <button key={d.deviceId || i} onClick={() => { pickMic(d.deviceId); setSrcMenu(null); }}
                      className={`w-full text-left px-2 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-2 ${active ? 'bg-small-orange/20 text-small-orange' : 'text-white/70 hover:bg-white/5'}`}>
                      <Mic size={12} /> <span className="truncate">{d.label || `Microphone ${i + 1}`}</span>
                    </button>
                  );
                })}
                {desktopAudio && (
                  <>
                    <div className="h-px bg-white/10 my-1.5" />
                    <button onClick={() => { rtc.useDesktopAudio(); setSrcMenu(null); }}
                      className="w-full text-left px-2 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-2 text-white/70 hover:bg-white/5">
                      <MonitorSpeaker size={12} /> Desktop / system audio
                    </button>
                  </>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Camera + source dropdown */}
      <div className="relative flex items-center">
        <button onClick={rtc.toggleVideo} aria-label={rtc.videoEnabled ? 'Turn camera off' : 'Turn camera on'}
          className={`${pad} rounded-l-full rounded-r-lg transition-all hover:scale-105 ${!rtc.videoEnabled ? 'bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.3)]' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
          {!rtc.videoEnabled ? <VideoOff size={icon} /> : <Video size={icon} />}
        </button>
        <button onClick={() => { setSrcMenu(m => m === 'cam' ? null : 'cam'); rtc.refreshDevices(); }} aria-label="Choose camera"
          className={`px-1.5 ${padSplit} rounded-r-full rounded-l-lg bg-white/10 text-white/50 hover:bg-white/20 transition-all`}><ChevronUp size={14} /></button>
        <AnimatePresence>
          {srcMenu === 'cam' && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSrcMenu(null)} />
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                className="absolute bottom-full mb-3 left-0 z-50 w-64 bg-[#0c0c0f] border border-white/10 rounded-2xl shadow-2xl p-2">
                <div className="px-2 py-1.5 text-[9px] font-black uppercase tracking-widest text-white/40">Camera</div>
                {rtc.devices.cameras.length === 0 && <div className="px-2 py-2 text-[10px] text-white/30">No camera found</div>}
                {rtc.devices.cameras.map((d, i) => {
                  const active = rtc.activeDevices.cameraId === d.deviceId;
                  return (
                    <button key={d.deviceId || i} onClick={() => { pickCamera(d.deviceId); setSrcMenu(null); }}
                      className={`w-full text-left px-2 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-2 ${active ? 'bg-small-orange/20 text-small-orange' : 'text-white/70 hover:bg-white/5'}`}>
                      <Video size={12} /> <span className="truncate">{d.label || `Camera ${i + 1}`}</span>
                    </button>
                  );
                })}
                {screenShare && (
                  <>
                    <div className="h-px bg-white/10 my-1.5" />
                    <button onClick={() => { rtc.toggleScreenShare(); setSrcMenu(null); }}
                      className={`w-full text-left px-2 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-2 ${rtc.sharingScreen ? 'bg-small-orange/20 text-small-orange' : 'text-white/70 hover:bg-white/5'}`}>
                      <Monitor size={12} /> {rtc.sharingScreen ? 'Stop sharing screen' : 'Share screen'}
                    </button>
                  </>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {screenShare && (
        <button onClick={rtc.toggleScreenShare} aria-label={rtc.sharingScreen ? 'Stop sharing screen' : 'Share screen'}
          className={`hidden sm:flex ${pad} rounded-full transition-all hover:scale-110 ${rtc.sharingScreen ? 'bg-small-orange text-white shadow-[0_0_30px_rgba(255,140,0,0.3)]' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
          <Monitor size={icon} />
        </button>
      )}
      {record && (
        <button onClick={record.toggle} title={record.active ? 'Stop recording' : 'Record'} aria-label={record.active ? 'Stop recording' : 'Record'}
          className={`hidden sm:flex ${pad} rounded-full transition-all hover:scale-110 ${record.active ? 'bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.4)] animate-pulse' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
          <Circle size={icon} fill={record.active ? 'currentColor' : 'none'} />
        </button>
      )}
      {extra}
      <button onClick={onEnd} aria-label={endLabel}
        className={`${pad} bg-red-600 text-white rounded-full hover:scale-110 transition-all shadow-[0_0_50px_rgba(220,38,38,0.4)]`}>
        <PhoneOff size={icon} />
      </button>
    </div>
  );
}
