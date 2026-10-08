// convert — change a slide from one template (or theme) to another without
// losing its words.
//
// Templates name their fields differently ("title" / "name" / "quote"…), so a
// plain key copy would drop most of the text. Fields are grouped by what they
// ARE — a kicker line, a headline, supporting copy, a single picture, a list
// of pictures — and carried across by group. Anything the new template has no
// place for is dropped; anything the old one never had falls back to the new
// template's own sample copy (the registry fills defaults).
import { templateById } from './registry';
import type { FieldDef, SlideTemplateDef } from './types';

type FieldClass = 'kicker' | 'title' | 'body' | 'image' | 'images';

const KICKER = ['kicker', 'eyebrow', 'series'];
const TITLE = ['title', 'name', 'headline'];
const BODY = ['subtitle', 'caption', 'detail', 'message', 'prompt', 'point', 'quote', 'text', 'bio', 'note', 'support', 'statement', 'role', 'speaker', 'reader', 'artist', 'credit', 'attribution', 'footer'];
const IMAGE = ['photo', 'imageUrl', 'photoUrl', 'artUrl', 'posterUrl'];
const IMAGES = ['photos'];

/** Reserved keys that travel with the slide, not with a template. */
const RESERVED = ['__ground', '__theme'];

function classOf(f: FieldDef): FieldClass | null {
  if (f.kind === 'images' || IMAGES.includes(f.key)) return 'images';
  if (f.kind === 'image' || IMAGE.includes(f.key)) return 'image';
  const plain = !f.kind || f.kind === 'text';
  if (!plain) return null;
  if (KICKER.includes(f.key)) return 'kicker';
  if (TITLE.includes(f.key)) return 'title';
  if (BODY.includes(f.key) || f.multiline) return 'body';
  return null;
}

const firstLine = (s: string) => (s || '').split(/\r?\n/).map(x => x.trim()).find(Boolean) || '';

/**
 * Carry `from` (field values under template `fromId`) across to template `toId`.
 * Same key → same value. Otherwise by class, in field order. Returns only the
 * fields that have a value; the registry fills the rest with defaults.
 */
export function mapFieldsToTemplate(fromId: string, from: Record<string, string>, toId: string): Record<string, string> {
  const src = templateById(fromId), dst = templateById(toId);
  const out: Record<string, string> = {};
  for (const k of RESERVED) if (from[k] != null) out[k] = from[k];
  if (!dst) return out;
  if (!src) { for (const f of dst.fields) if (from[f.key] != null && from[f.key] !== '') out[f.key] = from[f.key]; return out; }

  const used = new Set<string>();
  // 1) identical keys
  for (const f of dst.fields) {
    const v = from[f.key];
    if (v != null && v !== '' && src.fields.some(s => s.key === f.key)) { out[f.key] = v; used.add(f.key); }
  }
  // 2) by class, in order
  const pool = new Map<FieldClass, Array<{ key: string; value: string }>>();
  for (const f of src.fields) {
    const c = classOf(f), v = from[f.key];
    if (!c || used.has(f.key) || v == null || v === '') continue;
    (pool.get(c) ?? pool.set(c, []).get(c)!).push({ key: f.key, value: v });
  }
  const take = (c: FieldClass) => pool.get(c)?.shift();
  for (const f of dst.fields) {
    if (out[f.key] != null) continue;
    const c = classOf(f);
    if (!c) continue;
    if (c === 'image' || c === 'images') {
      // a single picture ↔ a list: take from either pool
      const one = take('image') ?? take('images');
      if (!one) continue;
      out[f.key] = c === 'image' ? firstLine(one.value) : one.value;
      continue;
    }
    const hit = take(c);
    if (hit) out[f.key] = hit.value;
  }
  return out;
}

/** Fields for `toId` from loose lines of text (a plain text slide). First line → headline, the rest → supporting copy. */
export function fieldsFromText(texts: string[], toId: string): Record<string, string> {
  const dst = templateById(toId);
  const lines = texts.map(t => (t || '').trim()).filter(Boolean);
  const out: Record<string, string> = {};
  if (!dst || !lines.length) return out;
  const title = dst.fields.find(f => classOf(f) === 'title');
  const bodies = dst.fields.filter(f => classOf(f) === 'body');
  if (title) {
    out[title.key] = lines[0];
    const rest = lines.slice(1).join('\n');
    const body = bodies.find(f => f.multiline) ?? bodies[0];
    if (rest && body) out[body.key] = rest;
  } else if (bodies.length) {
    const body = bodies.find(f => f.multiline) ?? bodies[0];
    out[body.key] = lines.join('\n');
  }
  return out;
}

export interface TemplateContent {
  kind: 'TELA_TEMPLATE'; templateId: string; fields: Record<string, string>; theme?: string;
  bgBlend?: string; bgOpacity?: number;
}

/** The same slide in another template. Theme and background blend stay; fields are carried by class. */
export function retemplate(content: TemplateContent, toId: string): TemplateContent {
  if (content.templateId === toId) return content;
  return { ...content, templateId: toId, fields: mapFieldsToTemplate(content.templateId, content.fields || {}, toId) };
}

/** The same slide in another theme. Palette customisations belong to the old theme, so they reset. */
export function rethemed(content: TemplateContent, themeId: string): TemplateContent {
  if (content.theme === themeId) return content;
  const fields = { ...(content.fields || {}) };
  delete fields.__theme;
  return { ...content, theme: themeId, fields };
}

/** A short display label for a slide made from this template. */
export function slideLabelFor(tpl: SlideTemplateDef, fields: Record<string, string>): string {
  const title = fields.title || fields.name || fields.quote || fields.point || fields.text || '';
  return `${tpl.name}${title && title !== tpl.name ? ' · ' + title.slice(0, 40) : ''}`;
}
