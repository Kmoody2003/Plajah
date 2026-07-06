import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AudioTrack, AudioClip, IAMFMetadata } from './types';

// Minimal WAV encoder (replaces the audiobuffer-to-wav dep; interleaves + PCM16).
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numCh = buffer.numberOfChannels, sr = buffer.sampleRate;
  const len = buffer.length * numCh * 2 + 44;
  const ab = new ArrayBuffer(len);
  const view = new DataView(ab);
  const chans: Float32Array[] = [];
  for (let i = 0; i < numCh; i++) chans.push(buffer.getChannelData(i));
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); view.setUint32(4, len - 8, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true); view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 2, true); view.setUint16(32, numCh * 2, true); view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, len - 44, true);
  let off = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, chans[ch][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2;
    }
  }
  return ab;
}

export function useSpatialAudioEngine() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [masterVolume, setMasterVolumeState] = useState(0.8);
  const masterGainRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      masterGainRef.current = audioContextRef.current.createGain();
      masterGainRef.current.connect(audioContextRef.current.destination);
      masterGainRef.current.gain.value = masterVolume;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tick = () => {
    if (audioContextRef.current && isPlaying) {
      setCurrentTime(audioContextRef.current.currentTime - startTimeRef.current);
      rafRef.current = requestAnimationFrame(tick);
    }
  };
  useEffect(() => {
    if (isPlaying) rafRef.current = requestAnimationFrame(tick);
    else if (rafRef.current) cancelAnimationFrame(rafRef.current);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  const setMasterVolume = (v: number) => { setMasterVolumeState(v); if (masterGainRef.current) masterGainRef.current.gain.value = v; };

  const addTrack = async (file?: File) => {
    const ctx = audioContextRef.current; if (!ctx || !masterGainRef.current) return;
    let buffer: AudioBuffer | null = null; let name = 'New Track';
    if (file) { buffer = await ctx.decodeAudioData(await file.arrayBuffer()); name = file.name.replace(/\.[^/.]+$/, ''); }

    const gainNode = ctx.createGain();
    const panner = ctx.createPanner();
    const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
    const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 200;
    const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 1;
    const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 5000;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24; compressor.knee.value = 30; compressor.ratio.value = 12; compressor.attack.value = 0.003; compressor.release.value = 0.25;

    panner.connect(low); low.connect(mid); mid.connect(high); high.connect(compressor); compressor.connect(gainNode); gainNode.connect(analyser); analyser.connect(masterGainRef.current);
    panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse'; panner.refDistance = 1; panner.maxDistance = 10000; panner.rolloffFactor = 1;
    panner.positionX.value = 0; panner.positionY.value = 0; panner.positionZ.value = 2;
    gainNode.gain.value = 0.8;

    const clips: AudioClip[] = buffer ? [{ id: uuidv4(), name, buffer, startTime: 0, duration: buffer.duration, offset: 0 }] : [];
    const newTrack: AudioTrack = {
      id: uuidv4(), name, url: '', buffer, clips, position: [0, 0, 2], volume: 0.8, muted: false,
      panner, gainNode, sourceNodes: [], plugins: [], analyser, eq: { low, mid, high }, dynamics: { compressor },
      automation: [{ parameter: 'volume', keyframes: [] }, { parameter: 'positionX', keyframes: [] }, { parameter: 'positionY', keyframes: [] }, { parameter: 'positionZ', keyframes: [] }],
      iamf: { id: uuidv4(), groupType: 'object', priority: 1 },
    };
    setTracks(prev => [...prev, newTrack]);
  };

  const updateTrackPosition = (id: string, position: [number, number, number]) =>
    setTracks(prev => prev.map(t => {
      if (t.id === id && t.panner) { t.panner.positionX.value = position[0]; t.panner.positionY.value = position[1]; t.panner.positionZ.value = position[2]; return { ...t, position }; }
      return t;
    }));

  const updateTrackVolume = (id: string, volume: number) =>
    setTracks(prev => prev.map(t => { if (t.id === id && t.gainNode && !t.muted) t.gainNode.gain.value = volume; return t.id === id ? { ...t, volume } : t; }));

  const toggleMute = (id: string) =>
    setTracks(prev => prev.map(t => { if (t.id === id && t.gainNode) { const m = !t.muted; t.gainNode.gain.value = m ? 0 : t.volume; return { ...t, muted: m }; } return t; }));

  const updateTrackEQ = (id: string, band: 'low' | 'mid' | 'high', value: number) =>
    setTracks(prev => prev.map(t => { if (t.id === id && t.eq) { t.eq[band].gain.value = value; return { ...t }; } return t; }));

  const updateIAMFMetadata = (id: string, metadata: Partial<IAMFMetadata>) =>
    setTracks(prev => prev.map(t => t.id === id ? { ...t, iamf: { ...(t.iamf as IAMFMetadata), ...metadata } } : t));

  const removeTrack = (id: string) => setTracks(prev => {
    const t = prev.find(x => x.id === id); t?.sourceNodes.forEach(s => { try { s.stop(); } catch { /* */ } });
    return prev.filter(x => x.id !== id);
  });

  const togglePlayback = (startTimeValue?: number) => {
    const ctx = audioContextRef.current; if (!ctx) return;
    if (isPlaying) {
      tracks.forEach(t => { t.sourceNodes.forEach(s => { try { s.stop(); } catch { /* */ } }); t.sourceNodes = []; });
      setIsPlaying(false);
    } else {
      if (ctx.state === 'suspended') ctx.resume();
      const startOffset = startTimeValue !== undefined ? startTimeValue : currentTime;
      startTimeRef.current = ctx.currentTime - startOffset;
      setCurrentTime(startOffset);
      setTracks(prev => prev.map(t => {
        const newSources: AudioBufferSourceNode[] = [];
        t.clips.forEach(clip => {
          if (clip.buffer && t.panner) {
            const clipEnd = clip.startTime + clip.duration;
            if (clipEnd > startOffset) {
              const source = ctx.createBufferSource(); source.buffer = clip.buffer; source.connect(t.panner);
              const bufferOffset = Math.max(0, startOffset - clip.startTime);
              const playDelay = Math.max(0, clip.startTime - startOffset);
              source.start(ctx.currentTime + playDelay, clip.offset + bufferOffset);
              newSources.push(source);
            }
          }
        });
        return { ...t, sourceNodes: newSources };
      }));
      setIsPlaying(true);
    }
  };

  const seek = (time: number) => {
    const was = isPlaying; if (was) togglePlayback();
    setCurrentTime(Math.max(0, time)); if (was) togglePlayback(Math.max(0, time));
  };

  const exportMix = async () => {
    if (!audioContextRef.current || tracks.length === 0) return;
    const duration = Math.max(...tracks.map(t => t.buffer?.duration || 0)) || 1;
    const offline = new OfflineAudioContext(2, Math.ceil(44100 * duration), 44100);
    for (const track of tracks) {
      if (!track.buffer || track.muted) continue;
      const src = offline.createBufferSource(); src.buffer = track.buffer;
      const panner = offline.createPanner(); panner.panningModel = 'HRTF';
      panner.positionX.value = track.position[0]; panner.positionY.value = track.position[1]; panner.positionZ.value = track.position[2];
      const gain = offline.createGain(); gain.gain.value = track.volume;
      src.connect(panner); panner.connect(gain); gain.connect(offline.destination); src.start(0);
    }
    const rendered = await offline.startRendering();
    const wav = audioBufferToWav(rendered);
    const blob = new Blob([new Uint8Array(wav)], { type: 'audio/wav' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'spatial_mix.wav'; a.click();
  };

  // IAMF/Eclipsa project descriptor (scene/object groups + spatial mix config).
  const exportIAMF = async () => {
    const project = {
      common: { version: '1.0', audio_element_count: tracks.length },
      audio_elements: tracks.map(t => ({
        element_id: t.iamf?.id, name: t.name,
        element_type: t.iamf?.groupType === 'scene' ? 0 : 1, // 0=Scene, 1=Object
        priority: t.iamf?.priority ?? 1,
        mix_config: { gain: t.volume, pan: { x: t.position[0], y: t.position[1], z: t.position[2] } },
      })),
    };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/iamf+json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'spatial_mix.iamf.json'; a.click();
  };

  return {
    tracks, addTrack, removeTrack, updateTrackPosition, updateTrackVolume, toggleMute, updateTrackEQ, updateIAMFMetadata,
    togglePlayback, isPlaying, currentTime, seek, masterVolume, setMasterVolume, exportMix, exportIAMF,
  };
}
