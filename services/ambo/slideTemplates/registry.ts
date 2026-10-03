// registry — the Ambo slide-template catalogue: ids, names, categories, field
// schemas (with service-ready default copy) and the designer for each.
import { lay } from './layout';
import { themeById, SLIDE_THEMES } from './themes';
import * as A from './designersA';
import * as B from './designersB';
import type { FieldDef, SlideObj, SlideTemplateDef, SlideTheme, ThemeOverrides } from './types';
import { PHOTO_TEMPLATES } from './templatesPhoto';
import { VIDEO_TEMPLATES } from './templatesVideo';
import { AUDIO_TEMPLATES } from './templatesAudio';
import { DATA_TEMPLATES } from './templatesData';

const F = (key: string, label: string, def: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, default: def, ...o });

export const SLIDE_TEMPLATES: SlideTemplateDef[] = [
  { id: 'welcome', name: 'Welcome', category: 'Welcome', slot: 'slide', blurb: 'A monumental centred greeting for walk-in.', design: A.welcome,
    fields: [F('kicker', 'Kicker', 'Welcome to'), F('title', 'Church name', 'Grace Community Church'), F('subtitle', 'Line', 'We are so glad you are here.'), F('footer', 'Footer', 'Sunday Worship · 10:30 AM')] },
  { id: 'countdown', name: 'Service Starting', category: 'Welcome', slot: 'slide', blurb: 'Live countdown to the start time; three zones on ultrawide.', design: A.countdown,
    fields: [F('kicker', 'Kicker', 'Our service begins in'), F('countTo', 'Count to (time)', '10:30 AM', { hint: 'e.g. 10:30 AM or 18:00 — leave empty for a title card' }), F('atZero', 'Shown at zero', 'Welcome'), F('title', 'Title', 'Sunday Worship'), F('note', 'Note', 'Find a seat, grab a coffee, and say hello to someone new.', { multiline: true })] },
  { id: 'sermon-title', name: 'Sermon Title', category: 'Sermon', slot: 'slide', blurb: 'Series, title, speaker and text, set against the theme hero.', design: A.sermonTitle,
    fields: [F('series', 'Series', 'Rooted · Part 3'), F('title', 'Sermon title', 'Deep Roots, Good Fruit'), F('speaker', 'Speaker', 'Pastor Maya Ellison'), F('reference', 'Scripture', 'Psalm 1:1–3')] },
  { id: 'sermon-point', name: 'Sermon Point', category: 'Sermon', slot: 'slide', blurb: 'A numbered point: numeral column and one strong sentence.', design: A.sermonPoint,
    fields: [F('number', 'Number', '1'), F('kicker', 'Kicker', 'Point one'), F('point', 'Point', 'Roots grow in the dark long before fruit shows in the light.', { multiline: true }), F('support', 'Support', 'Psalm 1:3 — like a tree planted by streams of water', { multiline: true })] },
  { id: 'big-quote', name: 'Big Quote', category: 'Sermon', slot: 'slide', blurb: 'Hanging quotation mark and a measured block of words.', design: A.bigQuote,
    fields: [F('quote', 'Quote', 'Let us not become weary in doing good, for at the proper time we will reap a harvest if we do not give up.', { multiline: true }), F('attribution', 'Attribution', 'Galatians 6:9')] },
  { id: 'announcement', name: 'Announcement', category: 'Announcements', slot: 'slide', blurb: 'Headline and a date · time · place strip.', design: A.announcement,
    fields: [F('kicker', 'Kicker', 'Announcement'), F('title', 'Title', 'Fall Family Picnic'), F('detail', 'Detail', 'Bring a side dish to share — we will provide the grill, games and lemonade.', { multiline: true }), F('date', 'Date', 'Sunday, October 19'), F('time', 'Time', '12:30 PM'), F('place', 'Place', 'Riverside Park · Pavilion B')] },
  { id: 'event', name: 'Event Card', category: 'Announcements', slot: 'slide', blurb: 'Photo well, calendar tile and the details.', design: A.eventCard,
    fields: [F('eyebrow', 'Eyebrow', 'Youth Night'), F('title', 'Title', 'Worship & Pizza'), F('weekday', 'Weekday', 'Friday'), F('month', 'Month', 'Oct'), F('day', 'Day', '24'), F('time', 'Time', '7:00 PM'), F('place', 'Place', 'The Loft · Room 210'), F('cta', 'Call to action', 'Sign up at the Connect table'), F('imageUrl', 'Photo URL', '', { hint: 'Optional image link' })] },
  { id: 'giving', name: 'Giving', category: 'Giving', slot: 'slide', blurb: 'Generosity message, ways to give and a QR well.', design: A.giving,
    fields: [F('kicker', 'Kicker', 'Tithes & Offerings'), F('title', 'Title', 'Generosity'), F('message', 'Message', 'Thank you for giving. Your generosity fuels ministry here at home and around the world.', { multiline: true }), F('link', 'Link', 'gracecommunity.church/give'), F('textCode', 'Text to give', 'Text GIVE to 55555'), F('qrLabel', 'QR caption', 'Scan to give'), F('qrUrl', 'QR image URL', '', { hint: 'Optional — paste a QR code image link' })] },
  { id: 'song-title', name: 'Song Title', category: 'Worship', slot: 'slide', blurb: 'The song over a watermark of the theme hero.', design: B.songTitle,
    fields: [F('kicker', 'Kicker', 'Now singing'), F('title', 'Song title', 'Great Is Thy Faithfulness'), F('credit', 'Writers', 'Thomas O. Chisholm · William M. Runyan'), F('info', 'Key / licence', 'Key of D · CCLI Song #22324')] },
  { id: 'prayer', name: 'Prayer / Response', category: 'Moments', slot: 'slide', blurb: 'Quiet: a small light, a modest title, room to breathe.', design: B.prayer,
    fields: [F('kicker', 'Kicker', 'Let us pray'), F('title', 'Title', 'A Time of Prayer'), F('prompt', 'Prompt', 'If you would like someone to pray with you, our prayer team is waiting at the front.', { multiline: true })] },
  { id: 'section', name: 'Section Divider', category: 'Moments', slot: 'slide', blurb: 'Numeral, rule, title — a band across ultrawide.', design: B.sectionDivider,
    fields: [F('number', 'Number', '2'), F('title', 'Section', 'Worship'), F('subtitle', 'Subtitle', 'Lifting our voices together')] },
  { id: 'speaker', name: 'Speaker Intro', category: 'Sermon', slot: 'slide', blurb: 'Portrait well and a short biography.', design: B.speakerIntro,
    fields: [F('kicker', 'Kicker', 'Our speaker today'), F('name', 'Name', 'Rev. Daniel Okafor'), F('role', 'Role', 'Lead Pastor, Grace Community Church'), F('bio', 'Bio', 'Daniel has served our city for fifteen years, planting two neighbourhood congregations and leading the food-pantry network.', { multiline: true }), F('photoUrl', 'Photo URL', '', { hint: 'Optional image link' })] },
  { id: 'bullets', name: 'Bullet List', category: 'Announcements', slot: 'slide', blurb: 'Header and items that re-column with the screen.', design: B.bulletList,
    fields: [F('kicker', 'Kicker', 'This week'), F('title', 'Title', 'Around Grace'), F('items', 'Items (one per line, "Item — detail")', 'Prayer Breakfast — Tuesday, 7 AM\nChoir Rehearsal — Wednesday, 7 PM\nMen’s Bible Study — Thursday, 6:30 AM\nFood Pantry — Saturday, 9 AM', { multiline: true })] },
  { id: 'image-caption', name: 'Image + Caption', category: 'Media', slot: 'slide', blurb: 'A bleeding photo and a caption column.', design: B.imageCaption,
    fields: [F('kicker', 'Kicker', 'Ministry moment'), F('title', 'Title', 'Serve Day 2026'), F('caption', 'Caption', 'More than two hundred volunteers repainted classrooms, stocked the pantry and planted the community garden.', { multiline: true }), F('credit', 'Credit', 'Photo · Communications Team'), F('imageUrl', 'Photo URL', '', { hint: 'Optional image link' })] },
  { id: 'benediction', name: 'Benediction', category: 'Moments', slot: 'slide', blurb: 'A framed tablet of blessing to close.', design: B.benediction,
    fields: [F('kicker', 'Kicker', 'Go in peace'), F('text', 'Blessing', 'The Lord bless you and keep you; the Lord make his face shine on you and be gracious to you.', { multiline: true }), F('reference', 'Reference', 'Numbers 6:24–25'), F('footer', 'Footer', 'See you next Sunday · 10:30 AM')] },
  { id: 'connect', name: 'Social & Connect', category: 'Welcome', slot: 'slide', blurb: 'Handle, platforms and a connect-card QR.', design: B.socialConnect,
    fields: [F('title', 'Title', 'Stay Connected'), F('handle', 'Handle', '@gracecommunity'), F('web', 'Website', 'gracecommunity.church'), F('platforms', 'Platforms (one per line)', 'Instagram\nYouTube\nFacebook\nSpotify', { multiline: true }), F('connect', 'Connect prompt', 'New here? Scan to fill out a Connect Card — we would love to meet you.', { multiline: true }), F('qrLabel', 'QR caption', 'Connect card'), F('qrUrl', 'QR image URL', '', { hint: 'Optional — paste a QR code image link' })] },
];

// Media and data templates live in their own files (each registers its live drawers on import).
SLIDE_TEMPLATES.push(...PHOTO_TEMPLATES, ...VIDEO_TEMPLATES, ...AUDIO_TEMPLATES, ...DATA_TEMPLATES);

export const TEMPLATE_CATEGORIES = ['Welcome', 'Sermon', 'Worship', 'Announcements', 'Giving', 'Moments', 'Media', 'Photo', 'Video', 'Audio', 'Data'] as const;

export function templateById(id: string): SlideTemplateDef | undefined { return SLIDE_TEMPLATES.find(t => t.id === id); }

export function defaultFields(t: SlideTemplateDef): Record<string, string> {
  return Object.fromEntries(t.fields.map(f => [f.key, f.default]));
}

/** Reserved field: '__ground' = 'solid' (default) | 'translucent' (show the background layer through). */
export const GROUND_FIELD = '__ground';
/** Reserved field: JSON ThemeOverrides from a saved template (palette, motion, faces). */
export const THEME_FIELD = '__theme';

const COLOR_KEYS = ['accent', 'accent2', 'accent3', 'ground', 'ground2', 'ink', 'muted', 'panel', 'panelInk'] as const;
const resolved = new Map<string, SlideTheme>();
const colourSwaps = new WeakMap<SlideTheme, Map<string, [number, number, number]>>();

function rgbOf(col: string | undefined): [number, number, number] | null {
  if (!col) return null;
  const h = col.trim().match(/^#([0-9a-f]{3,8})$/i);
  if (h) {
    let x = h[1];
    if (x.length === 3 || x.length === 4) x = x.slice(0, 3).split('').map(ch => ch + ch).join('');
    return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
  }
  const m = col.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  return m ? [+m[1], +m[2], +m[3]] : null;
}
/** Swap a base-palette colour for its override, keeping any alpha. */
function swapColour(col: string | undefined, swaps: Map<string, [number, number, number]>): string | undefined {
  const rgb = rgbOf(col);
  if (!col || !rgb) return col;
  const to = swaps.get(rgb.join(','));
  if (!to) return col;
  const hex = '#' + to.map(v => v.toString(16).padStart(2, '0')).join('');
  const h = col.trim().match(/^#([0-9a-f]{4}|[0-9a-f]{8})$/i);
  if (h) return hex + (h[1].length === 8 ? h[1].slice(6) : h[1][3] + h[1][3]);
  const a = col.match(/^rgba\([^)]*,\s*([\d.]+)\s*\)$/i);
  if (a) return `rgba(${to[0]},${to[1]},${to[2]},${a[1]})`;
  return hex;
}
function applyColourSwaps(objs: SlideObj[], th: SlideTheme): void {
  const swaps = colourSwaps.get(th);
  if (!swaps) return;
  for (const o of objs as any[]) {
    o.fill = swapColour(o.fill, swaps);
    o.stroke = swapColour(o.stroke, swaps);
    if (o.shadow?.color) o.shadow = { ...o.shadow, color: swapColour(o.shadow.color, swaps) };
    if (o.gradient?.stops) o.gradient = { ...o.gradient, stops: o.gradient.stops.map((st: any) => ({ ...st, color: swapColour(st.color, swaps) })) };
  }
}
/** The theme as customised by a saved template's `__theme` field (the platform theme when absent). */
export function resolveTheme(themeId: string | undefined, fields?: Record<string, string>): SlideTheme {
  const base = themeById(themeId);
  const raw = fields?.[THEME_FIELD];
  if (!raw) return base;
  const key = `${base.id}|${raw}`;
  const hit = resolved.get(key); if (hit) return hit;
  let o: ThemeOverrides = {};
  try { o = JSON.parse(raw) || {}; } catch { return base; }
  const c = { ...base.c };
  for (const k of COLOR_KEYS) { const v = o[k]; if (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v)) (c as any)[k] = v; }
  const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined;
  const motion = {
    ...base.motion,
    ...(o.enter ? { enter: o.enter } : {}), ...(o.exit ? { exit: o.exit } : {}),
    ...(num(o.enterSec, .1, 6) !== undefined ? { enterSec: num(o.enterSec, .1, 6)! } : {}),
    ...(num(o.exitSec, .1, 4) !== undefined ? { exitSec: num(o.exitSec, .1, 4)! } : {}),
  };
  const t = { ...base.t, ...(o.display ? { display: o.display } : {}), ...(o.text ? { text: o.text } : {}), ...(o.label ? { label: o.label } : {}) };
  const th: SlideTheme = { ...base, c, motion, t };
  // Motifs often paint from their own palette constants rather than th.c, so a
  // colour override is also applied by swapping the base colour in the built objects.
  const swaps = new Map<string, [number, number, number]>();
  for (const k of COLOR_KEYS) {
    const from = rgbOf(base.c[k]), to = rgbOf(c[k]);
    if (from && to && c[k] !== base.c[k]) swaps.set(from.join(','), to);
  }
  if (swaps.size) colourSwaps.set(th, swaps);
  if (resolved.size > 200) resolved.clear();
  resolved.set(key, th);
  return th;
}

const ROLE_GROUP: Record<string, number> = { GROUND: 0, ORNAMENT: 1, RULE: 1, IMAGE_SLOT: 1, LOGO: 1, LABEL: 2, HEADLINE: 3, DECK: 4, BODY: 4, CAPTION: 4, FOLIO: 4 };

function hash(s: string): number { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003; return h; }

/**
 * Build a slide's objects at W×H. Never throws: a designer failure returns null
 * so the caller can fall back to a labelled card.
 */
export function buildSlideObjects(templateId: string, themeId: string | undefined, fields: Record<string, string> | undefined, W: number, H: number): SlideObj[] | null {
  const t = templateById(templateId);
  if (!t || !(W > 0) || !(H > 0)) return null;
  const f: Record<string, string> = { ...defaultFields(t) };
  for (const [k, v] of Object.entries(fields || {})) if (typeof v === 'string') f[k] = v;
  const th = resolveTheme(themeId, f);
  try {
    const objs = t.design({ W, H, L: lay(W, H), th, f, seed: hash(templateId) });
    applyColourSwaps(objs, th);
    const translucent = f[GROUND_FIELD] === 'translucent';
    for (const o of objs) {
      o.grp = ROLE_GROUP[o.templateRole || 'ORNAMENT'] ?? 1;
      if (translucent && o.templateRole === 'GROUND') o.opacity = (o.opacity ?? 1) * (o === objs[0] ? .55 : .7);
    }
    return objs;
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[ambo] slide template failed', templateId, e);
    return null;
  }
}

export { SLIDE_THEMES };
