import type { TelaVectorObject } from '../types';
import { traceBitmapToTela } from './telaImageTrace';

export const TELA_DOCUMENT_MODEL = {
  id: 'onnx-community/Florence-2-base-ft',
  label: 'Tela Document Intelligence',
  version: 'florence-2-base-ft/q4-mixed-v1',
  approximateBytes: 300 * 1024 * 1024,
  license: 'MIT',
} as const;

export const TELA_SEGMENT_MODEL = {
  id: 'Xenova/slimsam-77-uniform', label: 'Tela Precision Segmentation',
  version: 'slimsam-77-uniform/q8-v1', approximateBytes: 14 * 1024 * 1024, license: 'Apache-2.0',
} as const;

export interface TelaModelProgress {
  phase: 'CHECKING' | 'DOWNLOADING' | 'LOADING' | 'FLATTENING' | 'OCR' | 'ANALYZING' | 'REGIONS' | 'SEGMENTING' | 'VECTORIZING' | 'FONT_MATCHING' | 'REBUILDING' | 'REASONING' | 'CLASSIFYING' | 'READY';
  message: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

type ProgressFn = (progress: TelaModelProgress) => void;
let runtimePromise: Promise<any> | null = null;
let segmentRuntimePromise: Promise<any> | null = null;

async function usableWebGpu() {
  try {
    const gpu = (navigator as any)?.gpu;
    return !!gpu && !!(await gpu.requestAdapter({ powerPreference: 'high-performance' }));
  } catch { return false; }
}

async function ensureModelStorage(bytes: number) {
  try {
    await navigator.storage?.persist?.();
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.quota && estimate?.usage !== undefined && estimate.quota - estimate.usage < bytes * 1.15) {
      const freeMb = Math.max(0, Math.floor((estimate.quota - estimate.usage) / 1048576));
      throw new Error(`This device has about ${freeMb} MB available for website data. Tela Document Intelligence needs approximately ${Math.ceil(bytes / 1048576)} MB. Free device storage or clear unused browser site data, then try again.`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Tela Document Intelligence needs')) throw error;
  }
}

function readableModelError(error: unknown, backend: string) {
  const raw = error instanceof Error ? error.message : String(error || 'Unknown model error');
  if (/quota|storage|space|disk/i.test(raw)) return raw;
  if (/fetch|network|failed to load|404|403/i.test(raw)) return `The local model download was interrupted (${raw}). Check the connection and try again; completed model files remain cached.`;
  if (/webgpu|adapter|shader|buffer|device lost/i.test(raw)) return `WebGPU could not initialize this model (${raw}). Tela will retry using its CPU/WASM fallback.`;
  return `Tela Document Intelligence could not start on ${backend}: ${raw}`;
}

export function isTelaDocumentModelInstalled() {
  return localStorage.getItem(`tela:model:${TELA_DOCUMENT_MODEL.version}`) === 'ready';
}

function reportDownload(onProgress?: ProgressFn) {
  return (event: any) => {
    if (!event) return;
    const progress = Number.isFinite(event.progress) ? event.progress / (event.progress > 1 ? 100 : 1) : undefined;
    onProgress?.({ phase: 'DOWNLOADING', message: event.file ? `Downloading ${String(event.file).split('/').at(-1)}…` : 'Downloading document intelligence…', progress, loaded: event.loaded, total: event.total });
  };
}

async function loadRuntime(onProgress?: ProgressFn) {
  if (runtimePromise) return runtimePromise;
  runtimePromise = (async () => {
    onProgress?.({ phase: 'CHECKING', message: 'Checking the local model cache…' });
    await ensureModelStorage(TELA_DOCUMENT_MODEL.approximateBytes);
    const { Florence2ForConditionalGeneration, AutoProcessor, AutoTokenizer } = await import('@huggingface/transformers');
    const modelId = TELA_DOCUMENT_MODEL.id;
    const hasWebGpu = await usableWebGpu();
    const common = { progress_callback: reportDownload(onProgress) };
    const dtype = { embed_tokens: 'q8', vision_encoder: 'q8', encoder_model: 'q4', decoder_model_merged: 'q4' };
    const [processor, tokenizer] = await Promise.all([AutoProcessor.from_pretrained(modelId, common), AutoTokenizer.from_pretrained(modelId, common)]);
    let model: any;
    if (hasWebGpu) {
      onProgress?.({ phase: 'LOADING', message: 'Loading the model on WebGPU…' });
      try { model = await Florence2ForConditionalGeneration.from_pretrained(modelId, { ...common, device: 'webgpu', dtype } as any); }
      catch (error) {
        console.warn('[Tela intelligence] WebGPU initialization failed; retrying with WASM.', error);
        onProgress?.({ phase: 'LOADING', message: 'WebGPU was unavailable; retrying on CPU/WASM…' });
      }
    }
    if (!model) {
      try { model = await Florence2ForConditionalGeneration.from_pretrained(modelId, { ...common, device: 'wasm', dtype } as any); }
      catch (error) { throw new Error(readableModelError(error, 'CPU/WASM')); }
    }
    localStorage.setItem(`tela:model:${TELA_DOCUMENT_MODEL.version}`, 'ready');
    onProgress?.({ phase: 'READY', message: 'Document intelligence is ready on this device.', progress: 1 });
    return { model, processor, tokenizer };
  })().catch(error => { runtimePromise = null; throw error; });
  return runtimePromise;
}

async function runTask(runtime: any, image: any, task: string, maxNewTokens = 1024) {
  const prompts = runtime.processor.construct_prompts(task);
  const textInputs = runtime.tokenizer(prompts);
  const visionInputs = await runtime.processor(image);
  const generated = await runtime.model.generate({ ...textInputs, ...visionInputs, max_new_tokens: maxNewTokens, num_beams: 1, do_sample: false });
  const decoded = runtime.tokenizer.batch_decode(generated, { skip_special_tokens: false })[0];
  return runtime.processor.post_process_generation(decoded, task, image.size)[task];
}

function quadBounds(quad: number[]) {
  const xs = quad.filter((_, i) => i % 2 === 0), ys = quad.filter((_, i) => i % 2 === 1);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(2, Math.max(...xs) - x), h: Math.max(2, Math.max(...ys) - y) };
}

const ART_REGION = /\b(photo|photograph|picture|image|illustration|diagram|drawing|artwork|map|chart|graph|figure|icon|logo|shape|cartoon|timeline)\b/i;
const TEXT_REGION = /\b(text|word|sentence|paragraph|title|heading|label|question|instruction)\b/i;
const FIELD_REGION = /\b(answer|response|input|field|blank|fill(?:able)?|write|textbox|text box|checkbox|check box|choice|signature)\b/i;
const NON_ART_REGION = /\b(page|paper|worksheet|document|background|margin|border|header|footer)\b/i;

export interface TelaDetectedResponseField {
  id: string;
  label: string;
  type: 'TEXT' | 'NUMBER' | 'SELECT' | 'CHECKBOX';
  x: number; y: number; w: number; h: number;
  confidence: number;
}

function overlapsField(a: TelaDetectedResponseField, b: TelaDetectedResponseField) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return ix * iy > Math.min(a.w * a.h, b.w * b.h) * .45;
}

interface DetectedVisualRegion { id: string; label: string; x: number; y: number; w: number; h: number; confidence: number; detectionSource: 'OBJECT' | 'DENSE_REGION'; }

interface PositionedText { x: number; y: number; w: number; h: number; text?: string; }

export interface TelaArtworkRegionReport {
  id: string;
  label: string;
  status: 'TRACED_MASK' | 'TRACED_BOX' | 'FALLBACK_IMAGE';
  pathCount: number;
  editablePathCount: number;
  confidence: number;
}

function regionOverlap(a: DetectedVisualRegion, b: DetectedVisualRegion) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return ix * iy / Math.max(1, Math.min(a.w * a.h, b.w * b.h));
}

function textCoverage(region: Pick<DetectedVisualRegion, 'x' | 'y' | 'w' | 'h'>, text: PositionedText[]) {
  const covered = text.reduce((sum, entry) => {
    const ix = Math.max(0, Math.min(region.x + region.w, entry.x + entry.w) - Math.max(region.x, entry.x));
    const iy = Math.max(0, Math.min(region.y + region.h, entry.y + entry.h) - Math.max(region.y, entry.y));
    return sum + ix * iy;
  }, 0);
  return Math.min(1, covered / Math.max(1, region.w * region.h));
}

/**
 * Convert what Florence sees into drawing actions. Object detection labels are semantic nouns
 * ("backpack", "apple", "microscope"), not the word "illustration"; they must still invoke the
 * pen tracer. Dense captions use OCR overlap to reject text blocks instead of a narrow art lexicon.
 */
export function selectTelaArtworkRegions(
  sources: Array<{ bboxes?: number[][]; labels?: string[]; source: 'OBJECT' | 'DENSE_REGION' }>,
  ocrEntries: PositionedText[],
  pageWidth: number,
  pageHeight: number,
) {
  const selected: DetectedVisualRegion[] = [];
  const pageArea = Math.max(1, pageWidth * pageHeight);
  sources.forEach(source => (source.bboxes || []).forEach((box, index) => {
    const label = String(source.labels?.[index] || '').trim();
    if (!label || box.length < 4) return;
    const x1 = Math.max(0, Math.min(pageWidth, box[0])), y1 = Math.max(0, Math.min(pageHeight, box[1]));
    const x2 = Math.max(x1, Math.min(pageWidth, box[2])), y2 = Math.max(y1, Math.min(pageHeight, box[3]));
    const candidate: DetectedVisualRegion = {
      id: `ai_region_${Date.now()}_${source.source}_${index}`,
      label, x: x1, y: y1, w: Math.max(3, x2 - x1), h: Math.max(3, y2 - y1),
      confidence: source.source === 'OBJECT' ? .84 : .76, detectionSource: source.source,
    };
    const area = candidate.w * candidate.h;
    if (area < pageArea * .00065 || area > pageArea * .82 || NON_ART_REGION.test(label)) return;
    const explicitlyVisual = ART_REGION.test(label);
    const semanticObject = source.source === 'OBJECT' && !TEXT_REGION.test(label) && !FIELD_REGION.test(label);
    const captionedVisual = !TEXT_REGION.test(label) && !FIELD_REGION.test(label) && textCoverage(candidate, ocrEntries) < .18;
    if (!explicitlyVisual && !semanticObject && !captionedVisual) return;
    const duplicate = selected.find(existing => regionOverlap(existing, candidate) > .68);
    if (duplicate) {
      if (candidate.detectionSource === 'OBJECT') {
        duplicate.label = candidate.label; duplicate.confidence = Math.max(duplicate.confidence, candidate.confidence); duplicate.detectionSource = 'OBJECT';
      }
      return;
    }
    selected.push(candidate);
  }));
  return selected;
}

function matchFont(text: string, width: number, size: number, heading: boolean) {
  const candidates = [
    { family: 'Arial', stack: 'Arial, Helvetica, sans-serif', source: 'SYSTEM' as const },
    { family: 'Inter', stack: 'Inter, Arial, sans-serif', source: 'OPEN_FONT' as const },
    { family: 'Noto Sans', stack: '"Noto Sans", Arial, sans-serif', source: 'OPEN_FONT' as const },
    { family: 'Liberation Sans', stack: '"Liberation Sans", Arial, sans-serif', source: 'OPEN_FONT' as const },
    { family: 'Source Serif 4', stack: '"Source Serif 4", Georgia, serif', source: 'OPEN_FONT' as const },
    { family: 'Georgia', stack: 'Georgia, "Times New Roman", serif', source: 'SYSTEM' as const },
    { family: 'Courier New', stack: '"Courier New", monospace', source: 'SYSTEM' as const },
  ];
  try {
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas font metrics');
    const scored = candidates.map(candidate => {
      ctx.font = `${heading ? 700 : 400} ${size}px ${candidate.stack}`;
      const measured = ctx.measureText(text).width;
      const available = typeof document !== 'undefined' && document.fonts ? document.fonts.check(`${size}px "${candidate.family}"`) : true;
      const difference = Math.abs(measured - width) / Math.max(1, width);
      return { ...candidate, difference: difference + (available ? 0 : .16) };
    }).sort((a, b) => a.difference - b.difference);
    const best = scored[0];
    return { size, family: best.stack, match: { family: best.family, source: best.source, confidence: Math.max(.25, Math.min(.94, 1 - best.difference)), fallbackFamilies: ['Noto Sans', 'Liberation Sans', 'Arial'] } };
  } catch {
    return { size, family: 'Arial, Helvetica, sans-serif', match: { family: 'Arial', source: 'SYSTEM' as const, confidence: .35, fallbackFamilies: ['Noto Sans', 'Liberation Sans'] } };
  }
}

function classifyTextObjects(objects: TelaVectorObject[], pageHeight: number) {
  const text = objects.filter(object => object.kind === 'TEXT');
  const largest = Math.max(0, ...text.map(object => object.fontSize || 0));
  text.forEach(object => {
    const value = object.text || '';
    if (/\b(?:directions?|instructions?|read each|complete the|show your work|circle|choose)\b/i.test(value)) {
      object.semanticRole = 'INSTRUCTION'; object.objectLabel = `Instruction · ${value.slice(0, 72)}`;
    } else if (/(?:\?|_{3,}|^\s*\d+[.)]|\b(?:what|why|how|which|solve|calculate|explain|describe)\b)/i.test(value)) {
      object.semanticRole = 'QUESTION'; object.objectLabel = `Question · ${value.slice(0, 72)}`;
    } else {
      object.semanticRole = 'PRINTED_CONTENT';
      object.objectLabel = (object.fontSize || 0) >= largest * .82 && object.y < pageHeight * .22 ? `Heading · ${value.slice(0, 72)}` : `Text · ${value.slice(0, 72)}`;
    }
  });
}

export interface TelaRebuildOptions {
  /**
   * 'auto' uses the Florence naming pack only when it is already installed; 'require'
   * downloads/loads it; 'skip' stays fully local. Reconstruction itself is deterministic
   * and never blocks on the 300 MB pack — Florence names artwork, it does not gate it.
   */
  semanticNaming?: 'auto' | 'require' | 'skip';
  /** Set false to skip the OCR-confidence orientation probe (still deskews). Default true. */
  orient?: boolean;
}

export async function rebuildDocumentIntelligently(src: string, onProgress?: ProgressFn, options: TelaRebuildOptions = {}) {
  const naming = options.semanticNaming ?? 'auto';
  const stamp = Date.now();

  // 1 · Paper flattening — every later pass (OCR, ink separation, traces, fallbacks) reads
  // the flatbed-quality derivative, which is what stops reconstructions looking photographic.
  onProgress?.({ phase: 'FLATTENING', message: 'Flattening paper, lighting and camera shadows…' });
  const { flattenWorksheet, cropToPaper, warpToPage, rotateWorksheet, paperKnockoutCrop, traceWorksheetRegion } = await import('./worksheetReprint');
  const { separateRulesAndRegions, eraseBoxesFromInk, normalizeTypography, sampleTextColor, classifyRegionArt, estimateDeskewAngle } = await import('./worksheetReprintCore');
  let flat = await flattenWorksheet(src);

  // 1a · Paper isolation + perspective. Real photos frame the page against a desk/keyboard/hand and
  // are often shot at an angle. First try a homography un-warp of the paper quadrilateral (corrects
  // keystone AND removes background); if no confident, meaningfully-skewed quad is found, fall back
  // to the axis-aligned crop-and-white-out. Either way the page ends up flat, square, and isolated.
  try {
    const warped = warpToPage(flat);
    if (warped) { flat = warped; onProgress?.({ phase: 'FLATTENING', message: 'Corrected page perspective.' }); }
    else flat = cropToPaper(flat);
  } catch (error) { console.warn('[Tela intelligence] paper isolation skipped.', error); }

  // 1b · Orientation + deskew — phone photos are routinely held sideways and tilted. Coarse
  // 90° orientation is decided by OCR-confidence voting (skippable via opts); fine skew is a
  // geometry-only projection-profile estimate. Both rotate the FLATTENED canvas, so paper stays
  // white and ink stays crisp, and every later pass reads an upright, square page.
  if (options.orient !== false) {
    try {
      const { detectPageOrientation } = await import('./worksheetLocalVision');
      onProgress?.({ phase: 'FLATTENING', message: 'Checking page orientation…' });
      const orient = await detectPageOrientation(flat.dataUrl, message => onProgress?.({ phase: 'FLATTENING', message }));
      if (orient.degrees) { flat = rotateWorksheet(flat, orient.degrees); onProgress?.({ phase: 'FLATTENING', message: `Rotated ${orient.degrees}° to upright.` }); }
    } catch (error) { console.warn('[Tela intelligence] orientation detection skipped.', error); }
  }
  const skew = estimateDeskewAngle(flat.ink, flat.width, flat.height);
  if (skew) { onProgress?.({ phase: 'FLATTENING', message: `Deskewing ${skew}°…` }); flat = rotateWorksheet(flat, -skew); }

  const pageW = flat.width, pageH = flat.height;

  // 2 · Optional semantic runtime.
  let runtime: any = null;
  if (naming === 'require' || (naming === 'auto' && isTelaDocumentModelInstalled())) {
    try { runtime = await loadRuntime(onProgress); }
    catch (error) {
      if (naming === 'require') throw error;
      console.warn('[Tela intelligence] semantic naming pack unavailable; continuing fully local.', error);
    }
  }

  // 3 · OCR on the flattened page. Florence when present, private Tesseract lane otherwise.
  onProgress?.({ phase: 'OCR', message: 'Reading text and preserving its position…' });
  let ocrEntries: Array<{ x: number; y: number; w: number; h: number; text: string }> = [];
  let eraseBoxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  let wordEntries: Array<{ x: number; y: number; w: number; h: number; text: string }> = [];
  let florenceImage: any = null;
  if (runtime) {
    try {
      const { RawImage } = await import('@huggingface/transformers');
      florenceImage = await RawImage.fromURL(flat.dataUrl);
      const ocr = await runTask(runtime, florenceImage, '<OCR_WITH_REGION>', 1536);
      const quads: number[][] = ocr?.quad_boxes || [];
      const labels: string[] = ocr?.labels || [];
      ocrEntries = quads.map((quad, index) => ({ ...quadBounds(quad), text: String(labels[index] || '').replace(/<\/?s>/g, '').trim() })).filter(entry => entry.text);
      eraseBoxes = ocrEntries;
      wordEntries = ocrEntries;
    } catch (error) { console.warn('[Tela intelligence] Florence OCR failed; the on-device OCR lane continues.', error); }
  }
  if (!ocrEntries.length) {
    const { recognizeWorksheetLines } = await import('./worksheetLocalVision');
    const local = await recognizeWorksheetLines(flat.dataUrl, message => onProgress?.({ phase: 'OCR', message }));
    const sx = pageW / Math.max(1, local.width), sy = pageH / Math.max(1, local.height);
    // Tesseract merges visually distant runs into one line ("Name: ____   Date: ____").
    // Split lines at large word gaps so each printed run keeps its true position.
    // Confident, body-height printed text only: handwriting OCRs at low confidence (< ~.55) and
    // stylized bubble-letter titles are very tall — both are kept OUT of the text layer. Titles are
    // left in the ink to be TRACED as artwork; handwriting is erased below so it becomes nothing.
    const tallCut = pageH * .045;
    const segmented: typeof local.lines = [];
    for (const line of local.lines.filter(entry => entry.confidence >= .55 && entry.h * sy <= tallCut)) {
      const inLine = local.words
        .filter(word => word.y + word.h / 2 >= line.y && word.y + word.h / 2 <= line.y + line.h && word.x >= line.x - 4 && word.x + word.w <= line.x + line.w + 4)
        .sort((a, b) => a.x - b.x);
      const runs: typeof inLine[] = inLine.length ? [[inLine[0]]] : [];
      for (let i = 1; i < inLine.length; i++) {
        if (inLine[i].x - (inLine[i - 1].x + inLine[i - 1].w) > Math.max(line.h * 2, local.width * .05)) runs.push([]);
        runs[runs.length - 1].push(inLine[i]);
      }
      if (runs.length < 2) { segmented.push(line); continue; }
      for (const run of runs) {
        const x0 = Math.min(...run.map(word => word.x)), y0 = Math.min(...run.map(word => word.y));
        const x1 = Math.max(...run.map(word => word.x + word.w)), y1 = Math.max(...run.map(word => word.y + word.h));
        segmented.push({ text: run.map(word => word.text).join(' '), confidence: line.confidence, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      }
    }
    ocrEntries = segmented.map(line => ({ x: line.x * sx, y: line.y * sy, w: line.w * sx, h: line.h * sy, text: line.text }));
    // Word boxes for ink subtraction: line boxes would also erase the printed blank
    // between two prompts on the same line ("Name: ____   Date: ____").
    wordEntries = local.words.filter(word => word.confidence >= .55 && word.h * sy <= tallCut).map(word => ({ x: word.x * sx, y: word.y * sy, w: word.w * sx, h: word.h * sy, text: word.text }));
    // Erase every body-height word (printed AND handwriting) from the ink so leftover ink is only
    // artwork; tall title words are intentionally NOT erased so they survive to be traced.
    eraseBoxes = local.words.filter(word => word.confidence >= .25 && word.h * sy <= tallCut).map(word => ({ x: word.x * sx, y: word.y * sy, w: word.w * sx, h: word.h * sy, text: word.text }));
  }
  if (!wordEntries.length) wordEntries = ocrEntries;

  // 4 · Ink separation: printed rules out, recognized text out — whatever ink remains IS
  // artwork. No detector can silently drop a drawing any more.
  onProgress?.({ phase: 'ANALYZING', message: 'Separating page rules, text ink and artwork ink…' });
  eraseBoxesFromInk(flat.ink, pageW, pageH, eraseBoxes.length ? eraseBoxes : ocrEntries, Math.max(2, Math.round(pageH * .002)));
  const { rules, frames, regions: inkRegions } = separateRulesAndRegions(flat.ink, pageW, pageH, flat.imageData.data);

  // 5 · Optional naming pass. Florence labels the ink regions; existence is already decided.
  let namedCandidates: DetectedVisualRegion[] = [];
  if (runtime && florenceImage) {
    onProgress?.({ phase: 'REGIONS', message: 'Naming recognized artwork ("book bag", "apple")…' });
    try {
      const dense = await runTask(runtime, florenceImage, '<DENSE_REGION_CAPTION>', 1024);
      let detected: any = null;
      try { detected = await runTask(runtime, florenceImage, '<OD>', 768); } catch { /* dense captions remain */ }
      namedCandidates = selectTelaArtworkRegions([
        { bboxes: detected?.bboxes, labels: detected?.labels, source: 'OBJECT' },
        { bboxes: dense?.bboxes, labels: dense?.labels, source: 'DENSE_REGION' },
      ], ocrEntries, pageW, pageH);
    } catch (error) { console.warn('[Tela intelligence] semantic naming skipped.', error); }
  }
  const labelForRegion = (region: { x: number; y: number; w: number; h: number }, index: number) => {
    let best: { label: string; score: number } | null = null;
    for (const candidate of namedCandidates) {
      const ix = Math.max(0, Math.min(region.x + region.w, candidate.x + candidate.w) - Math.max(region.x, candidate.x));
      const iy = Math.max(0, Math.min(region.y + region.h, candidate.y + candidate.h) - Math.max(region.y, candidate.y));
      const score = ix * iy / Math.max(1, Math.min(region.w * region.h, candidate.w * candidate.h));
      if (score > .3 && (!best || score > best.score)) best = { label: candidate.label, score };
    }
    return best?.label || `artwork ${index + 1}`;
  };

  const layoutObjects: TelaVectorObject[] = [];
  const artworkObjects: TelaVectorObject[] = [];
  const textObjects: TelaVectorObject[] = [];
  const interactionObjects: TelaVectorObject[] = [];
  const artworkRegions: TelaArtworkRegionReport[] = [];

  // 6 · Layout: rules keep their measured thickness and sampled ink color.
  rules.forEach((rule, index) => {
    const sampleBox = rule.axis === 'H'
      ? { x: rule.x1, y: Math.max(0, rule.y1 - rule.thickness), w: rule.x2 - rule.x1, h: rule.thickness * 2 + 1 }
      : { x: Math.max(0, rule.x1 - rule.thickness), y: rule.y1, w: rule.thickness * 2 + 1, h: rule.y2 - rule.y1 };
    layoutObjects.push({
      id: `ai_rule_${stamp}_${index}`, kind: 'LINE', x: rule.x1, y: rule.y1,
      w: Math.max(1, Math.abs(rule.x2 - rule.x1)), h: Math.max(1, Math.abs(rule.y2 - rule.y1)),
      points: [rule.x1, rule.y1, rule.x2, rule.y2], fill: 'none',
      stroke: sampleTextColor(flat.imageData.data, pageW, pageH, sampleBox),
      strokeWidth: Math.max(1, Math.round(rule.thickness * .9)), rotation: 0, opacity: 1,
      semanticRole: 'PRINTED_CONTENT', reconstructionLayer: 'LAYOUT',
      objectLabel: rule.axis === 'H' ? 'Layout · worksheet rule' : 'Layout · worksheet divider',
    });
  });

  // 6b · Form boxes: printed answer-box outlines become selectable rounded layout rectangles
  // instead of a page-swallowing artwork blob. This is what real classroom worksheets are made of.
  frames.forEach((frame, index) => {
    const stroke = sampleTextColor(flat.imageData.data, pageW, pageH, { x: frame.x, y: frame.y, w: frame.w, h: Math.max(2, Math.round(frame.h * .05)) });
    layoutObjects.push({
      id: `ai_frame_${stamp}_${index}`, kind: 'RECT', x: frame.x, y: frame.y, w: frame.w, h: frame.h,
      fill: 'none', stroke, strokeWidth: 2, rotation: 0, opacity: 1,
      semanticRole: 'PRINTED_CONTENT', reconstructionLayer: 'LAYOUT', objectLabel: 'Layout · answer box',
    });
  });

  // 7 · Artwork: every ink region causes a real drawing action; failures degrade to a clean
  // paper-knocked-out cutout of the FLATTENED page — never a grey photograph rectangle.
  for (let index = 0; index < inkRegions.length; index++) {
    const region = inkRegions[index];
    // Shadow/JPEG residue that survived flattening is unsaturated and light-to-mid grey — it is
    // not artwork. Real line art is near-black; real colour art is saturated. So drop any
    // unsaturated region whose dominant ink is light (>195), and additionally drop LARGE mid-grey
    // regions (>145) — those are the shadow triangles an underexposed photo leaves behind.
    const profile = classifyRegionArt(flat.imageData.data, pageW, pageH, region, flat.ink);
    const profileLum = [1, 3, 5].reduce((sum, i, c) => sum + parseInt(profile.inkColor.slice(i, i + 2), 16) * [.2126, .7152, .0722][c], 0);
    const regionAreaFrac = (region.w * region.h) / (pageW * pageH);
    if (profile.saturatedFraction < .12 && (profileLum > 195 || (profileLum > 145 && regionAreaFrac > .02))) continue;
    const label = labelForRegion(region, index);
    onProgress?.({ phase: 'VECTORIZING', message: `Tracing ${label} into editable spline shapes (${index + 1}/${inkRegions.length})…`, progress: inkRegions.length ? index / inkRegions.length : 0 });
    try {
      const traced = await traceWorksheetRegion(flat, region);
      if (!traced.objects.length) throw new Error(`No drawable contours for ${label}.`);
      const scaleX = traced.crop.w / Math.max(1, traced.traceWidth);
      const scaleY = traced.crop.h / Math.max(1, traced.traceHeight);
      const confidence = traced.status === 'TRACED_MASK' ? .92 : .8;
      const mapped = traced.objects.map((object, part) => ({
        ...object,
        id: `${region.id}_path_${part}`,
        x: traced.crop.x + object.x * scaleX, y: traced.crop.y + object.y * scaleY,
        w: object.w * scaleX, h: object.h * scaleY,
        semanticRole: 'ARTWORK' as const, reconstructionLayer: 'ARTWORK' as const,
        detectedLabel: label, detectionConfidence: confidence, parentRegionId: region.id,
        objectLabel: `Artwork · ${label} · vector ${part + 1}`,
      }));
      artworkObjects.push(...mapped);
      artworkRegions.push({ id: region.id, label, status: traced.status, pathCount: mapped.length, editablePathCount: mapped.filter(path => !!path.pathNodes?.length).length, confidence });
    } catch (error) {
      console.warn(`[Tela intelligence] ${label} could not be vectorized; retaining a clean cutout for review.`, error);
      const cut = paperKnockoutCrop(flat, region);
      artworkObjects.push({
        id: `${region.id}_fallback`, kind: 'IMAGE', x: cut.x, y: cut.y, w: cut.width, h: cut.height,
        fill: 'none', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1,
        sourceImageSrc: cut.dataUrl,
        sourceCrop: { x: 0, y: 0, width: cut.width, height: cut.height, sourceWidth: cut.width, sourceHeight: cut.height },
        objectLabel: `Needs vector review · ${label}`, semanticRole: 'ARTWORK', reconstructionLayer: 'ARTWORK', detectedLabel: label, detectionConfidence: .6, parentRegionId: region.id,
      });
      artworkRegions.push({ id: region.id, label, status: 'FALLBACK_IMAGE', pathCount: 0, editablePathCount: 0, confidence: .6 });
    }
  }

  // 8 · Typography: cluster sizes, snap columns, keep genuinely colored headings.
  onProgress?.({ phase: 'FONT_MATCHING', message: 'Harmonizing type sizes and columns, matching fonts…' });
  const typography = normalizeTypography(ocrEntries, pageW, pageH);
  typography.forEach((entry, index) => {
    const font = matchFont(entry.text, entry.w, entry.fontSize, entry.fontWeight >= 700);
    const sampled = sampleTextColor(flat.imageData.data, pageW, pageH, entry);
    const rgb = [parseInt(sampled.slice(1, 3), 16), parseInt(sampled.slice(3, 5), 16), parseInt(sampled.slice(5, 7), 16)];
    const fill = Math.max(...rgb) - Math.min(...rgb) > 42 ? sampled : '#17131d';
    textObjects.push({
      id: `ai_text_${stamp}_${index}`, kind: 'TEXT', x: entry.snapX, y: entry.y, w: entry.w, h: entry.h,
      text: entry.text, fill, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1,
      fontSize: entry.fontSize, fontFamily: font.family, fontWeight: entry.fontWeight, fontMatch: font.match,
      semanticRole: 'PRINTED_CONTENT', reconstructionLayer: 'TEXT', detectedLabel: entry.role === 'BODY' ? 'recognized text' : entry.role.toLowerCase(), detectionConfidence: .88,
      objectLabel: `Text · ${entry.text.slice(0, 72)}`,
    });
  });
  onProgress?.({ phase: 'CLASSIFYING', message: 'Classifying instructions, questions and response fields…' });
  classifyTextObjects(textObjects, pageH);

  // 9 · Response fields — every answer region becomes a TYPED, positioned form field: answer-box
  // frames, printed blanks in OCR text, and answer rules with a prompt. This is what turns a
  // faithful reconstruction into a real gradeable assignment (the marquee payoff).
  const inferFieldType = (t: string): TelaDetectedResponseField['type'] =>
    /(check|tick|checkbox)/i.test(t) ? 'CHECKBOX'
    : /(circle|choose|select|true or false|yes or no|multiple choice|pick one)/i.test(t) ? 'SELECT'
    : (/(how many|number|how old|years old|age|count|total|amount)/i.test(t) || /\d\s*[-+×÷=]/.test(t)) ? 'NUMBER'
    : 'TEXT';
  const fields: TelaDetectedResponseField[] = [];

  // 9a · Box fields: each printed answer box becomes one typed field in its writing area — UNLESS
  // it is an instruction box (text fills it), a freeform drawing box, or a multi-line box (its
  // internal rules make several fields instead). This is why dense box-grid worksheets now become
  // real forms instead of empty rectangles.
  frames.forEach((frame, fi) => {
    const inside = textObjects.filter(t => {
      const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
      return cx >= frame.x && cx <= frame.x + frame.w && cy >= frame.y && cy <= frame.y + frame.h;
    }).sort((a, b) => a.y - b.y);
    const labelText = inside.map(t => t.text).join(' ').trim();
    const coverage = inside.reduce((sum, t) => sum + t.w * t.h, 0) / Math.max(1, frame.w * frame.h);
    const rulesInBox = rules.filter(r => r.axis === 'H' && r.x1 >= frame.x - 6 && r.x2 <= frame.x + frame.w + 6 && r.y1 >= frame.y && r.y1 <= frame.y + frame.h);
    const isDraw = /(draw|picture|portrait|sketch|self ?portrait|illustrate)/i.test(labelText);
    const isInstruction = coverage > .42 || /(walk around|directions?|instructions?|interview a partner|find a different|listen carefully)/i.test(labelText);
    if (isDraw || isInstruction || rulesInBox.length >= 2) return;
    const lastBottom = inside.length ? Math.max(...inside.map(t => t.y + t.h)) : frame.y + frame.h * .35;
    const fy = Math.min(frame.y + frame.h - Math.max(30, frame.h * .18), Math.max(lastBottom + 10, frame.y + frame.h * .48));
    const label = (inside[0]?.text || 'Response').replace(/[:：]\s*$/, '').trim() || `Response ${fields.length + 1}`;
    const field: TelaDetectedResponseField = { id: `field_box_${stamp}_${fi}`, label, type: inferFieldType(labelText), x: frame.x + frame.w * .07, y: fy, w: frame.w * .86, h: Math.max(30, Math.min(52, frame.h * .26)), confidence: .82 };
    if (!fields.some(existing => overlapsField(existing, field))) fields.push(field);
  });

  // 9b · Question fields: a printed question (ends in '?', or a numbered/circled prompt) gets one
  // field on the first answer rule beneath it — the model for interview / short-answer worksheets
  // that are lines, not boxes. This is why question-style sheets now become real forms too.
  textObjects.filter(t => /\?\s*$/.test(t.text) || /^\s*[\(\[]?\d+[.)\]]/.test(t.text)).forEach((q, qi) => {
    const rule = rules.filter(r => r.axis === 'H' && r.y1 > q.y + q.h * .4 && r.y1 - (q.y + q.h) < Math.max(96, q.h * 4.5) && r.x2 > q.x && r.x1 < q.x + Math.max(q.w, pageW * .55))
      .sort((a, b) => a.y1 - b.y1)[0];
    if (!rule) return;
    const label = q.text.replace(/^\s*[\(\[]?\d+[.)\]]\s*/, '').trim() || `Question ${qi + 1}`;
    const w = Math.max(140, Math.min(rule.x2 - rule.x1, pageW * .82));
    const field: TelaDetectedResponseField = { id: `field_q_${stamp}_${qi}`, label, type: inferFieldType(q.text), x: rule.x1, y: Math.max(0, rule.y1 - Math.max(28, q.h * 1.5)), w, h: Math.max(30, q.h * 1.6), confidence: .78 };
    if (!fields.some(existing => overlapsField(existing, field))) fields.push(field);
  });

  ocrEntries.filter(entry => /_{2,}|\.{4,}/.test(entry.text)).forEach((entry, index) => {
    const field: TelaDetectedResponseField = { id: `field_ocr_${stamp}_${index}`, label: entry.text.replace(/[_\.]+/g, '').trim() || `Response ${fields.length + 1}`, type: inferFieldType(entry.text), x: entry.x, y: entry.y, w: Math.max(50, entry.w), h: Math.max(24, entry.h * 1.35), confidence: .86 };
    if (!fields.some(existing => overlapsField(existing, field))) fields.push(field);
  });
  rules.filter(rule => rule.axis === 'H').forEach((rule, index) => {
    const lineW = rule.x2 - rule.x1;
    if (lineW < Math.max(45, pageW * .06) || lineW > pageW * .88) return;
    // A rule with printed text directly beneath it is a section divider, not an answer blank.
    const isDivider = ocrEntries.some(entry => entry.y > rule.y1 && entry.y - rule.y1 < Math.max(44, entry.h * 2.4) && entry.x < rule.x2 && entry.x + entry.w > rule.x1);
    if (isDivider) return;
    // A blank's prompt is either printed to its LEFT ("Name: ____" — matched at WORD level so
    // two prompts on one line stay separate) or ABOVE it (a question with its rule underneath).
    const leftPrompt = wordEntries
      .filter(entry => entry.x + entry.w <= rule.x1 + 28 && Math.abs((entry.y + entry.h) - rule.y1) < Math.max(42, entry.h * 2.2) && /[:：]\s*$|^(name|date|class|period|grade)\b/i.test(entry.text))
      .sort((a, b) => (rule.x1 - (a.x + a.w)) - (rule.x1 - (b.x + b.w)))[0];
    const abovePrompt = ocrEntries
      .filter(entry => entry.y + entry.h <= rule.y1 + 6 && rule.y1 - (entry.y + entry.h) < Math.max(64, entry.h * 3) && entry.x < rule.x2 && entry.x + entry.w > rule.x1 - 32)
      .sort((a, b) => (rule.y1 - (a.y + a.h)) - (rule.y1 - (b.y + b.h)))[0];
    const prompt = leftPrompt || abovePrompt;
    if (!prompt) return;
    const field: TelaDetectedResponseField = { id: `field_line_${stamp}_${index}`, label: prompt.text || `Response ${fields.length + 1}`, type: inferFieldType(prompt.text), x: rule.x1, y: Math.max(0, rule.y1 - Math.max(24, prompt.h * 1.35)), w: lineW, h: Math.max(26, prompt.h * 1.45), confidence: .72 };
    if (!fields.some(existing => overlapsField(existing, field))) fields.push(field);
  });
  fields.forEach((field, index) => {
    interactionObjects.push({ id: `ai_field_${stamp}_${index}`, kind: 'RECT', x: field.x, y: field.y, w: field.w, h: field.h, fill: 'rgba(0,168,188,.04)', stroke: '#00A8BC', strokeWidth: 1, rotation: 0, opacity: .85, semanticRole: 'RESPONSE_GUIDE', reconstructionLayer: 'INTERACTION', objectLabel: `Response · ${field.label}` });
  });

  // 10 · Context is last; nothing here can destroy a layer built above.
  let understandingSummary = '';
  if (runtime && florenceImage) {
    onProgress?.({ phase: 'REASONING', message: 'Reading the rebuilt page to understand its assignment intent…' });
    try {
      const reasoning = await runTask(runtime, florenceImage, '<MORE_DETAILED_CAPTION>', 512);
      understandingSummary = typeof reasoning === 'string' ? reasoning : String(reasoning?.caption || reasoning?.text || '').trim();
    } catch (error) { console.warn('[Tela intelligence] contextual reasoning was skipped.', error); }
  }

  // 11 · Preview: proper baselines, width-fitted lines, subtle response guides.
  const objects = [...layoutObjects, ...artworkObjects, ...textObjects, ...interactionObjects];
  const measure = document.createElement('canvas').getContext('2d');
  const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const content = objects.map(o => {
    if (o.kind === 'TEXT') {
      const size = o.fontSize || 12;
      const baseline = o.y + Math.min(o.h * .82, size * 1.04);
      let fit = '';
      if (measure) {
        measure.font = `${o.fontWeight || 400} ${size}px ${o.fontFamily || 'Arial'}`;
        const width = measure.measureText(o.text || '').width;
        if (width > o.w * 1.05) fit = ` textLength="${Math.round(o.w)}" lengthAdjust="spacingAndGlyphs"`;
      }
      return `<text x="${o.x}" y="${baseline}" font-family="${esc(o.fontFamily || 'Arial,Helvetica,sans-serif')}" font-size="${size}" font-weight="${o.fontWeight || 400}" fill="${o.fill}"${fit}>${esc(o.text || '')}</text>`;
    }
    if (o.kind === 'PATH' && o.svgPathData) { const ox = o.pathOriginX ?? o.x, oy = o.pathOriginY ?? o.y; const sx = o.w / Math.max(1, o.pathOriginW ?? o.w), sy = o.h / Math.max(1, o.pathOriginH ?? o.h); return `<path d="${o.svgPathData}" fill="${o.fill}" stroke="${o.stroke}" stroke-width="${o.strokeWidth}" opacity="${o.opacity}" transform="translate(${o.x} ${o.y}) scale(${sx} ${sy}) translate(${-ox} ${-oy})"/>`; }
    if (o.kind === 'IMAGE' && o.sourceCrop && o.sourceImageSrc) { const c = o.sourceCrop; return `<svg x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" viewBox="${c.x} ${c.y} ${c.width} ${c.height}" preserveAspectRatio="none"><image href="${esc(o.sourceImageSrc)}" width="${c.sourceWidth}" height="${c.sourceHeight}" preserveAspectRatio="none"/></svg>`; }
    if (o.kind === 'RECT') { const guide = o.semanticRole === 'RESPONSE_GUIDE'; return `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="${guide ? 7 : 14}" fill="${o.fill}" stroke="${o.stroke}" stroke-width="${o.strokeWidth}"${guide ? ' stroke-dasharray="6 5"' : ''} opacity="${o.opacity}"/>`; }
    if (o.kind === 'LINE' && o.points) return `<line x1="${o.points[0]}" y1="${o.points[1]}" x2="${o.points[2]}" y2="${o.points[3]}" stroke="${o.stroke}" stroke-width="${o.strokeWidth}" stroke-linecap="round"/>`;
    return '';
  }).join('');
  const previewSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}" height="${pageH}" viewBox="0 0 ${pageW} ${pageH}"><rect width="100%" height="100%" fill="white"/>${content}</svg>`;

  const textCount = textObjects.length;
  const regionCount = inkRegions.length;
  const vectorPathCount = artworkObjects.filter(object => object.kind === 'PATH').length;
  const vectorizedRegionCount = artworkRegions.filter(region => region.status !== 'FALLBACK_IMAGE').length;
  const fallbackRegionCount = artworkRegions.filter(region => region.status === 'FALLBACK_IMAGE').length;
  onProgress?.({ phase: 'READY', message: `Rebuilt ${regionCount} artwork regions (${vectorPathCount} editable pen paths), ${textCount} text objects, ${layoutObjects.length} layout rules and ${fields.length} response fields.`, progress: 1 });
  return {
    width: pageW, height: pageH, objects, fields, artworkRegions, previewSvg,
    previewUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(previewSvg)}`,
    flattenedUrl: flat.dataUrl,
    semanticNaming: runtime ? 'FLORENCE' as const : 'LOCAL' as const,
    stats: { detectedPaths: objects.length, retainedContours: vectorPathCount, compoundLayers: objects.length, removedNoise: 0, sourceWidth: pageW, sourceHeight: pageH, textCount, regionCount, vectorPathCount, vectorizedRegionCount, fallbackRegionCount, layoutCount: layoutObjects.length, fieldCount: fields.length },
    layers: { layout: layoutObjects.length, artwork: artworkObjects.length, text: textObjects.length, interaction: interactionObjects.length },
    understanding: { summary: understandingSummary, classifiedAfterRebuild: true },
    engine: runtime ? TELA_DOCUMENT_MODEL.version : 'tela-reprint/local-v1',
  };
}

async function loadSegmentRuntime(onProgress?: ProgressFn) {
  if (segmentRuntimePromise) return segmentRuntimePromise;
  segmentRuntimePromise = (async () => {
    await ensureModelStorage(TELA_SEGMENT_MODEL.approximateBytes);
    const { SamModel, AutoProcessor } = await import('@huggingface/transformers');
    const hasWebGpu = await usableWebGpu();
    const common = { progress_callback: reportDownload(onProgress) };
    const processor = await AutoProcessor.from_pretrained(TELA_SEGMENT_MODEL.id, common);
    let model: any;
    if (hasWebGpu) {
      try { model = await SamModel.from_pretrained(TELA_SEGMENT_MODEL.id, { ...common, device: 'webgpu', dtype: 'q8' } as any); }
      catch (error) { console.warn('[Tela segmentation] WebGPU failed; retrying with WASM.', error); }
    }
    if (!model) {
      try { model = await SamModel.from_pretrained(TELA_SEGMENT_MODEL.id, { ...common, device: 'wasm', dtype: 'q8' } as any); }
      catch (error) { throw new Error(readableModelError(error, 'CPU/WASM')); }
    }
    localStorage.setItem(`tela:model:${TELA_SEGMENT_MODEL.version}`, 'ready');
    return { model, processor };
  })().catch(error => { segmentRuntimePromise = null; throw error; });
  return segmentRuntimePromise;
}

function browserImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const image = new Image(); image.crossOrigin = 'anonymous'; image.onload = () => resolve(image); image.onerror = () => reject(new Error('Could not read the source image for segmentation.')); image.src = src; });
}

/** Turn a Florence semantic box into a precise transparent cutout with local SlimSAM. */
export async function refineDocumentRegionMask(
  src: string,
  crop: { x: number; y: number; width: number; height: number; sourceWidth: number; sourceHeight: number },
  onProgress?: ProgressFn,
) {
  onProgress?.({ phase: 'CHECKING', message: 'Preparing local precision segmentation…' });
  const runtime = await loadSegmentRuntime(onProgress);
  const { RawImage } = await import('@huggingface/transformers');
  const raw = await RawImage.fromURL(src);
  const point = [[[crop.x + crop.width / 2, crop.y + crop.height / 2]]];
  const boxes = [[[crop.x, crop.y, crop.x + crop.width, crop.y + crop.height]]];
  onProgress?.({ phase: 'REGIONS', message: 'Tracing the selected object boundary…' });
  const inputs = await runtime.processor(raw, { input_points: point, input_boxes: boxes });
  const outputs = await runtime.model(inputs);
  const masks = await runtime.processor.post_process_masks(outputs.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);
  const mask: any = masks[0];
  const scores: number[] = Array.from(outputs.iou_scores?.data || []);
  let best = 0; for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
  const dims: number[] = mask.dims || [];
  const height = dims.at(-2) || crop.sourceHeight, width = dims.at(-1) || crop.sourceWidth;
  const plane = width * height, offset = Math.min(best, Math.max(0, Math.floor(mask.data.length / plane) - 1)) * plane;
  const image = await browserImage(src);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas masking is unavailable.');
  ctx.drawImage(image, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height);
  const sx = width / crop.sourceWidth, sy = height / crop.sourceHeight;
  const padX = crop.width * sx * .08, padY = crop.height * sy * .08;
  const left = crop.x * sx - padX, top = crop.y * sy - padY, right = (crop.x + crop.width) * sx + padX, bottom = (crop.y + crop.height) * sy + padY;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const insidePrompt = x >= left && x <= right && y >= top && y <= bottom;
    const keep = insidePrompt && Number(mask.data[offset + y * width + x]) > 0;
    pixels.data[(y * width + x) * 4 + 3] = keep ? pixels.data[(y * width + x) * 4 + 3] : 0;
  }
  ctx.putImageData(pixels, 0, 0);
  onProgress?.({ phase: 'READY', message: 'Object edge refined locally.', progress: 1 });
  return { src: canvas.toDataURL('image/png'), confidence: scores[best] ?? 0, width, height };
}
