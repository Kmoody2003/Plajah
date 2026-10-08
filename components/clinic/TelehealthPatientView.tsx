import React, { useEffect, useRef, useState } from 'react';
import { Video, VideoOff, Mic, MicOff, PhoneOff, MessageSquare, Send, FlaskConical, User, Loader2 } from 'lucide-react';
import { VisitCall, type VisitChatMessage } from '../../services/clinic/telehealthCall';

interface Props {
  sessionId: string;
  patientName: string;
  /** Small picture-in-window used by the provider to preview what the patient sees on this device. */
  embedded?: boolean;
  onLeave?: () => void;
}

/** The patient's side of a (demo) telehealth visit: waiting room → live call with chat. */
export const TelehealthPatientView: React.FC<Props> = ({ sessionId, patientName, embedded, onLeave }) => {
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [providerHere, setProviderHere] = useState(false);
  const [providerName, setProviderName] = useState('your provider');
  const [state, setState] = useState<RTCPeerConnectionState>('new');
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chat, setChat] = useState<VisitChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const callRef = useRef<VisitCall | null>(null);
  const localEl = useRef<HTMLVideoElement>(null);
  const remoteEl = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // The embedded preview shares this device with the provider: no mic, and the remote is muted, or it would feed back.
    const call = new VisitCall(sessionId, 'patient', patientName, {
      onLocal: setLocal,
      onRemote: setRemote,
      onPeerLeft: () => setRemote(null),
      onPresence: (here, name) => { setProviderHere(here); if (name) setProviderName(name); },
      onState: setState,
      onChat: m => setChat(c => [...c, m]),
      onError: setError,
    }, { audio: !embedded });
    callRef.current = call;
    call.join().catch(() => { /* surfaced through onError */ });
    return () => { call.leave().catch(() => {}); callRef.current = null; };
  }, [sessionId, patientName, embedded]);

  useEffect(() => { if (localEl.current) localEl.current.srcObject = local; }, [local]);
  useEffect(() => { if (remoteEl.current) remoteEl.current.srcObject = remote; }, [remote]);

  const connected = state === 'connected' && !!remote;
  const send = () => { callRef.current?.sendChat(draft); setDraft(''); };
  const leave = () => { callRef.current?.leave().catch(() => {}); onLeave?.(); };

  return (
    <div className={`${embedded ? 'w-full h-full' : 'fixed inset-0 z-50'} bg-[#07030d] text-white flex flex-col overflow-hidden font-sans`}>
      {!embedded && (
        <div className="px-4 py-2 bg-amber-400/10 border-b border-amber-400/30 text-[11px] text-amber-100 flex items-center gap-2">
          <FlaskConical size={13} className="text-amber-300" /> <b className="uppercase tracking-wider text-amber-300">Demo visit</b> — a demonstration with a fictional patient. Not a real medical visit.
        </div>
      )}
      <div className="relative flex-1 bg-black flex items-center justify-center">
        <video ref={remoteEl} autoPlay playsInline muted={!!embedded} className={`w-full h-full object-cover ${connected ? 'block' : 'hidden'}`} />
        {!connected && (
          <div className="text-center p-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-tr from-[#6B0099] via-[#00DAF3] to-[#06D6A0] flex items-center justify-center mb-3"><User size={30} /></div>
            <h3 className={`${embedded ? 'text-sm' : 'text-xl'} font-black font-['Space_Grotesk']`}>
              {providerHere ? 'Connecting…' : 'Waiting room'}
            </h3>
            <p className="text-xs text-white/50 mt-1 flex items-center justify-center gap-1.5">
              <Loader2 size={12} className="animate-spin" /> {providerHere ? `Joining ${providerName}` : 'Your provider will admit you shortly'}
            </p>
            {error && <p className="text-xs text-red-300 mt-3 max-w-xs mx-auto">{error}</p>}
          </div>
        )}

        <div className={`absolute ${embedded ? 'bottom-1 right-1 w-16 h-12' : 'top-4 right-4 w-32 h-24 sm:w-40 sm:h-28'} rounded-xl overflow-hidden border border-[#00DAF3] bg-black`}>
          <video ref={localEl} autoPlay muted playsInline className={`w-full h-full object-cover scale-x-[-1] ${camOff ? 'hidden' : 'block'}`} />
          {camOff && <div className="w-full h-full flex items-center justify-center text-white/40"><VideoOff size={16} /></div>}
        </div>

        {!embedded && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-2xl bg-black/80 border border-white/20 backdrop-blur">
            <button onClick={() => { const m = !muted; setMuted(m); callRef.current?.setMuted(m); }} className={`p-3 rounded-xl ${muted ? 'bg-red-500' : 'bg-white/10 hover:bg-white/20'}`} aria-label={muted ? 'Unmute' : 'Mute'}>{muted ? <MicOff size={18} /> : <Mic size={18} />}</button>
            <button onClick={() => { const o = !camOff; setCamOff(o); callRef.current?.setVideoOff(o); }} className={`p-3 rounded-xl ${camOff ? 'bg-red-500' : 'bg-white/10 hover:bg-white/20'}`} aria-label={camOff ? 'Camera on' : 'Camera off'}>{camOff ? <VideoOff size={18} /> : <Video size={18} />}</button>
            <button onClick={() => setChatOpen(o => !o)} className={`p-3 rounded-xl ${chatOpen ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'}`} aria-label="Chat"><MessageSquare size={18} /></button>
            <button onClick={leave} className="p-3 rounded-xl bg-red-500 hover:bg-red-600" aria-label="Leave visit"><PhoneOff size={18} /></button>
          </div>
        )}

        {!embedded && chatOpen && (
          <div className="absolute right-4 bottom-24 w-72 max-h-[50%] rounded-2xl bg-[#0c0617]/95 border border-white/10 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
              {chat.length === 0 && <p className="text-white/40">Visit chat. Messages are not saved in the demo.</p>}
              {chat.map(m => (
                <div key={m.id} className={m.who === 'me' ? 'text-right' : ''}>
                  <span className={`inline-block px-2.5 py-1.5 rounded-xl ${m.who === 'me' ? 'bg-[#00DAF3] text-black' : 'bg-white/10'}`}>{m.text}</span>
                </div>
              ))}
            </div>
            <div className="p-2 flex gap-1.5 border-t border-white/10">
              <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Message…" className="flex-1 bg-white/5 rounded-lg px-2 py-1.5 text-xs outline-none" />
              <button onClick={send} className="p-2 rounded-lg bg-[#00DAF3] text-black" aria-label="Send"><Send size={13} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TelehealthPatientView;
