import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Mic,
  Music2,
  Play,
  RefreshCw,
  Scissors,
  Sparkles,
  X,
} from 'lucide-react';
import type { GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import type { SongBrief } from '../../../../services/melos/direct/songBrief';
import {
  phraseDisplay,
  regenRequest,
  staleRegions,
  vocalGuideNotes,
  type VocalLayer,
  type VocalNote,
  type VocalPhrase,
  type VocalRegenRequest,
} from '../../../../services/melos/direct/vocalScore';
import {
  applyVocalNoteEdit,
  applyVocalPhraseDelivery,
  applyVocalPhraseMove,
  applyVocalPhraseRetext,
  applyVocalPhraseSplit,
} from '../../../../services/melos/direct/vocalTimeline';

export interface VocalTrackPanelProps {
  doc: GrooveDoc;
  layer: VocalLayer;
  brief?: SongBrief | null;
  onChangeLayer: (next: VocalLayer) => void;
  onPreviewGuide?: (notes: { startBeats: number; lengthBeats: number; key: number; vel: number }[]) => void;
  onCreateGuideTrack?: (notes: { startBeats: number; lengthBeats: number; key: number; vel: number }[]) => void;
  onRegenerateRegion?: (req: VocalRegenRequest) => void;
  onClose?: () => void;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const DELIVERY_PRESETS = ['whispered', 'belted', 'falsetto', 'rap', 'spoken'] as const;

function midiToNoteName(midi: number): string {
  const clamped = Math.max(0, Math.min(127, Math.round(midi)));
  const name = NOTE_NAMES[clamped % 12];
  const octave = Math.floor(clamped / 12) - 1;
  return `${name}${octave}`;
}

function formatBarBeat(beat: number, beatsPerBar: number): string {
  const safeBeat = Math.max(0, beat);
  const bar = Math.floor(safeBeat / beatsPerBar) + 1;
  const beatInBar = (safeBeat % beatsPerBar) + 1;
  return `${bar}.${beatInBar.toFixed(1)}`;
}

const TAKE_BADGE: Record<VocalPhrase['take']['status'], { label: string; className: string }> = {
  fresh: {
    label: 'Fresh',
    className: 'border-emerald-400/35 bg-emerald-500/15 text-emerald-300',
  },
  stale: {
    label: 'Stale',
    className: 'border-amber-400/40 bg-amber-500/15 text-amber-300',
  },
  none: {
    label: 'Unrendered',
    className: 'border-[#D0BCFF]/30 bg-[#D0BCFF]/10 text-[#D0BCFF]',
  },
};

export const VocalTrackPanel: React.FC<VocalTrackPanelProps> = ({
  doc,
  layer,
  brief,
  onChangeLayer,
  onPreviewGuide,
  onCreateGuideTrack,
  onRegenerateRegion,
  onClose,
}) => {
  const beatsPerBar = brief?.beatsPerBar ?? 4;
  const bpm = brief?.bpm ?? doc.bpm;

  const [selectedNote, setSelectedNote] = useState<{ phraseId: string; noteId: string } | null>(null);
  const [draftLyrics, setDraftLyrics] = useState<Record<string, string>>({});
  const [engineStatus, setEngineStatus] = useState<string | null>(null);

  // Keep draft lyrics synced when phrases are added, split, or replaced externally.
  useEffect(() => {
    setDraftLyrics((prev) => {
      const next: Record<string, string> = {};
      for (const p of layer.phrases) {
        next[p.id] = prev[p.id] !== undefined && prev[p.id] !== p.text ? prev[p.id] : p.text;
      }
      return next;
    });
  }, [layer.phrases]);

  const dirtyRegions = useMemo(() => staleRegions(layer), [layer]);
  const guideNotes = useMemo(() => vocalGuideNotes(layer), [layer]);

  const selectedPhrase = useMemo(
    () => (selectedNote ? layer.phrases.find((p) => p.id === selectedNote.phraseId) ?? null : null),
    [layer.phrases, selectedNote],
  );
  const selectedNoteObj = useMemo(
    () =>
      selectedPhrase && selectedNote
        ? selectedPhrase.notes.find((n) => n.id === selectedNote.noteId) ?? null
        : null,
    [selectedPhrase, selectedNote],
  );

  const handleCommitRetext = (phrase: VocalPhrase) => {
    const nextText = (draftLyrics[phrase.id] ?? phrase.text).trim();
    if (!nextText || nextText === phrase.text) return;
    setDraftLyrics((prev) => ({ ...prev, [phrase.id]: nextText }));
    onChangeLayer(applyVocalPhraseRetext(layer, phrase.id, nextText));
  };

  const handleNudgePhrase = (phraseId: string, deltaBeats: number) => {
    onChangeLayer(applyVocalPhraseMove(layer, phraseId, deltaBeats));
  };

  const handleSplitAtSelected = (phraseId: string) => {
    if (!selectedNote || selectedNote.phraseId !== phraseId) return;
    onChangeLayer(applyVocalPhraseSplit(layer, phraseId, selectedNote.noteId));
    setSelectedNote(null);
  };

  const handlePitchStep = (phraseId: string, note: VocalNote, semitones: number) => {
    const nextKey = Math.max(24, Math.min(108, note.key + semitones));
    onChangeLayer(applyVocalNoteEdit(layer, phraseId, note.id, { key: nextKey }));
  };

  const handleToggleDelivery = (phrase: VocalPhrase, tag: string) => {
    const exists = phrase.delivery.includes(tag);
    const next = exists
      ? phrase.delivery.filter((d) => d !== tag)
      : [...phrase.delivery, tag];
    onChangeLayer(applyVocalPhraseDelivery(layer, phrase.id, next));
  };

  const handleRegenerateStale = () => {
    if (dirtyRegions.length === 0) {
      setEngineStatus('All vocal phrases are already fresh.');
      return;
    }
    if (!onRegenerateRegion || !brief) {
      setEngineStatus(
        `No singing engine attached — ${dirtyRegions.length} region${dirtyRegions.length === 1 ? '' : 's'} queued.`,
      );
      return;
    }
    setEngineStatus(
      `Queued ${dirtyRegions.length} stale region${dirtyRegions.length === 1 ? '' : 's'} for singing synthesis.`,
    );
    for (const region of dirtyRegions) {
      onRegenerateRegion(regenRequest(layer, region, brief));
    }
  };

  return (
    <section
      className="flex flex-col rounded-xl border border-[#2A2738] bg-[#121118] text-zinc-100 shadow-2xl"
      aria-label="Chora Direct Vocal Track"
    >
      {/* Top Studio Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#252232] bg-[#171520] px-4 py-3 rounded-t-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#00DAF3]/35 bg-[#00DAF3]/10 text-[#00DAF3]">
            <Mic className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-wide text-white">
                Vocal Track Score
              </h2>
              <span className="rounded-full border border-[#D0BCFF]/30 bg-[#D0BCFF]/10 px-2 py-0.5 text-[11px] font-medium text-[#D0BCFF]">
                {layer.voice.name}
              </span>
              <span className="text-[11px] text-zinc-400">
                {midiToNoteName(layer.voice.range[0])}–{midiToNoteName(layer.voice.range[1])}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              {layer.phrases.length} phrase{layer.phrases.length === 1 ? '' : 's'} · {bpm} BPM ·{' '}
              {brief?.keyName ?? 'Project Key'} · {layer.language.toUpperCase()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedNoteObj && selectedPhrase && (
            <div className="flex items-center gap-1 rounded-lg border border-[#00DAF3]/30 bg-[#00DAF3]/10 px-2 py-1 text-xs">
              <span className="font-mono text-[#00DAF3]">
                “{selectedNoteObj.syllable || '—'}” {midiToNoteName(selectedNoteObj.key)}
              </span>
              <button
                type="button"
                onClick={() => handlePitchStep(selectedPhrase.id, selectedNoteObj, -1)}
                className="ml-1 rounded bg-[#1D1B27] px-1.5 py-0.5 text-[11px] font-medium text-zinc-200 hover:bg-[#2A2738]"
                title="Pitch down 1 semitone"
              >
                -1
              </button>
              <button
                type="button"
                onClick={() => handlePitchStep(selectedPhrase.id, selectedNoteObj, 1)}
                className="rounded bg-[#1D1B27] px-1.5 py-0.5 text-[11px] font-medium text-zinc-200 hover:bg-[#2A2738]"
                title="Pitch up 1 semitone"
              >
                +1
              </button>
            </div>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#2A2738] bg-[#1B1924] p-1.5 text-zinc-400 hover:border-zinc-600 hover:text-white"
              aria-label="Close vocal track panel"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* Stale Regions & Guide Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#252232] bg-[#15131D] px-4 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[#2A2738] bg-[#1C1A26] px-2.5 py-1 text-zinc-300">
            <Sparkles className="h-3.5 w-3.5 text-[#D0BCFF]" />
            <span>
              <strong className="font-semibold text-white">{dirtyRegions.length}</strong>{' '}
              dirty window{dirtyRegions.length === 1 ? '' : 's'}
            </span>
          </span>
          {engineStatus && (
            <span className="text-[11px] text-[#00DAF3]">{engineStatus}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRegenerateStale}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D0BCFF]/40 bg-[#D0BCFF]/15 px-3 py-1.5 text-xs font-medium text-[#D0BCFF] transition hover:bg-[#D0BCFF]/25"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate stale
          </button>

          <button
            type="button"
            onClick={() => onPreviewGuide?.(guideNotes)}
            disabled={!onPreviewGuide || guideNotes.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#00DAF3]/40 bg-[#00DAF3]/15 px-3 py-1.5 text-xs font-medium text-[#00DAF3] transition hover:bg-[#00DAF3]/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" />
            Preview Guide
          </button>

          <button
            type="button"
            onClick={() => onCreateGuideTrack?.(guideNotes)}
            disabled={!onCreateGuideTrack || guideNotes.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#2F2B3F] bg-[#1E1C29] px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:border-[#00DAF3]/50 hover:text-[#00DAF3] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Music2 className="h-3.5 w-3.5" />
            Bounce Guide MIDI
          </button>
        </div>
      </div>

      {/* Phrases & Syllable Beat Lanes */}
      <div className="flex flex-col gap-3 p-4 max-h-[540px] overflow-y-auto">
        {layer.phrases.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#2C293B] bg-[#16141F] p-6 text-center text-xs text-zinc-400">
            No vocal phrases in this layer yet.
          </div>
        ) : (
          layer.phrases.map((phrase, phraseIdx) => {
            const badge = TAKE_BADGE[phrase.take.status];
            const phraseEnd = phrase.startBeats + phrase.lengthBeats;
            const spanBeats = Math.max(0.25, phrase.lengthBeats);
            const displayItems = phraseDisplay(phrase);
            const isPhraseSelected = selectedNote?.phraseId === phrase.id;
            const selectedIndexInPhrase = isPhraseSelected
              ? phrase.notes.findIndex((n) => n.id === selectedNote?.noteId)
              : -1;
            const canSplit = selectedIndexInPhrase > 0;

            return (
              <div
                key={phrase.id}
                className="rounded-xl border border-[#262334] bg-[#171520] p-3 transition hover:border-[#343048]"
              >
                {/* Phrase Meta & Controls Row */}
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-[#00DAF3]">
                      P{phraseIdx + 1}
                    </span>
                    <span className="rounded bg-[#111017] px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                      Bar {formatBarBeat(phrase.startBeats, beatsPerBar)}–
                      {formatBarBeat(phraseEnd, beatsPerBar)}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-500">
                      ({phrase.startBeats.toFixed(1)}b–{phraseEnd.toFixed(1)}b)
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  {/* Phrase Nudge & Split Controls */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleNudgePhrase(phrase.id, -0.5)}
                      disabled={phrase.startBeats <= 0}
                      className="inline-flex items-center gap-0.5 rounded border border-[#2A2738] bg-[#1D1B27] px-2 py-1 text-[11px] text-zinc-300 hover:border-[#00DAF3]/50 hover:text-white disabled:opacity-40"
                      title="Nudge phrase earlier by 0.5 beats"
                    >
                      <ChevronLeft className="h-3 w-3" />
                      -0.5b
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNudgePhrase(phrase.id, 0.5)}
                      className="inline-flex items-center gap-0.5 rounded border border-[#2A2738] bg-[#1D1B27] px-2 py-1 text-[11px] text-zinc-300 hover:border-[#00DAF3]/50 hover:text-white"
                      title="Nudge phrase later by 0.5 beats"
                    >
                      +0.5b
                      <ChevronRight className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSplitAtSelected(phrase.id)}
                      disabled={!canSplit}
                      className="inline-flex items-center gap-1 rounded border border-[#D0BCFF]/35 bg-[#D0BCFF]/10 px-2 py-1 text-[11px] text-[#D0BCFF] hover:bg-[#D0BCFF]/20 disabled:cursor-not-allowed disabled:opacity-35"
                      title={
                        canSplit
                          ? 'Split phrase before the selected note'
                          : 'Select a note after the first syllable to split'
                      }
                    >
                      <Scissors className="h-3 w-3" />
                      Split
                    </button>
                  </div>
                </div>

                {/* Inline Retext Input & Delivery Tags */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <div className="flex min-w-[220px] flex-1 items-center gap-1.5">
                    <input
                      type="text"
                      value={draftLyrics[phrase.id] ?? phrase.text}
                      onChange={(e) =>
                        setDraftLyrics((prev) => ({ ...prev, [phrase.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCommitRetext(phrase);
                        }
                      }}
                      onBlur={() => handleCommitRetext(phrase)}
                      placeholder="Edit phrase lyrics..."
                      aria-label={`Lyrics for phrase ${phraseIdx + 1}`}
                      className="w-full rounded-lg border border-[#2B283A] bg-[#121118] px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:border-[#00DAF3] focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    {DELIVERY_PRESETS.map((tag) => {
                      const active = phrase.delivery.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleToggleDelivery(phrase, tag)}
                          className={`rounded-full border px-2 py-0.5 text-[10px] transition ${
                            active
                              ? 'border-[#00DAF3]/50 bg-[#00DAF3]/15 text-[#00DAF3]'
                              : 'border-[#2A2738] bg-[#13121A] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Beat Ruler + Syllables Drawn Directly Over Notes */}
                <div className="relative rounded-lg border border-[#242131] bg-[#121118] px-2 py-2">
                  {/* Beat tick ruler */}
                  <div className="mb-1.5 flex justify-between border-b border-[#221F2F] pb-1 font-mono text-[10px] text-zinc-500">
                    <span>{phrase.startBeats.toFixed(1)}b</span>
                    <span>{(phrase.startBeats + spanBeats * 0.5).toFixed(1)}b</span>
                    <span>{phraseEnd.toFixed(1)}b</span>
                  </div>

                  {/* Proportional Note / Syllable Lane */}
                  <div className="relative h-14 w-full">
                    {phrase.notes.map((note, noteIdx) => {
                      const leftPct = Math.max(
                        0,
                        Math.min(96, ((note.startBeats - phrase.startBeats) / spanBeats) * 100),
                      );
                      const widthPct = Math.max(
                        6,
                        Math.min(100 - leftPct, (note.lengthBeats / spanBeats) * 100),
                      );
                      const isSelected =
                        selectedNote?.phraseId === phrase.id &&
                        selectedNote?.noteId === note.id;
                      const label = displayItems[noteIdx]?.label ?? note.syllable;

                      return (
                        <button
                          key={note.id}
                          type="button"
                          onClick={() =>
                            setSelectedNote({ phraseId: phrase.id, noteId: note.id })
                          }
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          className={`absolute top-0 bottom-0 flex flex-col items-start justify-between overflow-hidden rounded-md border px-1.5 py-1 text-left transition ${
                            isSelected
                              ? 'z-10 border-[#00DAF3] bg-[#00DAF3]/20 ring-1 ring-[#00DAF3]/60'
                              : 'border-[#332E47] bg-[#1E1B2B] hover:border-[#D0BCFF]/60'
                          }`}
                          title={`${label} · ${midiToNoteName(note.key)} (${note.lengthBeats.toFixed(2)}b)`}
                        >
                          <span className="truncate text-[11px] font-semibold leading-tight text-white">
                            {label || '·'}
                          </span>
                          <span className="rounded bg-[#121118]/90 px-1 py-0.2 font-mono text-[9px] text-[#D0BCFF]">
                            {midiToNoteName(note.key)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
