import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Plus,
  Repeat,
  Sparkles,
  Sliders,
  Grid,
} from 'lucide-react';
import type { AnimaProject, AnimaLayer, Keyframe } from '../../../services/anima/types';

interface AnimaTimelineProps {
  project: AnimaProject;
  onUpdateProject: React.Dispatch<React.SetStateAction<AnimaProject>>;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onAddKeyframe?: (layerId: string, channelPath: string, value: number) => void;
  className?: string;
}

export const AnimaTimeline: React.FC<AnimaTimelineProps> = ({
  project,
  onUpdateProject,
  isPlaying,
  onTogglePlay,
  onAddKeyframe,
  className,
}) => {
  const [expandedLayers, setExpandedLayers] = useState<Record<string, boolean>>({
    l_hero: true,
  });
  const [autoKeyEnabled, setAutoKeyEnabled] = useState(true);
  const [zoom, setZoom] = useState(16); // pixels per frame
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);

  const rulerRef = useRef<HTMLDivElement>(null);
  const tracksScrollRef = useRef<HTMLDivElement>(null);

  const totalFrames = project.durationFrames || 72;
  const currentFrame = project.currentFrame || 1;
  const fps = project.fps || 24;

  const toggleLayerExpanded = (layerId: string) => {
    setExpandedLayers((prev) => ({ ...prev, [layerId]: !prev[layerId] }));
  };

  const handleFrameJump = useCallback(
    (targetFrame: number) => {
      const clamped = Math.max(1, Math.min(totalFrames, Math.round(targetFrame)));
      onUpdateProject((prev) => ({ ...prev, currentFrame: clamped }));
    },
    [totalFrames, onUpdateProject]
  );

  const handleRulerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsScrubbing(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollLeft = tracksScrollRef.current ? tracksScrollRef.current.scrollLeft : 0;
    const clickX = e.clientX - rect.left + scrollLeft;
    const targetFrame = clickX / zoom + 1;
    handleFrameJump(targetFrame);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isScrubbing || !rulerRef.current) return;
      const rect = rulerRef.current.getBoundingClientRect();
      const scrollLeft = tracksScrollRef.current ? tracksScrollRef.current.scrollLeft : 0;
      const moveX = e.clientX - rect.left + scrollLeft;
      const targetFrame = moveX / zoom + 1;
      handleFrameJump(targetFrame);
    };

    const handleMouseUp = () => {
      if (isScrubbing) setIsScrubbing(false);
    };

    if (isScrubbing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrubbing, zoom, handleFrameJump]);

  const handleToggleLayerVisibility = (layerId: string) => {
    onUpdateProject((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l)),
    }));
  };

  const handleToggleLayerLock = (layerId: string) => {
    onUpdateProject((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === layerId ? { ...l, locked: !l.locked } : l)),
    }));
  };

  const handleAddKeyAtCurrent = (layerId: string, channelKey: string) => {
    const targetSec = (currentFrame - 1) / fps;
    const newKeyId = `kf_${Date.now()}`;

    onUpdateProject((prev) => {
      return {
        ...prev,
        layers: prev.layers.map((l) => {
          if (l.id !== layerId) return l;
          const ch = l.channels[channelKey];
          if (!ch) return l;

          // Compute default value or current interpolated value
          let val = ch.defaultValue ?? 0;
          if (channelKey === 'transform.x') val = l.transform.x;
          else if (channelKey === 'transform.y') val = l.transform.y;
          else if (channelKey === 'transform.rotationZ') val = l.transform.rotationZ;
          else if (channelKey === 'opacity') val = l.opacity;

          const existingIdx = ch.keyframes.findIndex((k) => Math.abs(k.t - targetSec) < 0.01);
          let updatedKeys: Keyframe<number>[];

          if (existingIdx >= 0) {
            updatedKeys = [...ch.keyframes];
            updatedKeys[existingIdx] = { ...updatedKeys[existingIdx], v: val };
          } else {
            const newKey: Keyframe<number> = {
              id: newKeyId,
              t: targetSec,
              v: val,
              ease: 'smooth',
            };
            updatedKeys = [...ch.keyframes, newKey].sort((a, b) => a.t - b.t);
          }

          return {
            ...l,
            channels: {
              ...l.channels,
              [channelKey]: { ...ch, keyframes: updatedKeys },
            },
          };
        }),
      };
    });
  };

  // Convert frame to timecode HH:MM:SS:FF
  const formatTimecode = (f: number, rate: number) => {
    const totalSeconds = Math.floor((f - 1) / rate);
    const frames = (f - 1) % rate;
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#121018',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        color: '#e8e6ee',
        fontFamily: "'Inter', sans-serif",
        userSelect: 'none',
      }}
    >
      {/* ── 1. TIMELINE TRANSPORT & TOOLBAR ── */}
      <div
        style={{
          height: 38,
          backgroundColor: '#181520',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
        }}
      >
        {/* Left: Playback Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => handleFrameJump(1)}
            title="First Frame"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.7)',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <SkipBack size={14} />
          </button>

          <button
            onClick={() => handleFrameJump(currentFrame - 1)}
            title="Previous Frame"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.7)',
              cursor: 'pointer',
              padding: 4,
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            ◀
          </button>

          <button
            onClick={onTogglePlay}
            style={{
              background: isPlaying ? '#FF8C00' : '#00DAF3',
              border: 'none',
              color: '#000',
              borderRadius: 6,
              padding: '4px 12px',
              fontSize: 11,
              fontWeight: 900,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            {isPlaying ? <Pause size={12} fill="#000" /> : <Play size={12} fill="#000" />}
            {isPlaying ? 'PAUSE' : 'PLAY'}
          </button>

          <button
            onClick={() => handleFrameJump(currentFrame + 1)}
            title="Next Frame"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.7)',
              cursor: 'pointer',
              padding: 4,
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            ▶
          </button>

          <button
            onClick={() => handleFrameJump(totalFrames)}
            title="Last Frame"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.7)',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <SkipForward size={14} />
          </button>

          <div
            style={{
              height: 16,
              width: 1,
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              margin: '0 6px',
            }}
          />

          {/* Timecode Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              background: 'rgba(0, 0, 0, 0.4)',
              padding: '3px 8px',
              borderRadius: 4,
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontFamily: 'monospace',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 900, color: '#00DAF3' }}>
              {formatTimecode(currentFrame, fps)}
            </span>
            <span style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.5)' }}>
              FRAME {currentFrame} / {totalFrames}
            </span>
          </div>
        </div>

        {/* Center: Cadence & Keyframe Quick Directives */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255, 255, 255, 0.45)', textTransform: 'uppercase' }}>
            Hold Cadence:
          </div>
          {[
            { rate: 1, label: 'On 1s (24 FPS Full)' },
            { rate: 2, label: 'On 2s (12 FPS Anime / Cartoon)' },
            { rate: 3, label: 'On 3s (8 FPS)' },
          ].map(({ rate, label }) => (
            <button
              key={rate}
              onClick={() => {
                onUpdateProject((p) => {
                  const hero = p.layers.find((l) => l.id === 'l_hero');
                  if (hero && hero.celTrack) hero.celTrack.stepRate = rate as any;
                  return { ...p };
                });
              }}
              style={{
                fontSize: 10,
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: 4,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background:
                  project.layers.find((l) => l.id === 'l_hero')?.celTrack?.stepRate === rate
                    ? 'rgba(107, 0, 153, 0.5)'
                    : 'rgba(255, 255, 255, 0.04)',
                color:
                  project.layers.find((l) => l.id === 'l_hero')?.celTrack?.stepRate === rate
                    ? '#00DAF3'
                    : 'rgba(255, 255, 255, 0.7)',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Right: Keyframing Controls & Zoom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setAutoKeyEnabled(!autoKeyEnabled)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              fontWeight: 900,
              padding: '3px 8px',
              borderRadius: 4,
              border: `1px solid ${autoKeyEnabled ? '#D40055' : 'rgba(255,255,255,0.1)'}`,
              background: autoKeyEnabled ? 'rgba(212, 0, 85, 0.2)' : 'transparent',
              color: autoKeyEnabled ? '#FF4F8B' : 'rgba(255,255,255,0.4)',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 12 }}>●</span> AUTO-KEY
          </button>

          {/* Zoom Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>ZOOM</span>
            <input
              type="range"
              min={8}
              max={32}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ width: 64, accentColor: '#00DAF3' }}
            />
          </div>
        </div>
      </div>

      {/* ── 2. MAIN TIMELINE BODY: LAYERS & TRACK LANES ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Left Column: Layer & Channel Outliner Header (Width 280px) */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            backgroundColor: '#15131c',
            borderRight: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Outliner Header */}
          <div
            style={{
              height: 28,
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 10px',
              fontSize: 10,
              fontWeight: 900,
              color: 'rgba(255, 255, 255, 0.5)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            <span>ANIMATION LAYERS & TRACKS</span>
            <span style={{ fontSize: 9 }}>KEYFRAME</span>
          </div>

          {/* Layer Rows */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {project.layers.map((layer) => {
              const isExpanded = !!expandedLayers[layer.id];
              return (
                <div key={layer.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  {/* Layer Main Header Row */}
                  <div
                    style={{
                      height: 28,
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0 8px',
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        onClick={() => toggleLayerExpanded(layer.id)}
                        style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }}
                      >
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </button>

                      <button
                        onClick={() => handleToggleLayerVisibility(layer.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: layer.visible ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.2)',
                          cursor: 'pointer',
                          padding: 2,
                        }}
                      >
                        {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>

                      <button
                        onClick={() => handleToggleLayerLock(layer.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: layer.locked ? '#FF8C00' : 'rgba(255, 255, 255, 0.2)',
                          cursor: 'pointer',
                          padding: 2,
                        }}
                      >
                        {layer.locked ? <Lock size={11} /> : <Unlock size={11} />}
                      </button>

                      <span style={{ color: layer.id === 'l_hero' ? '#00DAF3' : '#fff' }}>
                        {layer.name}
                      </span>
                    </div>

                    <span
                      style={{
                        fontSize: 9,
                        padding: '1px 5px',
                        borderRadius: 3,
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: 'rgba(255, 255, 255, 0.6)',
                        fontFamily: 'monospace',
                      }}
                    >
                      {layer.type.toUpperCase()}
                    </span>
                  </div>

                  {/* Expanded Property Channels */}
                  {isExpanded && (
                    <div style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}>
                      {/* Cel Exposure Track (X-Sheet) */}
                      {layer.celTrack && (
                        <div
                          style={{
                            height: 24,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0 8px 0 28px',
                            fontSize: 10,
                            color: '#FF8C00',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>🎞️</span> Cel Exposures (On {layer.celTrack.stepRate}s)
                          </span>
                        </div>
                      )}

                      {/* Property Tracks: Position X, Position Y, Rotation, Opacity */}
                      {Object.entries(layer.channels).map(([chKey, channel]) => (
                        <div
                          key={chKey}
                          style={{
                            height: 22,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0 8px 0 28px',
                            fontSize: 10,
                            color: 'rgba(255, 255, 255, 0.65)',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
                          }}
                        >
                          <span>{channel.name}</span>

                          {/* Add Keyframe Button */}
                          <button
                            onClick={() => handleAddKeyAtCurrent(layer.id, chKey)}
                            title={`Add keyframe at frame ${currentFrame}`}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: channel.keyframes.some(
                                (k) => Math.abs(k.t - (currentFrame - 1) / fps) < 0.01
                              )
                                ? '#FFD700'
                                : 'rgba(255, 255, 255, 0.3)',
                              fontSize: 12,
                              cursor: 'pointer',
                              padding: '0 4px',
                            }}
                          >
                            ◆
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Area: Keyframe Tracks & Ruler */}
        <div
          ref={tracksScrollRef}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflowX: 'auto',
            overflowY: 'hidden',
            backgroundColor: '#0d0c12',
            position: 'relative',
          }}
        >
          {/* Top Ruler Bar */}
          <div
            ref={rulerRef}
            onMouseDown={handleRulerMouseDown}
            style={{
              height: 28,
              backgroundColor: '#16141e',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              position: 'relative',
              width: totalFrames * zoom + 120,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {/* Frame Tick Marks & Labels */}
            {Array.from({ length: totalFrames }, (_, i) => {
              const frameNum = i + 1;
              const isMajor = frameNum % 6 === 0 || frameNum === 1;
              const isSecond = frameNum % fps === 0;

              return (
                <div
                  key={frameNum}
                  style={{
                    position: 'absolute',
                    left: i * zoom,
                    top: 0,
                    bottom: 0,
                    width: 1,
                    backgroundColor: isSecond
                      ? 'rgba(0, 218, 243, 0.4)'
                      : isMajor
                      ? 'rgba(255, 255, 255, 0.2)'
                      : 'rgba(255, 255, 255, 0.06)',
                  }}
                >
                  {isMajor && (
                    <span
                      style={{
                        position: 'absolute',
                        left: 3,
                        top: 4,
                        fontSize: 9,
                        fontFamily: 'monospace',
                        color: isSecond ? '#00DAF3' : 'rgba(255, 255, 255, 0.5)',
                        pointerEvents: 'none',
                      }}
                    >
                      {frameNum}
                    </span>
                  )}
                </div>
              );
            })}

            {/* Playhead Needle Head */}
            <div
              style={{
                position: 'absolute',
                left: (currentFrame - 1) * zoom,
                top: 0,
                width: 12,
                height: 18,
                transform: 'translateX(-50%)',
                backgroundColor: '#D40055',
                clipPath: 'polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%)',
                zIndex: 30,
                pointerEvents: 'none',
              }}
            />
          </div>

          {/* Track Lanes Canvas / Grid */}
          <div
            style={{
              flex: 1,
              width: totalFrames * zoom + 120,
              position: 'relative',
              overflowY: 'auto',
            }}
          >
            {/* Background Grid Lines */}
            {Array.from({ length: totalFrames }, (_, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: i * zoom,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  backgroundColor: (i + 1) % 12 === 0 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                  pointerEvents: 'none',
                }}
              />
            ))}

            {/* Vertical Red/Cyan Playhead Line */}
            <div
              style={{
                position: 'absolute',
                left: (currentFrame - 1) * zoom,
                top: 0,
                bottom: 0,
                width: 2,
                backgroundColor: '#D40055',
                boxShadow: '0 0 8px rgba(212, 0, 85, 0.8)',
                zIndex: 25,
                pointerEvents: 'none',
              }}
            />

            {/* Layer Track Lanes */}
            {project.layers.map((layer) => {
              const isExpanded = !!expandedLayers[layer.id];
              return (
                <div key={layer.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  {/* Layer Summary Lane */}
                  <div
                    style={{
                      height: 28,
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      position: 'relative',
                    }}
                  >
                    {/* Summary Diamonds: show keyframe if any sub-channel has one */}
                    {Object.values(layer.channels).flatMap((ch) =>
                      ch.keyframes.map((k) => {
                        const framePos = Math.round(k.t * fps) + 1;
                        return (
                          <div
                            key={k.id}
                            title={`${ch.name}: ${k.v} at frame ${framePos}`}
                            style={{
                              position: 'absolute',
                              left: (framePos - 1) * zoom,
                              top: 7,
                              width: 12,
                              height: 12,
                              transform: 'translateX(-50%) rotate(45deg)',
                              backgroundColor: selectedKeyframeId === k.id ? '#FFD700' : '#00DAF3',
                              border: '1px solid #000',
                              cursor: 'pointer',
                              zIndex: 10,
                            }}
                            onClick={() => setSelectedKeyframeId(k.id)}
                          />
                        );
                      })
                    )}
                  </div>

                  {/* Expanded Property Channel Lanes */}
                  {isExpanded && (
                    <div style={{ backgroundColor: 'rgba(0, 0, 0, 0.15)' }}>
                      {/* Cel Exposure Track (X-Sheet bars) */}
                      {layer.celTrack && (
                        <div
                          style={{
                            height: 24,
                            position: 'relative',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
                          }}
                        >
                          {/* Exposure blocks on 2s / 1s */}
                          {Array.from(
                            { length: Math.ceil(totalFrames / (layer.celTrack.stepRate || 2)) },
                            (_, bIdx) => {
                              const start = bIdx * (layer.celTrack?.stepRate || 2);
                              const width = (layer.celTrack?.stepRate || 2) * zoom;
                              return (
                                <div
                                  key={bIdx}
                                  style={{
                                    position: 'absolute',
                                    left: start * zoom,
                                    top: 2,
                                    width: width - 2,
                                    height: 20,
                                    borderRadius: 3,
                                    backgroundColor:
                                      bIdx % 2 === 0
                                        ? 'rgba(255, 140, 0, 0.3)'
                                        : 'rgba(212, 0, 85, 0.3)',
                                    border: '1px solid rgba(255, 140, 0, 0.5)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    paddingLeft: 4,
                                    fontSize: 9,
                                    fontWeight: 900,
                                    color: '#fff',
                                    fontFamily: 'monospace',
                                  }}
                                >
                                  CEL {bIdx + 1}
                                </div>
                              );
                            }
                          )}
                        </div>
                      )}

                      {/* Property Lanes with Diamond Keyframes */}
                      {Object.entries(layer.channels).map(([chKey, channel]) => (
                        <div
                          key={chKey}
                          style={{
                            height: 22,
                            position: 'relative',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
                          }}
                        >
                          {/* Keyframe diamonds */}
                          {channel.keyframes.map((k) => {
                            const framePos = Math.round(k.t * fps) + 1;
                            const isSelected = selectedKeyframeId === k.id;
                            return (
                              <div
                                key={k.id}
                                title={`${channel.name}: ${k.v} (${k.ease || 'smooth'})`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedKeyframeId(k.id);
                                  handleFrameJump(framePos);
                                }}
                                style={{
                                  position: 'absolute',
                                  left: (framePos - 1) * zoom,
                                  top: 5,
                                  width: 10,
                                  height: 10,
                                  transform: 'translateX(-50%) rotate(45deg)',
                                  backgroundColor: isSelected ? '#FFD700' : '#00DAF3',
                                  boxShadow: isSelected ? '0 0 8px #FFD700' : 'none',
                                  border: '1px solid #100e16',
                                  cursor: 'pointer',
                                  zIndex: 15,
                                }}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnimaTimeline;
