import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Volume2, Sparkles, Scissors, Clock, Film } from 'lucide-react';
import { plajahAudioCore } from '../../services/voice/plajahAudioCore';

export interface SlateTake {
  takeNum: number;
  label: string;
  dur: number;
  emotion: 'urgent' | 'neutral' | 'whisper' | 'intense';
}

export interface SlateScriptLine {
  id: string;
  speakerName: string;
  emotion: string;
  text: string;
  selectedTake: number;
  takes: SlateTake[];
}

interface SlateWaveformVisualizerProps {
  line: SlateScriptLine;
  take: SlateTake;
  isSelected: boolean;
  onSelectTake?: () => void;
  onSnapTake?: () => void;
  onGenerateWanVideoShot?: (snapDuration: number) => void;
  voiceEngine?: 'kokoro' | 'fish_speech';
}

export const SlateWaveformVisualizer: React.FC<SlateWaveformVisualizerProps> = ({
  line,
  take,
  isSelected,
  onSelectTake,
  onSnapTake,
  voiceEngine = 'kokoro',
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0); // 0 to 1
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Generate pseudo-deterministic speech peaks for the waveform based on line text & take number
  const peaks = React.useMemo(() => {
    const numBars = 48;
    const result: number[] = [];
    const seed = (line.text.length * 13 + take.takeNum * 37) % 100;
    
    for (let i = 0; i < numBars; i++) {
      // Create envelope with natural speech pauses and syllabic bursts
      const pos = i / numBars;
      const envelope = Math.sin(pos * Math.PI); // Attack and decay
      const syllableBurst = Math.sin(pos * 18 + seed) > 0.2 ? 1 : 0.35;
      const noise = ((Math.sin(i * 99 + seed) + 1) / 2) * 0.45;
      
      let height = (0.2 + 0.8 * envelope * syllableBurst + noise) * 0.9;
      if (take.emotion === 'whisper') height *= 0.6;
      if (take.emotion === 'urgent') height = Math.min(1.0, height * 1.25);
      
      result.push(Math.max(0.12, Math.min(1.0, height)));
    }
    return result;
  }, [line.text, take.takeNum, take.emotion]);

  // Video Shot Snap duration: vocal duration + 300ms pre/post editorial cradle
  const snapDuration = Number((take.dur + 0.6).toFixed(2));

  // Primary speaker tint
  const speakerColor = line.speakerName.toLowerCase().includes('aria') ? '#00DAF3' : '#FF8C00';

  const handleToggleAudition = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    try {
      setIsPlaying(true);
      const res = await plajahAudioCore.synthesizeFabulaDialogue({
        text: line.text,
        speakerName: line.speakerName,
        emotion: take.emotion,
        takeIndex: take.takeNum,
        engine: voiceEngine,
      });

      const audioUrl = URL.createObjectURL(res.audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setIsPlaying(false);
        setPlaybackProgress(0);
      };

      audio.play().catch(() => setIsPlaying(false));

      const updateProgress = () => {
        if (audio && !audio.paused && audio.duration) {
          setPlaybackProgress(audio.currentTime / audio.duration);
          animFrameRef.current = requestAnimationFrame(updateProgress);
        }
      };
      animFrameRef.current = requestAnimationFrame(updateProgress);
    } catch {
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  return (
    <div
      onClick={onSelectTake}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '8px 10px',
        borderRadius: '8px',
        background: isSelected ? 'rgba(255, 140, 0, 0.12)' : 'rgba(255, 255, 255, 0.03)',
        border: isSelected ? '1px solid #FF8C00' : '1px solid rgba(255, 255, 255, 0.08)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Top Header: Take Label, Duration & Editorial Snap Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={handleToggleAudition}
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              border: 'none',
              background: isPlaying ? '#FF8C00' : 'rgba(255, 255, 255, 0.1)',
              color: isPlaying ? '#000' : '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
            }}
            title={isPlaying ? 'Pause Audition' : 'Audition Take Audio'}
          >
            {isPlaying ? <Pause size={10} /> : <Play size={10} style={{ marginLeft: '1px' }} />}
          </button>
          <span style={{ fontSize: '11px', fontWeight: 600, color: isSelected ? '#fff' : '#cbd5e1' }}>
            {take.label}
          </span>
          <span style={{
            fontSize: '9px',
            textTransform: 'uppercase',
            padding: '1px 5px',
            borderRadius: '3px',
            background: 'rgba(255, 255, 255, 0.06)',
            color: 'rgba(255, 255, 255, 0.6)',
          }}>
            {take.emotion}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)', fontFamily: 'monospace' }}>
            <span>{take.dur}s</span>
            <span style={{ margin: '0 4px', opacity: 0.3 }}>/</span>
            <span style={{ color: '#06D6A0' }} title="Video Shot Snap Duration (with 300ms pre/post padding)">
              {snapDuration}s SNAP
            </span>
          </div>

          {onSnapTake && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSnapTake();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                fontSize: '10px',
                fontWeight: 700,
                borderRadius: '4px',
                border: 'none',
                background: isSelected ? '#FF8C00' : 'rgba(255, 140, 0, 0.25)',
                color: isSelected ? '#000' : '#FF8C00',
                cursor: 'pointer',
              }}
              title="Snap dialogue take and video cut duration directly to playhead"
            >
              <Scissors size={10} />
              <span>SNAP</span>
            </button>
          )}

          {onGenerateWanVideoShot && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onGenerateWanVideoShot(snapDuration);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 7px',
                fontSize: '10px',
                fontWeight: 700,
                borderRadius: '4px',
                border: '1px solid rgba(0, 218, 243, 0.4)',
                background: 'rgba(0, 218, 243, 0.15)',
                color: '#00DAF3',
                cursor: 'pointer',
              }}
              title="Generate Wan 2.1 video shot synced to this dialogue duration"
            >
              <Film size={10} />
              <span>WAN VIDEO</span>
            </button>
          )}
        </div>
      </div>

      {/* Waveform Visualization Canvas / SVG Container */}
      <div
        style={{
          position: 'relative',
          height: '32px',
          borderRadius: '4px',
          background: '#090a0d',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 6px',
          overflow: 'hidden',
        }}
      >
        {/* Editorial Pre-roll and Post-roll Cut Boundary Brackets */}
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '8px',
          borderRight: '1px dashed rgba(6, 214, 160, 0.4)',
          background: 'rgba(6, 214, 160, 0.05)',
        }} title="300ms Pre-Roll Video Cradle" />

        <div style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: '8px',
          borderLeft: '1px dashed rgba(6, 214, 160, 0.4)',
          background: 'rgba(6, 214, 160, 0.05)',
        }} title="300ms Post-Roll Video Cradle" />

        {/* Audio Peak Bars */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '0 6px',
        }}>
          {peaks.map((peak, idx) => {
            const barPos = idx / peaks.length;
            const isAuditioned = isPlaying && barPos <= playbackProgress;

            return (
              <div
                key={idx}
                style={{
                  width: '2px',
                  height: `${peak * 24}px`,
                  borderRadius: '1px',
                  backgroundColor: isAuditioned
                    ? '#fff'
                    : isSelected
                    ? speakerColor
                    : 'rgba(255, 255, 255, 0.25)',
                  boxShadow: isAuditioned ? `0 0 6px ${speakerColor}` : undefined,
                  transition: 'background-color 0.1s ease',
                }}
              />
            );
          })}
        </div>

        {/* Live Scrub/Playback Needle */}
        {isPlaying && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${playbackProgress * 100}%`,
              width: '1.5px',
              backgroundColor: '#fff',
              boxShadow: '0 0 6px rgba(255, 255, 255, 0.8)',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </div>
  );
};

export default SlateWaveformVisualizer;
