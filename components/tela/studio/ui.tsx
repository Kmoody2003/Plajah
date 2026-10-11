// Studio UI primitives — compact pro controls in Tela's dark chrome on Plajah DS tokens.
// Numeric fields scrub with the mouse (drag the label), accept arithmetic ("120/2"), and
// commit on Enter/blur; every control is keyboard reachable and labelled for screen readers.
import React, { useEffect, useRef, useState } from 'react';

export const C = {
  bg: '#0e0d14', bg2: '#13121a', rail: '#0b0a10', line: 'rgba(255,255,255,.08)', line2: 'rgba(255,255,255,.14)',
  text: 'rgba(255,255,255,.86)', dim: 'rgba(255,255,255,.5)', faint: 'rgba(255,255,255,.32)',
  accent: 'var(--pj-cyan, #00DAF3)', accentSoft: 'rgba(0,218,243,.13)', magenta: 'var(--pj-magenta, #D40055)',
  brand: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))', field: 'rgba(255,255,255,.055)',
};

export const lblStyle: React.CSSProperties = { fontSize: 9.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: C.faint };

/** Evaluate "12+4", "100/3", "50%"(of base) safely. */
export function evalNumber(s: string, base?: number): number | null {
  const t = s.trim(); if (!t) return null;
  if (/%$/.test(t) && base !== undefined) { const v = parseFloat(t); return isFinite(v) ? base * v / 100 : null; }
  if (!/^[-+*/().\d\s]+$/.test(t)) { const v = parseFloat(t); return isFinite(v) ? v : null; }
  // Tiny recursive-descent evaluator (no eval: CSP-safe in the WinUI / Android shells).
  const src = t.replace(/\s+/g, ''); let i = 0;
  const peek = () => src[i];
  const atom = (): number => {
    if (peek() === '(') { i++; const v = expr(); if (peek() === ')') i++; return v; }
    if (peek() === '-') { i++; return -atom(); } if (peek() === '+') { i++; return atom(); }
    const m = /^\d*\.?\d+/.exec(src.slice(i)); if (!m) throw new Error('nan'); i += m[0].length; return parseFloat(m[0]);
  };
  const term = (): number => { let v = atom(); while (peek() === '*' || peek() === '/') { const op = src[i++]; const r = atom(); v = op === '*' ? v * r : v / r; } return v; };
  const expr = (): number => { let v = term(); while (peek() === '+' || peek() === '-') { const op = src[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; };
  try { const v = expr(); return i === src.length && isFinite(v) ? v : null; } catch { return null; }
}

export const NumField: React.FC<{
  label: string; value: number | null | undefined; onChange: (v: number) => void; onCommit?: () => void;
  step?: number; min?: number; max?: number; unit?: string; width?: number; title?: string; precision?: number; mixed?: boolean;
}> = ({ label, value, onChange, onCommit, step = 1, min, max, unit, width = 64, title, precision = 2, mixed }) => {
  const shown = value === null || value === undefined || mixed ? '' : String(+value.toFixed(precision));
  const [text, setText] = useState(shown); const editing = useRef(false);
  useEffect(() => { if (!editing.current) setText(shown); }, [shown]);
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const commit = () => { editing.current = false; const v = evalNumber(text, value ?? undefined); if (v !== null && v !== value) onChange(clamp(v)); else setText(shown); onCommit?.(); };
  const scrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return; e.preventDefault();
    const x0 = e.clientX, v0 = value ?? 0; let moved = false;
    const move = (ev: PointerEvent) => { const dx = ev.clientX - x0; if (Math.abs(dx) > 2) moved = true; if (!moved) return; const k = ev.shiftKey ? 10 : ev.altKey ? .1 : 1; onChange(clamp(+(v0 + Math.round(dx / 2) * step * k).toFixed(4))); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (moved) onCommit?.(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  return (
    <label title={title ?? label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, width, borderRadius: 6, background: C.field, border: `1px solid ${C.line}`, padding: '0 5px 0 0', flexShrink: 0 }}>
      <span onPointerDown={scrub} style={{ cursor: 'ew-resize', fontSize: 9.5, fontWeight: 800, color: C.dim, padding: '0 3px 0 6px', userSelect: 'none', minWidth: 12 }}>{label}</span>
      <input aria-label={title ?? label} value={text} placeholder={mixed ? '—' : ''} inputMode="decimal"
        onFocus={e => { editing.current = true; e.currentTarget.select(); }} onChange={e => setText(e.target.value)} onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
          else if (e.key === 'Escape') { editing.current = false; setText(shown); (e.target as HTMLInputElement).blur(); }
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const k = (e.shiftKey ? 10 : 1) * step * (e.key === 'ArrowUp' ? 1 : -1); const v = clamp((value ?? 0) + k); onChange(+v.toFixed(4)); }
        }}
        style={{ flex: 1, minWidth: 0, width: '100%', background: 'transparent', border: 0, outline: 'none', color: C.text, fontSize: 11.5, fontVariantNumeric: 'tabular-nums' }} />
      {unit && <span style={{ fontSize: 9, color: C.faint }}>{unit}</span>}
    </label>
  );
};

export const IconBtn: React.FC<{ title: string; onClick?: (e: React.MouseEvent) => void; active?: boolean; disabled?: boolean; children: React.ReactNode; size?: number; style?: React.CSSProperties; danger?: boolean }> = ({ title, onClick, active, disabled, children, size = 26, style, danger }) => (
  <button type="button" title={title} aria-label={title} aria-pressed={active} disabled={disabled} onClick={onClick}
    style={{ display: 'inline-grid', placeItems: 'center', width: size, height: size, borderRadius: 7, border: active ? '1px solid rgba(0,218,243,.45)' : '1px solid transparent', background: active ? C.accentSoft : 'transparent', color: danger ? '#ff8fa8' : active ? '#9ff6ff' : C.text, opacity: disabled ? .35 : 1, cursor: disabled ? 'default' : 'pointer', flexShrink: 0, ...style }}>
    {children}
  </button>
);

export const TextBtn: React.FC<{ onClick?: () => void; children: React.ReactNode; title?: string; active?: boolean; disabled?: boolean; primary?: boolean; style?: React.CSSProperties }> = ({ onClick, children, title, active, disabled, primary, style }) => (
  <button type="button" title={title} onClick={onClick} disabled={disabled}
    style={{ height: 24, padding: '0 8px', borderRadius: 6, fontSize: 10.5, fontWeight: 750, whiteSpace: 'nowrap', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? .4 : 1, color: primary ? '#fff' : active ? '#9ff6ff' : C.text, background: primary ? C.brand : active ? C.accentSoft : C.field, border: `1px solid ${active ? 'rgba(0,218,243,.4)' : C.line}`, ...style }}>
    {children}
  </button>
);

export const Select: React.FC<{ value: string; onChange: (v: string) => void; options: Array<[string, string]>; title: string; width?: number | string; style?: React.CSSProperties }> = ({ value, onChange, options, title, width = 96, style }) => (
  <select aria-label={title} title={title} value={value} onChange={e => onChange(e.target.value)}
    style={{ height: 24, width, padding: '0 4px', borderRadius: 6, background: '#17131d', border: `1px solid ${C.line}`, color: C.text, fontSize: 11, outline: 'none', ...style }}>
    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>
);

export const Row: React.FC<{ children: React.ReactNode; gap?: number; style?: React.CSSProperties; wrap?: boolean }> = ({ children, gap = 6, style, wrap = true }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap', marginBottom: 7, ...style }}>{children}</div>
);

/** A colour chip; 'none' shows the red slash. */
export const Chip: React.FC<{ color: string; size?: number; selected?: boolean; title?: string; onClick?: (e: React.MouseEvent) => void; global?: boolean }> = ({ color, size = 18, selected, title, onClick, global }) => (
  <button type="button" title={title ?? color} aria-label={title ?? color} onClick={onClick}
    style={{ position: 'relative', width: size, height: size, borderRadius: 4, padding: 0, cursor: 'pointer', flexShrink: 0, border: selected ? '2px solid #fff' : '1px solid rgba(255,255,255,.25)', background: color === 'none' ? '#fff' : color, overflow: 'hidden' }}>
    {color === 'none' && <span style={{ position: 'absolute', left: -3, right: -3, top: '50%', height: 2, background: '#e11', transform: 'rotate(-45deg)' }} />}
    {global && <span style={{ position: 'absolute', right: 0, bottom: 0, width: 0, height: 0, borderLeft: '6px solid transparent', borderBottom: '6px solid #fff' }} />}
  </button>
);

/** Native colour input styled as a chip (hex in, hex out). */
export const ColorInput: React.FC<{ value: string; onChange: (v: string) => void; onCommit?: () => void; title: string; size?: number }> = ({ value, onChange, onCommit, title, size = 22 }) => {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : /^#[0-9a-f]{3}$/i.test(value) ? '#' + value.slice(1).split('').map(c => c + c).join('') : '#000000';
  return <input type="color" aria-label={title} title={title} value={hex} onChange={e => onChange(e.target.value)} onBlur={onCommit}
    style={{ width: size, height: size, padding: 0, border: '1px solid rgba(255,255,255,.22)', borderRadius: 5, background: 'transparent', cursor: 'pointer', flexShrink: 0 }} />;
};

/** Collapsible dock section. */
export const Section: React.FC<{ id: string; title: string; open: boolean; onToggle: (id: string) => void; right?: React.ReactNode; children: React.ReactNode }> = ({ id, title, open, onToggle, right, children }) => (
  <section aria-label={title} style={{ borderBottom: `1px solid ${C.line}` }}>
    <header style={{ display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px', cursor: 'pointer', userSelect: 'none' }} onClick={() => onToggle(id)}>
      <span style={{ fontSize: 9, color: C.faint, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}>▶</span>
      <span style={{ ...lblStyle, color: open ? C.text : C.dim }}>{title}</span>
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>{right}</span>
    </header>
    {open && <div style={{ padding: '2px 10px 10px' }}>{children}</div>}
  </section>
);

export const Slider: React.FC<{ label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; onCommit?: () => void; format?: (v: number) => string }> = ({ label, value, min, max, step = .01, onChange, onCommit, format }) => (
  <label style={{ display: 'grid', gridTemplateColumns: '78px 1fr 40px', alignItems: 'center', gap: 6, marginBottom: 5 }}>
    <span style={{ fontSize: 10.5, color: C.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={e => onChange(+e.target.value)} onPointerUp={onCommit} onKeyUp={onCommit} style={{ width: '100%', accentColor: '#00DAF3' }} />
    <span style={{ fontSize: 10.5, color: C.text, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{format ? format(value) : +value.toFixed(2)}</span>
  </label>
);
