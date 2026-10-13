// components/tela/TelaAudiobookStudio.tsx — Dual-Cast Manuscript Narration & Audiobook Studio.
// Automatically detects character quotes vs narrator prose, auditions multi-voice casting,
// and exports chapter-by-chapter audio files.
// 100% Native Plajah: Zero external cloud dependencies.

import React, { useState, useEffect, useRef } from 'react';
import {
  Headphones,
  BookOpen,
  Play,
  Pause,
  Download,
  Sparkles,
  User,
  Volume2,
  Mic,
  Clock,
  CheckCircle2,
  ChevronRight,
  RotateCw,
  FileAudio
} from 'lucide-react';
import {
  telaAudiobookEngine,
  AudiobookProject,
  AudiobookChapter,
  AudiobookCastMember,
} from '../../services/audiobook/telaAudiobookStudio';
import { KOKORO_VOICES } from '../../services/voice/onDeviceVoiceEngine';

interface TelaAudiobookStudioProps {
  initialManuscript?: string;
  bookTitle?: string;
  onClose?: () => void;
}

export const TelaAudiobookStudio: React.FC<TelaAudiobookStudioProps> = ({
  initialManuscript = `Chapter 1: The Echo of Oberon

The neon rain pelted against the high windows of the observatory, washing the city in ribbons of electric violet and wet amber. Aria stared into the holographic star-chart, her fingers hovering over the glowing navigational nodes.

“If the transmitter goes down tonight, none of our signals reach the orbital dock,” she whispered, her voice tightening with quiet dread.

From the shadow of the doorway, Marcus stepped forward. The mechanical iris of his right ocular implant whirred softly as it adjusted to the dim console light.

“The auxiliary core is holding at forty percent,” Marcus replied calmly. “We still have a narrow window, but we cannot afford another surge.”

Aria turned to face him, the ambient cyan glare catching the sharp angles of her jaw. “Then we initiate the bypass now.”`,
  bookTitle = 'The Echo of Oberon',
  onClose,
}) => {
  const [project, setProject] = useState<AudiobookProject>(() =>
    telaAudiobookEngine.createProject(bookTitle, initialManuscript, 'Aria & Marcus')
  );

  const [activeChapterId, setActiveChapterId] = useState<string>(project.chapters[0]?.id || '');
  const [synthesizing, setSynthesizing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPct, setProgressPct] = useState(0);

  // Audio Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeChapter = project.chapters.find((c) => c.id === activeChapterId) || project.chapters[0];

  const handleSynthesizeActiveChapter = async () => {
    if (!activeChapter || synthesizing) return;
    setSynthesizing(true);
    setProgressPct(0);

    try {
      const updated = await telaAudiobookEngine.synthesizeChapter(activeChapter, (p) => {
        setProgressPct(Math.round((p.currentParagraph / p.totalParagraphs) * 100));
        setProgressMsg(p.status);
      });

      setProject((prev) => ({
        ...prev,
        chapters: prev.chapters.map((c) => (c.id === updated.id ? updated : c)),
      }));

      // Ready audio
      if (updated.audioUrl) {
        if (audioRef.current) {
          audioRef.current.src = updated.audioUrl;
        } else {
          audioRef.current = new Audio(updated.audioUrl);
        }
      }
    } catch (e) {
      console.error('Synthesis failed:', e);
    } finally {
      setSynthesizing(false);
    }
  };

  const handleTogglePlay = () => {
    if (!activeChapter?.audioUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(activeChapter.audioUrl);
      audioRef.current.ontimeupdate = () => {
        if (audioRef.current) {
          setPlaybackTime(audioRef.current.currentTime);
          // Highlight current segment
          let elapsed = 0;
          for (let i = 0; i < activeChapter.segments.length; i++) {
            const seg = activeChapter.segments[i];
            if (audioRef.current.currentTime >= elapsed && audioRef.current.currentTime < elapsed + seg.durationSeconds) {
              setActiveSegmentIndex(i);
              break;
            }
            elapsed += seg.durationSeconds;
          }
        }
      };
      audioRef.current.onended = () => {
        setIsPlaying(false);
        setActiveSegmentIndex(null);
        setPlaybackTime(0);
      };
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleExportChapter = () => {
    if (!activeChapter) return;
    const { fileName, blob, url } = telaAudiobookEngine.exportChapterAudio(activeChapter, project.title);
    if (!url) return;

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      backgroundColor: '#0d0f12',
      color: '#e2e8f0',
      fontFamily: 'Inter, system-ui, sans-serif',
      overflow: 'hidden',
    }}>
      {/* Top Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        backgroundColor: '#14171d',
        borderBottom: '1px solid #232731',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Headphones size={20} color="#00DAF3" />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 700, fontSize: '15px', color: '#fff' }}>{project.title}</span>
              <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '12px', backgroundColor: 'rgba(0, 218, 243, 0.15)', color: '#00DAF3' }}>
                Dual-Cast Audiobook Studio
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>
              Zero-Cloud Kokoro 82M + Fish Speech · Automatic Quote Separation
            </div>
          </div>
        </div>

        {/* Chapter Switcher & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <select
            value={activeChapterId}
            onChange={(e) => {
              setActiveChapterId(e.target.value);
              setIsPlaying(false);
              if (audioRef.current) audioRef.current.pause();
            }}
            style={{
              padding: '6px 12px',
              backgroundColor: '#1b1f27',
              border: '1px solid #2d3340',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '12px',
            }}
          >
            {project.chapters.map((chap) => (
              <option key={chap.id} value={chap.id}>
                {chap.title} ({chap.paragraphs.length} paragraphs)
              </option>
            ))}
          </select>

          {activeChapter?.isSynthesized ? (
            <button
              onClick={handleExportChapter}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                backgroundColor: '#10b981',
                color: '#000',
                fontWeight: 700,
                fontSize: '12px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Download size={13} />
              <span>Export Chapter (WAV)</span>
            </button>
          ) : (
            <button
              onClick={handleSynthesizeActiveChapter}
              disabled={synthesizing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                backgroundColor: synthesizing ? '#f59e0b' : '#00DAF3',
                color: '#000',
                fontWeight: 700,
                fontSize: '12px',
                borderRadius: '6px',
                border: 'none',
                cursor: synthesizing ? 'wait' : 'pointer',
              }}
            >
              <Sparkles size={13} />
              <span>{synthesizing ? `Synthesizing (${progressPct}%)…` : 'Synthesize Dual-Cast Audio'}</span>
            </button>
          )}

          {onClose && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '16px' }}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left Column: Manuscript Viewer with Quote Highlights */}
        <div style={{
          flex: 1.2,
          padding: '24px 32px',
          overflowY: 'auto',
          borderRight: '1px solid #232731',
          lineHeight: '1.7',
          fontSize: '14px',
          color: '#cbd5e1',
        }}>
          <div style={{ maxWidth: '680px', margin: '0 auto' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#fff', marginBottom: '16px' }}>
              {activeChapter?.title}
            </h2>

            {/* Paragraph rendering with interactive quote segmentation */}
            {activeChapter?.paragraphs.map((para, pIdx) => {
              // Highlight quotes inside the paragraph
              const quoteRegex = /(“[^”]+”|"[^"]+")/g;
              const parts = para.split(quoteRegex);

              return (
                <p key={pIdx} style={{ marginBottom: '18px' }}>
                  {parts.map((part, partIdx) => {
                    const isQuote = /^["“]/.test(part);
                    return isQuote ? (
                      <span
                        key={partIdx}
                        style={{
                          color: '#00DAF3',
                          backgroundColor: 'rgba(0, 218, 243, 0.12)',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          fontWeight: 500,
                          borderBottom: '1px solid rgba(0, 218, 243, 0.4)',
                        }}
                        title="Character Dialogue (Spoken Voice Track)"
                      >
                        {part}
                      </span>
                    ) : (
                      <span key={partIdx}>{part}</span>
                    );
                  })}
                </p>
              );
            })}
          </div>
        </div>

        {/* Right Column: Audio Director & Dual-Cast Segment Inspector */}
        <div style={{
          width: '380px',
          backgroundColor: '#121419',
          display: 'flex',
          flexDirection: 'column',
          padding: '18px',
          gap: '16px',
          overflowY: 'auto',
        }}>
          {/* Cast Overview */}
          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#181b22', border: '1px solid #282d38' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={13} color="#00DAF3" />
              <span>Dual-Cast Voice Distribution</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: '#fff' }}>Prose Narrator</span>
                <span style={{ color: '#FF8C00', fontWeight: 600 }}>Aria (af_heart)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: '#fff' }}>Character Dialogue</span>
                <span style={{ color: '#00DAF3', fontWeight: 600 }}>Fish Speech 1.5 Cloned</span>
              </div>
            </div>
          </div>

          {/* Chapter Audio Player */}
          {activeChapter?.isSynthesized && (
            <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: '#181b22', border: '1px solid #00DAF3', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#00DAF3' }}>
                  Chapter 24-bit Audio Master
                </span>
                <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                  {playbackTime.toFixed(1)}s / {activeChapter.totalDurationSeconds.toFixed(1)}s
                </span>
              </div>

              {/* Play / Pause Button */}
              <button
                onClick={handleTogglePlay}
                style={{
                  padding: '10px',
                  backgroundColor: isPlaying ? '#FF8C00' : '#00DAF3',
                  color: '#000',
                  fontWeight: 700,
                  fontSize: '13px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                <span>{isPlaying ? 'Pause Narration' : 'Listen to Chapter'}</span>
              </button>
            </div>
          )}

          {/* Synthesized Segments Stream */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Volume2 size={13} color="#FF8C00" />
              <span>Sequential Voice Segments ({activeChapter?.segments.length || 0})</span>
            </div>

            {activeChapter?.segments.length === 0 ? (
              <div style={{ padding: '24px 12px', textAlign: 'center', color: '#64748b', fontSize: '12px', border: '1px dashed #282d38', borderRadius: '6px' }}>
                <Sparkles size={20} style={{ margin: '0 auto 6px', opacity: 0.4 }} />
                <div>No audio synthesized yet.</div>
                <div style={{ fontSize: '11px', marginTop: '4px' }}>Click "Synthesize Dual-Cast Audio" to generate.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {activeChapter?.segments.map((seg, sIdx) => {
                  const isCurrent = activeSegmentIndex === sIdx;
                  return (
                    <div
                      key={seg.segmentId}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '6px',
                        backgroundColor: isCurrent ? 'rgba(0, 218, 243, 0.15)' : '#181b22',
                        border: isCurrent ? '1px solid #00DAF3' : '1px solid #232731',
                        fontSize: '11px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: seg.speakerType === 'NARRATOR' ? '#FF8C00' : '#00DAF3',
                        }}>
                          {seg.speakerName}
                        </span>
                        <span style={{ color: '#64748b', fontFamily: 'monospace' }}>
                          {seg.durationSeconds.toFixed(1)}s
                        </span>
                      </div>
                      <div style={{ color: isCurrent ? '#fff' : '#94a3b8', fontStyle: seg.speakerType === 'CHARACTER_QUOTE' ? 'italic' : 'normal' }}>
                        “{seg.text.slice(0, 50)}{seg.text.length > 50 ? '…' : ''}”
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default TelaAudiobookStudio;
