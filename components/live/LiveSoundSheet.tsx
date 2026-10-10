/**
 * LiveSoundSheet — "Sound" panel for anyone on a Reello Live stage (host or guest).
 * Lay device audio / screen audio / a played file UNDER your mic (services/liveAudioMixer.ts).
 */
import React, { useEffect, useRef, useState } from 'react';
import { X, Mic, MonitorSpeaker, Music, Play, Pause, Square, Headphones, Upload } from 'lucide-react';
import { canShareDeviceAudio, type LiveAudioMixer, type MixSourceState, type MixSourceId } from '../../services/liveAudioMixer';

// Hoisted (not defined inside the sheet) so a volume drag isn't remounted on every gain update.
function SourceRow({ s, mixer, icon, children }: { s?: MixSourceState; mixer: LiveAudioMixer | null; icon: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">{icon}</span>
        <span className="flex-1 text-[12px] font-bold text-white">{s?.label}</span>
        {children}
      </div>
      {s?.active && mixer && (
        <input type="range" min={0} max={1.5} step={0.05} value={s.gain} aria-label={`${s.label} volume`}
          onChange={e => mixer.setGain(s.id, Number(e.target.value))}
          className="w-full mt-2 accent-red-500" />
      )}
    </div>
  );
}

export function LiveSoundSheet({ mixer, state, ensureMixer, onClose, compact }: {
  mixer: LiveAudioMixer | null;
  state: MixSourceState[];
  ensureMixer: () => Promise<LiveAudioMixer>;
  onClose: () => void;
  compact?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mediaName, setMediaName] = useState('');
  const [playing, setPlaying] = useState(false);
  const [msg, setMsg] = useState('');
  const [, force] = useState(0);
  const LABEL: Record<MixSourceId, string> = { mic: 'Mic', device: 'Device audio', screen: 'Screen audio', media: 'Play into stream' };
  const src = (id: MixSourceId): MixSourceState => state.find(s => s.id === id) ?? { id, active: false, gain: 1, label: LABEL[id] };
  const deviceOk = canShareDeviceAudio();

  // Reflect the media element's play state (it can end on its own).
  useEffect(() => {
    const el = mixer?.media;
    if (!el) { setPlaying(false); return; }
    const on = () => setPlaying(!el.paused);
    el.addEventListener('play', on); el.addEventListener('pause', on); el.addEventListener('ended', on);
    on();
    return () => { el.removeEventListener('play', on); el.removeEventListener('pause', on); el.removeEventListener('ended', on); };
  }, [mixer, state]);

  const shareDevice = async () => {
    setMsg('');
    const m = await ensureMixer();
    const ok = await m.shareDeviceAudio();
    if (!ok) setMsg('No audio was shared. In the picker, choose a tab or your screen and turn on "Share audio".');
  };
  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    const m = await ensureMixer();
    m.playMedia(f);
    setMediaName(f.name);
  };

  return (
    <div className={`fixed inset-x-0 bottom-0 z-[60] bg-zinc-950/95 backdrop-blur border-t border-white/10 rounded-t-3xl p-4 ${compact ? 'max-h-[60dvh]' : 'max-h-[75dvh]'} overflow-y-auto`}
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-white">Sound</p>
          <p className="text-[10px] text-white/50">Share audio into the stream and keep talking over it.</p>
        </div>
        <button onClick={onClose} aria-label="Close sound" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70"><X size={15} /></button>
      </div>

      <div className="space-y-2">
        <SourceRow mixer={mixer} s={src("mic")} icon={<Mic size={15} />}>
          <span className="text-[10px] text-white/40">{mixer ? 'Mixed' : 'Direct'}</span>
        </SourceRow>

        <SourceRow mixer={mixer} s={src("device")} icon={<MonitorSpeaker size={15} />}>
          {src('device')?.active
            ? <button onClick={() => mixer?.remove('device')} className="px-2.5 py-1 rounded-full bg-red-500/80 text-white text-[9px] font-black uppercase">Stop</button>
            : deviceOk
              ? <button onClick={shareDevice} className="px-2.5 py-1 rounded-full bg-white text-black text-[9px] font-black uppercase">Share</button>
              : <span className="text-[10px] text-white/40">Computer only</span>}
        </SourceRow>
        {!deviceOk && (
          <p className="text-[10px] text-white/45 px-1">
            Phone browsers can't capture other apps' sound. Use <b className="text-white/70">Play into stream</b> below to share music or a clip from your phone.
          </p>
        )}

        {src('screen')?.active && <SourceRow mixer={mixer} s={src("screen")} icon={<MonitorSpeaker size={15} />} />}

        <SourceRow mixer={mixer} s={src("media")} icon={<Music size={15} />}>
          {src('media')?.active ? (
            <div className="flex items-center gap-1">
              <button aria-label={playing ? 'Pause' : 'Play'} onClick={() => { const el = mixer?.media; if (!el) return; el.paused ? el.play().catch(() => {}) : el.pause(); }}
                className="w-7 h-7 rounded-full bg-white text-black flex items-center justify-center">{playing ? <Pause size={12} /> : <Play size={12} />}</button>
              <button aria-label="Stop" onClick={() => { mixer?.stopMedia(); setMediaName(''); }}
                className="w-7 h-7 rounded-full bg-white/15 text-white flex items-center justify-center"><Square size={11} /></button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} className="px-2.5 py-1 rounded-full bg-white text-black text-[9px] font-black uppercase flex items-center gap-1"><Upload size={10} /> Pick</button>
          )}
        </SourceRow>
        {mediaName && src('media')?.active && <p className="text-[10px] text-white/50 px-1 truncate">Playing: {mediaName}</p>}
        <input ref={fileRef} type="file" accept="audio/*,video/*" className="hidden" onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />

        {mixer && (
          <div className="flex gap-2 pt-1">
            <button onClick={() => { mixer.ducking = !mixer.ducking; force(n => n + 1); }}
              className={`flex-1 px-3 py-2 rounded-full text-[10px] font-black uppercase ${mixer.ducking ? 'bg-white text-black' : 'bg-white/10 text-white/70'}`}>
              Lower music when I talk
            </button>
            <button onClick={() => { mixer.setMonitor(!mixer.monitoring); force(n => n + 1); }}
              className={`px-3 py-2 rounded-full text-[10px] font-black uppercase flex items-center gap-1 ${mixer.monitoring ? 'bg-white text-black' : 'bg-white/10 text-white/70'}`}>
              <Headphones size={12} /> Hear it
            </button>
          </div>
        )}
        {mixer?.monitoring && <p className="text-[10px] text-amber-300/80 px-1">Use headphones, or your mic will pick the music up twice.</p>}
        {msg && <p className="text-[10px] text-amber-300 px-1">{msg}</p>}
        <p className="text-[9px] text-white/35 px-1 pt-1">Only share music and clips you have the rights to stream.</p>
      </div>
    </div>
  );
}
