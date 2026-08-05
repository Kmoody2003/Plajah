import React from 'react';

/**
 * The Plajah brand background, for television.
 *
 * These are the exact stops from `body.theme-plajah #universal-background` in index.css — the
 * gradient the app and the website already use — rather than a TV-specific approximation. That
 * is the whole point: a viewer moving from the phone to the sofa should recognise the same
 * surface, and any drift between the two reads as two different products.
 *
 * Layering, bottom to top:
 *   1. #0d0015          the brand's near-black violet, not a neutral black
 *   2. purple bloom     upper left
 *   3. magenta bloom    lower right
 *   4. orange warmth    centre, low opacity — the logo's third colour, present but not shouting
 *   5. a scrim          same 0.18 wash the theme applies, so artwork and type stay legible
 *
 * The scrim matters more here than on a phone: a TV screen is mostly other people's cover art and
 * thumbnails, and without it a saturated ground fights every card on the shelf.
 */
export const TV_BRAND_BACKGROUND =
  'radial-gradient(ellipse 90% 70% at 15% 10%, rgba(107, 0, 153, 0.85) 0%, transparent 55%),' +
  'radial-gradient(ellipse 70% 60% at 85% 85%, rgba(212, 0, 85, 0.70) 0%, transparent 55%),' +
  'radial-gradient(ellipse 55% 45% at 55% 45%, rgba(255, 140, 0, 0.22) 0%, transparent 60%),' +
  '#0d0015';

const TvBrandBackdrop: React.FC = () => (
  <>
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden
      style={{ background: TV_BRAND_BACKGROUND }}
    />
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden
      style={{ background: 'rgba(13, 0, 21, 0.18)' }}
    />
  </>
);

export default TvBrandBackdrop;
