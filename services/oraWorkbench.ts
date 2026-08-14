import { auth, fetchUserAlbums, fetchUserVideos } from './backendService';
import { listWritingProjects } from './loreaProjectsService';
import type { OraSourceService } from '../types';

// ─────────────────────────────────────────────────────────────────────────
// Ora — Workbench.
//
// Every project-management tool on the market opens empty and charges you a
// manual-entry tax. Plajah already holds the work, so this one arrives full:
// a project here is not a checklist someone typed, it is the actual releases,
// manuscripts and videos on the account, each carrying its own real state.
//
// THE RULE, same as the goal adapters: nothing is invented. Every state string
// below is derived from a field that genuinely exists on the record. If a
// property cannot be read, the item simply has no note against it — Workbench
// never guesses that something "needs mixing" or "is nearly done", because a
// plausible-sounding lie about your own work is worse than silence.
//
// Blueprint: docs/PLAJAH_WELLBEING_SUITE_BLUEPRINT.md §4b
// ─────────────────────────────────────────────────────────────────────────

export interface WorkItem {
  id: string;
  title: string;
  /** Short factual state, e.g. "9 tracks" or "31,400 words". */
  state: string;
  /**
   * A concrete missing piece, derived from an absent field — "No cover art",
   * "No thumbnail". Never a judgement about quality or readiness.
   */
  needs?: string;
}

export interface WorkProject {
  id: string;
  title: string;
  service: OraSourceService;
  /** Provenance label, matching the goal chips: Chora, Lorea, Reello. */
  label: string;
  state: string;
  items: WorkItem[];
  /** Deep link to the surface that owns this work. */
  ref?: string;
  updatedAt: number;
}

export interface WorkbenchResult {
  projects: WorkProject[];
  /** How many real artefacts were found. Drives the "you added none of these" line. */
  itemCount: number;
  /** True when a source could not be read at all — shown as incomplete, not empty. */
  partial: boolean;
}

const fmt = (n: number) => n.toLocaleString();

/** Assemble the signed-in user's real work into projects. Read-only, uid-scoped. */
export async function assembleWorkbench(): Promise<WorkbenchResult> {
  const uid = auth.currentUser?.uid;
  if (!uid) return { projects: [], itemCount: 0, partial: true };

  let partial = false;
  const projects: WorkProject[] = [];
  let itemCount = 0;

  // ── Chora: releases and their tracks ──────────────────────────────────
  try {
    const albums = await fetchUserAlbums(uid);
    for (const a of albums) {
      const tracks = Array.isArray(a?.tracks) ? a.tracks : [];
      const items: WorkItem[] = tracks.map((t) => {
        // Only absences we can actually observe on the record.
        const missing: string[] = [];
        if (!t.url) missing.push('no audio file');
        if (!t.lyrics) missing.push('no lyrics');
        return {
          id: t.id,
          title: t.title || 'Untitled track',
          state: t.duration
            ? `${Math.floor(t.duration / 60)}:${String(Math.round(t.duration % 60)).padStart(2, '0')}`
            : 'no duration set',
          needs: missing.length ? missing.join(' · ') : undefined,
        };
      });
      itemCount += items.length;
      projects.push({
        id: `chora_${a.id}`,
        title: a.title || 'Untitled release',
        service: 'CHORA',
        label: 'Chora',
        state: a.isPublic === false
          ? `Draft · ${tracks.length} track${tracks.length === 1 ? '' : 's'}`
          : `${tracks.length} track${tracks.length === 1 ? '' : 's'}`,
        items: a.coverImage ? items : [{ id: `${a.id}_cover`, title: 'Cover art', state: 'missing', needs: 'no cover image' }, ...items],
        ref: '/?view=music',
        updatedAt: Number(a.createdAt) || 0,
      });
    }
  } catch {
    partial = true;
  }

  // ── Lorea: books and screenplays ──────────────────────────────────────
  try {
    const { projects: writing, chapters } = await listWritingProjects(uid);
    for (const p of writing) {
      const own = chapters.filter((c: any) => c.projectId === p.id);
      const items: WorkItem[] = own.slice(0, 40).map((c: any) => ({
        id: String(c.id),
        title: c.title || 'Untitled chapter',
        state: Number(c.wordCount) ? `${fmt(Number(c.wordCount))} words` : 'empty',
      }));
      itemCount += items.length || 1;
      const words = Number(p.wordCountCurrent) || 0;
      const target = Number(p.wordCountTarget) || 0;
      projects.push({
        id: `lorea_${p.id}`,
        title: p.title || 'Untitled',
        service: 'LOREA',
        label: 'Lorea',
        state: target > 0
          ? `${fmt(words)} / ${fmt(target)} words · ${p.status.toLowerCase()}`
          : `${fmt(words)} words · ${p.status.toLowerCase()}`,
        items,
        ref: '/?view=books',
        updatedAt: Number(p.updatedAt) || Number(p.createdAt) || 0,
      });
    }
  } catch {
    partial = true;
  }

  // ── Reello: published videos ──────────────────────────────────────────
  try {
    const videos = await fetchUserVideos(uid);
    if (videos.length) {
      const items: WorkItem[] = videos.slice(0, 40).map((v) => {
        const missing: string[] = [];
        if (!v.thumbnailUrl && !v.coverImageUrl) missing.push('no thumbnail');
        if (!v.description) missing.push('no description');
        return {
          id: v.id,
          title: v.title || 'Untitled video',
          state: typeof v.playsCount === 'number' ? `${fmt(v.playsCount)} plays` : 'published',
          needs: missing.length ? missing.join(' · ') : undefined,
        };
      });
      itemCount += items.length;
      projects.push({
        id: 'reello_all',
        title: 'Reello uploads',
        service: 'REELLO',
        label: 'Reello',
        state: `${videos.length} video${videos.length === 1 ? '' : 's'}`,
        items,
        ref: '/?view=videos',
        updatedAt: Math.max(0, ...videos.map((v) => Number((v as any).timestamp) || 0)),
      });
    }
  } catch {
    partial = true;
  }

  projects.sort((a, b) => b.updatedAt - a.updatedAt);
  return { projects, itemCount, partial };
}

/** Everything with an observable missing piece, flattened. The actual to-do list. */
export function loose(result: WorkbenchResult): Array<{ project: string; item: WorkItem; label: string }> {
  return result.projects.flatMap((p) =>
    p.items.filter((i) => i.needs).map((item) => ({ project: p.title, item, label: p.label })),
  );
}
