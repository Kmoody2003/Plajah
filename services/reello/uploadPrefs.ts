// Reello upload templates + defaults.
//
// An UPLOAD TEMPLATE is what a watch folder (or a batch) fills every upload's details from: a title
// pattern, description, tags, category, visibility, and what Story Intelligence should do with it.
// The DEFAULTS say what batch and automatic uploads are when nothing else does — private or public.
//
// Stored server-side at reelloUploadPrefs/{uid} through /api/reello/prefs (so they follow the account
// to every device, and need no client Firestore rule). Watch folders themselves are on-device
// (services/reello/watchFolders.ts): a browser folder handle can't leave the machine that granted it.

import { DEFAULT_INTEL_OPTIONS } from './intel/core';
import type { IntelOptions } from './intel/types';

export type UploadVisibility = 'PUBLIC' | 'PRIVATE';

export interface UploadTemplate {
  id: string;
  name: string;
  /** Tokens: {name} (tidied file name), {filename}, {folder}, {date}, {n}, {account}. */
  titlePattern: string;
  description: string;
  tags: string[];
  genre: string;
  /** null = use the account default. */
  visibility: UploadVisibility | null;
  storyIntel: boolean;
  intel: IntelOptions;
  updatedAt: number;
}

export interface ReelloUploadPrefs {
  /** What batch and automatic (watch-folder) uploads are when their template doesn't say. */
  defaultVisibility: UploadVisibility;
  /** Story Intelligence on for hand-picked uploads unless the uploader turns it off. */
  storyIntelDefault: boolean;
  templates: UploadTemplate[];
  defaultTemplateId?: string;
  updatedAt: number;
}

/** Hand-picked uploads at once; more than this goes through a folder, in the background. */
export const MAX_DIRECT_FILES = 5;

export const VIDEO_FILE_RE = /\.(mp4|mov|m4v|webm|mkv|avi|mpg|mpeg|mts|m2ts|3gp)$/i;
export const isVideoFile = (f: { name: string; type?: string }) => (f.type || '').startsWith('video/') || VIDEO_FILE_RE.test(f.name);

export const DEFAULT_PREFS: ReelloUploadPrefs = {
  defaultVisibility: 'PRIVATE', storyIntelDefault: true, templates: [], updatedAt: 0,
};

export function newTemplate(name = 'New template'): UploadTemplate {
  return {
    id: `tpl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    name, titlePattern: '{name}', description: '', tags: [], genre: 'General', visibility: null,
    storyIntel: true, intel: { ...DEFAULT_INTEL_OPTIONS }, updatedAt: Date.now(),
  };
}

/** "my_vlog-ep03_FINAL (1).mp4" → "My vlog ep03". */
export function tidyFileName(fileName: string): string {
  const base = fileName.replace(/\.[^/.]+$/, '')
    .replace(/\s*\(\d+\)$/, '')
    .replace(/[_]+/g, ' ').replace(/-+/g, ' ')
    .replace(/\b(final|export|render|master|v\d+|copy)\b/gi, '')
    .replace(/\s{2,}/g, ' ').trim();
  return base ? base[0].toUpperCase() + base.slice(1) : fileName;
}

export interface TemplateContext { fileName: string; folder?: string; index?: number; account?: string; date?: Date }

/** Fill one upload's details from a template. Missing template → just a tidy title. */
export function applyTemplate(t: UploadTemplate | null | undefined, ctx: TemplateContext, prefs: Pick<ReelloUploadPrefs, 'defaultVisibility'>) {
  const date = ctx.date || new Date();
  const tokens: Record<string, string> = {
    name: tidyFileName(ctx.fileName),
    filename: ctx.fileName.replace(/\.[^/.]+$/, ''),
    folder: ctx.folder || '',
    date: date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
    n: String((ctx.index ?? 0) + 1),
    account: ctx.account || '',
  };
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (m, k) => (k in tokens ? tokens[k] : m)).replace(/\s{2,}/g, ' ').trim();
  const title = (fill(t?.titlePattern || '{name}') || tokens.name).slice(0, 180);
  return {
    title,
    description: fill(t?.description || ''),
    tags: [...(t?.tags || [])],
    genre: t?.genre || 'General',
    visibility: (t?.visibility || prefs.defaultVisibility) as UploadVisibility,
    storyIntel: t ? t.storyIntel : true,
    intel: { ...DEFAULT_INTEL_OPTIONS, ...(t?.intel || {}) } as IntelOptions,
  };
}

/** Clean a prefs body from the wire (server and client both run it). */
export function sanitizePrefs(raw: any): ReelloUploadPrefs {
  const vis = (v: any): UploadVisibility | null => (v === 'PUBLIC' || v === 'PRIVATE' ? v : null);
  const s = (v: any, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
  const templates: UploadTemplate[] = (Array.isArray(raw?.templates) ? raw.templates : []).slice(0, 40).map((t: any) => {
    const i = t?.intel || {};
    const target = i.merchTarget?.kind === 'ORG' && typeof i.merchTarget.orgId === 'string'
      ? { kind: 'ORG' as const, orgId: s(i.merchTarget.orgId, 128), orgName: s(i.merchTarget.orgName, 120) }
      : { kind: 'USER' as const };
    return {
      id: s(t?.id, 60) || newTemplate().id,
      name: s(t?.name, 80) || 'Template',
      titlePattern: s(t?.titlePattern, 200) || '{name}',
      description: s(t?.description, 5000),
      tags: (Array.isArray(t?.tags) ? t.tags : []).map((x: any) => s(x, 40)).filter(Boolean).slice(0, 30),
      genre: s(t?.genre, 40) || 'General',
      visibility: vis(t?.visibility),
      storyIntel: t?.storyIntel !== false,
      intel: {
        article: i.article !== false, clips: i.clips !== false, merch: i.merch !== false,
        publishMode: i.publishMode === 'AUTO' ? 'AUTO' : 'APPROVE',
        merchTarget: target,
        clipVisibility: i.clipVisibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC',
      },
      updatedAt: typeof t?.updatedAt === 'number' ? t.updatedAt : Date.now(),
    };
  });
  const defaultTemplateId = typeof raw?.defaultTemplateId === 'string' && templates.some(t => t.id === raw.defaultTemplateId) ? raw.defaultTemplateId : undefined;
  return {
    defaultVisibility: vis(raw?.defaultVisibility) || 'PRIVATE',
    storyIntelDefault: raw?.storyIntelDefault !== false,
    templates,
    ...(defaultTemplateId ? { defaultTemplateId } : {}),
    updatedAt: Date.now(),
  };
}
