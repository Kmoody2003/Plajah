// Shared visual tokens for the Academia Integrity Wall views.
//
// TeacherToolsView and its siblings theme with a local inline-style `T` object rather than the
// CSS-variable design system, so these views match that convention — but the values are the
// real brand tokens from styles/plajah-ds.css, not placeholders. Kept in one module so the four
// integrity views can't drift from each other the way four copied `T` objects would.

import type { CSSProperties } from 'react';

export const T = {
  bg: '#0a0a0f',
  card: '#12121a',
  cardAlt: '#15151f',
  border: '#20202c',
  ink: '#fff',
  muted: '#9a9aa6',
  faint: '#777',
  // Brand (styles/plajah-ds.css)
  purple: '#6B0099',
  magenta: '#D40055',
  orange: '#FF8C00',
  cyan: '#00DAF3',
  lilac: '#D0BCFF',
  // Semantic
  success: '#06D6A0',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
} as const;

export const cardStyle: CSSProperties = {
  background: T.card,
  border: `1px solid ${T.border}`,
  borderRadius: 14,
};

export const chip = (on: boolean, color: string = T.orange): CSSProperties => ({
  cursor: 'pointer',
  padding: '7px 12px',
  borderRadius: 8,
  fontSize: 12.5,
  fontWeight: 700,
  border: `1px solid ${on ? color : T.border}`,
  background: on ? `${color}22` : 'transparent',
  color: on ? color : T.ink,
});

export const btn = (variant: 'solid' | 'outline' | 'ghost' = 'solid', color: string = T.orange): CSSProperties => ({
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '10px 18px',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 800,
  border: variant === 'ghost' ? '1px solid transparent' : `1px solid ${color}`,
  background: variant === 'solid' ? color : 'transparent',
  color: variant === 'solid' ? '#12121a' : color,
});

export const badge = (color: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '3px 9px',
  borderRadius: 999,
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  border: `1px solid ${color}55`,
  background: `${color}1a`,
  color,
});

/** Download a generated text artifact (disclosure letter, integrity-log CSV). */
export function downloadText(filename: string, body: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick — revoking synchronously cancels the download in some WebViews.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
