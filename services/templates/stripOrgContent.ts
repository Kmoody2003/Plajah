// stripOrgContent — the design of a Tela document without the organization in it: lorem text shaped like
// the original, empty image slots, no lesson data, links, media or narration. Pure (no browser or
// Firebase imports) so the server share route (routes/templateShare.ts) runs the same strip the client previews.
import type { TelaDoc, TelaDevice, TelaVectorObject } from '../../types';
import type { Action } from '../living/contracts';

const strip = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ');

/** Placeholder Latin shaped like the original: same lines, about the same length, same capitalisation. */
export function loremLike(src: string, seed = 0): string {
  let w = seed % LOREM.length;
  return src.split('\n').map(line => {
    const t = line.trim(); if (!t) return line;
    const words: string[] = []; let len = 0;
    while (len < Math.max(3, t.length - 2)) { const x = LOREM[w++ % LOREM.length]; words.push(x); len += x.length + 1; }
    let out = words.join(' ');
    if (t === t.toUpperCase() && /[A-Z]/.test(t)) out = out.toUpperCase();
    else out = out.charAt(0).toUpperCase() + out.slice(1);
    if (/[.!?]$/.test(t)) out += '.';
    return out;
  }).join('\n');
}

const CONTENT_KEYS = new Set(['text', 'title', 'subtitle', 'prompt', 'question', 'answer', 'correctAnswer', 'caption', 'alt', 'description', 'body', 'content', 'hint', 'summary', 'instructions', 'placeholder', 'credit', 'note', 'notes', 'label', 'value', 'explanation', 'rubric', 'feedback', 'name', 'expected', 'acceptedAnswers', 'teacherNote']);
const DROP_KEYS = new Set(['src', 'url', 'sourceUrl', 'sourceImageSrc', 'storagePath', 'href', 'link', 'ctaUrl', 'textMaskUrl', 'posterSrc', 'story', 'document', 'raster', 'rasterPreview', 'domainBinding', 'assignment', 'answerKey', 'words']);

function scrub(v: any, seed: { n: number }, key?: string): any {
  if (typeof v === 'string') return key && CONTENT_KEYS.has(key) && v.trim() ? loremLike(v, seed.n++) : v;
  if (Array.isArray(v)) return key === 'options' || key === 'choices' ? v.map(x => (typeof x === 'string' ? loremLike(x, seed.n++) : scrub(x, seed))) : v.map(x => scrub(x, seed));
  if (v && typeof v === 'object') {
    const o: any = {};
    for (const [k, x] of Object.entries(v)) {
      if (DROP_KEYS.has(k)) continue;
      if (k === 'values' && x && typeof x === 'object' && !Array.isArray(x)) { o[k] = Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([c, s]) => [c, typeof s === 'string' && s ? loremLike(s, seed.n++) : s])); continue; }
      if (k === 'cells' && x && typeof x === 'object') { o[k] = Object.fromEntries(Object.entries(x as Record<string, string>).map(([c, s]) => [c, typeof s === 'string' && s && !s.startsWith('=') ? loremLike(s, seed.n++).split(' ')[0] : s])); continue; }
      o[k] = scrub(x, seed, k);
    }
    return o;
  }
  return v;
}

function scrubVector(o: TelaVectorObject, seed: { n: number }): TelaVectorObject {
  if (o.kind === 'IMAGE') {
    const { sourceImageSrc: _s, sourceCrop: _c, ...rest } = o as any;
    return { ...rest, kind: 'RECT', fill: '#d9d5e2', opacity: .7, stroke: '#b8b2c6', strokeWidth: 1, objectLabel: 'Image slot', templateRole: 'IMAGE_SLOT', semanticRole: undefined } as TelaVectorObject;
  }
  const keepLabel = o.objectLabel; const keepRole = o.templateRole;
  const out = scrub(o, seed) as TelaVectorObject;
  out.objectLabel = keepLabel; out.templateRole = keepRole; // labels drive behaviours and editing, not content
  return out;
}

/** The design without the org: lorem text, empty image slots, no lesson data, links, media or narration. */
export function stripOrgContent(d: TelaDoc, o: { title: string }): TelaDoc {
  const seed = { n: 0 };
  const devices: Record<string, TelaDevice> = {};
  for (const [id, dev] of Object.entries(d.devices)) {
    if (dev.type === 'VECTOR') devices[id] = { ...dev, name: dev.name ? loremLike(dev.name, seed.n++) : dev.name, objects: dev.objects.map(x => scrubVector(x, seed)) };
    else if (dev.type === 'IMAGE') devices[id] = { ...dev, layers: [], raster: undefined, rasterPreview: undefined, rasterRev: undefined } as TelaDevice;
    else if (dev.type === 'MEDIA') devices[id] = { ...dev, src: '', name: 'Media slot', storagePath: undefined, size: 0 };
    else if (dev.type === 'FIGURE') continue;
    else devices[id] = scrub(dev, seed) as TelaDevice;
  }
  const frames = d.frames.map(f => ({ ...f, label: f.label ? loremLike(f.label, seed.n++) : f.label, deviceIds: f.deviceIds.filter(id => devices[id]) }));
  // Behaviours keep their motion; anything carrying words or links (emit payloads, set text) is cleared, nested branches included.
  const cleanActions = (as?: Action[]): Action[] | undefined => as?.map(a =>
    a.do === 'emit' ? { ...a, payload: undefined }
      : a.do === 'set' && a.props.text !== undefined ? { ...a, props: { ...a.props, text: loremLike(a.props.text, seed.n++) } }
        : a.do === 'if' ? { ...a, then: cleanActions(a.then)!, else: cleanActions(a.else) }
          : a);
  const living = d.living ? { ...d.living, authorNotes: undefined, pages: d.living.pages.map(p => ({ ...p, narration: undefined, a11y: undefined, behaviors: p.behaviors.map(b => ({ ...b, label: undefined, hint: b.hint ? 'Try it' : undefined, do: cleanActions(b.do)!, reduced: cleanActions(b.reduced) })) })) } : undefined;
  const { lesson: _l, publication: _p, issue: _i, assignmentFormat: _a, orgOrigin: _o, ...rest } = d;
  return strip({ ...rest, title: o.title, devices, frames, living, bindings: (d.bindings || []).filter(b => devices[b.sourceDeviceId] && devices[b.targetDeviceId]) });
}
