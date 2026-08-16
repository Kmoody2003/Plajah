// ScriptureRefChip — the inline reference, live anywhere text is rendered.
//
// The design rule from the Lectio direction: a reference is always mono and
// uppercase-tracked ("ROM 8:28"), so it reads as a tappable object on sight
// wherever it appears — a post, a chat message, a sermon note, a caption.
//
// Hover previews the verse; click opens Lectio at that passage. Touch skips
// the preview and opens straight away, since there is no hover to intend with.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { formatRef, refId, type ScriptureRef } from '../../services/scriptureRef';
import { fetchRefText, prefetchRef, type ResolvedRef } from '../../services/scriptureText';

const CARD_W = 320;
const HOVER_DELAY = 240;

/** Open the reader at a passage. The listener lives in App.tsx. */
export function openScripture(ref: ScriptureRef): void {
  window.dispatchEvent(new CustomEvent('OPEN_BIBLE', { detail: { refId: refId(ref) } }));
}

interface Props {
  refObj: ScriptureRef;
  /** The text as the author actually wrote it. */
  raw: string;
  /** Preview on hover. Off in dense surfaces like a chat list. */
  preview?: boolean;
  className?: string;
}

const ScriptureRefChip: React.FC<Props> = ({ refObj, raw, preview = true, className }) => {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const [data, setData] = useState<ResolvedRef | null>(null);
  const [failed, setFailed] = useState(false);

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };
  useEffect(() => clearTimer, []);

  const place = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.min(Math.max(12, r.left + r.width / 2 - CARD_W / 2), window.innerWidth - CARD_W - 12);
    // Flip below when there isn't room above.
    const above = r.top > 200;
    setPos({ left, top: above ? r.top - 10 : r.bottom + 10, above });
  }, []);

  const show = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(async () => {
      place();
      setOpen(true);
      if (!data && !failed) {
        const resolved = await fetchRefText(refObj);
        if (resolved) setData(resolved); else setFailed(true);
      }
    }, HOVER_DELAY);
  }, [data, failed, place, refObj]);

  const hide = useCallback(() => { clearTimer(); setOpen(false); }, []);

  // Any scroll or resize invalidates a fixed-position card.
  useEffect(() => {
    if (!open) return;
    const onMove = () => hide();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, hide]);

  const activate = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    hide();
    openScripture(refObj);
  };

  const label = formatRef(refObj, 'display');

  return (
    <>
      <span
        ref={anchorRef}
        role="link"
        tabIndex={0}
        aria-label={`Open ${label} in Lectio`}
        title={label}
        onClick={activate}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') activate(e); }}
        onPointerEnter={(e) => {
          if (!preview || e.pointerType !== 'mouse') return;
          prefetchRef(refObj);
          show();
        }}
        onPointerLeave={hide}
        onFocus={() => { if (preview) { prefetchRef(refObj); show(); } }}
        onBlur={hide}
        className={
          'cursor-pointer font-mono uppercase tracking-wider text-[0.92em] ' +
          'text-[#D4AF37] hover:text-[#F0D171] underline decoration-dotted decoration-[#D4AF37]/50 ' +
          'underline-offset-2 transition-colors focus:outline-none focus-visible:ring-1 ' +
          'focus-visible:ring-[#D4AF37] rounded-sm ' + (className ?? '')
        }
      >
        {raw}
      </span>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: pos.above ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            onMouseEnter={clearTimer}
            onMouseLeave={hide}
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.above ? undefined : pos.top,
              bottom: pos.above ? window.innerHeight - pos.top : undefined,
              width: CARD_W,
              zIndex: 200,
            }}
            className="rounded-xl border border-[#D4AF37]/35 bg-[#131120]/97 backdrop-blur-md shadow-2xl overflow-hidden"
          >
            <div className="px-4 pt-3 pb-2 flex items-baseline justify-between gap-3 border-b border-white/8">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#D4AF37]">{label}</span>
              <span className="text-[9px] uppercase tracking-widest text-white/35">
                {data?.translation ?? '…'}
              </span>
            </div>
            <div className="px-4 py-3">
              {data ? (
                <p
                  className="text-[13px] leading-relaxed text-white/85"
                  style={{ fontFamily: '"Palatino Linotype", Palatino, Georgia, serif' }}
                >
                  {data.text}
                  {data.truncated && <span className="text-white/35"> …</span>}
                </p>
              ) : failed ? (
                <p className="text-[12px] text-white/45">Couldn’t load this passage right now.</p>
              ) : (
                <div className="space-y-2" aria-hidden>
                  <div className="h-2.5 rounded bg-white/8 w-full" />
                  <div className="h-2.5 rounded bg-white/8 w-11/12" />
                  <div className="h-2.5 rounded bg-white/8 w-2/3" />
                </div>
              )}
            </div>
            <div className="px-4 pb-3 text-[9px] uppercase tracking-widest text-white/30">
              Tap to open in Lectio
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
};

export default ScriptureRefChip;
