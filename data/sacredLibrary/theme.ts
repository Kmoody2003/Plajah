// Sacred Library — shared Plajah design-language tokens.
// The Sacred Library is a Plajah product surface, so its shell (grounds, headers,
// hero, blueprint) uses the Plajah brand: the purple→magenta→orange aurora over a
// purple-biased near-black, with glass surfaces. Each faith's gold/saffron is kept
// as that wing's own accent, layered on top of this shell.

/** The signature Plajah aurora ground for the Sacred Library's fullscreen overlays. */
export const PLAJAH_BG =
  'radial-gradient(1100px 620px at 82% -8%, rgba(107,0,153,0.28), transparent 60%),' +
  'radial-gradient(900px 560px at 6% 108%, rgba(212,0,85,0.20), transparent 60%),' +
  'radial-gradient(760px 520px at 50% 62%, rgba(255,140,0,0.07), transparent 70%),' +
  '#0A0711';

/** Translucent glass for sticky headers over the aurora. */
export const PLAJAH_HEADER = 'rgba(10,7,17,0.72)';

/** The brand gradient (purple→magenta) for marks and primary chrome. */
export const BRAND_GRAD = 'linear-gradient(135deg,#6B0099,#D40055)';

/** A brighter brand gradient for hero text on the dark ground. */
export const BRAND_TEXT = 'linear-gradient(120deg, #E9DBFF, #D40055 52%, #FF8C00)';

export const PJ_LILAC = '#D0BCFF';
export const PJ_ORANGE = '#FF8C00';
export const PJ_CYAN = '#00DAF3';
