import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from '../ui';

/**
 * Inventory's one overlay: a bottom sheet on phones, a centred card on desktop. Portaled to
 * document.body — ancestors with CSS transforms (the page transitions) re-anchor `position: fixed`,
 * which made deep-mounted overlays open at the page TOP (see the platform gotchas).
 */
const Sheet: React.FC<{
  title: string; eyebrow?: string; onClose: () => void; wide?: boolean; footer?: React.ReactNode; children: React.ReactNode;
}> = ({ title, eyebrow, onClose, wide, footer, children }) => {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[1300] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`pj-surface pj-surface--5 pj-surface--sheet relative w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[92dvh] flex flex-col rounded-b-none sm:rounded-b-[28px] overflow-hidden`}
        style={{ padding: 0 }}
      >
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 shrink-0">
          <div className="min-w-0">
            {eyebrow && <p className="pj-eyebrow">{eyebrow}</p>}
            <h3 className="type-title-lg font-black truncate" style={{ color: 'var(--text-primary)' }}>{title}</h3>
          </div>
          <IconButton aria-label="Close" variant="ghost" size="sm" onClick={onClose}><X /></IconButton>
        </header>
        <div className="flex-1 overflow-y-auto px-5 pb-5 overscroll-contain">{children}</div>
        {footer && <footer className="shrink-0 px-5 py-4 border-t" style={{ borderColor: 'var(--pj-border)' }}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
};

export default Sheet;
