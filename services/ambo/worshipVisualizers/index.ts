// services/ambo/worshipVisualizers/index.ts
// Unified registry & Ambo platform adapters for all 72 Church, Worship, Praise,
// Hymnal, and Scripture Reading Audio-Reactive Visualizers — each built through the
// Council of Art Directors (services/council); see councilBuilds.ts and docs/ambo/council.

import type { LyricStyle, LyricFrame } from '../lyricStyles';
import type { ScriptureLayout, ScriptureState } from '../scriptureKit';
import {
  WorshipVisualizerDef,
  WorshipCategory,
  WorshipRenderParams,
  synthesizeWorshipAudioState,
  SAMPLE_SCRIPTURES,
  resolveDirector,
  resolveCouncilNote,
} from './types';
import { CALM_WORSHIP_VISUALIZERS } from './calmWorshipVisualizers';
import { UPTEMPO_PRAISE_VISUALIZERS } from './uptempoPraiseVisualizers';
import { SCRIPTURE_READING_VISUALIZERS } from './scriptureReadingVisualizers';

export * from './types';
export * from './councilBuilds';
export * from './builds';
export { CALM_WORSHIP_VISUALIZERS } from './calmWorshipVisualizers';
export { UPTEMPO_PRAISE_VISUALIZERS } from './uptempoPraiseVisualizers';
export { SCRIPTURE_READING_VISUALIZERS } from './scriptureReadingVisualizers';

/** All 72 designs across Calm Contemporary Worship (24), Uptempo Praise & Hymnal (24), and Scripture Reading (24). */
export const ALL_WORSHIP_VISUALIZERS: WorshipVisualizerDef[] = [
  ...CALM_WORSHIP_VISUALIZERS,
  ...UPTEMPO_PRAISE_VISUALIZERS,
  ...SCRIPTURE_READING_VISUALIZERS,
];

export const DEFAULT_WORSHIP_PARAMS: WorshipRenderParams = {
  motion: 0.5,
  warmth: 0.5,
  reactivity: 0.72,
  textSafe: 0.5,
  showText: true,
};

export function getWorshipVisualizerById(id: string): WorshipVisualizerDef | undefined {
  return ALL_WORSHIP_VISUALIZERS.find(v => v.id === id);
}

export function getWorshipVisualizersByCategory(category: WorshipCategory | 'all'): WorshipVisualizerDef[] {
  if (category === 'all') return ALL_WORSHIP_VISUALIZERS;
  return ALL_WORSHIP_VISUALIZERS.filter(v => v.category === category);
}

/** Adapter converting the 48 Lyric Visualizers (24 Calm + 24 Uptempo) into Ambo `LyricStyle` entries. */
export const WORSHIP_LYRIC_STYLES: LyricStyle[] = [
  ...CALM_WORSHIP_VISUALIZERS,
  ...UPTEMPO_PRAISE_VISUALIZERS,
].map((vis): LyricStyle => ({
  id: vis.id,
  name: vis.name,
  director: resolveDirector(vis),
  council: 'Art Council',
  blurb: `${vis.subtitle} — ${resolveCouncilNote(vis)}`,
  use: vis.serviceUse,
  draw(ctx: CanvasRenderingContext2D, f: LyricFrame) {
    const audio = synthesizeWorshipAudioState(f.pos, vis.category, 0.72);
    if (f.beat != null) {
      audio.beatPhase = f.beat;
      audio.pulse = Math.pow(Math.max(0, 1 - f.beat * 2.0), 2.2) * 0.75;
    }
    vis.render({
      ctx,
      w: f.w,
      h: f.h,
      t: f.pos,
      audio,
      params: DEFAULT_WORSHIP_PARAMS,
      lyricFrame: f,
    });
  },
}));

/** Adapter converting the 24 Scripture Reading Visualizers into Ambo `ScriptureLayout` entries. */
export const WORSHIP_SCRIPTURE_LAYOUTS: ScriptureLayout[] = SCRIPTURE_READING_VISUALIZERS.map((vis): ScriptureLayout => ({
  id: vis.id,
  name: vis.name,
  family: 'Art Council',
  background: 'opaque',
  director: resolveDirector(vis),
  blurb: `${vis.subtitle} — ${resolveCouncilNote(vis)}`,
  animated: true,
  draw(ctx: CanvasRenderingContext2D, s: ScriptureState) {
    const t = s.mt ?? s.t ?? 0;
    const audio = synthesizeWorshipAudioState(t, 'scripture-reading', 0.7);
    vis.render({
      ctx,
      w: s.w,
      h: s.h,
      t,
      audio,
      params: {
        ...DEFAULT_WORSHIP_PARAMS,
        showText: !s.noText,
      },
      scripture: {
        reference: s.reference || SAMPLE_SCRIPTURES[0].reference,
        translation: s.translation || SAMPLE_SCRIPTURES[0].translation,
        text: s.text || SAMPLE_SCRIPTURES[0].text,
        context: s.context ?? SAMPLE_SCRIPTURES[0].context,
      },
      scriptureWordIndex: s.highlightWord,
    });
  },
}));
