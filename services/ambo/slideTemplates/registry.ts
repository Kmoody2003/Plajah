// registry — the Ambo slide-template catalogue: ids, names, categories, field
// schemas (with service-ready default copy) and the designer for each.
import { lay } from './layout';
import { themeById, SLIDE_THEMES } from './themes';
import * as A from './designersA';
import * as B from './designersB';
import type { FieldDef, SlideObj, SlideTemplateDef } from './types';

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

export const TEMPLATE_CATEGORIES = ['Welcome', 'Sermon', 'Worship', 'Announcements', 'Giving', 'Moments', 'Media'] as const;

export function templateById(id: string): SlideTemplateDef | undefined { return SLIDE_TEMPLATES.find(t => t.id === id); }

export function defaultFields(t: SlideTemplateDef): Record<string, string> {
  return Object.fromEntries(t.fields.map(f => [f.key, f.default]));
}

/** Reserved field: '__ground' = 'solid' (default) | 'translucent' (show the background layer through). */
export const GROUND_FIELD = '__ground';

const ROLE_GROUP: Record<string, number> = { GROUND: 0, ORNAMENT: 1, RULE: 1, IMAGE_SLOT: 1, LOGO: 1, LABEL: 2, HEADLINE: 3, DECK: 4, BODY: 4, CAPTION: 4, FOLIO: 4 };

function hash(s: string): number { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003; return h; }

/**
 * Build a slide's objects at W×H. Never throws: a designer failure returns null
 * so the caller can fall back to a labelled card.
 */
export function buildSlideObjects(templateId: string, themeId: string | undefined, fields: Record<string, string> | undefined, W: number, H: number): SlideObj[] | null {
  const t = templateById(templateId);
  if (!t || !(W > 0) || !(H > 0)) return null;
  const th = themeById(themeId);
  const f: Record<string, string> = { ...defaultFields(t) };
  for (const [k, v] of Object.entries(fields || {})) if (typeof v === 'string') f[k] = v;
  try {
    const objs = t.design({ W, H, L: lay(W, H), th, f, seed: hash(templateId) });
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
