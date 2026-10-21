// services/comicProject/showcaseImport.ts — open a showcase book as a ComicProject and
// export it back. The round trip is lossless: exporting an untouched import yields the
// original ShowcaseComicBook (tests/comicProject.test.ts checks every showcase title).

import type {
  ComicPage,
  KineticSfx,
  NarrativeCaption,
  SequentialPanel,
  ShowcaseComicBook,
  SpeechBalloon,
} from '../../data/showcase/comicTypes';
import { layoutFlexRows } from './layout';
import type {
  BalloonStyle,
  CameraAngle,
  ComicBalloonStyle,
  ComicPageDocument,
  ComicPanelNode,
  ComicProject,
  ComicProjectFormat,
  KanjiSfxItem,
  PanelLayoutPresetId,
  PanelSubLayer,
  PositionSpec,
  SfxStyle,
  SpeechBalloonItem,
} from './types';

// ── Vocabulary maps ──────────────────────────────────────────────────────────

const BALLOON_IN: Record<BalloonStyle, ComicBalloonStyle> = {
  standard: 'SPEECH',
  whisper: 'WHISPER',
  shout: 'SHOUT',
  comms: 'COMMS',
  thought: 'THOUGHT',
  'jagged-monster': 'MONSTER',
};

const BALLOON_OUT: Record<Exclude<ComicBalloonStyle, 'NARRATION_CAPTION'>, BalloonStyle> = {
  SPEECH: 'standard',
  WHISPER: 'whisper',
  SHOUT: 'shout',
  COMMS: 'comms',
  THOUGHT: 'thought',
  MONSTER: 'jagged-monster',
};

export const SFX_STYLE_INK: Record<SfxStyle, { fill: string; stroke: string }> = {
  'orange-kinetic': { fill: '#f97316', stroke: '#1c0a00' },
  'cyan-electric': { fill: '#22d3ee', stroke: '#04121a' },
  'red-impact': { fill: '#dc2626', stroke: '#fff7ed' },
  'screentone-speed': { fill: '#f8fafc', stroke: '#0f172a' },
  'kirby-crackle': { fill: '#facc15', stroke: '#1e1b4b' },
  'ligne-ink': { fill: '#0f172a', stroke: '#f8fafc' },
};

export function cameraAngleToShot(angle?: CameraAngle): ComicPanelNode['cameraShot'] {
  switch (angle) {
    case 'extreme-wide':
    case 'wide':
    case 'bird-eye':
      return 'ESTABLISHING_WIDE';
    case 'low-angle-heroic':
    case 'worm-eye':
      return 'LOW_ANGLE_HERO';
    case 'high-angle-dutch':
      return 'HIGH_ANGLE_TENSION';
    case 'close-up':
      return 'CLOSE_UP';
    case 'extreme-close-up':
      return 'EXTREME_CLOSE_UP';
    default:
      return 'MEDIUM_ACTION';
  }
}

export function shotToCameraAngle(shot: ComicPanelNode['cameraShot']): CameraAngle {
  switch (shot) {
    case 'ESTABLISHING_WIDE':
      return 'wide';
    case 'LOW_ANGLE_HERO':
      return 'low-angle-heroic';
    case 'HIGH_ANGLE_TENSION':
      return 'high-angle-dutch';
    case 'CLOSE_UP':
      return 'close-up';
    case 'EXTREME_CLOSE_UP':
      return 'extreme-close-up';
    default:
      return 'medium';
  }
}

// ── Positions ────────────────────────────────────────────────────────────────

/** Parses "4%" (or a bare number) to a percentage; px values assume a ~600px panel. */
function pct(v: string | undefined, fallback: number): number {
  if (v == null) return fallback;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return fallback;
  return v.trim().endsWith('px') ? (n / 600) * 100 : n;
}

/** Top-left percentages for an imported position (CSS bottom/right anchors estimated). */
export function positionToXY(pos: PositionSpec, est: { w: number; h: number }) {
  const widthPct = pct(pos.maxWidth, est.w);
  const xPct = pos.left != null ? pct(pos.left, 4) : pos.right != null ? 100 - pct(pos.right, 4) - widthPct : 4;
  const yPct = pos.top != null ? pct(pos.top, 4) : pos.bottom != null ? 100 - pct(pos.bottom, 4) - est.h : 4;
  return { xPct: round(xPct), yPct: round(yPct), widthPct: round(widthPct) };
}

function xyToPosition(x: number, y: number, widthPct?: number): PositionSpec {
  const pos: PositionSpec = { top: `${round(y)}%`, left: `${round(x)}%` };
  if (widthPct != null) pos.maxWidth = `${round(widthPct)}%`;
  return pos;
}

function dockFor(xPct: number, yPct: number): SpeechBalloonItem['dockZone'] {
  const top = yPct < 50;
  if (xPct > 45) return top ? 'top-right' : 'bottom-right';
  return top ? 'top-left' : 'bottom-left';
}

function tailTarget(b: { xPct: number; yPct: number; widthPct: number }, dir?: SpeechBalloon['tailDirection']) {
  const left = dir === 'bottom-left' || dir === 'top-left';
  const up = dir === 'top-left' || dir === 'top-right';
  return {
    tailTargetXPct: round(left ? b.xPct + 8 : b.xPct + b.widthPct - 8),
    tailTargetYPct: round(up ? Math.max(0, b.yPct - 8) : Math.min(100, b.yPct + 24)),
  };
}

// ── Import ───────────────────────────────────────────────────────────────────

export function balloonFromShowcase(b: SpeechBalloon, id: string): SpeechBalloonItem {
  const xy = positionToXY(b.position, { w: 40, h: 14 });
  return {
    id,
    speaker: b.speaker,
    text: b.text,
    style: BALLOON_IN[b.style] ?? 'SPEECH',
    dockZone: dockFor(xy.xPct, xy.yPct),
    ...xy,
    ...tailTarget(xy, b.tailDirection),
    tailDirection: b.tailDirection,
    source: b.position,
    sourceXY: xy,
  };
}

export function captionFromShowcase(c: NarrativeCaption, id: string): SpeechBalloonItem {
  const xy = positionToXY(c.position, { w: 46, h: 10 });
  return {
    id,
    speaker: '',
    text: c.text,
    style: 'NARRATION_CAPTION',
    captionKind: c.kind,
    dockZone: dockFor(xy.xPct, xy.yPct),
    ...xy,
    tailTargetXPct: xy.xPct,
    tailTargetYPct: xy.yPct,
    tailDirection: 'none',
    source: c.position,
    sourceXY: xy,
  };
}

export function sfxFromShowcase(s: KineticSfx, id: string): KanjiSfxItem {
  // SFX render centred on their point, so anchor the centre a little inside the corner.
  const xy = positionToXY(s.position, { w: 24, h: 12 });
  const ink = SFX_STYLE_INK[s.style] ?? SFX_STYLE_INK['orange-kinetic'];
  return {
    id,
    kanji: s.word,
    romaji: '',
    meaning: s.animation,
    xPct: round(xy.xPct + 10),
    yPct: round(xy.yPct + 6),
    scale: 1,
    rotationDeg: -8,
    colorHex: ink.fill,
    strokeHex: ink.stroke,
    fxStyle: s.style,
    animation: s.animation,
    fontSize: s.fontSize,
    source: s.position,
    sourceXY: { xPct: round(xy.xPct + 10), yPct: round(xy.yPct + 6) },
  };
}

export function parseBoundingBox(raw: string): { x: number; y: number; w: number; h: number } {
  const num = (k: string, d: number) => {
    const m = raw.match(new RegExp(`${k}\\s*:\\s*(-?[\\d.]+)`));
    return m ? parseFloat(m[1]) : d;
  };
  return { x: num('x', 0.15), y: num('y', 0.05), w: num('w', 0.7), h: num('h', 1) };
}

function formatBoundingBox(b: { x: number; y: number; w: number; h: number }) {
  return `{ x: ${b.x}, y: ${b.y}, w: ${b.w}, h: ${b.h} }`;
}

/** The three layers an imported panel needs: art plate, lettering, SFX. */
export function graphicNovelLayers(panelKey: string): PanelSubLayer[] {
  const kf = (id: string) => [{ id, timeSec: 0, scale: 1, x: 0, y: 0, rotation: 0, opacity: 1 }];
  return [
    { id: `lyr_bal_${panelKey}`, name: 'Lettering', kind: 'SPEECH_BALLOONS', visible: true, locked: false, keyframes: kf(`kf_bal_${panelKey}`) },
    { id: `lyr_sfx_${panelKey}`, name: 'SFX', kind: 'KANJI_SFX', visible: true, locked: false, keyframes: kf(`kf_sfx_${panelKey}`) },
    { id: `lyr_bg_${panelKey}`, name: 'Art Plate', kind: 'BACKGROUND_PLATE', visible: true, locked: false, keyframes: kf(`kf_bg_${panelKey}`) },
  ];
}

function panelFromShowcase(p: SequentialPanel, pageNumber: number, idx: number): ComicPanelNode {
  const key = p.panelId ?? `p${pageNumber}_${idx + 1}`;
  const captions = p.captions.map((c, i) => captionFromShowcase(c, `cap_${key}_${i}`));
  const balloons = p.balloons.map((b, i) => balloonFromShowcase(b, `bal_${key}_${i}`));
  const loop = p.motion;
  const loopSpan = loop?.enabled ? Math.max(0.5, loop.timeRange[1] - loop.timeRange[0]) : 0;

  return {
    id: `panel_${key}`,
    order: idx + 1,
    cameraShot: cameraAngleToShot(p.cameraAngle),
    prompt: p.artBrief,
    renderedImageUrl: p.imageUrl,
    box: { xPct: 0, yPct: 0, widthPct: 100, heightPct: 100 },
    nestedDocument: {
      id: `nested_${key}`,
      timelineDurationSec: loopSpan ? round(loopSpan, 2) : 5,
      cinemagraphPreset: 'none',
      halftone: { enabled: false, dotsPerInch: 60, opacity: 0.24, colorHex: '#000000' },
      layers: graphicNovelLayers(key),
      inkStrokes: [],
      balloons: [...captions, ...balloons],
      sfxItems: (p.sfx ?? []).map((s, i) => sfxFromShowcase(s, `sfx_${key}_${i}`)),
    },
    panelNumber: p.panelNumber,
    globalPanelNumber: p.globalPanelNumber,
    sourcePanelId: p.panelId,
    geometry: p.geometry,
    flex: p.flex,
    cameraAngle: p.cameraAngle,
    framingCode: p.framingCode,
    eyeVector: p.eyeVector,
    artBrief: p.artBrief,
    generationPrompt: p.generationPrompt,
    editorialRationale: p.editorialRationale,
    imageFallback: p.imageFallback,
    video:
      p.sourceVideoUrl || p.muxPlaybackId || p.motion || p.timecodeSeconds != null
        ? {
            sourceVideoUrl: p.sourceVideoUrl,
            muxPlaybackId: p.muxPlaybackId,
            timecodeSeconds: p.timecodeSeconds,
            anchorTimecodeSeconds: p.anchorTimecodeSeconds,
            endTimecodeSeconds: p.endTimecodeSeconds,
            loop: p.motion,
          }
        : undefined,
    subject: p.samLayer
      ? {
          enabled: p.samLayer.enabled,
          subjectName: p.samLayer.subjectName,
          confidenceScore: p.samLayer.confidenceScore,
          box: parseBoundingBox(p.samLayer.boundingBox),
          breakoutPixels: p.samLayer.breakoutPixels,
          rawBoundingBox: p.samLayer.boundingBox,
        }
      : undefined,
  };
}

export function pageFromShowcase(page: ComicPage, gutterPx: number): ComicPageDocument {
  const panels = page.panels.map((p, i) => panelFromShowcase(p, page.pageNumber, i));
  const { boxes, aspect } = layoutFlexRows(panels);
  return {
    id: `page_${page.pageNumber}`,
    title: page.title,
    presetId: 'flex-rows' as PanelLayoutPresetId,
    gutterPx,
    paperColorHex: '#050507',
    panels: panels.map((p, i) => ({ ...p, box: boxes[i] })),
    aspect,
    meta: {
      pageNumber: page.pageNumber,
      slugline: page.slugline,
      act: page.act,
      actNumber: page.actNumber,
      timeRangeLabel: page.timeRangeLabel,
      summary: page.summary,
      sequenceBeat: page.sequenceBeat,
      layoutGrammar: page.layoutGrammar,
      activeLensName: page.activeLensName,
      activeLensDesc: page.activeLensDesc,
    },
  };
}

function formatFor(book: ShowcaseComicBook): ComicProjectFormat {
  if (book.genre === 'seinen-kinetic' || book.genre === 'shojo-gothic') return 'manga';
  return book.pages.length >= 16 ? 'graphic-novel' : 'comic';
}

export function showcaseProjectId(showcaseId: string) {
  return `showcase-${showcaseId}`;
}

export function showcaseBookToComicProject(book: ShowcaseComicBook, now = Date.now()): ComicProject {
  const { pages, ...meta } = book;
  const gutter = Math.max(4, Math.round(pct(book.visualGrammar.gutterWidth, 12)));
  return {
    schema: 'plajah.comicProject',
    version: 1,
    id: showcaseProjectId(book.id),
    title: book.title,
    format: formatFor(book),
    readingDirection: 'ltr',
    source: { kind: 'showcase', showcaseId: book.id },
    book: meta,
    pages: pages.map((p) => pageFromShowcase(p, gutter)),
    createdAt: now,
    updatedAt: now,
  };
}

// ── Export ───────────────────────────────────────────────────────────────────

/** Assigns only defined values, so optional showcase keys stay absent when unset. */
function put<T extends object, K extends keyof T>(obj: T, key: K, val: T[K] | undefined) {
  if (val !== undefined) obj[key] = val as T[K];
}

function moved(item: { xPct: number; yPct: number; widthPct?: number }, src?: { xPct: number; yPct: number; widthPct?: number }) {
  if (!src) return true;
  return (
    Math.abs(item.xPct - src.xPct) > 0.01 ||
    Math.abs(item.yPct - src.yPct) > 0.01 ||
    (item.widthPct != null && src.widthPct != null && Math.abs(item.widthPct - src.widthPct) > 0.01)
  );
}

function balloonToShowcase(b: SpeechBalloonItem): SpeechBalloon {
  const out: SpeechBalloon = {
    speaker: b.speaker,
    text: b.text,
    style: BALLOON_OUT[b.style as keyof typeof BALLOON_OUT] ?? 'standard',
    position: b.source && !moved(b, b.sourceXY) ? b.source : xyToPosition(b.xPct, b.yPct, b.widthPct),
  };
  put(out, 'tailDirection', b.tailDirection);
  return out;
}

function captionToShowcase(b: SpeechBalloonItem): NarrativeCaption {
  return {
    text: b.text,
    kind: b.captionKind ?? 'internal-monologue',
    position: b.source && !moved(b, b.sourceXY) ? b.source : xyToPosition(b.xPct, b.yPct, b.widthPct),
  };
}

function sfxToShowcase(s: KanjiSfxItem): KineticSfx {
  const out: KineticSfx = {
    word: s.kanji,
    style: s.fxStyle ?? 'orange-kinetic',
    animation: s.animation ?? 'pulse',
    position: s.source && !moved(s, s.sourceXY) ? s.source : xyToPosition(s.xPct - 10, s.yPct - 6),
  };
  put(out, 'fontSize', s.fontSize);
  return out;
}

export function panelToShowcase(p: ComicPanelNode): SequentialPanel {
  const balloons = p.nestedDocument.balloons;
  const out: SequentialPanel = {
    panelNumber: p.panelNumber ?? p.order,
    geometry: p.geometry ?? 'standard-rect',
    flex: p.flex ?? Math.max(1, Math.min(12, Math.round((p.box.widthPct / 100) * 12))),
    cameraAngle: p.cameraAngle ?? shotToCameraAngle(p.cameraShot),
    eyeVector: p.eyeVector ?? '',
    artBrief: p.artBrief ?? p.prompt,
    generationPrompt: p.generationPrompt ?? p.prompt,
    captions: balloons.filter((b) => b.style === 'NARRATION_CAPTION').map(captionToShowcase),
    balloons: balloons.filter((b) => b.style !== 'NARRATION_CAPTION').map(balloonToShowcase),
  };
  put(out, 'globalPanelNumber', p.globalPanelNumber);
  put(out, 'panelId', p.sourcePanelId);
  put(out, 'framingCode', p.framingCode);
  put(out, 'editorialRationale', p.editorialRationale);
  if (p.nestedDocument.sfxItems.length) out.sfx = p.nestedDocument.sfxItems.map(sfxToShowcase);
  if (p.subject) {
    const raw = p.subject.rawBoundingBox;
    const untouched = raw && JSON.stringify(parseBoundingBox(raw)) === JSON.stringify(p.subject.box);
    out.samLayer = {
      enabled: p.subject.enabled,
      subjectName: p.subject.subjectName,
      confidenceScore: p.subject.confidenceScore,
      boundingBox: untouched ? raw! : formatBoundingBox(p.subject.box),
      breakoutPixels: p.subject.breakoutPixels,
    };
  }
  put(out, 'motion', p.video?.loop);
  put(out, 'imageUrl', p.renderedImageUrl);
  put(out, 'imageFallback', p.imageFallback);
  put(out, 'timecodeSeconds', p.video?.timecodeSeconds);
  put(out, 'anchorTimecodeSeconds', p.video?.anchorTimecodeSeconds);
  put(out, 'endTimecodeSeconds', p.video?.endTimecodeSeconds);
  put(out, 'muxPlaybackId', p.video?.muxPlaybackId);
  put(out, 'sourceVideoUrl', p.video?.sourceVideoUrl);
  return out;
}

export function pageToShowcase(page: ComicPageDocument, index: number): ComicPage {
  const m = page.meta ?? {};
  const out: ComicPage = {
    pageNumber: m.pageNumber ?? index + 1,
    title: page.title,
    act: m.act ?? '',
    sequenceBeat: m.sequenceBeat ?? '',
    layoutGrammar: m.layoutGrammar ?? '',
    panels: page.panels.map(panelToShowcase),
  };
  put(out, 'slugline', m.slugline);
  put(out, 'actNumber', m.actNumber);
  put(out, 'timeRangeLabel', m.timeRangeLabel);
  put(out, 'summary', m.summary);
  put(out, 'activeLensName', m.activeLensName);
  put(out, 'activeLensDesc', m.activeLensDesc);
  return out;
}

/** Exports a project in showcase format (for Lorea, the Council V4 reader, or a new showcase file). */
export function comicProjectToShowcaseBook(project: ComicProject): ShowcaseComicBook {
  const meta: ComicProject['book'] = project.book ?? {
    id: project.id,
    templateId: 'tela-comic-project',
    title: project.title,
    subtitle: '',
    genre: 'modern-cinematic',
    councilLenses: { leadArtist: '', leadWriter: '', storyIntelligence: '' },
    targetAudience: 'all-ages',
    pageCount: project.pages.length,
    logline: '',
    blurb: '',
    theme: '',
    visualGrammar: {
      gutterWidth: '12px',
      gutterColor: '#000000',
      pageTexture: 'matte',
      primaryPalette: [],
      typography: { bodyFont: 'system-ui, sans-serif', captionFont: 'Courier New, monospace', sfxFont: 'Impact, sans-serif' },
      inkingStyle: '',
    },
    characters: [],
    remixIdeas: [],
    councilDirectorNotes: '',
  };
  return {
    ...meta,
    title: project.title,
    pageCount: project.pages.length,
    pages: project.pages.map(pageToShowcase),
  };
}

function round(n: number, dp = 3) {
  const m = 10 ** dp;
  return Math.round(n * m) / m;
}
