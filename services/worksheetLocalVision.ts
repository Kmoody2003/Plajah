// worksheetLocalVision — privacy-first worksheet OCR and layout analysis.
// Runs entirely in the browser with Tesseract.js. The trained language data is cached by the
// browser after first use; scans are never uploaded by this lane.

import { createWorker, PSM, type Worker } from 'tesseract.js';
import type { DigitalWorksheet, WorksheetField, WorksheetSegment } from './worksheetDigitizer';
import { registerFieldsToScan, classifyPlusOrDivide, findAnswerBlank, splitOrdinals, type ScanLine, type GrayImage, type PxBox } from './worksheetScanCore';

// ── One warm OCR worker ─────────────────────────────────────────────────────────
// Booting Tesseract (WASM + language data) costs seconds; every pass used to boot and tear down its
// own worker, so a single student scan paid that 2–3×. One worker is kept warm, jobs are serialised
// (parameters are per-worker state), and it is released after a quiet minute to give memory back.
let workerPromise: Promise<Worker> | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
let ocrQueue: Promise<unknown> = Promise.resolve();
let progressSink: ((progress: number) => void) | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      logger: event => { if (event.status === 'recognizing text') progressSink?.(event.progress || 0); },
    }).catch(error => { workerPromise = null; throw error; });
  }
  return workerPromise;
}

/** Run one OCR job on the shared worker. `onProgress` receives 0..1 recognition progress. */
export function withOcrWorker<T>(job: (worker: Worker) => Promise<T>, onProgress?: (progress: number) => void): Promise<T> {
  const run = async () => {
    if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = null; }
    const worker = await getWorker();
    progressSink = onProgress || null;
    try { return await job(worker); }
    finally {
      progressSink = null;
      releaseTimer = setTimeout(() => {
        const pending = workerPromise; workerPromise = null; releaseTimer = null;
        void pending?.then(w => w.terminate()).catch(() => {});
      }, 60_000);
    }
  };
  const next = ocrQueue.then(run, run);
  ocrQueue = next.catch(() => undefined);
  return next;
}

/** Start loading OCR in the background (call when a scanner opens, before the photo arrives). */
export function warmOcr(): void { void withOcrWorker(async () => undefined).catch(() => {}); }

export interface LocalWord {
  text: string;
  confidence: number;
  box: { x: number; y: number; width: number; height: number };
}

export interface LocalVisionResult {
  sheet: DigitalWorksheet;
  words: LocalWord[];
  /** Every OCR'd line with its 0–100% box — anchors for registration and assignment matching. */
  lines: ScanLine[];
  /** Plain text, top to bottom. */
  text: string;
  engine: 'tesseract-js';
}

const pctBox = (bbox: any, width: number, height: number) => ({
  x: clamp((Number(bbox?.x0) / width) * 100),
  y: clamp((Number(bbox?.y0) / height) * 100),
  width: clamp(((Number(bbox?.x1) - Number(bbox?.x0)) / width) * 100, 1),
  height: clamp(((Number(bbox?.y1) - Number(bbox?.y0)) / height) * 100, 1),
});

export interface LocalOcrLine { text: string; confidence: number; x: number; y: number; w: number; h: number; }

/** Rotate a data URL by 0/90/180/270° onto a downscaled canvas, for cheap orientation probing. */
async function rotatedProbe(dataUrl: string, degrees: number, maxEdge: number): Promise<string> {
  const image: HTMLImageElement = await new Promise((res, rej) => {
    const el = new Image(); el.onload = () => res(el); el.onerror = () => rej(new Error('probe load failed')); el.src = dataUrl;
  });
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const w = Math.max(2, Math.round(image.naturalWidth * scale)), h = Math.max(2, Math.round(image.naturalHeight * scale));
  const swap = degrees === 90 || degrees === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? h : w; canvas.height = swap ? w : h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(degrees * Math.PI / 180);
  ctx.drawImage(image, -w / 2, -h / 2, w, h);
  return canvas.toDataURL('image/jpeg', .85);
}

/**
 * Decide coarse page orientation (0/90/180/270°) by OCR-confidence voting.
 * Phone photos of worksheets are routinely held sideways; geometry can't tell upright from
 * upside-down, but real words only score well at the true orientation. One reused worker OCRs a
 * downscaled copy at each rotation; the rotation whose confident words carry the most total text
 * wins. 0° must be clearly beaten before we rotate, so an already-upright scan is never disturbed.
 */
export async function detectPageOrientation(
  imageDataUrl: string,
  onProgress?: (message: string) => void,
  degreesToTry: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270],
): Promise<{ degrees: 0 | 90 | 180 | 270; scores: Record<number, number> }> {
  onProgress?.('Checking page orientation…');
  const scores: Record<number, number> = { 0: 0, 90: 0, 180: 0, 270: 0 };
  await withOcrWorker(async worker => {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    for (const deg of degreesToTry) {
      const probe = await rotatedProbe(imageDataUrl, deg, 1100);
      const result: any = await worker.recognize(probe, {}, { text: true, blocks: true });
      let score = 0;
      for (const block of result.data?.blocks || []) for (const para of block.paragraphs || []) for (const line of para.lines || []) for (const word of line.words || []) {
        const conf = Number(word.confidence || 0);
        const text = String(word.text || '').trim();
        // Only real, confident alphabetic words count — random noise OCRs as low-confidence junk.
        if (conf >= 60 && /[A-Za-z]{2,}/.test(text)) score += conf * text.replace(/[^A-Za-z]/g, '').length;
      }
      scores[deg] = score;
      onProgress?.(`Orientation ${deg}° · score ${Math.round(score)}`);
    }
  });
  let best: 0 | 90 | 180 | 270 = 0, bestScore = scores[0];
  for (const deg of degreesToTry) if (deg && scores[deg] > bestScore) { bestScore = scores[deg]; best = deg as 90 | 180 | 270; }
  // Require a decisive win over upright to actually rotate.
  if (best !== 0 && scores[best] < scores[0] * 1.35 + 40) best = 0;
  return { degrees: best, scores };
}

/**
 * Line-level OCR with PIXEL boxes, for the reprint reconstruction lane.
 * This is the always-available OCR path: no 300 MB model pack, no upload. Florence, when
 * installed, replaces it with richer region text — but reconstruction never blocks on it.
 */
export async function recognizeWorksheetLines(
  imageDataUrl: string,
  onProgress?: (message: string) => void,
): Promise<{ lines: LocalOcrLine[]; words: LocalOcrLine[]; width: number; height: number }> {
  onProgress?.('Loading private on-device OCR…');
  return withOcrWorker(async worker => {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1', user_defined_dpi: '300' });
    // tesseract.js v5+ only emits the block/line/word tree when explicitly requested,
    // and v7 no longer reports imageWidth/imageHeight — measure the input directly.
    const result: any = await worker.recognize(imageDataUrl, {}, { text: true, blocks: true });
    const data = result.data || {};
    const dims = await new Promise<{ width: number; height: number }>(resolve => {
      const probe = new Image();
      probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
      probe.onerror = () => resolve({ width: Number(data.imageWidth || 1), height: Number(data.imageHeight || 1) });
      probe.src = imageDataUrl;
    });
    const width = Math.max(1, dims.width), height = Math.max(1, dims.height);
    const lines: LocalOcrLine[] = [];
    const words: LocalOcrLine[] = [];
    const toEntry = (node: any): LocalOcrLine | null => {
      const text = String(node.text || '').replace(/\s+/g, ' ').trim();
      const b = node.bbox || {};
      const w = Number(b.x1) - Number(b.x0), h = Number(b.y1) - Number(b.y0);
      if (!text || !(w > 1) || !(h > 1)) return null;
      return { text, confidence: Math.max(0, Math.min(1, Number(node.confidence || 0) / 100)), x: Number(b.x0), y: Number(b.y0), w, h };
    };
    for (const block of data.blocks || []) for (const paragraph of block.paragraphs || []) for (const line of paragraph.lines || []) {
      const entry = toEntry(line);
      if (!entry) continue;
      lines.push(entry);
      // Word boxes matter downstream: erasing whole LINE boxes from the ink map would also
      // erase the printed answer blank sitting between two words ("Name: ____ Date: ____").
      for (const word of line.words || []) { const wordEntry = toEntry(word); if (wordEntry) words.push(wordEntry); }
    }
    return { lines: lines.sort((a, b) => a.y - b.y || a.x - b.x), words, width, height };
  }, p => onProgress?.(`Reading text locally · ${Math.round(p * 100)}%`));
}

/** OCR and rebuild a usable teacher-editable draft without a paid API call. */
export async function digitizeWorksheetOnDevice(
  imageDataUrl: string,
  createdBy: string,
  onProgress?: (message: string) => void,
): Promise<LocalVisionResult> {
  onProgress?.('Loading private on-device OCR…');
  return withOcrWorker(async worker => {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    });
    // v5+ requires opting into the block/line/word tree; without it every downstream box
    // came from the synthetic text fallback and the fillable overlay landed nowhere real.
    const result: any = await worker.recognize(imageDataUrl, {}, { text: true, blocks: true });
    const data = result.data || {};
    // v7 reports no image dimensions; measuring the input keeps every % box honest.
    const dims = await new Promise<{ width: number; height: number }>(resolve => {
      const probe = new Image();
      probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
      probe.onerror = () => resolve({ width: Number(data.imageWidth || 1), height: Number(data.imageHeight || 1) });
      probe.src = imageDataUrl;
    });
    const width = Math.max(1, dims.width), height = Math.max(1, dims.height);
    const rawWords: any[] = [];
    for (const block of data.blocks || [])
      for (const paragraph of block.paragraphs || [])
        for (const line of paragraph.lines || [])
          for (const word of line.words || []) rawWords.push(word);
    const words: LocalWord[] = rawWords
      .filter(word => String(word.text || '').trim())
      .map(word => ({ text: String(word.text).trim(), confidence: clamp(Number(word.confidence || 0) / 100), box: pctBox(word.bbox, width, height) }));
    // Pixels: Tesseract drops underscore blanks and reads "÷" as "+", so both come back from the page.
    const gray = await loadGray(imageDataUrl, width, height).catch(() => null);
    const pxLines = collectPxLines(data.blocks || [], gray);
    const lines = pxLines.map(l => ({ text: l.text, box: pctBox(l.bbox, width, height), confidence: l.confidence }));
    if (!lines.length && String(data.text || '').trim()) {
      String(data.text).split(/\r?\n/).map((text, index, all) => ({ text: text.trim(), box: { x: 6, y: 8 + index * (84 / Math.max(1, all.length)), width: 88, height: 4 }, confidence: .45 })).filter(x => x.text).forEach(x => lines.push(x));
    }
    const split = splitOrdinals(lines.map(line => line.text));
    const isQuestion = (text: string, i: number) => !!split[i]?.ordinal || /\?|_{2,}|\b(true|false)\b/i.test(text) || (/=/.test(text) && /\d/.test(text));
    const questionLines = lines.filter((line, i) => i > 0 && isQuestion(line.text, i) && !/^\s*(name|date|class|period)\b/i.test(line.text));
    const source = questionLines.length ? questionLines : lines.filter((_, index) => index > 0).slice(0, 30);
    const fields: WorksheetField[] = source.map((line, index) => {
      const i = lines.indexOf(line);
      const px = pxLines[i];
      const field = inferField({ ...line, text: split[i]?.text || line.text }, index, split[i]?.ordinal);
      if (gray && px) {
        // The answer box is the printed blank (plus the writing space above it) when there is one,
        // stopping before the next column's question on the same row.
        const nextX = pxLines.filter(o => o !== px && o.bbox.x0 > px.bbox.x1 && Math.min(o.bbox.y1, px.bbox.y1) - Math.max(o.bbox.y0, px.bbox.y0) > (px.bbox.y1 - px.bbox.y0) * .5).reduce((m, o) => Math.min(m, o.bbox.x0 - 4), width * .97);
        const blank = findAnswerBlank(gray, px.bbox, px.words, nextX);
        if (blank) field.box = pctBox(blank, width, height);
      }
      return field;
    });
    const segments: WorksheetSegment[] = lines.map((line, index) => ({
      id: `text_${index + 1}`,
      kind: index === 0 ? 'heading' : questionLines.includes(line) ? 'question' : 'instructions',
      box: line.box, text: line.text,
      fieldIds: questionLines.includes(line) ? [`q${questionLines.indexOf(line) + 1}`] : undefined,
      confidence: line.confidence,
    }));
    const title = lines[0]?.text || 'Scanned worksheet';
    const confidence = words.length ? words.reduce((sum, word) => sum + word.confidence, 0) / words.length : .25;
    const fieldCoverage = clamp(questionLines.length / Math.max(1, lines.length), 0);
    const layoutFidelity = lines.length > 1 ? .78 : .35;
    const understandingConfidence = fields.length ? Math.min(.86, .45 + fields.length * .025) : .2;
    const score = Math.round((confidence * .45 + layoutFidelity * .2 + Math.min(1, fieldCoverage * 2) * .2 + understandingConfidence * .15) * 100);
    const sheet: DigitalWorksheet = {
      id: '', title, subject: inferSubject(lines.map(line => line.text).join(' ')),
      objective: `Practice the skills assessed in ${title}.`, standardIds: [], fields,
      createdBy, createdAt: Date.now(), status: 'draft', hasManualFields: true, segments,
      confidence, reviewIssues: [
        'On-device OCR created this draft without uploading the scan.',
        ...(confidence < .72 ? ['Low-confidence text is highlighted for teacher review.'] : []),
        'Confirm answer keys and standards before assigning.',
      ],
      intelligence: { primary: 'on-device', ocr: 'tesseract-js', segmentation: 'local-layout', cloudCalls: 0 },
      scanAssessment: { score, textConfidence: Math.round(confidence * 100), layoutFidelity: Math.round(layoutFidelity * 100), fieldCoverage: Math.round(Math.min(1, fieldCoverage * 2) * 100), understandingConfidence: Math.round(understandingConfidence * 100) },
    };
    const scanLines: ScanLine[] = lines.map(line => ({ text: line.text, box: line.box, confidence: line.confidence }));
    return { sheet, words, lines: scanLines, text: lines.map(line => line.text).join('\n'), engine: 'tesseract-js' as const };
  }, p => onProgress?.(`Reading locally · ${Math.round(p * 100)}%`));
}

/** Extract recognized marks inside the already-known answer boxes of a completed paper copy. */
export interface CompletedReadOptions {
  /** 'auto' uses the handwriting model when it is already installed; 'require' loads it; 'skip'
   *  stays on Tesseract + ink-density. The reader always degrades honestly. */
  handwriting?: 'auto' | 'require' | 'skip';
  onProgress?: (message: string) => void;
  /** A page already straightened + OCR'd (readPageOnDevice) — skips doing both again. */
  page?: PageRead;
}

export interface PageRead {
  flat: import('./worksheetReprint').FlattenedWorksheet;
  local: LocalVisionResult;
}

/**
 * Read a student's COMPLETED worksheet scan into per-field answers, confidences, and an "answered"
 * flag from ink density. The scan is flattened first (cleaner OCR); Tesseract handles any PRINT and
 * gives a baseline; and when the handwriting model is available, each answered field's writing area
 * is cropped and read by TrOCR — the lane that actually transcribes handwriting. Because handwriting
 * OCR is uncertain, ink-density still records that the work was DONE, so completion is accurate even
 * when the words can't be read, and low-confidence reads are surfaced for teacher review upstream.
 */
export async function readCompletedWorksheetOnDevice(imageDataUrl: string, sheet: DigitalWorksheet, options: CompletedReadOptions = {}) {
  const wantHandwriting = options.handwriting ?? 'auto';
  let flat: any = null;
  let cleaned = imageDataUrl;
  let density: ((box: { x: number; y: number; width: number; height: number }) => number) | null = null;
  try {
    if (options.page) flat = options.page.flat;
    else { options.onProgress?.('Straightening the page…'); flat = await normalizeWorksheetPage(imageDataUrl); }
    cleaned = flat.dataUrl;
    const { data } = flat.imageData; const W = flat.width, H = flat.height;
    density = (box) => {
      const x0 = Math.max(0, Math.floor(box.x / 100 * W)), y0 = Math.max(0, Math.floor(box.y / 100 * H));
      const x1 = Math.min(W, Math.ceil((box.x + box.width) / 100 * W)), y1 = Math.min(H, Math.ceil((box.y + box.height) / 100 * H));
      let dark = 0, total = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        const lum = data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722;
        total++; if (lum < 150) dark++;
      }
      return total ? dark / total : 0;
    };
  } catch (error) { console.warn('[worksheetLocalVision] completed-scan flatten skipped.', error); }

  const local = options.page?.local || await digitizeWorksheetOnDevice(cleaned, sheet.createdBy, options.onProgress);
  // The student's photo is never framed like the teacher's: anchor on the printed prompts and move
  // every answer box onto THIS photo before reading ink inside it.
  const registration = registerFieldsToScan(sheet, local.lines);
  const placed = registration.sheet;
  const answers: Record<string, string> = {};
  const confidence: Record<string, number> = {};
  const answered: Record<string, boolean> = {};
  for (const field of placed.fields) {
    const inBox = local.words.filter(word => {
      const cx = word.box.x + word.box.width / 2, cy = word.box.y + word.box.height / 2;
      return cx >= field.box.x && cx <= field.box.x + field.box.width && cy >= field.box.y && cy <= field.box.y + field.box.height;
    }).filter(word => !/^_+$/.test(word.text));
    const inkDensity = density ? density(field.box) : 0;
    const hasInk = inkDensity > .018;
    answered[field.id] = inBox.length > 0 || hasInk;
    if (inBox.length) {
      answers[field.id] = inBox.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x).map(word => word.text.replace(/_+/g, '')).join(' ').trim();
      // A read off an unregistered photo is a guess about where the box is — trust it less.
      const placementTrust = registration.matched >= 2 ? 1 : .7;
      confidence[field.id] = placementTrust * inBox.reduce((sum, word) => sum + word.confidence, 0) / inBox.length;
    } else if (hasInk) {
      answers[field.id] = '';
      confidence[field.id] = 0.2;
    }
  }
  // Handwriting lane: transcribe each answered field's writing area with TrOCR when available.
  if (flat && wantHandwriting !== 'skip') {
    try {
      const { isHandwritingModelInstalled, transcribeHandwritingCrops } = await import('./handwritingTranscription');
      if (wantHandwriting === 'require' || (wantHandwriting === 'auto' && isHandwritingModelInstalled())) {
        const { cropHandwriting } = await import('./worksheetReprint');
        const targets = placed.fields.filter(f => answered[f.id]);
        if (targets.length) {
          options.onProgress?.('Reading handwriting on this device…');
          const crops = targets.map(f => ({ id: f.id, dataUrl: cropHandwriting(flat, f.box) }));
          const read = await transcribeHandwritingCrops(crops, p => options.onProgress?.(p.message));
          for (const f of targets) {
            const r = read[f.id];
            if (r && r.text) { answers[f.id] = r.text; confidence[f.id] = r.confidence; }
          }
        }
      }
    } catch (error) { console.warn('[worksheetLocalVision] handwriting lane skipped.', error); }
  }

  const anyAnswered = Object.values(answered).some(Boolean);
  return {
    ok: anyAnswered, answers, confidence, answered,
    registration: { matched: registration.matched, total: registration.total, quality: registration.quality },
    pageText: local.text, pageImage: cleaned,
    message: anyAnswered ? undefined : 'No writing was detected inside the answer regions. You can still enter answers manually.',
  };
}

/**
 * Turn any phone photo into an upright, flat, paper-only page: lighting flattened, perspective
 * corrected (or cropped to paper), sideways shots rotated, and fine skew removed. Teacher scans and
 * student scans both pass through this, so they share one page coordinate space.
 * Orientation voting (several OCR passes) only runs for landscape captures — worksheets and flyers
 * are portrait, so an upright portrait photo never pays for it.
 */
export async function normalizeWorksheetPage(src: string, onProgress?: (message: string) => void) {
  const { flattenWorksheet, cropToPaper, warpToPage, rotateWorksheet } = await import('./worksheetReprint');
  const { estimateDeskewAngle, buildInkMap } = await import('./worksheetReprintCore');
  // Find the paper on the RAW photo first: lighting flattening brightens the desk around the page
  // until paper and desk look alike, so isolating after flattening silently kept the desk.
  let pageSrc = src;
  try {
    const image: HTMLImageElement = await new Promise((res, rej) => { const el = new Image(); el.onload = () => res(el); el.onerror = () => rej(new Error('page load failed')); el.src = src; });
    const scale = Math.min(1, 1700 / Math.max(image.naturalWidth, image.naturalHeight));
    const W = Math.max(2, Math.round(image.naturalWidth * scale)), H = Math.max(2, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0, W, H);
    const imageData = ctx.getImageData(0, 0, W, H);
    const raw = { canvas, ctx, width: W, height: H, dataUrl: src, imageData, ink: buildInkMap(imageData.data, W, H) };
    const isolated = warpToPage(raw);
    if (isolated) pageSrc = isolated.dataUrl;
  } catch (error) { console.warn('[worksheetLocalVision] raw paper isolation skipped.', error); }
  let flat = await flattenWorksheet(pageSrc);
  if (pageSrc === src) {
    try { flat = warpToPage(flat) || cropToPaper(flat); } catch (error) { console.warn('[worksheetLocalVision] paper isolation skipped.', error); }
  }
  if (flat.width > flat.height * 1.12) {
    try {
      const orient = await detectPageOrientation(flat.dataUrl, onProgress, [0, 90, 270]);
      if (orient.degrees) flat = rotateWorksheet(flat, orient.degrees);
    } catch (error) { console.warn('[worksheetLocalVision] orientation skipped.', error); }
  }
  try {
    const skew = estimateDeskewAngle(flat.ink, flat.width, flat.height);
    if (skew) flat = rotateWorksheet(flat, -skew);
  } catch (error) { console.warn('[worksheetLocalVision] deskew skipped.', error); }
  return flat;
}

/** OCR any page (worksheet, flyer, note) on device: normalized image + lines + plain text. */
export async function readPageOnDevice(src: string, onProgress?: (message: string) => void): Promise<PageRead & { pageImage: string; text: string }> {
  onProgress?.('Straightening the page…');
  const flat = await normalizeWorksheetPage(src, onProgress);
  const local = await digitizeWorksheetOnDevice(flat.dataUrl, 'scanner', onProgress);
  return { flat, local, pageImage: flat.dataUrl, text: local.text };
}

async function loadGray(src: string, width: number, height: number): Promise<GrayImage> {
  const image: HTMLImageElement = await new Promise((res, rej) => { const el = new Image(); el.onload = () => res(el); el.onerror = () => rej(new Error('gray load failed')); el.src = src; });
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < data.length; i += 4, j++) data[j] = (rgba[i] * 54 + rgba[i + 1] * 183 + rgba[i + 2] * 19) >> 8;
  return { data, width, height };
}

/** OCR lines in pixels, with word boxes, and "+" glyphs re-checked against the ink for "÷". */
function collectPxLines(blocks: any[], gray: GrayImage | null) {
  const out: Array<{ text: string; bbox: PxBox; confidence: number; words: PxBox[] }> = [];
  for (const block of blocks) for (const paragraph of block.paragraphs || []) for (const line of paragraph.lines || []) {
    const lb = line.bbox || {};
    const bbox: PxBox = { x0: Number(lb.x0), y0: Number(lb.y0), x1: Number(lb.x1), y1: Number(lb.y1) };
    const wordTexts: string[] = [];
    const wordBoxes: PxBox[] = [];
    for (const word of line.words || []) {
      let text = String(word.text || '').trim();
      if (!text) continue;
      if (gray && text.includes('+') && Array.isArray(word.symbols)) {
        text = word.symbols.map((sym: any) => {
          if (sym.text !== '+') return String(sym.text || '');
          const b = sym.bbox || {};
          return classifyPlusOrDivide(gray, { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, bbox.y0, bbox.y1) === '÷' ? '÷' : '+';
        }).join('') || text;
      }
      wordTexts.push(text);
      const wb = word.bbox || {};
      wordBoxes.push({ x0: Number(wb.x0), y0: Number(wb.y0), x1: Number(wb.x1), y1: Number(wb.y1) });
    }
    const text = (wordTexts.length ? wordTexts.join(' ') : String(line.text || '')).replace(/\s+/g, ' ').trim();
    if (!text || !(bbox.x1 - bbox.x0 > 1)) continue;
    out.push({ text, bbox, confidence: clamp(Number(line.confidence || 0) / 100, .55), words: wordBoxes });
  }
  return out.sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
}

function inferField(line: { text: string; box: LocalWord['box']; confidence: number }, index: number, splitOrdinal?: string): WorksheetField {
  const ordinal = splitOrdinal || line.text.match(/^\s*([\dA-Z]+[.)])\s/i)?.[1];
  const choices = Array.from(line.text.matchAll(/(?:^|\s)([A-D])[.)]\s*([^A-D]+?)(?=\s[A-D][.)]|$)/gi)).map(match => match[2].trim());
  const numeric = /[+\-×÷=]|\b(calculate|solve|sum|difference|product|quotient)\b/i.test(line.text);
  const type: WorksheetField['type'] = choices.length > 1 ? 'multiple-choice' : /\btrue\s*(?:or|\/)\s*false\b/i.test(line.text) ? 'true-false' : numeric ? 'numeric' : line.box.height > 8 ? 'long-text' : 'short-text';
  return {
    id: `q${index + 1}`, ordinal, label: line.text, type, ...(choices.length > 1 ? { choices } : {}),
    box: { x: Math.min(72, Math.max(8, line.box.x + line.box.width + 1)), y: line.box.y, width: 92 - Math.min(72, Math.max(8, line.box.x + line.box.width + 1)), height: Math.max(5, line.box.height) },
    points: 1, needsManualGrade: true, confidence: line.confidence,
  };
}

function inferSubject(text: string) {
  const vocab: Record<string, RegExp> = {
    Math: /[+\-×÷=]|\b(fraction|decimal|equation|multiply|divide|geometry|algebra|number|calculate|solve|sum|graph|angle|area|perimeter)\b/gi,
    Science: /\b(cell|energy|ecosystem|matter|experiment|hypothesis|organism|force|motion|atom|planet|weather|habitat|chemical|biology|physics)\b/gi,
    History: /\b(history|century|government|war|civilization|president|empire|revolution|constitution|colony|ancient|timeline)\b/gi,
    'English Language Arts': /\b(sentence|paragraph|grammar|reading|author|character|theme|verb|noun|adjective|poem|story|passage|vocabulary|spelling)\b/gi,
    Geography: /\b(map|continent|country|state|capital|ocean|latitude|longitude|region|geography)\b/gi,
    'World Language': /\b(translate|vocabulary|conjugate|spanish|french|german|latin)\b/gi,
  };
  const ranked = Object.entries(vocab).map(([subject, pattern]) => [subject, (text.match(pattern) || []).length] as const).sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[1] ? ranked[0][0] : 'General';
}

function clamp(value: number, fallback = 0) { return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback; }
