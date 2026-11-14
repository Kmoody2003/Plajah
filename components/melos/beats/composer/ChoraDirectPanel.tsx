// Chora Direct Panel — Phase 2 UI.
//
// Lets the producer write in Suno's style + [Section] lyrics language (or Chora extensions like
// [Verse 1 | 8 bars | mp], {Fm9 | Bbm7}, word~, ^word, wo-o-ord, /), see the compiled SongBrief
// and player read-through notes (`reviewBrief()`) live, and hand the single-truth brief directly
// to the project doc, Composer Council, Session Band, and Music Lab.

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Check, AlertTriangle, Info, Lightbulb, Users, Feather, Music, Wand2 } from 'lucide-react';
import type { GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { parseSongPrompt } from '../../../../services/melos/direct/songPrompt';
import {
  compileSongBrief,
  reviewBrief,
  type ReviewNote,
  type SongBrief,
} from '../../../../services/melos/direct/songBrief';
import { applyBriefToDoc, buildBriefStudioHandoffs } from '../../../../services/melos/direct/applyBriefToDoc';

interface Props {
  doc: GrooveDoc;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onBriefCompiled?: (brief: SongBrief) => void;
  onOpenCouncil?: (groundingDescription: string) => void;
  onOpenBand?: () => void;
  onOpenMusicLab?: (brief: SongBrief) => void;
  onClose: () => void;
}

const EXAMPLES = [
  {
    label: 'Deep House',
    style: 'deep house, 122 bpm, F minor, warm rhodes, female vocal',
    lyrics: '[Intro | 4 bars | mp]\n[Verse 1 | 8 bars | mf]\nCity lights are calling out my name~\n[Drop | 16 bars | ff]\nHold me in the ^mo-o-oment / tonight',
  },
  {
    label: 'Afro-Cuban Jazz',
    style: 'latin jazz, afro-cuban, 184 bpm, Bb major',
    lyrics: '[Head | 16 bars | mf]\n{Bbmaj7 | Gm7 | Cm7 | F7}\n[Solo: tenor sax | 16 bars | f]',
  },
  {
    label: 'Viennese Waltz',
    style: 'viennese waltz, 3/4, D major, strings',
    lyrics: '[Intro | 4 bars | p]\n[Theme | 16 bars | mf]\nLanterns glowing across the hall',
  },
  {
    label: 'Epic Trailer',
    style: 'epic trailer, massive war drums, heroic brass, D minor',
    lyrics: '[Intro | 8 bars | p]\n[Build | 8 bars | mf]\n[Drop | 16 bars | ff]',
  },
];

const ACCENT = '#8B5CFF';

export const ChoraDirectPanel: React.FC<Props> = ({
  doc,
  onMutate,
  onBriefCompiled,
  onOpenCouncil,
  onOpenBand,
  onOpenMusicLab,
  onClose,
}) => {
  const [splitBoxes, setSplitBoxes] = useState(true);
  const [title, setTitle] = useState(doc.name && doc.name !== 'Untitled' ? doc.name : '');
  const [styleText, setStyleText] = useState('deep house, 122 bpm, F minor, warm rhodes, female vocal');
  const [lyricText, setLyricText] = useState(
    '[Intro | 4 bars | mp]\n[Verse 1 | 8 bars | mf]\nCity lights are calling out my name~\n[Drop | 16 bars | ff]\nHold me in the ^mo-o-oment / tonight',
  );
  const [singleText, setSingleText] = useState(
    'deep house, 122 bpm, F minor, warm rhodes, female vocal\n\n[Intro | 4 bars | mp]\n[Verse 1 | 8 bars | mf]\nCity lights are calling out my name~\n[Drop | 16 bars | ff]\nHold me in the ^mo-o-oment / tonight',
  );
  const [appliedMsg, setAppliedMsg] = useState('');

  const { brief, notes, handoffs } = useMemo(() => {
    const parsed = splitBoxes
      ? parseSongPrompt({ style: styleText, lyrics: lyricText, title: title.trim() || undefined })
      : parseSongPrompt(singleText);
    const b = compileSongBrief(parsed, { bpm: doc.bpm });
    const n = reviewBrief(b);
    const h = buildBriefStudioHandoffs(b);
    return { brief: b, notes: n, handoffs: h };
  }, [splitBoxes, styleText, lyricText, singleText, title, doc.bpm]);

  const applyToProject = () => {
    onMutate((d) => {
      applyBriefToDoc(d, brief);
    });
    onBriefCompiled?.(brief);
    setAppliedMsg(`Applied ${brief.pack.label} (${brief.bpm} BPM, ${brief.keyName}, ${brief.totalBars} bars)`);
  };

  const levelBadge = (level: ReviewNote['level']) => {
    if (level === 'problem') return { icon: AlertTriangle, cls: 'border-rose-400/35 bg-rose-500/10 text-rose-200' };
    if (level === 'suggest') return { icon: Lightbulb, cls: 'border-amber-400/35 bg-amber-500/10 text-amber-200' };
    return { icon: Info, cls: 'border-white/15 bg-white/[0.04] text-white/75' };
  };

  const panel = (
    <div
      className="fixed inset-y-3 right-3 z-50 w-[min(94vw,660px)] rounded-2xl border border-white/15 bg-[#120B1C]/95 text-white shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden"
      data-testid="chora-direct-panel"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Wand2 size={16} style={{ color: ACCENT }} />
          <div>
            <div className="text-sm font-semibold">Chora Direct</div>
            <div className="text-[11px] text-white/50">Single-truth brief for Council, Session Band &amp; Music Lab</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (splitBoxes) {
                setSingleText([title.trim() ? `Title: ${title.trim()}` : '', styleText.trim(), '', lyricText.trim()].filter(Boolean).join('\n'));
              }
              setSplitBoxes((v) => !v);
            }}
            className="h-7 px-2.5 rounded-lg border border-white/15 text-[11px] text-white/70 hover:text-white hover:bg-white/10"
          >
            {splitBoxes ? 'Single Box' : 'Style + Lyrics'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-lg border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10"
            title="Close Chora Direct"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/40 mr-1">Examples:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => {
                setStyleText(ex.style);
                setLyricText(ex.lyrics);
                setSingleText(`${ex.style}\n\n${ex.lyrics}`);
                setAppliedMsg('');
              }}
              className="h-6 px-2 rounded-md border border-white/15 bg-white/[0.04] text-[10px] text-white/75 hover:bg-[#8B5CFF]/20 hover:border-[#8B5CFF]/40"
            >
              {ex.label}
            </button>
          ))}
        </div>

        {splitBoxes ? (
          <div className="space-y-2.5">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Song title (optional)"
              className="w-full rounded-lg border border-white/15 bg-[#191026] px-2.5 py-1.5 text-xs text-white placeholder:text-white/35"
            />
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-white/45 mb-1">
                Style Line (genre, BPM, key, meter, instrumentation, exclusions)
              </label>
              <textarea
                rows={2}
                value={styleText}
                onChange={(e) => { setStyleText(e.target.value); setAppliedMsg(''); }}
                className="w-full rounded-lg border border-white/15 bg-[#191026] px-2.5 py-2 text-xs text-white placeholder:text-white/35"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-white/45 mb-1">
                Sections, Chords &amp; Lyrics ([Section | bars | dynamic], {'{Chords}'}, word~, ^accent, wo-o-ord, /)
              </label>
              <textarea
                rows={5}
                value={lyricText}
                onChange={(e) => { setLyricText(e.target.value); setAppliedMsg(''); }}
                className="w-full rounded-lg border border-white/15 bg-[#191026] px-2.5 py-2 font-mono text-[11px] text-white placeholder:text-white/35"
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-white/45 mb-1">
              Full Chora Prompt (style line before first [Section])
            </label>
            <textarea
              rows={8}
              value={singleText}
              onChange={(e) => { setSingleText(e.target.value); setAppliedMsg(''); }}
              className="w-full rounded-lg border border-white/15 bg-[#191026] px-2.5 py-2 font-mono text-[11px] text-white"
            />
          </div>
        )}

        {/* Compiled Brief Summary */}
        <div className="rounded-xl border border-[#8B5CFF]/30 bg-[#8B5CFF]/[0.08] p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-[#8B5CFF]/25 text-[#E3D4FF] font-semibold text-[11px]">
                {brief.pack.label}{brief.blend ? ` × ${brief.blend.label}` : ''}
              </span>
              <span className="text-white/60 text-[11px]">{brief.pack.family}</span>
            </div>
            <div className="text-[11px] text-white/80 font-mono">
              {brief.bpm} BPM · {brief.keyName} · {brief.meter[0]}/{brief.meter[1]} · {brief.totalBars} bars (~{brief.seconds}s)
            </div>
          </div>
          <div className="text-[11px] text-white/60">
            Session Band genre: <span className="text-white/90 font-mono">{handoffs.bandGenre}</span> · Chart:{' '}
            <span className="text-white/85 font-mono break-all">{handoffs.bandChart}</span>
          </div>
          {brief.unknownTags.length > 0 && (
            <div className="text-[11px] text-amber-200/80">
              Kept as written directions: {brief.unknownTags.join(', ')}
            </div>
          )}
        </div>

        {/* Form & Sections */}
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-white/45">Form ({brief.sections.length} sections)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {brief.sections.map((sec) => (
              <div key={sec.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-white">{sec.label}</span>
                  <span className="text-white/50 font-mono">
                    bars {sec.startBar + 1}–{sec.startBar + sec.bars} · {sec.dynamic}
                  </span>
                </div>
                <div className="text-[10px] text-white/55 font-mono truncate mt-0.5">
                  {sec.chords.slice(0, 4).map((b) => b.join(' ')).join(' | ')}
                  {sec.chords.length > 4 ? ' | …' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Read-through Notes */}
        {notes.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-white/45">Read-Through ({notes.length})</div>
            <div className="space-y-1">
              {notes.map((n, idx) => {
                const { icon: Icon, cls } = levelBadge(n.level);
                return (
                  <div key={idx} className={`rounded-lg border px-2.5 py-1.5 flex items-start gap-2 text-[11px] ${cls}`}>
                    <Icon size={13} className="shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">{n.role}:</span> {n.message}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {appliedMsg && (
          <div className="rounded-lg border border-emerald-400/35 bg-emerald-500/15 px-3 py-2 text-emerald-200 text-[11px] flex items-center gap-1.5">
            <Check size={13} /> {appliedMsg}
          </div>
        )}
      </div>

      {/* Hand-off Footer */}
      <div className="px-4 py-3 border-t border-white/10 bg-[#0D0814]/80 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={applyToProject}
          className="h-8 px-3 rounded-lg bg-[#8B5CFF] hover:bg-[#7A49F5] text-white font-semibold text-xs flex items-center gap-1.5"
        >
          <Check size={13} /> Apply Brief to Project
        </button>
        {onOpenCouncil && (
          <button
            type="button"
            onClick={() => {
              applyToProject();
              onOpenCouncil(handoffs.councilDescription);
              onClose();
            }}
            className="h-8 px-3 rounded-lg border border-white/15 bg-white/[0.06] hover:bg-white/10 text-white text-xs flex items-center gap-1.5"
          >
            <Feather size={13} /> Open in Council
          </button>
        )}
        {onOpenBand && (
          <button
            type="button"
            onClick={() => {
              applyToProject();
              onOpenBand();
              onClose();
            }}
            className="h-8 px-3 rounded-lg border border-white/15 bg-white/[0.06] hover:bg-white/10 text-white text-xs flex items-center gap-1.5"
          >
            <Users size={13} /> Open in Session Band
          </button>
        )}
        {onOpenMusicLab && (
          <button
            type="button"
            onClick={() => {
              applyToProject();
              onOpenMusicLab(brief);
              onClose();
            }}
            className="h-8 px-3 rounded-lg border border-[#D0BCFF]/35 bg-[#8B5CFF]/15 hover:bg-[#8B5CFF]/25 text-[#E5D9FF] text-xs flex items-center gap-1.5"
          >
            <Music size={13} /> Open in Music Lab
          </button>
        )}
        {!onOpenCouncil && !onOpenBand && !onOpenMusicLab && (
          <span className="text-[11px] text-white/45 flex items-center gap-1">
            <Sparkles size={12} /> Brief synced to doc
          </span>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(panel, document.body) : panel;
};

export default ChoraDirectPanel;
