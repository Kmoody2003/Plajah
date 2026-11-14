// Chora Direct — Phase 2 project hand-off helper (`applyBriefToDoc.ts`).
//
// Applies a compiled `SongBrief` cleanly onto a `GrooveDoc` in a single atomic mutation so
// BPM, key, meter, form sections, bar-aligned lyrics, and Session Band genre/chart all read
// from one single-truth brief.

import { grooveUid, type GrooveDoc } from '../beats/grooveDoc';
import {
  briefGrounding,
  briefToBandChart,
  briefToLyricLines,
  briefToRenderRequest,
  type SongBrief,
} from './songBrief';
import { layoutVocal } from './vocalScore';

type MeterDen = 2 | 4 | 8 | 16;
const VALID_DENS = new Set<MeterDen>([2, 4, 8, 16]);

export function applyBriefToDoc(
  doc: GrooveDoc,
  brief: SongBrief,
  opts: { resetTempoMap?: boolean } = {},
): GrooveDoc {
  doc.bpm = Math.max(30, Math.min(300, brief.bpm));
  if (opts.resetTempoMap ?? true) {
    doc.tempoMap = undefined;
  }

  doc.key = {
    tonic: brief.key.tonic,
    scale: brief.key.mode,
  };

  const num = Math.max(1, Math.min(16, Math.round(brief.meter[0])));
  const den: MeterDen = VALID_DENS.has(brief.meter[1] as MeterDen)
    ? (brief.meter[1] as MeterDen)
    : 4;
  doc.meter = [{ bar: 0, num, den }];

  const firstSceneId = doc.scenes?.[0]?.id ?? 'scene-1';
  doc.sections = brief.sections.map((s) => ({
    id: s.id,
    sceneId: firstSceneId,
    bars: s.bars,
    name: s.label,
  }));

  const lyricLines = briefToLyricLines(brief);
  doc.lyrics = lyricLines.map((l) => ({
    id: grooveUid(),
    bar: l.bar,
    text: l.text,
  }));
  doc.vocalLayer = layoutVocal(brief);

  const bandChart = briefToBandChart(brief);
  doc.band = {
    seats: doc.band?.seats ?? {},
    takes: doc.band?.takes,
    genre: bandChart.genre,
    chart: bandChart.chart,
  };

  if (brief.title) {
    doc.name = brief.title;
    if (doc.showcaseMetadata) {
      doc.showcaseMetadata.trackTitle = brief.title;
    }
  }

  return doc;
}

export interface BriefStudioHandoffs {
  councilDescription: string;
  bandGenre: string;
  bandChart: string;
  musicLab: ReturnType<typeof briefToRenderRequest>;
}

export function buildBriefStudioHandoffs(
  brief: SongBrief,
  opts: { sectionId?: string; maxGroundingChars?: number } = {},
): BriefStudioHandoffs {
  const band = briefToBandChart(brief);
  return {
    councilDescription: briefGrounding(brief, {
      sectionId: opts.sectionId,
      maxChars: opts.maxGroundingChars ?? 1600,
    }),
    bandGenre: band.genre,
    bandChart: band.chart,
    musicLab: briefToRenderRequest(brief),
  };
}
