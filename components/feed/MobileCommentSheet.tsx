// Phone / tablet / foldable comments: a bottom sheet whose bottom edge rides on top of the on-screen keyboard, so the
// thread and the box you're typing in stay together right above the keys — no empty gap, no minimising the keyboard
// to scroll back up. Portalled to <body> because the feed's animated wrappers carry CSS transforms, which would
// re-anchor `position: fixed` to the card instead of the screen.
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';

export interface MobileCommentSheetProps {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}

const MobileCommentSheet: React.FC<MobileCommentSheetProps> = ({ title = 'Comments', onClose, children }) => {
  const kb = useKeyboardInset(true);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const startY = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, []);

  // With the keyboard up the sheet takes everything visible above it; otherwise ~88% of the screen.
  const vvH = typeof window !== 'undefined' && window.visualViewport ? window.visualViewport.height : null;
  const height = kb > 0 && vvH ? Math.round(vvH - 8) : undefined;

  // Drag the grab handle down to dismiss.
  const onHandleDown = (e: React.PointerEvent) => { startY.current = e.clientY; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); };
  const onHandleMove = (e: React.PointerEvent) => {
    if (startY.current == null || !sheetRef.current) return;
    const dy = Math.max(0, e.clientY - startY.current);
    sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onHandleUp = (e: React.PointerEvent) => {
    if (startY.current == null || !sheetRef.current) return;
    const dy = e.clientY - startY.current;
    startY.current = null;
    sheetRef.current.style.transform = '';
    if (dy > 90) onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9400]" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div
        ref={sheetRef}
        className="absolute inset-x-0 flex flex-col rounded-t-2xl border-t border-white/10 bg-[#0e0f12] shadow-[0_-12px_40px_rgba(0,0,0,0.55)] overflow-hidden"
        style={{
          bottom: kb,
          height: height ?? '88dvh',
          paddingBottom: kb > 0 ? 0 : 'env(safe-area-inset-bottom)',
          transition: 'bottom 120ms ease-out, height 120ms ease-out, transform 160ms ease-out',
        }}
      >
        <div
          className="relative flex items-center justify-center pt-2 pb-1 shrink-0 touch-none select-none"
          onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}
        >
          <span className="w-10 h-1 rounded-full bg-white/20" aria-hidden />
        </div>
        {/* The section fills the sheet: its list scrolls, its composer stays pinned at the bottom (above the keys). */}
        <div className="flex-1 min-h-0 flex flex-col [&>*]:!h-full [&>*]:!max-h-none [&>*]:!rounded-none [&>*]:!border-0 [&>*]:!shadow-none">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default MobileCommentSheet;
