/**
 * Safety gates — drop-in wrappers that enforce the viewer's Content & Safety
 * settings anywhere content renders.
 *
 *   <SensitiveContentGate labels={post.contentLabels}>…media/text…</SensitiveContentGate>
 *     Blurs labeled content and asks before revealing. Per-post reveal;
 *     "always show" shortcut updates the user's settings.
 *
 *   <MutedContentGate text={post.text} authorName={…}>…content…</MutedContentGate>
 *     If the post matches the viewer's muted words/topics, the CONTENT is
 *     blurred — the author stays visible — with a notice, a brief description,
 *     and a one-tap unmute for that post.
 *
 *   <CleanText text={…} />
 *     Renders text with profanity blurred (tap a word to reveal) when the
 *     viewer's Clean Speech filter is on.
 */

import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, ShieldAlert, VolumeX } from 'lucide-react';
import {
  type ContentLabel, type SafetySettings,
  loadSafetySettings, saveSafetySettings, getCachedSafetySettings, onSafetySettingsChange,
  shouldGate, labelName, checkMuted, segmentProfanity,
} from '../../services/contentSafetyService';

// ─── Shared hook ─────────────────────────────────────────────────────────────

export function useSafetySettings(): SafetySettings {
  const [settings, setSettings] = useState<SafetySettings>(getCachedSafetySettings());
  useEffect(() => {
    let mounted = true;
    loadSafetySettings().then(s => { if (mounted) setSettings(s); });
    const off = onSafetySettingsChange(s => { if (mounted) setSettings({ ...s }); });
    return () => { mounted = false; off(); };
  }, []);
  return settings;
}

// ─── Sensitive content gate ──────────────────────────────────────────────────

export const SensitiveContentGate: React.FC<{
  labels?: ContentLabel[];
  children: React.ReactNode;
  /** compact = smaller cover for inline media tiles */
  compact?: boolean;
}> = ({ labels, children, compact }) => {
  const settings = useSafetySettings();
  const [revealed, setRevealed] = useState(false);
  const { gated, reasons } = shouldGate(labels, settings);

  if (!gated || revealed) {
    return (
      <>
        {children}
        {gated && revealed && (
          <button
            onClick={() => setRevealed(false)}
            className="mt-1 flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors">
            <EyeOff size={9} /> Hide again
          </button>
        )}
      </>
    );
  }

  const alwaysShow = async () => {
    const next = { ...settings };
    if (reasons.includes('GRAPHIC_VIOLENCE')) next.blurGraphic = false;
    if (reasons.some(r => r === 'MATURE_18' || r === 'ARTISTIC_NUDITY')) next.blurAdult = false;
    await saveSafetySettings(next);
    setRevealed(true);
  };

  return (
    <div className="relative rounded-2xl overflow-hidden">
      {/* blurred preview of the actual content */}
      <div className="pointer-events-none select-none blur-2xl saturate-50 opacity-60" aria-hidden>
        {children}
      </div>
      <div className={`absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 backdrop-blur-sm ${compact ? 'p-3' : 'p-6'}`}>
        <ShieldAlert size={compact ? 16 : 22} className="text-[#FF8C00]" />
        <p className={`font-black uppercase tracking-widest text-white text-center ${compact ? 'text-[8px]' : 'text-[10px]'}`}>
          {reasons.map(labelName).join(' · ')}
        </p>
        {!compact && (
          <p className="text-[9px] text-white/50 text-center max-w-60 leading-relaxed">
            The creator marked this content. Do you want to see it?
          </p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <button
            onClick={() => setRevealed(true)}
            className={`flex items-center gap-1.5 rounded-full bg-[#FF8C00] text-black font-black uppercase tracking-widest hover:bg-[#ffa033] transition-colors ${compact ? 'px-3 py-1.5 text-[8px]' : 'px-4 py-2 text-[9px]'}`}>
            <Eye size={compact ? 9 : 11} /> View
          </button>
          {!compact && (
            <button
              onClick={alwaysShow}
              className="px-4 py-2 rounded-full bg-white/10 border border-white/15 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white transition-colors">
              Always show
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Muted content gate ──────────────────────────────────────────────────────

export const MutedContentGate: React.FC<{
  text: string;
  children: React.ReactNode;
}> = ({ text, children }) => {
  const settings = useSafetySettings();
  const [unmuted, setUnmuted] = useState(false);
  const match = unmuted ? null : checkMuted(text ?? '', settings);

  if (!match) return <>{children}</>;

  return (
    <div className="relative rounded-2xl overflow-hidden">
      <div className="pointer-events-none select-none blur-xl opacity-40" aria-hidden>
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 p-5">
        <VolumeX size={18} className="text-white/40" />
        <p className="text-[9px] font-black uppercase tracking-widest text-white/70 text-center">
          This post contains content you chose to mute
        </p>
        <p className="text-[8px] font-bold uppercase tracking-widest text-white/30">
          Muted: {match.matched.map(m => `“${m}”`).join(', ')}
        </p>
        {match.description && (
          <p className="text-[10px] text-white/45 text-center max-w-72 leading-relaxed italic">
            About: {match.description}
          </p>
        )}
        <button
          onClick={() => setUnmuted(true)}
          className="mt-1 flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 border border-white/15 text-[9px] font-black uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/15 transition-colors">
          <Eye size={11} /> Show this post
        </button>
      </div>
    </div>
  );
};

// ─── Clean speech text ───────────────────────────────────────────────────────

export const CleanText: React.FC<{
  text: string;
  className?: string;
}> = ({ text, className }) => {
  const settings = useSafetySettings();
  const [revealedIdx, setRevealedIdx] = useState<Set<number>>(new Set());

  if (!settings.cleanSpeech) return <span className={className}>{text}</span>;

  const segments = segmentProfanity(text ?? '');
  if (segments.length === 1 && !segments[0].profane) return <span className={className}>{text}</span>;

  return (
    <span className={className}>
      {segments.map((seg, i) => seg.profane && !revealedIdx.has(i) ? (
        <button
          key={i}
          title="Filtered by your Clean Speech setting — tap to reveal"
          onClick={(e) => { e.stopPropagation(); setRevealedIdx(prev => new Set(prev).add(i)); }}
          className="inline-block align-baseline blur-[5px] hover:blur-[3px] bg-white/10 rounded px-0.5 cursor-pointer select-none transition-all"
          aria-label="filtered word">
          {seg.text}
        </button>
      ) : (
        <React.Fragment key={i}>{seg.text}</React.Fragment>
      ))}
    </span>
  );
};

export default SensitiveContentGate;
