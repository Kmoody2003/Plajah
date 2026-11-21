import {
  FABULA_ASPECT_RATIOS,
  FABULA_RES_PRESETS,
  buildFabulaFilmPresets,
} from '../fabula/filmFormats';
import { PRINT_PRODUCTS } from '../print/products';

export { FABULA_ASPECT_RATIOS, FABULA_RES_PRESETS };

export type PagePresetCategory =
  | 'paper'
  | 'film'
  | 'comic'
  | 'print'
  | 'banner';

export interface TelaPageSizePreset {
  id: string;
  label: string;
  category: PagePresetCategory;
  kind: 'PAPER' | 'SCREEN' | 'BOARD';
  w: number;
  h: number;
  page?: string;
  unitLabel: string;
  displayDims: string;
  productId?: string;
  source?: string;
}

const inToPx = (inches: number) => Math.round(inches * 96);
const mmToPx = (mm: number) => Math.round((mm / 25.4) * 96);

const CATEGORY_META: Array<{ id: PagePresetCategory; label: string }> = [
  { id: 'paper', label: 'Standard Paper & Books' },
  { id: 'film', label: 'Film & Video (Fabula)' },
  { id: 'comic', label: 'Comics & Graphic Novels' },
  { id: 'print', label: 'Card Stock, Postcards & Posters' },
  { id: 'banner', label: 'Banners, Social & Signage' },
];

export const PAGE_PRESET_CATEGORIES = CATEGORY_META;

const inPreset = (
  id: string,
  label: string,
  category: PagePresetCategory,
  wIn: number,
  hIn: number,
  opts?: { kind?: 'PAPER' | 'SCREEN' | 'BOARD'; productId?: string; unitLabel?: string },
): TelaPageSizePreset => ({
  id,
  label,
  category,
  kind: opts?.kind ?? 'PAPER',
  w: inToPx(wIn),
  h: inToPx(hIn),
  page: `${wIn}in ${hIn}in`,
  unitLabel: opts?.unitLabel ?? 'in',
  displayDims: `${wIn}×${hIn} in`,
  productId: opts?.productId,
});

const mmPreset = (
  id: string,
  label: string,
  category: PagePresetCategory,
  wMm: number,
  hMm: number,
  opts?: { kind?: 'PAPER' | 'SCREEN' | 'BOARD'; productId?: string },
): TelaPageSizePreset => ({
  id,
  label,
  category,
  kind: opts?.kind ?? 'PAPER',
  w: mmToPx(wMm),
  h: mmToPx(hMm),
  page: `${wMm}mm ${hMm}mm`,
  unitLabel: 'mm',
  displayDims: `${wMm}×${hMm} mm`,
  productId: opts?.productId,
});

const pxPreset = (
  id: string,
  label: string,
  category: PagePresetCategory,
  w: number,
  h: number,
  opts?: { kind?: 'PAPER' | 'SCREEN' | 'BOARD'; source?: string },
): TelaPageSizePreset => ({
  id,
  label,
  category,
  kind: opts?.kind ?? 'SCREEN',
  w,
  h,
  unitLabel: 'px',
  displayDims: `${w}×${h} px`,
  source: opts?.source,
});

const fabulaPresets: TelaPageSizePreset[] = buildFabulaFilmPresets().map(f => ({
  id: f.id,
  label: f.label,
  category: 'film',
  kind: 'SCREEN',
  w: f.w,
  h: f.h,
  unitLabel: 'px',
  displayDims: `${f.w}×${f.h} px (${f.aspect})`,
  source: 'fabula',
}));

const BASE_PRESETS: TelaPageSizePreset[] = [
  // ── Standard Paper & Books ──
  inPreset('LETTER', 'Letter (8.5×11″)', 'paper', 8.5, 11),
  mmPreset('A4', 'A4 (210×297 mm)', 'paper', 210, 297, { productId: 'magazine-a4-perfect' }),
  inPreset('BOOKLET', 'Half Letter / Booklet (5.5×8.5″)', 'paper', 5.5, 8.5, { productId: 'book-5.5x8.5-perfect' }),
  inPreset('LEGAL', 'Legal (8.5×14″)', 'paper', 8.5, 14),
  inPreset('TABLOID', 'Tabloid / Ledger (11×17″)', 'paper', 11, 17, { productId: 'newspaper-tabloid' }),
  inPreset('EXECUTIVE', 'Executive (7.25×10.5″)', 'paper', 7.25, 10.5),
  mmPreset('A5', 'A5 (148×210 mm)', 'paper', 148, 210, { productId: 'flyer-a5' }),
  mmPreset('A3', 'A3 (297×420 mm)', 'paper', 297, 420),
  mmPreset('A2', 'A2 (420×594 mm)', 'paper', 420, 594),
  mmPreset('A1', 'A1 (594×841 mm)', 'paper', 594, 841),
  mmPreset('A0', 'A0 (841×1189 mm)', 'paper', 841, 1189),
  mmPreset('A6', 'A6 (105×148 mm)', 'paper', 105, 148),
  inPreset('BOOK_6X9', 'Trade Paperback (6×9″)', 'paper', 6, 9, { productId: 'book-6x9-perfect' }),
  inPreset('PICTURE_BOOK_8_5', 'Picture Book Square (8.5×8.5″)', 'paper', 8.5, 8.5, { productId: 'picture-book-8.5' }),

  // ── Film & Video (directly imported from Fabula) ──
  ...fabulaPresets,
  pxPreset('FILM_IMAX_1_43', 'IMAX 1.43:1 (2860×2000)', 'film', 2860, 2000, { source: 'fabula' }),
  pxPreset('FILM_ACADEMY_1_37', 'Academy Flat 1.37:1 (1480×1080)', 'film', 1480, 1080, { source: 'fabula' }),

  // ── Comics & Graphic Novels ──
  inPreset('COMIC_US', 'US Modern Comic (6.625×10.25″)', 'comic', 6.625, 10.25, { productId: 'comic-us' }),
  inPreset('COMIC_US_BLEED', 'US Comic + Bleed (6.875×10.5″)', 'comic', 6.875, 10.5, { productId: 'comic-us' }),
  inPreset('COMIC_SILVER', 'Silver Age Comic (7×10.5″)', 'comic', 7, 10.5),
  inPreset('COMIC_GOLDEN', 'Golden Age Comic (7.75×10.5″)', 'comic', 7.75, 10.5),
  inPreset('COMIC_SPREAD', 'US Comic Double Spread (13.25×10.25″)', 'comic', 13.25, 10.25),
  inPreset('COMIC_GN_6X9', 'Graphic Novel (6×9″)', 'comic', 6, 9, { productId: 'graphic-novel-6.625' }),
  inPreset('COMIC_GN_6_625X10_1875', 'Graphic Novel Trim (6.625×10.1875″)', 'comic', 6.625, 10.1875, { productId: 'graphic-novel-6.625' }),
  inPreset('COMIC_GN_7X10', 'Graphic Novel Trade (7×10″)', 'comic', 7, 10),
  mmPreset('MANGA_TANKOBON_B6', 'Manga Tankōbon B6 (128×182 mm)', 'comic', 128, 182, { productId: 'manga-tankobon' }),
  mmPreset('MANGA_SHINSHO', 'Manga Shinsho (112×176 mm)', 'comic', 112, 176),
  mmPreset('MANGA_A5', 'Manga Kanzenban A5 (148×210 mm)', 'comic', 148, 210),
  mmPreset('MANGA_B4_MS', 'Manga Manuscript B4 (257×364 mm)', 'comic', 257, 364),
  mmPreset('EURO_BD_ALBUM', 'European BD Album (216×297 mm)', 'comic', 216, 297),
  inPreset('COMIC_STRIP_WIDE', 'Comic Strip / Landscape (11×5.5″)', 'comic', 11, 5.5),
  pxPreset('WEBTOON_SCROLL', 'Webtoon Vertical Strip (800×2560)', 'comic', 800, 2560),
  pxPreset('COMIC_DIGITAL_HD', 'Digital Comic Page (1200×1800)', 'comic', 1200, 1800),

  // ── Card Stock, Postcards & Posters ──
  inPreset('CARD_BUSINESS_US', 'Business Card US (3.5×2″)', 'print', 3.5, 2, { productId: 'business-card-us' }),
  mmPreset('CARD_BUSINESS_EU', 'Business Card EU (85×55 mm)', 'print', 85, 55),
  inPreset('CARD_SQUARE', 'Square Card Stock (2.5×2.5″)', 'print', 2.5, 2.5),
  inPreset('POSTCARD_4X6', 'Postcard (6×4″)', 'print', 6, 4, { productId: 'postcard-4x6' }),
  inPreset('POSTCARD_5X7', 'Postcard / Invite A7 (5×7″)', 'print', 5, 7),
  inPreset('POSTCARD_6X9', 'Oversized Postcard (6×9″)', 'print', 6, 9),
  inPreset('CARD_A2_NOTE', 'Greeting / Note Card A2 (4.25×5.5″)', 'print', 4.25, 5.5),
  inPreset('CARD_A6_INVITE', 'Invitation Card A6 (4.5×6.25″)', 'print', 4.5, 6.25),
  inPreset('RACK_CARD_4X9', 'Rack Card (4×9″)', 'print', 4, 9),
  inPreset('TRIFOLD_LETTER', 'Tri-Fold Brochure (11×8.5″)', 'print', 11, 8.5, { productId: 'trifold-letter' }),
  inPreset('STICKER_3X3', 'Die-Cut Sticker (3×3″)', 'print', 3, 3, { productId: 'sticker-3in' }),
  inPreset('MAGAZINE_US', 'Magazine US (8.375×10.875″)', 'print', 8.375, 10.875, { productId: 'magazine-letter-saddle' }),
  inPreset('NEWSPAPER_BROADSHEET', 'Broadsheet (11×21″)', 'print', 11, 21, { productId: 'newspaper-broadsheet' }),
  inPreset('POSTER_11X17', 'Small Poster (11×17″)', 'print', 11, 17),
  inPreset('POSTER_12X18', 'Event Poster (12×18″)', 'print', 12, 18),
  inPreset('POSTER_16X20', 'Art Print Poster (16×20″)', 'print', 16, 20),
  inPreset('POSTER_18X24', 'Medium Poster (18×24″)', 'print', 18, 24, { productId: 'poster-18x24' }),
  inPreset('POSTER_24X36', 'Large Poster (24×36″)', 'print', 24, 36),
  inPreset('POSTER_27X40', 'Movie Poster One-Sheet (27×40″)', 'print', 27, 40),
  inPreset('POSTER_36X48', 'Display / Transit Poster (36×48″)', 'print', 36, 48),

  // ── Banners, Web Ads, Social & Signage ──
  pxPreset('BANNER_LEADERBOARD', 'Web Leaderboard Banner (728×90)', 'banner', 728, 90),
  pxPreset('BANNER_MEDIUM_RECT', 'Medium Rectangle Ad (300×250)', 'banner', 300, 250),
  pxPreset('BANNER_LARGE_RECT', 'Large Rectangle Ad (336×280)', 'banner', 336, 280),
  pxPreset('BANNER_WIDE_SKYSCRAPER', 'Wide Skyscraper (160×600)', 'banner', 160, 600),
  pxPreset('BANNER_HALF_PAGE', 'Half-Page Web Ad (300×600)', 'banner', 300, 600),
  pxPreset('BANNER_BILLBOARD', 'Web Billboard (970×250)', 'banner', 970, 250),
  pxPreset('BANNER_MOBILE_320X50', 'Mobile Banner (320×50)', 'banner', 320, 50),
  pxPreset('BANNER_MOBILE_320X100', 'Large Mobile Banner (320×100)', 'banner', 320, 100),
  pxPreset('BANNER_WEB_HERO', 'Website Hero Banner (1920×600)', 'banner', 1920, 600),
  pxPreset('BANNER_EMAIL_HEADER', 'Email Header Banner (600×200)', 'banner', 600, 200),
  pxPreset('BANNER_YOUTUBE', 'YouTube Channel Banner (2560×1440)', 'banner', 2560, 1440),
  pxPreset('BANNER_YT_THUMB', 'YouTube Thumbnail (1280×720)', 'banner', 1280, 720),
  pxPreset('SQUARE', 'Square Social 1:1 (1080×1080)', 'banner', 1080, 1080),
  pxPreset('SIGNAGE_1080x1920', 'Vertical Signage / Story (1080×1920)', 'banner', 1080, 1920),
  pxPreset('PHONE', 'Phone Screen (390×844)', 'banner', 390, 844),
  pxPreset('BANNER_X_HEADER', 'X / Twitter Header (1500×500)', 'banner', 1500, 500),
  pxPreset('BANNER_LINKEDIN', 'LinkedIn Cover Banner (1584×396)', 'banner', 1584, 396),
  pxPreset('BANNER_FACEBOOK', 'Facebook Cover (820×312)', 'banner', 820, 312),
  pxPreset('BANNER_TWITCH', 'Twitch Profile Banner (1200×480)', 'banner', 1200, 480),
  inPreset('BANNER_XSTAND_24X63', 'X-Stand Display Banner (24×63″)', 'banner', 24, 63, { kind: 'PAPER' }),
  inPreset('BANNER_ROLLUP_33X80', 'Retractable Roll-Up Banner (33×80″)', 'banner', 33, 80, { kind: 'PAPER' }),
  inPreset('BANNER_VINYL_2X4FT', 'Vinyl Banner 2×4 ft (48×24″)', 'banner', 48, 24, { kind: 'PAPER' }),
  inPreset('BANNER_VINYL_3X6FT', 'Vinyl Banner 3×6 ft (72×36″)', 'banner', 72, 36, { kind: 'PAPER', productId: 'banner-3x6ft' }),
  inPreset('BANNER_VINYL_4X8FT', 'Vinyl Banner 4×8 ft (96×48″)', 'banner', 96, 48, { kind: 'PAPER' }),
  inPreset('BANNER_BACKDROP_8X8', 'Step & Repeat Backdrop 8×8 ft (96×96″)', 'banner', 96, 96, { kind: 'PAPER' }),

  // Freeform
  {
    id: 'FREE',
    label: 'Custom / Freeform',
    category: 'paper',
    kind: 'BOARD',
    w: 760,
    h: 440,
    unitLabel: 'px',
    displayDims: 'Custom',
  },
];

// Ensure every product from PRINT_PRODUCTS that isn't covered has a preset mapping helper too
const KNOWN_PRODUCT_IDS = new Set(BASE_PRESETS.map(p => p.productId).filter(Boolean));
for (const prod of PRINT_PRODUCTS) {
  if (KNOWN_PRODUCT_IDS.has(prod.id)) continue;
  if (prod.binding === 'wrap') continue;
  const cat: PagePresetCategory =
    prod.kind === 'comic' || prod.kind === 'manga' ? 'comic'
    : prod.kind === 'banner' ? 'banner'
    : prod.kind === 'book' || prod.kind === 'zine' ? 'paper'
    : 'print';
  BASE_PRESETS.push(inPreset(`PRINT_${prod.id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`, prod.label, cat, prod.trimIn[0], prod.trimIn[1], { productId: prod.id }));
}

export const TELA_PAGE_SIZE_CATALOG: TelaPageSizePreset[] = BASE_PRESETS;

export const PAGE_PRESETS_BY_ID: Record<string, TelaPageSizePreset> = Object.fromEntries(
  TELA_PAGE_SIZE_CATALOG.map(p => [p.id, p]),
);

export function getPagePreset(id: string | undefined): TelaPageSizePreset {
  return (id && PAGE_PRESETS_BY_ID[id]) || PAGE_PRESETS_BY_ID.FREE;
}

export function formatPageDimensions(wPx: number, hPx: number, unit: 'px' | 'in' | 'mm' = 'px'): string {
  if (unit === 'in') return `${(wPx / 96).toFixed(2).replace(/\.?0+$/, '')}×${(hPx / 96).toFixed(2).replace(/\.?0+$/, '')} in`;
  if (unit === 'mm') return `${Math.round((wPx / 96) * 25.4)}×${Math.round((hPx / 96) * 25.4)} mm`;
  return `${Math.round(wPx)}×${Math.round(hPx)} px`;
}

export function unitValueFromPx(px: number, unit: 'px' | 'in' | 'mm'): number {
  if (unit === 'in') return Math.round((px / 96) * 100) / 100;
  if (unit === 'mm') return Math.round((px / 96) * 25.4 * 10) / 10;
  return Math.round(px);
}

export function pxFromUnitValue(val: number, unit: 'px' | 'in' | 'mm'): number {
  if (!Number.isFinite(val) || val <= 0) return 0;
  if (unit === 'in') return Math.round(val * 96);
  if (unit === 'mm') return Math.round((val / 25.4) * 96);
  return Math.round(val);
}
