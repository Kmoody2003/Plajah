// services/tela/telaSecurity.ts — finds code hiding in a Tela document and removes it before it can run.
//
// A shared or imported document is data someone else wrote, and three parts of it reach the page as markup:
// Writer blocks (innerHTML), vector object fields (objectToSvg writes fill, stroke, path data… into attributes)
// and media URLs. cleanTelaDoc walks the whole document and returns it with only the dangerous parts removed.
// Anything else stays byte for byte, so a clean document comes back as the same object and costs no edit.
//
// Plain text fields (a table cell, a vector TEXT object) are drawn escaped, so a lesson that mentions
// "<script>" is left alone. Lottie needs no check: dotlottie-web has no JavaScript expression engine.

export type TelaThreatKind = 'script' | 'event-handler' | 'dangerous-url' | 'embedded-content' | 'attribute-injection' | 'spreadsheet-command' | 'prototype-pollution';

export interface TelaThreat {
  kind: TelaThreatKind;
  /** Where in the document, in words ("Text", "Drawing"). */
  where: string;
  /** A short piece of what was removed. Show it as text, never as markup. */
  sample: string;
}

export const THREAT_LABEL: Record<TelaThreatKind, string> = {
  'script': 'Script',
  'event-handler': 'Code that runs on an event',
  'dangerous-url': 'Link that runs code',
  'embedded-content': 'Embedded page or plugin',
  'attribute-injection': 'Code hidden in a style value',
  'spreadsheet-command': 'Spreadsheet command',
  'prototype-pollution': 'Field that alters the app',
};

export const TELA_THREAT_EVENT = 'tela:threat-blocked';
export interface TelaThreatDetail { docId: string; ownerId: string; orgId?: string; threats: TelaThreat[] }

const MAX_THREATS = 200;
const sample = (s: string) => s.slice(0, 120);

const DROP_TAGS = new Set(['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select', 'svg', 'math', 'template', 'noscript', 'audio', 'video', 'source', 'portal', 'marquee']);
const ALLOWED_TAGS = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'big', 'blockquote', 'br', 'center', 'cite', 'code', 'dd', 'del', 'dfn', 'div', 'dl', 'dt', 'em', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'tt', 'u', 'ul', 'var', 'wbr']);
const ALLOWED_ATTRS = new Set(['style', 'class', 'dir', 'lang', 'title', 'href', 'target', 'rel', 'src', 'alt', 'width', 'height', 'color', 'face', 'size', 'align', 'colspan', 'rowspan', 'role']);
const BAD_STYLE = /url\s*\(|expression\s*\(|@import|behavior\s*:|-moz-binding|javascript\s*:/i;
/** Plain formatting needs no parser, which keeps typing in a Writer block cheap. */
const PLAIN_MARKUP = /^(?:[^<]|<\/?(?:b|i|u|s|em|strong|code|sub|sup|mark|span|p|div)>|<br\s*\/?>)*$/i;
const LOOKS_DANGEROUS = /<\s*\/?\s*[a-z!?]|\bon[a-z]{3,}\s*=|javascript\s*:/i;

const URL_KEY = /^(src|href|url|link|poster|action|formaction|xlink:href)$|(Src|Url|URL|Href|Link)$/;
/** A value breaking out of an attribute: a quote then a new tag or attribute, or markup outright. */
const ATTR_BREAKOUT = /["'`]\s*(?:\/?>|[\w:-]+\s*=)|<\s*\/?\s*[a-z!?]|\bon[a-z]{3,}\s*=|javascript\s*:/i;
/** Vector fields drawn as escaped text, or holding JSON. Every other string there lands in an attribute. */
const VECTOR_TEXT_KEY = new Set(['text', 'objectLabel', 'name', 'label', 'title', 'inlineJson', 'prompt', 'alt']);
/** Commands a spreadsheet app runs when it opens a CSV (DDE, remote fetches). */
const SHEET_COMMAND = /^[=+\-@]\s*(?:(?:cmd|powershell|pwsh|mshta|regsvr32|msiexec|rundll32|wscript|cscript)\b|.*\|\s*'|.*\b(?:DDE|DDEAUTO|WEBSERVICE|FILTERXML|IMPORTXML|IMPORTDATA|IMPORTHTML|IMPORTFEED|CALL|REGISTER)\s*\()/i;
const SVG_CODE = /<\s*script|\bon[a-z]{3,}\s*=|javascript\s*:/i;

function isDangerousUrl(raw: string): boolean {
  // eslint-disable-next-line no-control-regex
  const u = raw.slice(0, 256).replace(/[\u0000- ]/g, '').toLowerCase();
  if (/^(?:javascript|vbscript|livescript):/.test(u)) return true;
  if (/^data:(?:text\/html|text\/xml|application\/xml|application\/xhtml)/.test(u)) return true;
  if (!u.startsWith('data:image/svg')) return false;
  const comma = raw.indexOf(',');
  const body = raw.slice(comma + 1, comma + 1 + 4_000_000);
  try {
    const text = /;base64/i.test(raw.slice(0, comma)) ? atob(body.replace(/\s+/g, '')) : decodeURIComponent(body);
    return SVG_CODE.test(text);
  } catch { return SVG_CODE.test(body); }
}

function scrubElement(root: Element, found: (kind: TelaThreatKind, text: string) => void): boolean {
  let changed = false;
  for (const el of Array.from(root.children)) {
    const tag = el.tagName.toLowerCase();
    if (DROP_TAGS.has(tag)) {
      found(tag === 'script' || tag === 'style' ? 'script' : 'embedded-content', el.outerHTML);
      el.remove(); changed = true; continue;
    }
    if (scrubElement(el, found)) changed = true;
    if (!ALLOWED_TAGS.has(tag)) {
      // A tag we don't know keeps its words and loses the tag.
      el.replaceWith(...Array.from(el.childNodes)); changed = true; continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) { found('event-handler', `${name}="${attr.value}"`); el.removeAttribute(attr.name); changed = true; continue; }
      if (name === 'href' || name === 'src') {
        if (isDangerousUrl(attr.value)) { found('dangerous-url', attr.value); el.removeAttribute(attr.name); changed = true; }
        continue;
      }
      if (name === 'style' && BAD_STYLE.test(attr.value)) { found('attribute-injection', attr.value); el.removeAttribute(attr.name); changed = true; continue; }
      if (!ALLOWED_ATTRS.has(name) && !name.startsWith('data-') && !name.startsWith('aria-')) { el.removeAttribute(attr.name); changed = true; }
    }
  }
  return changed;
}

/** Rich text safe to give innerHTML. Returns the same string unless something had to go. */
export function sanitizeRichText(html: string, onThreat?: (kind: TelaThreatKind, text: string) => void): string {
  if (typeof html !== 'string' || !html.includes('<') || PLAIN_MARKUP.test(html)) return html;
  const found = (kind: TelaThreatKind, text: string) => onThreat?.(kind, sample(text));
  if (typeof DOMParser === 'undefined') {
    if (!LOOKS_DANGEROUS.test(html)) return html;
    found('script', html);
    return html.replace(/</g, '&lt;');
  }
  // DOMParser documents are inert: nothing here loads or runs while we look at it. Parse again after a
  // change, since removing a node can make what's left parse differently.
  let current = html;
  for (let pass = 0; pass < 4; pass++) {
    const body = new DOMParser().parseFromString(`<!doctype html><body>${current}`, 'text/html').body;
    if (!scrubElement(body, found)) return pass === 0 ? html : current;
    current = body.innerHTML;
  }
  return current.replace(/</g, '&lt;');
}

interface WalkCtx { threats: TelaThreat[]; where: string; vector: boolean; grid: boolean }

function add(ctx: WalkCtx, kind: TelaThreatKind, text: string) {
  if (ctx.threats.length < MAX_THREATS) ctx.threats.push({ kind, where: ctx.where, sample: sample(text) });
}

function cleanString(key: string, value: string, inBlock: boolean, ctx: WalkCtx): string {
  if (inBlock && key === 'text') return sanitizeRichText(value, (kind, text) => add(ctx, kind, text));
  if (URL_KEY.test(key)) {
    if (!isDangerousUrl(value)) return value;
    add(ctx, 'dangerous-url', value);
    return '';
  }
  if (ctx.vector && !VECTOR_TEXT_KEY.has(key) && ATTR_BREAKOUT.test(value)) {
    add(ctx, 'attribute-injection', value);
    return '';
  }
  if (ctx.grid && SHEET_COMMAND.test(value)) {
    add(ctx, 'spreadsheet-command', value);
    return `'${value}`;
  }
  return value;
}

function walk(value: unknown, key: string, inBlock: boolean, ctx: WalkCtx): unknown {
  if (typeof value === 'string') return cleanString(key, value, inBlock, ctx);
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    let out: unknown[] | null = null;
    value.forEach((item, i) => {
      const next = walk(item, key, inBlock, ctx);
      if (next !== item) (out ??= value.slice())[i] = next;
    });
    return out ?? value;
  }
  let out: Record<string, unknown> | null = null;
  const source = value as Record<string, unknown>;
  for (const k of Object.keys(source)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
      add(ctx, 'prototype-pollution', k);
      if (!out) out = { ...source };
      delete out[k];
      continue;
    }
    const next = walk(source[k], k, inBlock || k === 'blocks', ctx);
    if (next !== source[k]) (out ??= { ...source })[k] = next;
  }
  return out ?? value;
}

const DEVICE_WORD: Record<string, string> = { WRITER: 'Text', GRID: 'Sheet', BASE: 'Table', FORM: 'Form', VECTOR: 'Drawing', IMAGE: 'Image', CHART: 'Chart', NOTES: 'Notes', MEDIA: 'Media', FIGURE: 'Figure' };

/** The document with every dangerous part removed, and what was removed. Same object when it was clean. */
export function cleanTelaDoc<T>(doc: T): { doc: T; threats: TelaThreat[] } {
  const threats: TelaThreat[] = [];
  const source = doc as unknown as Record<string, any>;
  if (!source || typeof source !== 'object' || !source.devices) return { doc, threats };
  const { devices, ...rest } = source;
  const cleanRest = walk(rest, '', false, { threats, where: 'Document', vector: false, grid: false }) as Record<string, any>;
  let nextDevices: Record<string, any> | null = null;
  for (const id of Object.keys(devices)) {
    if (id === '__proto__' || id === 'constructor' || id === 'prototype') {
      threats.push({ kind: 'prototype-pollution', where: 'Document', sample: id });
      if (!nextDevices) nextDevices = { ...devices };
      delete nextDevices[id];
      continue;
    }
    const device = devices[id];
    const ctx: WalkCtx = { threats, where: device?.name || device?.title || DEVICE_WORD[device?.type] || 'Content', vector: device?.type === 'VECTOR', grid: device?.type === 'GRID' };
    const next = walk(device, '', false, ctx);
    if (next !== device) (nextDevices ??= { ...devices })[id] = next;
  }
  if (cleanRest === rest && !nextDevices) return { doc, threats };
  return { doc: { ...cleanRest, devices: nextDevices ?? devices } as unknown as T, threats };
}

/** cleanTelaDoc that also tells the open editor, which shows the warning and records it in the trail. */
export function cleanAndReport<T>(doc: T): T {
  const { doc: clean, threats } = cleanTelaDoc(doc);
  if (threats.length) {
    try { window.dispatchEvent(new CustomEvent<TelaThreatDetail>(TELA_THREAT_EVENT, { detail: { docId: (doc as any)?.id || '', ownerId: (doc as any)?.ownerId || '', orgId: (doc as any)?.orgOrigin?.orgId, threats } })); } catch { /* no window */ }
  }
  return clean;
}

/** Last check on one vector object just before its fields are written into SVG markup. */
export function cleanVectorObject<T>(object: T): T {
  return walk(object, '', false, { threats: [], where: '', vector: true, grid: false }) as T;
}
