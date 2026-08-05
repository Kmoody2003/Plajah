/**
 * BrowserStreamCapture — no-OBS live streaming via Mux WHIP
 *
 * WebRTC-HTTP Ingest Protocol (WHIP) lets a browser send a live stream
 * directly to Mux using getUserMedia + RTCPeerConnection.
 * No OBS, no RTMP software, no screen-capture app required.
 *
 * How it works:
 *   1. getUserMedia() → camera + mic MediaStream
 *   2. RTCPeerConnection → addTrack for video + audio
 *   3. createOffer() → POST offer SDP to Mux WHIP endpoint
 *   4. Mux returns answer SDP → setRemoteDescription
 *   5. WebRTC negotiation complete → stream is live on Mux
 *
 * Usage: drop <BrowserStreamCapture streamId={muxStreamId} onEnd={() => {}} />
 * alongside a PlajahLivePlayer showing the same playbackId.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Mic, MicOff, VideoOff, MonitorStop, Loader2, AlertCircle, Check, Settings, Radio, Monitor } from 'lucide-react';
import { auth } from '../services/firebase';

interface Props {
  /** Mux live stream ID — used to build the WHIP endpoint URL */
  streamId: string;
  /** Mux stream key — required for WHIP auth */
  streamKey: string;
  onStreamStart?: () => void;
  onStreamEnd?: () => void;
  onError?: (msg: string) => void;
}

type StreamState = 'idle' | 'requesting' | 'connecting' | 'live' | 'error' | 'ended';

const WHIP_ENDPOINT = (streamId: string, streamKey: string) =>
  `https://global-api.mux.com/whip/${streamId}?key=${streamKey}`;

// Quality presets
const QUALITY_PRESETS = {
  '720p':  { width: 1280, height: 720,  frameRate: 30, videoBps: 2_500_000, audioBps: 128_000 },
  '1080p': { width: 1920, height: 1080, frameRate: 30, videoBps: 4_500_000, audioBps: 192_000 },
  '480p':  { width: 854,  height: 480,  frameRate: 30, videoBps: 1_200_000, audioBps: 96_000  },
};
type Quality = keyof typeof QUALITY_PRESETS;

export default function BrowserStreamCapture({ streamId, streamKey, onStreamStart, onStreamEnd, onError }: Props) {
  const [state, setState] = useState<StreamState>('idle');
  const [error, setError] = useState('');
  const [quality, setQuality] = useState<Quality>('720p');
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [duration, setDuration] = useState(0);
  const [screenShare, setScreenShare] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState('');
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('');
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);

  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Enumerate devices on mount
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
      setAudioDevices(devices.filter(d => d.kind === 'audioinput'));
    }).catch(() => {});
  }, []);

  // Duration timer
  useEffect(() => {
    if (state === 'live') {
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state]);

  const getStream = useCallback(async (): Promise<MediaStream> => {
    const q = QUALITY_PRESETS[quality];
    if (screenShare) {
      const screen = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { width: { ideal: q.width }, height: { ideal: q.height }, frameRate: { ideal: q.frameRate } },
        audio: true,
      });
      return screen;
    }
    return navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: selectedVideoDevice ? { exact: selectedVideoDevice } : undefined,
        width: { ideal: q.width }, height: { ideal: q.height },
        frameRate: { ideal: q.frameRate },
      },
      audio: {
        deviceId: selectedAudioDevice ? { exact: selectedAudioDevice } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 48_000,
      },
    });
  }, [quality, screenShare, selectedVideoDevice, selectedAudioDevice]);

  const startStream = useCallback(async () => {
    setState('requesting');
    setError('');
    setDuration(0);

    try {
      // 1. Get local media
      const stream = await getStream();
      streamRef.current = stream;

      // 2. Preview
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        previewRef.current.muted = true;
      }

      setState('connecting');

      // 3. Set up RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        bundlePolicy: 'max-bundle',
      });
      pcRef.current = pc;

      // Apply bitrate constraints via SDP munging after offer
      const q = QUALITY_PRESETS[quality];
      stream.getTracks().forEach(track => {
        const sender = pc.addTrack(track, stream);
        if (track.kind === 'video') {
          const params = sender.getParameters();
          if (!params.encodings) params.encodings = [{}];
          params.encodings[0].maxBitrate = q.videoBps;
          sender.setParameters(params).catch(() => {});
        } else if (track.kind === 'audio') {
          const params = sender.getParameters();
          if (!params.encodings) params.encodings = [{}];
          params.encodings[0].maxBitrate = q.audioBps;
          sender.setParameters(params).catch(() => {});
        }
      });

      // 4. Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering
      await new Promise<void>(resolve => {
        if (pc.iceGatheringState === 'complete') { resolve(); return; }
        const check = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', check); resolve(); } };
        pc.addEventListener('icegatheringstatechange', check);
        setTimeout(resolve, 5000); // 5s timeout
      });

      // 5. POST offer SDP to Mux WHIP endpoint
      const whipUrl = WHIP_ENDPOINT(streamId, streamKey);
      const whipRes = await fetch(whipUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          Authorization: `Bearer ${streamKey}`,
        },
        body: pc.localDescription?.sdp,
      });

      if (!whipRes.ok) {
        const text = await whipRes.text();
        throw new Error(`WHIP error ${whipRes.status}: ${text}`);
      }

      // 6. Set remote description from Mux answer
      const answerSdp = await whipRes.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      setState('live');
      onStreamStart?.();

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setError('WebRTC connection lost');
          setState('error');
          onError?.('WebRTC connection lost');
        }
      };
    } catch (err: any) {
      console.error('[WHIP] Stream start failed:', err);
      const msg = err.name === 'NotAllowedError'
        ? 'Camera/mic access denied. Allow permissions and try again.'
        : err.message ?? 'Stream failed to start';
      setError(msg);
      setState('error');
      onError?.(msg);
    }
  }, [getStream, streamId, streamKey, quality, onStreamStart, onError]);

  const stopStream = useCallback(() => {
    // Close WHIP connection
    pcRef.current?.close();
    pcRef.current = null;
    // Stop all tracks
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
    setState('ended');
    onStreamEnd?.();
  }, [onStreamEnd]);

  const toggleMic = () => {
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !micEnabled; });
    setMicEnabled(v => !v);
  };

  const toggleCam = () => {
    streamRef.current?.getVideoTracks().forEach(t => { t.enabled = !camEnabled; });
    setCamEnabled(v => !v);
  };

  const fmtDuration = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
      : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  const isStreaming = state === 'live';

  return (
    <div className="bg-[#0a0a0a] border border-white/8 rounded-2xl overflow-hidden">
      {/* Preview */}
      <div className="relative aspect-video bg-black">
        <video ref={previewRef} autoPlay playsInline muted className="w-full h-full object-cover"/>

        {/* Overlays */}
        {state === 'idle' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Camera size={32} className="text-white/15 mx-auto mb-2"/>
              <p className="text-white/20 text-sm">Camera preview will appear here</p>
            </div>
          </div>
        )}
        {(state === 'requesting' || state === 'connecting') && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={24} className="text-orange-400 animate-spin"/>
              <p className="text-white/60 text-sm">{state === 'requesting' ? 'Requesting camera access…' : 'Connecting to Mux WHIP…'}</p>
            </div>
          </div>
        )}
        {state === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="flex flex-col items-center gap-2 text-center px-8">
              <AlertCircle size={24} className="text-red-400"/>
              <p className="text-red-400 text-sm">{error}</p>
              <button onClick={() => setState('idle')} className="mt-2 px-4 py-1.5 bg-white/10 rounded-lg text-xs text-white/70 hover:bg-white/15 transition-colors">
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Live indicators */}
        {isStreaming && (
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-red-600 px-2.5 py-1 rounded-lg">
              <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping"/>
              <span className="text-white text-[9px] font-black uppercase tracking-widest">Live</span>
            </div>
            <div className="bg-black/60 backdrop-blur px-2 py-1 rounded-lg text-white text-[10px] font-mono">
              {fmtDuration(duration)}
            </div>
          </div>
        )}

        {!micEnabled && isStreaming && (
          <div className="absolute bottom-3 left-3 bg-red-600/80 backdrop-blur px-2 py-1 rounded-lg flex items-center gap-1">
            <MicOff size={10} className="text-white"/>
            <span className="text-[9px] text-white font-bold">Muted</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 space-y-3">
        {/* Quality + device settings */}
        {!isStreaming && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1">
              {(Object.keys(QUALITY_PRESETS) as Quality[]).map(q => (
                <button key={q} onClick={() => setQuality(q)}
                  className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${quality === q ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : 'border-white/10 text-white/30 hover:text-white'}`}>
                  {q}
                </button>
              ))}
            </div>
            <button onClick={() => setScreenShare(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors ${screenShare ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'border-white/10 text-white/30 hover:text-white'}`}>
              <Monitor size={11}/> {screenShare ? 'Screen share ON' : 'Screen share'}
            </button>
            <button onClick={() => setShowDeviceSettings(v => !v)}
              className="ml-auto p-1.5 rounded-lg border border-white/10 text-white/30 hover:text-white transition-colors">
              <Settings size={13}/>
            </button>
          </div>
        )}

        {/* Device pickers */}
        {showDeviceSettings && !isStreaming && (
          <div className="space-y-2 p-3 bg-white/[0.03] border border-white/5 rounded-xl">
            <div>
              <div className="text-[9px] text-white/30 uppercase tracking-wider mb-1">Camera</div>
              <select value={selectedVideoDevice} onChange={e => setSelectedVideoDevice(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none">
                <option value="">Default camera</option>
                {videoDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0,8)}</option>)}
              </select>
            </div>
            <div>
              <div className="text-[9px] text-white/30 uppercase tracking-wider mb-1">Microphone</div>
              <select value={selectedAudioDevice} onChange={e => setSelectedAudioDevice(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none">
                <option value="">Default mic</option>
                {audioDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0,8)}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Main action buttons */}
        <div className="flex items-center gap-2">
          {!isStreaming ? (
            <button onClick={startStream} disabled={state === 'requesting' || state === 'connecting'}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-colors disabled:opacity-50">
              <Radio size={15}/>
              {state === 'connecting' ? 'Connecting…' : 'Go Live (No OBS needed)'}
            </button>
          ) : (
            <>
              <button onClick={toggleMic}
                className={`p-2.5 rounded-xl border transition-colors ${micEnabled ? 'border-white/10 text-white/60 hover:text-white' : 'border-red-500/40 bg-red-500/10 text-red-400'}`}>
                {micEnabled ? <Mic size={15}/> : <MicOff size={15}/>}
              </button>
              <button onClick={toggleCam}
                className={`p-2.5 rounded-xl border transition-colors ${camEnabled ? 'border-white/10 text-white/60 hover:text-white' : 'border-red-500/40 bg-red-500/10 text-red-400'}`}>
                {camEnabled ? <Camera size={15}/> : <VideoOff size={15}/>}
              </button>
              <button onClick={stopStream}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 hover:bg-red-600 hover:border-red-600 text-white/70 hover:text-white font-bold rounded-xl transition-colors">
                <MonitorStop size={15}/> End stream
              </button>
            </>
          )}
        </div>

        {state === 'ended' && (
          <div className="flex items-center gap-2 text-green-400 text-sm">
            <Check size={14}/> Stream ended · Duration: {fmtDuration(duration)}
          </div>
        )}

        <p className="text-[10px] text-white/20">
          Uses WebRTC WHIP — streams directly to Mux from your browser.
          No OBS, no RTMP software needed. Works on Chrome 94+, Edge 94+.
        </p>
      </div>
    </div>
  );
}
