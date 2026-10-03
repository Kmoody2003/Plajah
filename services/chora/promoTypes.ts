export const PROMO_VERSION = 1 as const;
export const PROMO_SUITES = [
  { id: 'kinetic-pulse', name: 'Kinetic Pulse', subtitle: 'Make some noise.', description: 'Electric color. Oversized type. Pure momentum.', color: '#D40055', number: '01' },
  { id: 'harmonia-velvet', name: 'Harmonia Velvet', subtitle: 'Stay a little longer.', description: 'Warm vinyl. Quiet luxury. A record worth keeping.', color: '#FF8C00', number: '02' },
  { id: 'avant-monolith', name: 'Avant Monolith', subtitle: 'A new frequency.', description: 'Architectural space. Precision type. Future sound.', color: '#00DAF3', number: '03' },
] as const;
/** Review collection: deliberately excluded from the production picker and bundle. */
export const REVIEW_PROMO_SUITES = [
  { id: 'editorial-nocturne', name: 'Editorial Nocturne', subtitle: 'An issue worth hearing.', description: 'Ivory editorial typography, vermilion margin and a museum-scale cover.', color: '#DF4C32', number: '04', status: 'review' },
  { id: 'botanical-reverie', name: 'Botanical Reverie', subtitle: 'Sound takes root.', description: 'Forest paper, botanical silhouettes and luminous jade.', color: '#B6D7AD', number: '05', status: 'review' },
  { id: 'brutalist-signal', name: 'Brutalist Signal', subtitle: 'Turn the signal up.', description: 'Acid yellow, industrial registration marks and uncompromising type.', color: '#DBFF00', number: '06', status: 'review' },
  { id: 'celestial-atlas', name: 'Celestial Atlas', subtitle: 'Chart another world.', description: 'Midnight cartography, orbital notation and antique gold.', color: '#D7B878', number: '07', status: 'review' },
  { id: 'chrome-current', name: 'Chrome Current', subtitle: 'Liquid frequency.', description: 'Cobalt, reflective ribbons and bright futuristic geometry.', color: '#7AEAFF', number: '08', status: 'review' },
  { id: 'paper-salon', name: 'Paper Salon', subtitle: 'A personal invitation.', description: 'Rose stock, cut-paper sculpture and intimate serif composition.', color: '#E79FAD', number: '09', status: 'review' },
] as const;
export const ALL_PROMO_SUITES = [...PROMO_SUITES, ...REVIEW_PROMO_SUITES] as const;
export type PromoTemplateId = typeof ALL_PROMO_SUITES[number]['id'];
export const PROMO_FORMATS = {
  story: { label: 'Story', width: 1080, height: 1920, ratio: '9:16' },
  square: { label: 'Square', width: 1080, height: 1080, ratio: '1:1' },
  portrait: { label: 'Portrait', width: 1080, height: 1350, ratio: '4:5' },
  landscape: { label: 'Landscape', width: 1920, height: 1080, ratio: '16:9' },
} as const;
export type PromoFormat = keyof typeof PROMO_FORMATS;
export const DSP_NAMES = ['Spotify', 'Apple Music', 'Tidal', 'Amazon Music', 'YouTube Music', 'Deezer'] as const;
export type PromoDsp = typeof DSP_NAMES[number];
export interface PromoSnippet {
  trackId: string;
  start: number;
  duration: number;
  source: 'waveform' | 'suggested' | 'manual';
}
/** Small, durable recipe on the album. Assets are derived, never fictional URLs.
 * No audio files, auth tokens, data URLs, or full Tela documents go into Firestore. */
export interface PromoRecipe {
  version: typeof PROMO_VERSION;
  template: PromoTemplateId;
  title: string;
  artist: string;
  tagline: string;
  secondaryDsps: Partial<Record<PromoDsp, string>>;
  snippets: PromoSnippet[];
  updatedAt: number;
}
export interface PromoRelease {
  id: string;
  ownerId?: string;
  title: string;
  artist: string;
  coverImage: string;
  releaseDate?: number;
  isScheduled?: boolean;
  tracks: import('../../types').Track[];
  autoPromo?: PromoRecipe;
}
