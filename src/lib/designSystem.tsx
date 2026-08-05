import React, { useEffect, useState } from 'react';
import { useViewport, columnsFor } from '../../hooks/useViewport';

// ─────────────────────────────────────────────────────────────────────────
// Shared mobile design-system primitives. Surfaces import from here so mobile
// layout, type scale, touch targets and motion are consistent + first-class.
// Type classes resolve to the .type-* utilities defined in index.css.
// ─────────────────────────────────────────────────────────────────────────

/** Material 3 Expressive type roles → CSS utility class names (see index.css). */
export const TYPE = {
  displayLg: 'type-display-lg', displayMd: 'type-display-md', displaySm: 'type-display-sm',
  headlineLg: 'type-headline-lg', headlineMd: 'type-headline-md', headlineSm: 'type-headline-sm',
  titleLg: 'type-title-lg', titleMd: 'type-title-md', titleSm: 'type-title-sm',
  bodyLg: 'type-body-lg', bodyMd: 'type-body-md', bodySm: 'type-body-sm',
  labelLg: 'type-label-lg', labelMd: 'type-label-md', labelSm: 'type-label-sm',
} as const;

/** M3 Expressive motion presets for `motion` components — one source of truth. */
export const MOTION = {
  spring:      { type: 'spring', stiffness: 320, damping: 30 } as const,
  springSoft:  { type: 'spring', stiffness: 210, damping: 26 } as const,
  emphasized:  { duration: 0.5, ease: [0.2, 0, 0, 1] } as const,   // M3 emphasized
  standard:    { duration: 0.3, ease: [0.2, 0, 0, 1] } as const,
  exit:        { duration: 0.2, ease: [0.3, 0, 1, 1] } as const,
};

export interface SafeAreaInsets { top: number; right: number; bottom: number; left: number; }

/** Live safe-area insets in px (notch / home-indicator / nav bar) for JS-positioned UI. */
export function useSafeArea(): SafeAreaInsets {
  const v = useViewport();
  const [insets, setInsets] = useState<SafeAreaInsets>({ top: 0, right: 0, bottom: 0, left: 0 });
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const px = (s: string) => parseFloat(s) || 0;
    setInsets({ top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) });
    document.body.removeChild(probe);
  }, [v.width, v.height, v.orientation]);
  return insets;
}

/** Responsive CSS-grid: mobile-first column counts, foldable-aware (adds a column when spanning). */
export const AdaptiveGrid: React.FC<{
  phone?: number; tablet?: number; desktop?: number;
  gap?: string | number; className?: string; style?: React.CSSProperties; children?: React.ReactNode;
}> = ({ phone = 1, tablet = 2, desktop = 3, gap = '1rem', className = '', style, children }) => {
  const v = useViewport();
  const cols = columnsFor(v, { phone, tablet, desktop });
  return (
    <div className={className} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap, ...style }}>
      {children}
    </div>
  );
};

/** Centered content column with responsive gutters + safe-area padding. */
export const Container: React.FC<{
  max?: number; className?: string; style?: React.CSSProperties; children?: React.ReactNode;
}> = ({ max = 1200, className = '', style, children }) => (
  <div
    className={className}
    style={{
      width: '100%', maxWidth: max, marginInline: 'auto',
      paddingLeft: 'max(1rem, env(safe-area-inset-left))',
      paddingRight: 'max(1rem, env(safe-area-inset-right))',
      ...style,
    }}
  >
    {children}
  </div>
);

/** Guarantees a ≥44px comfortable hit area around small controls (adds the `.tap` utility). */
export const TouchTarget: React.FC<
  { large?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ large = false, className = '', children, ...rest }) => (
  <button className={`${large ? 'tap-lg' : 'tap'} ${className}`} {...rest}>{children}</button>
);
