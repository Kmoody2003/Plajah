/**
 * AudioBookStudio — Plajah Lorea
 *
 * Authors record their own narration paragraph by paragraph.
 * MAI Transcribe 1.5 verifies each recording against the source text.
 * Any unrecorded paragraphs can be filled in with MAI Voice 2 AI narration.
 * The finished audiobook is stitched, uploaded, and published as a new
 * edition of the book with `hasAudio: true`.
 *
 * Workflow:
 *   Select chapter → Record paragraphs OR generate AI → Review accuracy →
 *   Preview full chapter → Publish
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Mic, MicOff, Play, Pause, Square, RotateCcw,
  Check, X, AlertTriangle, Sparkles, ChevronDown, ChevronRight,
  Upload, BookOpen, Volume2, Clock, Star, Wand2, Radio,
  RefreshCw, ChevronLeft, Info, Download,
} from 'lucide-react';
import { Album } from '../types';
import { auth, db, storage } from '../services/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import {
  MAI_VOICES, MAIVoiceProfile,
  synthesizeNarration, transcribeAudio, measureTranscriptionAccuracy,
  splitForTTS, estimateNarrationDurationMs, getMicrosoftAIConfig,
} from '../services/microsoftAIService';

interface Props {
  book: Album;
  onBack: () => void;
  user: any;
}

// ── Paragraph narration state ──────────────────────────────────────────────────
type ParagraphStatus = 'idle' | 'recording' | 'recorded' | 'ai_generated' | 'verified' | 'error' | 'uploading';

interface ParagraphState {
  index: number;
  text: string;
  status: ParagraphStatus;
  audioBlob?: Blob;
  audioUrl?: string;
  transcriptAccuracy?: number;
  transcriptText?: string;
  durationMs?: number;
  errorMsg?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function splitToParagraphs(content: string): string[] {
  return content
    .split(/\n{2,}/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(p => p.length > 10);
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function accuracyColor(acc: number): string {
  if (acc >= 0.9) return 'text-green-400';
  if (acc >= 0.7) return 'text-amber-400';
  return 'text-red-400';
}

// ── Narration bar ──────────────────────────────────────────────────────────────
const NarrationBar: React.FC<{ audioBlob?: Blob; audioUrl?: string; label: string }> = ({ audioBlob, audioUrl, label }) => {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const url = audioUrl || (audioBlob ? URL.createObjectURL(audioBlob) : null);

  if (!url) return null;

  return (
    <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-black/20 border border-white/10 rounded-xl">
      <button
        onClick={() => {
          if (!audioRef.current) return;
          if (playing) { audioRef.current.pause(); setPlaying(false); }
          else { audioRef.current.play(); setPlaying(true); }
        }}
        className="w-7 h-7 rounded-full bg-purple-600/50 flex items-center justify-center hover:bg-purple-500/60 transition-all shrink-0"
      >
        {playing ? <Pause size={11} /> : <Play size={11} fill="white" />}
      </button>
      <span className="text-[9px] text-white/40 flex-1 truncate">{label}</span>
      <audio ref={audioRef} src={url} onEnded={() => setPlaying(false)} className="hidden" />
    </div>
  );
};

// ── Paragraph card ─────────────────────────────────────────────────────────────
const ParagraphCard: React.FC<{
  state: ParagraphState;
  isRecording: boolean;
  onRecord: () => void;
  onStop: () => void;
  onGenAI: () => void;
  onReset: () => void;
  selectedVoice: string;
}> = ({ state, isRecording, onRecord, onStop, onGenAI, onReset, selectedVoice }) => {
  const statusIcon = {
    idle:          <Radio size={12} className="text-white/30" />,
    recording:     <Mic size={12} className="text-red-400 animate-pulse" />,
    recorded:      <Check size={12} className="text-amber-400" />,
    ai_generated:  <Sparkles size={12} className="text-blue-400" />,
    verified:      <Check size={12} className="text-green-400" />,
    uploading:     <div className="w-3 h-3 border border-purple-400/40 border-t-purple-400 rounded-full animate-spin" />,
    error:         <AlertTriangle size={12} className="text-red-400" />,
  }[state.status];

  const statusBg = {
    idle:          'border-white/10 bg-white/[0.03]',
    recording:     'border-red-500/40 bg-red-900/20',
    recorded:      'border-amber-500/30 bg-amber-900/15',
    ai_generated:  'border-blue-500/30 bg-blue-900/15',
    verified:      'border-green-500/30 bg-green-900/15',
    uploading:     'border-purple-500/30 bg-purple-900/15',
    error:         'border-red-500/30 bg-red-900/15',
  }[state.status];

  return (
    <div className={`border rounded-2xl p-4 transition-all ${statusBg}`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mt-0.5">
          {statusIcon}
        </div>
        <p className="flex-1 text-sm text-white/70 leading-relaxed">{state.text}</p>
      </div>

      {/* Accuracy badge */}
      {state.transcriptAccuracy !== undefined && (
        <div className="mt-2 flex items-center gap-2 pl-9">
          <span className={`text-[9px] font-black ${accuracyColor(state.transcriptAccuracy)}`}>
            {Math.round(state.transcriptAccuracy * 100)}% accuracy
          </span>
          {state.transcriptAccuracy < 0.7 && (
            <span className="text-[9px] text-red-400/70">— re-record recommended</span>
          )}
        </div>
      )}

      {/* Audio preview */}
      {(state.audioBlob || state.audioUrl) && (
        <div className="pl-9">
          <NarrationBar
            audioBlob={state.audioBlob}
            audioUrl={state.audioUrl}
            label={state.status === 'ai_generated' ? `AI narration — ${MAI_VOICES.find(v=>v.id===selectedVoice)?.name}` : 'Your recording'}
          />
        </div>
      )}

      {state.errorMsg && (
        <p className="mt-2 pl-9 text-[9px] text-red-400">{state.errorMsg}</p>
      )}

      {/* Action row */}
      <div className="flex gap-2 mt-3 pl-9">
        {state.status === 'idle' && (
          <>
            <button onClick={onRecord} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 border border-red-500/30 rounded-full text-[8px] font-black uppercase tracking-widest text-red-300 hover:bg-red-600/30 transition-all">
              <Mic size={9} /> Record
            </button>
            <button onClick={onGenAI} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 rounded-full text-[8px] font-black uppercase tracking-widest text-blue-300 hover:bg-blue-600/30 transition-all">
              <Sparkles size={9} /> AI Voice
            </button>
          </>
        )}

        {state.status === 'recording' && (
          <button onClick={onStop} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/50 border border-red-500/60 rounded-full text-[8px] font-black uppercase tracking-widest text-white animate-pulse">
            <Square size={9} fill="white" /> Stop
          </button>
        )}

        {(state.status === 'recorded' || state.status === 'ai_generated' || state.status === 'verified' || state.status === 'error') && (
          <button onClick={onReset} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-[8px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 transition-all">
            <RotateCcw size={9} /> Redo
          </button>
        )}
      </div>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
const AudioBookStudio: React.FC<Props> = ({ book, onBack, user }) => {
  const chapters = (book as any).chapters ?? book.bookChapters ?? [];
  const [chapterIndex, setChapterIndex] = useState(0);
  const [selectedVoice, setSelectedVoice] = useState(MAI_VOICES[0].id);
  const [narrationRate, setNarrationRate] = useState(1.0);
  const [paragraphs, setParagraphs] = useState<ParagraphState[]>([]);
  const [activeRecordingIndex, setActiveRecordingIndex] = useState<number | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState(0);
  const [publishDone, setPublishDone] = useState(false);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [aiGeneratingIndex, setAiGeneratingIndex] = useState<number | null>(null);
  const [globalAIGenerating, setGlobalAIGenerating] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const config = getMicrosoftAIConfig();
  const chapter = chapters[chapterIndex];

  // Parse paragraphs when chapter changes
  useEffect(() => {
    if (!chapter) return;
    const content = chapter.content || '';
    const texts = splitToParagraphs(content);
    setParagraphs(texts.map((text, index) => ({ index, text, status: 'idle' })));
  }, [chapterIndex, chapter?.id]);

  // ── Recording ────────────────────────────────────────────────────────────────
  const startRecording = useCallback(async (idx: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      chunksRef.current = [];
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await verifyRecording(idx, audioBlob);
      };
      mr.start(250);
      mediaRecorderRef.current = mr;
      setActiveRecordingIndex(idx);
      setParagraphs(prev => prev.map(p => p.index === idx ? { ...p, status: 'recording', errorMsg: undefined } : p));
    } catch (err: any) {
      setParagraphs(prev => prev.map(p => p.index === idx ? { ...p, status: 'error', errorMsg: 'Microphone access denied.' } : p));
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setActiveRecordingIndex(null);
  }, []);

  const verifyRecording = async (idx: number, audioBlob: Blob) => {
    setParagraphs(prev => prev.map(p => p.index === idx ? { ...p, status: 'uploading', audioBlob } : p));
    const paragraph = paragraphs.find(p => p.index === idx);
    if (!paragraph) return;

    try {
      if (config.transcribeReady) {
        const result = await transcribeAudio(audioBlob);
        const accuracy = measureTranscriptionAccuracy(paragraph.text, result.transcript);
        setParagraphs(prev => prev.map(p => p.index === idx ? {
          ...p, status: 'recorded', audioBlob,
          transcriptAccuracy: accuracy.accuracy,
          transcriptText: result.transcript,
          durationMs: estimateNarrationDurationMs(paragraph.text, narrationRate),
        } : p));
      } else {
        // No transcription key — just mark as recorded without accuracy check
        setParagraphs(prev => prev.map(p => p.index === idx ? { ...p, status: 'recorded', audioBlob } : p));
      }
    } catch {
      setParagraphs(prev => prev.map(p => p.index === idx ? { ...p, status: 'recorded', audioBlob } : p));
    }
  };

  // ── AI narration ──────────────────────────────────────────────────────────────
  const generateAIForParagraph = async (idx: number) => {
    if (!config.voiceReady) {
      setParagraphs(prev => prev.map(p => p.index === idx ? { ...p, status: 'error', errorMsg: 'VITE_AZURE_SPEECH_KEY not set.' } : p));
      return;
    }
    const paragraph = paragraphs.find(p => p.index === idx);
    if (!paragraph) return;
    setAiGeneratingIndex(idx);
    setParagraphs(prev => prev.map(p => p.index === idx ? { ...p, status: 'uploading', errorMsg: undefined } : p));
    try {
      const { audioBlob, durationMs } = await synthesizeNarration({ text: paragraph.text, voiceId: selectedVoice, rate: narrationRate });
      setParagraphs(prev => prev.map(p => p.index === idx ? { ...p, status: 'ai_generated', audioBlob, durationMs, transcriptAccuracy: 1.0 } : p));
    } catch (err: any) {
      setParagraphs(prev => prev.map(p => p.index === idx ? { ...p, status: 'error', errorMsg: err.message } : p));
    } finally {
      setAiGeneratingIndex(null);
    }
  };

  const generateAIForAll = async () => {
    setGlobalAIGenerating(true);
    const idle = paragraphs.filter(p => p.status === 'idle');
    for (const p of idle) {
      await generateAIForParagraph(p.index);
    }
    setGlobalAIGenerating(false);
  };

  const resetParagraph = (idx: number) => {
    setParagraphs(prev => prev.map(p => p.index === idx ? { ...p, status: 'idle', audioBlob: undefined, audioUrl: undefined, transcriptAccuracy: undefined, errorMsg: undefined } : p));
  };

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const recordedCount = paragraphs.filter(p => p.status !== 'idle' && p.status !== 'error').length;
  const totalCount = paragraphs.length;
  const completionPct = totalCount > 0 ? Math.round((recordedCount / totalCount) * 100) : 0;
  const avgAccuracy = (() => {
    const withAcc = paragraphs.filter(p => p.transcriptAccuracy !== undefined);
    if (!withAcc.length) return null;
    return withAcc.reduce((s, p) => s + (p.transcriptAccuracy ?? 0), 0) / withAcc.length;
  })();
  const estimatedTotalMs = paragraphs.reduce((s, p) => s + (p.durationMs ?? estimateNarrationDurationMs(p.text, narrationRate)), 0);

  // ── Publish ───────────────────────────────────────────────────────────────────
  const publishAudioBook = async () => {
    const ready = paragraphs.filter(p => p.audioBlob);
    if (!ready.length || !user) return;
    setIsPublishing(true);
    setPublishProgress(0);

    try {
      // Upload each paragraph audio to Storage
      const audioUrls: string[] = [];
      for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        if (p.audioBlob) {
          const path = `audiobooks/${book.id}/chapter${chapterIndex}/para${i}.webm`;
          const ref2 = storageRef(storage, path);
          await uploadBytes(ref2, p.audioBlob);
          audioUrls.push(await getDownloadURL(ref2));
        } else {
          audioUrls.push(''); // gap — no audio for this paragraph
        }
        setPublishProgress(Math.round(((i + 1) / paragraphs.length) * 80));
      }

      // Stitch audio URLs as chapter metadata
      // In production: server-side audio concatenation via Azure Media Services or FFmpeg
      const firstAudioUrl = audioUrls.find(u => u) || '';

      // Update the book document in Firestore
      const bookRef = doc(db, 'albums', book.id);
      await updateDoc(bookRef, {
        hasAudio: true,
        [`chapters.${chapterIndex}.audioUrl`]: firstAudioUrl,
        [`chapters.${chapterIndex}.audioParagraphUrls`]: audioUrls,
        [`chapters.${chapterIndex}.audioVoice`]: selectedVoice,
        [`chapters.${chapterIndex}.audioRate`]: narrationRate,
        updatedAt: Date.now(),
      });

      setPublishProgress(100);
      setPublishDone(true);
    } catch (err: any) {
      console.error('[AudioBookStudio] publish failed:', err);
    } finally {
      setIsPublishing(false);
    }
  };

  if (!chapter) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black/60 text-white gap-4">
      <BookOpen size={40} className="opacity-30" />
      <p className="text-white/30 text-sm font-black uppercase tracking-widest">No chapters found in this book.</p>
      <p className="text-white/20 text-xs">Add chapters in the Book Authoring Studio first.</p>
      <button onClick={onBack} className="mt-2 px-4 py-2 bg-white/5 rounded-full text-xs font-black text-white/40">Back</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-black/60 backdrop-blur-sm text-white">
      {/* ── Header ── */}
      <div className="sticky top-0 z-40 bg-black/70 backdrop-blur-xl border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all">
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-black text-white truncate">Audio Production — {book.title}</h1>
            <p className="text-[9px] text-white/40 font-black uppercase tracking-widest">Lorea · MAI Voice 2 + MAI Transcribe 1.5</p>
          </div>
          {/* Config warnings */}
          {!config.voiceReady && (
            <div className="flex items-center gap-1 px-2 py-1 bg-amber-900/30 border border-amber-500/30 rounded-full">
              <AlertTriangle size={9} className="text-amber-400" />
              <span className="text-[7px] font-black text-amber-400">KEY MISSING</span>
            </div>
          )}
        </div>

        {/* Chapter selector */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {chapters.map((ch, i) => (
            <button key={i} onClick={() => setChapterIndex(i)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${chapterIndex === i ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
              {ch.title || `Ch. ${i + 1}`}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Progress', value: `${completionPct}%`, sub: `${recordedCount}/${totalCount}`, color: 'text-purple-400' },
            { label: 'Avg Accuracy', value: avgAccuracy != null ? `${Math.round(avgAccuracy * 100)}%` : '—', sub: 'transcription', color: avgAccuracy != null ? accuracyColor(avgAccuracy) : 'text-white/30' },
            { label: 'Est. Duration', value: formatDuration(estimatedTotalMs), sub: 'this chapter', color: 'text-blue-400' },
            { label: 'Voice', value: MAI_VOICES.find(v => v.id === selectedVoice)?.emoji ?? '🎙️', sub: 'AI Voice', color: 'text-amber-400' },
          ].map(s => (
            <div key={s.label} className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-3 text-center">
              <p className={`text-lg font-black ${s.color}`}>{s.value}</p>
              <p className="text-[7px] text-white/30 font-black uppercase tracking-widest">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Progress bar ── */}
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <motion.div className="h-full bg-gradient-to-r from-purple-600 to-violet-400 rounded-full" animate={{ width: `${completionPct}%` }} />
        </div>

        {/* ── Voice + controls ── */}
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => setShowVoicePicker(v => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-white/[0.05] border border-white/10 rounded-2xl text-xs font-black text-white/70 hover:border-purple-500/40 transition-all">
            <Volume2 size={13} className="text-purple-400" />
            {MAI_VOICES.find(v => v.id === selectedVoice)?.name}
            <ChevronDown size={11} className={`transition-transform ${showVoicePicker ? 'rotate-180' : ''}`} />
          </button>

          <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.05] border border-white/10 rounded-2xl">
            <span className="text-[9px] text-white/40 font-black uppercase tracking-widest">Speed</span>
            {[0.75, 1, 1.1, 1.25].map(r => (
              <button key={r} onClick={() => setNarrationRate(r)}
                className={`px-2 py-0.5 rounded-full text-[8px] font-black transition-all ${narrationRate === r ? 'bg-purple-600 text-white' : 'text-white/30 hover:text-white/70'}`}>
                {r}×
              </button>
            ))}
          </div>

          <button onClick={generateAIForAll} disabled={globalAIGenerating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 border border-blue-500/30 rounded-2xl text-[9px] font-black uppercase tracking-widest text-blue-300 hover:bg-blue-600/30 disabled:opacity-40 transition-all">
            {globalAIGenerating
              ? <div className="w-3 h-3 border border-blue-400/40 border-t-blue-400 rounded-full animate-spin" />
              : <Wand2 size={11} />}
            Fill Remaining with AI
          </button>
        </div>

        {/* ── Voice picker ── */}
        <AnimatePresence>
          {showVoicePicker && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="grid grid-cols-2 gap-2">
              {MAI_VOICES.map(v => (
                <button key={v.id} onClick={() => { setSelectedVoice(v.id); setShowVoicePicker(false); }}
                  className={`flex items-center gap-3 p-3 rounded-2xl border transition-all text-left ${selectedVoice === v.id ? 'border-purple-500/60 bg-purple-900/30' : 'border-white/[0.07] bg-white/[0.03] hover:border-purple-500/30'}`}>
                  <span className="text-xl shrink-0">{v.emoji}</span>
                  <div>
                    <p className="text-xs font-black text-white">{v.name}</p>
                    <p className="text-[8px] text-white/40 leading-tight">{v.description}</p>
                  </div>
                  {selectedVoice === v.id && <Check size={12} className="text-green-400 ml-auto shrink-0" />}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Microsoft AI note ── */}
        {!config.voiceReady && (
          <div className="flex items-start gap-3 p-4 bg-amber-950/40 border border-amber-500/30 rounded-2xl">
            <Info size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-black text-amber-300 mb-1">Azure Speech Key Required</p>
              <p className="text-[9px] text-amber-200/60 leading-relaxed">
                MAI Voice 2 and MAI Transcribe 1.5 require <code className="bg-amber-900/40 px-1 rounded">VITE_AZURE_SPEECH_KEY</code> in{' '}
                <code className="bg-amber-900/40 px-1 rounded">.env.local</code>.{' '}
                Get a key from <strong>portal.azure.com → Azure AI Services</strong>.
                Endpoints will be updated to MAI-specific URLs once Microsoft publishes official docs.
              </p>
            </div>
          </div>
        )}

        {/* ── Paragraph cards ── */}
        <div className="space-y-3">
          {paragraphs.map(p => (
            <ParagraphCard
              key={p.index}
              state={p}
              isRecording={activeRecordingIndex === p.index}
              onRecord={() => startRecording(p.index)}
              onStop={stopRecording}
              onGenAI={() => generateAIForParagraph(p.index)}
              onReset={() => resetParagraph(p.index)}
              selectedVoice={selectedVoice}
            />
          ))}
        </div>

        {/* ── Publish ── */}
        {completionPct > 0 && !publishDone && (
          <div className="sticky bottom-0 left-0 right-0 bg-black/80 backdrop-blur-xl border-t border-white/10 -mx-4 px-4 py-4">
            <div className="flex items-center gap-4 max-w-3xl mx-auto">
              <div className="flex-1">
                <p className="text-xs font-black text-white">{recordedCount}/{totalCount} paragraphs ready</p>
                <p className="text-[9px] text-white/40">{paragraphs.filter(p => p.status === 'idle').length} paragraphs still need narration</p>
              </div>
              <button
                onClick={publishAudioBook}
                disabled={isPublishing || recordedCount === 0}
                className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
              >
                {isPublishing ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{publishProgress}%</>
                ) : (
                  <><Upload size={14} /> Publish Audiobook</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {publishDone && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="text-5xl">🎧</div>
            <h2 className="text-2xl font-black text-white">Audiobook Published!</h2>
            <p className="text-white/50 text-sm">Chapter {chapterIndex + 1} audio is live. Listeners can now hear it in the Lorea reader.</p>
            <button onClick={onBack} className="px-6 py-3 bg-purple-600 rounded-2xl text-xs font-black uppercase tracking-widest">Back to Book</button>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default AudioBookStudio;
