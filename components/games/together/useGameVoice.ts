// Game voice — party, team, match and realtime-room voice on LiveKit (services/meetings/livekitSession.ts). The
// server mints a token only for members/players who aren't on child accounts (routes/gamerTogether.ts →
// POST /chat/voice) and lists anyone this listener has blocked, whom the session then drops.
// Audio only. Push-to-talk: hold V (outside text boxes) or hold the talk button.
// `spatial` turns on proximity voice (services/gamerNet/spatialVoice.ts): the game feeds positions through
// voice.spatial.setListener / setPeer and far-away players fade out.

import { useCallback, useEffect, useRef, useState } from 'react';
import { chat, failed } from '../../../services/gamerNet/togetherClient';
import type { SpatialOpts, SpatialVoice, Vec3 } from '../../../services/gamerNet/spatialVoice';

export type VoiceStatus = 'off' | 'connecting' | 'on' | 'unavailable' | 'error';
type Session = { join(): Promise<void>; leave(): Promise<void>; setAudioEnabled(on: boolean): void; setExcludedPeers(ids: string[]): void };

export interface SpatialControl {
  setListener(pos: Vec3, forward?: Vec3): void;
  setPeer(id: string, pos: Vec3 | null): void;
  inRange(): string[];
}

export interface GameVoice {
  status: VoiceStatus;
  error: string;
  muted: boolean;
  ptt: boolean;
  talking: boolean;
  speakers: string[];
  peers: string[];
  /** Remote voices by uid (for the party → stream mix). */
  streams: Map<string, MediaStream>;
  /** Present while connected in spatial mode. */
  spatial: SpatialControl | null;
  join(): Promise<void>;
  leave(): void;
  toggleMute(): void;
  setPtt(on: boolean): void;
  /** Push-to-talk hold (button). */
  hold(on: boolean): void;
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};

export function useGameVoice(scope: string | null, displayName?: string, opts: { spatial?: boolean | SpatialOpts } = {}): GameVoice {
  const [status, setStatus] = useState<VoiceStatus>('off');
  const [error, setError] = useState('');
  const [muted, setMutedState] = useState(false);
  const [ptt, setPttState] = useState(false);
  const [talking, setTalking] = useState(false);
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [peers, setPeers] = useState<string[]>([]);
  const [streams, setStreams] = useState<Map<string, MediaStream>>(() => new Map());
  const [spatial, setSpatial] = useState<SpatialControl | null>(null);
  const session = useRef<Session | null>(null);
  const audios = useRef(new Map<string, HTMLAudioElement>());
  const space = useRef<SpatialVoice | null>(null);
  const state = useRef({ muted: false, ptt: false, held: false });
  const spatialOpt = opts.spatial;

  const applyMic = useCallback(() => {
    const s = state.current;
    const on = !s.muted && (!s.ptt || s.held);
    session.current?.setAudioEnabled(on);
    setTalking(on && s.ptt);
  }, []);

  const dropAudio = (id?: string) => {
    for (const [peer, el] of audios.current) {
      if (id && peer !== id) continue;
      el.pause(); el.srcObject = null; el.remove(); audios.current.delete(peer);
    }
    if (space.current) { if (id) space.current.remove(id); }
    setStreams(prev => { if (!id) return new Map(); if (!prev.has(id)) return prev; const n = new Map(prev); n.delete(id); return n; });
  };

  const leave = useCallback(() => {
    const s = session.current; session.current = null;
    void s?.leave().catch(() => {});
    dropAudio();
    space.current?.dispose(); space.current = null; setSpatial(null);
    setPeers([]); setSpeakers([]); setTalking(false);
    setStatus(st => (st === 'unavailable' ? st : 'off'));
  }, []);

  const join = useCallback(async () => {
    if (!scope || session.current) return;
    setError(''); setStatus('connecting');
    const g = await chat.voice(scope);
    if (failed(g)) { setStatus(g.httpStatus === 503 ? 'unavailable' : 'error'); setError(g.error); return; }
    try {
      const [{ LiveKitSession }, sv] = await Promise.all([
        import('../../../services/meetings/livekitSession'),
        spatialOpt ? import('../../../services/gamerNet/spatialVoice') : Promise.resolve(null),
      ]);
      if (sv) {
        const sp = new sv.SpatialVoice(typeof spatialOpt === 'object' ? spatialOpt : {});
        space.current = sp;
        setSpatial({ setListener: (p, f) => sp.setListener(p, f), setPeer: (id, p) => sp.setPeer(id, p), inRange: () => sp.inRange() });
      }
      const s = new LiveKitSession(
        { sessionId: g.room, topology: 'mesh', role: 'participant', media: { audio: true, video: false }, collectionName: 'gamer_voice', displayName },
        {
          onRemoteStream: (peer, stream) => {
            if (space.current) space.current.add(peer, stream);
            else {
              let el = audios.current.get(peer);
              if (!el) { el = document.createElement('audio'); el.autoplay = true; el.style.display = 'none'; document.body.appendChild(el); audios.current.set(peer, el); }
              el.srcObject = stream; void el.play().catch(() => {});
            }
            setStreams(prev => new Map(prev).set(peer, stream));
            setPeers(p => (p.includes(peer) ? p : [...p, peer]));
          },
          onPeerLeft: peer => { dropAudio(peer); setPeers(p => p.filter(x => x !== peer)); },
          onActiveSpeakers: ids => setSpeakers(ids),
          onError: e => { setError(e.message || 'Voice failed'); },
        },
        { url: g.url, token: g.token, room: g.room, identity: g.identity, cap: g.cap },
      );
      if (g.exclude?.length) s.setExcludedPeers(g.exclude);
      session.current = s;
      await s.join();
      if (session.current !== s) return;
      applyMic();
      space.current?.resume();
      setStatus('on');
    } catch (e: any) {
      session.current = null; dropAudio();
      space.current?.dispose(); space.current = null; setSpatial(null);
      setStatus('error'); setError(e?.message || 'Could not start voice — check your microphone');
    }
  }, [scope, displayName, applyMic, spatialOpt]);

  const toggleMute = useCallback(() => { state.current.muted = !state.current.muted; setMutedState(state.current.muted); applyMic(); }, [applyMic]);
  const setPtt = useCallback((on: boolean) => { state.current.ptt = on; state.current.held = false; setPttState(on); applyMic(); }, [applyMic]);
  const hold = useCallback((on: boolean) => { if (!state.current.ptt) return; state.current.held = on; applyMic(); }, [applyMic]);

  // Hold V to talk while push-to-talk is on.
  useEffect(() => {
    if (!ptt || status !== 'on') return;
    const down = (e: KeyboardEvent) => { if ((e.key === 'v' || e.key === 'V') && !e.repeat && !isTyping(e.target)) hold(true); };
    const up = (e: KeyboardEvent) => { if (e.key === 'v' || e.key === 'V') hold(false); };
    const blur = () => hold(false);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [ptt, status, hold]);

  // Leave when the scope changes or the component goes away.
  useEffect(() => () => leave(), [scope, leave]);

  return { status, error, muted, ptt, talking, speakers, peers, streams, spatial, join, leave, toggleMute, setPtt, hold };
}
