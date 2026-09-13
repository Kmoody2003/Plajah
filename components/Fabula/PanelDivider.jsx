import React from 'react';

/** Pointer capture supports mouse, pen and touch; arrows provide keyboard resizing. */
export default function PanelDivider({ label, value, onChange, min = 150, max = 900, vertical = false, reverse = false, percent = false }) {
  const change = (n) => onChange(Math.max(min, Math.min(max, n)));
  return <div role="separator" aria-label={label} aria-orientation={vertical ? 'horizontal' : 'vertical'}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)} tabIndex={0}
    className={vertical ? 'panel-divider horizontal' : 'panel-divider'} title={label}
    onKeyDown={(e) => {
      const d = ['ArrowRight', 'ArrowDown'].includes(e.key) ? 10 : ['ArrowLeft', 'ArrowUp'].includes(e.key) ? -10 : 0;
      if (d) { e.preventDefault(); change(value + d * (reverse ? -1 : 1)); }
    }}
    onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.dataset.origin = String(vertical ? e.clientY : e.clientX); e.currentTarget.dataset.size = String(value); }}
    onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) change(Number(e.currentTarget.dataset.size) + ((vertical ? e.clientY : e.clientX) - Number(e.currentTarget.dataset.origin)) * (reverse ? -1 : 1) * (percent ? 100 / Math.max(1, e.currentTarget.parentElement.clientWidth) : 1)); }}
    onPointerUp={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }} />;
}
