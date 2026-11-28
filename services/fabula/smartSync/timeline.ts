// Smart Sync → Fabula timeline. Pure: returns the clips and markers to add; Fabula commits them through its
// own undo history, so "Apply" is one Ctrl+Z away from never having happened.

import type { CutSegment, GraphicFlag, SmartSyncState } from './types';
import { layout } from './fuse';

export interface BuildOptions {
  mcAssetId: string;
  /** Timeline time the program starts at. */
  at: number;
  videoTrack: string;
  audioTrack: string;
  /** Track for lower thirds / full pages (a video track above the picture). */
  gfxTrack: string;
  uid: () => string;
  fps: number;
  /** Lower-third template ids (Fabula LOWER_THIRDS) per category; full pages use a centred title. */
  ltSpec: { scripture?: string; name?: string; other?: string };
  /** Verse text by flag id, when it could be looked up. */
  verseText?: Record<string, string>;
  /** Place suggested (not yet accepted) flags too. Default true — they're marked ✦ and easy to delete. */
  includeSuggested?: boolean;
  /** Fabula FX defaults for title clips. */
  titleFx: Record<string, unknown>;
}

export interface BuiltTimeline {
  clips: any[];
  markers: Array<{ t: number; label: string; color?: string }>;
  offsets: Record<string, number>;
  duration: number;
}

const q = (t: number, fps: number) => Math.round(t * fps) / fps;

export function buildTimeline(s: SmartSyncState, o: BuildOptions): BuiltTimeline {
  const { offsets, mcDuration } = layout(s.angles, s.sync);
  const clips: any[] = [];
  const cut: CutSegment[] = s.cut.length ? s.cut : [{ start: 0, end: mcDuration, angle: Math.max(0, s.angles.findIndex((a) => a.kind === 'video')), reason: 'Whole program', by: 'YOU' }];
  for (const c of cut) {
    const dur = q(c.end - c.start, o.fps);
    if (dur <= 0) continue;
    clips.push({
      id: o.uid(), trackId: o.videoTrack, start: q(o.at + c.start, o.fps), duration: dur, srcIn: q(c.start, o.fps),
      kind: 'multicam', assetId: o.mcAssetId, angle: c.angle, label: s.angles[c.angle]?.name || `Angle ${c.angle + 1}`,
      // Sound comes from the master track below, so angle cuts never jump the audio.
      av: true,
      aiCut: { reason: c.reason, by: c.by, approved: !!c.approved, locked: !!c.locked },
    });
  }
  // Master sound, laid once under the whole program.
  const M = s.angles.find((a) => a.assetId === s.masterId);
  if (M) {
    const off = offsets[M.assetId] ?? 0;          // master source time at multicam 0
    const lead = Math.max(0, -off), srcIn = Math.max(0, off);
    const dur = Math.min(M.duration - srcIn, mcDuration - lead);
    if (dur > 0) clips.push({ id: o.uid(), trackId: o.audioTrack, start: q(o.at + lead, o.fps), duration: q(dur, o.fps), srcIn: q(srcIn, o.fps), kind: 'media', assetId: M.assetId, label: `${M.name} · master sound` });
  }
  // Graphics.
  const flags = s.flags.filter((f) => f.status === 'accepted' || (f.status === 'suggested' && o.includeSuggested !== false));
  for (const f of flags) clips.push(flagClip(f, o));
  const markers = s.sections.map((sec) => ({ t: q(o.at + sec.start, o.fps), label: sec.label, color: SECTION_COLOR[sec.kind] }));
  return { clips, markers, offsets, duration: mcDuration };
}

const SECTION_COLOR: Record<string, string> = {
  welcome: '#38bdf8', worship: '#a855f7', prayer: '#f59e0b', scripture: '#22c55e', sermon: '#ef4444', announcements: '#06b6d4',
  offering: '#eab308', altar: '#f97316', benediction: '#94a3b8',
};

export function flagClip(f: GraphicFlag, o: BuildOptions): any {
  const verse = o.verseText?.[f.id] || '';
  const base = {
    id: o.uid(), trackId: o.gfxTrack, start: q(o.at + f.at, o.fps), duration: q(f.duration, o.fps), srcIn: 0, kind: 'title',
    fx: { ...o.titleFx, blend: 'normal', fadeIn: f.kind === 'fullPage' ? 0.4 : 0, fadeOut: f.kind === 'fullPage' ? 0.4 : 0 },
    aiFlag: { id: f.id, category: f.category, kind: f.kind, status: f.status, heard: f.heard },
  };
  const mark = f.status === 'accepted' ? '' : '✦ ';
  if (f.kind === 'fullPage') {
    const body = verse || f.subtitle;
    return { ...base, text: f.title, subtitle: body, titleStyle: 'classic', tx: 50, ty: 50, label: `${mark}${f.title} · full page` };
  }
  const spec = f.category === 'scripture' ? o.ltSpec.scripture : f.category === 'name' ? o.ltSpec.name : o.ltSpec.other;
  const sub = f.category === 'scripture' ? clip90(verse) : f.subtitle;
  return { ...base, text: f.title, subtitle: sub, tag: f.category === 'scripture' ? 'SCRIPTURE' : '', ...(spec ? { tGraphic: { specId: spec } } : { titleStyle: 'modern' }), label: `${mark}${f.title}` };
}

const clip90 = (s: string) => (s.length > 90 ? s.slice(0, 88).replace(/\s+\S*$/, '') + '…' : s);
