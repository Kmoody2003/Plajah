import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AudioTrack, AudioClip, IAMFMetadata, SerializedTrack } from './types';
// PCM16 WAV encoding comes from the shared encoder (byte-identical to the old inline one).
import { encodeWav } from '../../services/audio/wavEncode';

// Settings applied to a track when rebuilt from a saved project.
interface TrackSeed {
  name: string;
  position?: [number, number, number];
  volume?: number;
  muted?: boolean;
  eq?: { low: number; mid: number; high: number };
  iamf?: IAMFMetadata;
  sourceUrl?: string;
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

  // Build a fully-wired track from a decoded buffer + optional saved settings.
  const buildTrack = (ctx: BaseAudioContext, master: AudioNode, buffer: AudioBuffer | null, seed: TrackSeed, file?: File | null): AudioTrack => {
    const pos = seed.position ?? [0, 0, 2];
    const vol = seed.volume ?? 0.8;
    const muted = seed.muted ?? false;
    const gainNode = (ctx as AudioContext).createGain();
    const panner = (ctx as AudioContext).createPanner();
    const analyser = (ctx as AudioContext).createAnalyser(); analyser.fftSize = 256;
    const low = (ctx as AudioContext).createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 200;
    const mid = (ctx as AudioContext).createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 1;
    const high = (ctx as AudioContext).createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 5000;
    const compressor = (ctx as AudioContext).createDynamicsCompressor();
    compressor.threshold.value = -24; compressor.knee.value = 30; compressor.ratio.value = 12; compressor.attack.value = 0.003; compressor.release.value = 0.25;

    panner.connect(low); low.connect(mid); mid.connect(high); high.connect(compressor); compressor.connect(gainNode); gainNode.connect(analyser); analyser.connect(master);
    panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse'; panner.refDistance = 1; panner.maxDistance = 10000; panner.rolloffFactor = 1;
    panner.positionX.value = pos[0]; panner.positionY.value = pos[1]; panner.positionZ.value = pos[2];
    if (seed.eq) { low.gain.value = seed.eq.low; mid.gain.value = seed.eq.mid; high.gain.value = seed.eq.high; }
    gainNode.gain.value = muted ? 0 : vol;

    const clips: AudioClip[] = buffer ? [{ id: uuidv4(), name: seed.name, buffer, startTime: 0, duration: buffer.duration, offset: 0 }] : [];
    return {
      id: uuidv4(), name: seed.name, url: '', file: file ?? null, sourceUrl: seed.sourceUrl, buffer, clips,
      position: pos, volume: vol, muted,
      panner, gainNode, sourceNodes: [], plugins: [], analyser, eq: { low, mid, high }, dynamics: { compressor },
      automation: [{ parameter: 'volume', keyframes: [] }, { parameter: 'positionX', keyframes: [] }, { parameter: 'positionY', keyframes: [] }, { parameter: 'positionZ', keyframes: [] }],
      iamf: seed.iamf ?? { id: uuidv4(), groupType: 'object', priority: 1 },
    };
  };

  const addTrack = async (file?: File) => {
    const ctx = audioContextRef.current; if (!ctx || !masterGainRef.current) return;
    let buffer: AudioBuffer | null = null; let name = 'New Track';
    if (file) { buffer = await ctx.decodeAudioData(await file.arrayBuffer()); name = file.name.replace(/\.[^/.]+$/, ''); }
    const newTrack = buildTrack(ctx, masterGainRef.current, buffer, { name }, file);
    setTracks(prev => [...prev, newTrack]);
  };

  // Rebuild a track from a saved project: fetch the stem, decode, restore settings.
  const addTrackFromSource = async (seed: SerializedTrack): Promise<boolean> => {
    const ctx = audioContextRef.current; if (!ctx || !masterGainRef.current || !seed.sourceUrl) return false;
    try {
      const res = await fetch(seed.sourceUrl);
      const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
      const t = buildTrack(ctx, masterGainRef.current, buffer, {
        name: seed.name, position: seed.position, volume: seed.volume, muted: seed.muted, eq: seed.eq, iamf: seed.iamf, sourceUrl: seed.sourceUrl,
      });
      setTracks(prev => [...prev, t]);
      return true;
    } catch { return false; }
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

  // Render the full spatial mix (HRTF binaural fold-down) to a WAV Blob. This is a real,
  // universally-playable master — the audio Chora hosts/plays today.
  const renderMixToBlob = async (): Promise<Blob | null> => {
    if (!audioContextRef.current || tracks.length === 0) return null;
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
    return encodeWav(rendered, 16);
  };

  // IAMF/Eclipsa authoring descriptor (scene/object groups + spatial mix config).
  // Note: this is the authoring metadata, not a compiled .iamf bitstream (that needs a
  // native/WASM IAMF encoder — deferred). It rides alongside the WAV master so a true
  // IAMF encode can happen later without re-authoring.
  const buildIAMFProject = () => ({
    common: { version: '1.0', audio_element_count: tracks.length },
    audio_elements: tracks.map(t => ({
      element_id: t.iamf?.id, name: t.name,
      element_type: t.iamf?.groupType === 'scene' ? 0 : 1, // 0=Scene, 1=Object
      priority: t.iamf?.priority ?? 1,
      mix_config: { gain: t.volume, pan: { x: t.position[0], y: t.position[1], z: t.position[2] } },
    })),
  });

  const exportMix = async () => {
    const blob = await renderMixToBlob(); if (!blob) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'spatial_mix.wav'; a.click();
  };

  const exportIAMF = async () => {
    const blob = new Blob([JSON.stringify(buildIAMFProject(), null, 2)], { type: 'application/iamf+json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'spatial_mix.iamf.json'; a.click();
  };

  // Firestore-safe arrangement of the current tracks (no AudioNodes / buffers). `sourceUrl`
  // is filled in by the persistence layer after each stem is uploaded to the locker.
  const serializeTracks = (): SerializedTrack[] => tracks.map(t => ({
    id: t.id, name: t.name, sourceUrl: t.sourceUrl || '',
    position: t.position, volume: t.volume, muted: t.muted,
    eq: { low: t.eq?.low.gain.value ?? 0, mid: t.eq?.mid.gain.value ?? 0, high: t.eq?.high.gain.value ?? 0 },
    iamf: t.iamf,
  }));

  // The live tracks (with their source File) — the persistence layer needs the File to upload.
  const getTracks = () => tracks;

  const clearTracks = () => setTracks(prev => {
    prev.forEach(t => t.sourceNodes.forEach(s => { try { s.stop(); } catch { /* */ } }));
    return [];
  });

  return {
    tracks, addTrack, addTrackFromSource, removeTrack, updateTrackPosition, updateTrackVolume, toggleMute, updateTrackEQ, updateIAMFMetadata,
    togglePlayback, isPlaying, currentTime, seek, masterVolume, setMasterVolume,
    exportMix, exportIAMF, renderMixToBlob, buildIAMFProject, serializeTracks, getTracks, clearTracks,
  };
}
