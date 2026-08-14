import React from 'react';

/**
 * Plajah design-system surfaces — cards, panels, sheets.
 *
 * Elevation on Plajah is depth + glass opacity, not a lighter grey, because
 * every surface is translucent over background art. `level` moves both together
 * so a card never ends up opaque-but-flat or shadowed-but-transparent.
 *
 * Spec: docs/PLAJAH_DESIGN_SYSTEM.md
 */

export type SurfaceLevel = 1 | 2 | 3 | 4 | 5;
export type SurfaceShape = 'card' | 'sheet' | 'hero';

interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 1 = resting card · 3 = floating panel · 5 = modal / sheet over content. */
  level?: SurfaceLevel;
  /** card 24px · sheet 28px · hero 36px. */
  shape?: SurfaceShape;
  /** Hairline brand-gradient border, for one featured card per view. */
  brand?: boolean;
  /** Adds the standard internal padding. Off for media-edge-to-edge cards. */
  padded?: boolean;
  as?: keyof React.JSX.IntrinsicElements;
}

export const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { level = 1, shape = 'card', brand, padded = true, as: Tag = 'div', className = '', style, children, ...rest },
  ref
) {
  const cls = [
    'pj-surface',
    level > 1 && `pj-surface--${level}`,
    shape !== 'card' && `pj-surface--${shape}`,
    brand && 'pj-surface--brand',
    className,
  ].filter(Boolean).join(' ');

  const Component = Tag as React.ElementType;
  return (
    <Component
      ref={ref}
      className={cls}
      style={padded ? { padding: 'var(--pj-space-5)', ...style } : style}
      {...rest}
    >
      {children}
    </Component>
  );
});

/**
 * Canonical dialog/form footer. Primary action goes LAST in DOM order (reading
 * order + the position users' hands expect); the CSS reverses and stretches it
 * on narrow screens so mobile gets the primary on top, full width.
 */
export const Actions: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...rest }) => (
  <div className={`pj-actions ${className}`} {...rest} />
);

/** The tiny hyper-tracked label above a section title — Plajah's signature gesture. */
export const Eyebrow: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ className = '', ...rest }) => (
  <p className={`pj-eyebrow ${className}`} {...rest} />
);

export default Surface;
