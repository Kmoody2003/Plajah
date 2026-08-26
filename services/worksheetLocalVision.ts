// worksheetLocalVision — privacy-first worksheet OCR and layout analysis.
// Runs entirely in the browser with Tesseract.js. The trained language data is cached by the
// browser after first use; scans are never uploaded by this lane.

import { createWorker, PSM } from 'tesseract.js';
import type { DigitalWorksheet, WorksheetField, WorksheetSegment } from './worksheetDigitizer';

export interface LocalWord {
  text: string;
  confidence: number;
  box: { x: number; y: number; width: number; height: number };
}

export interface LocalVisionResult {
  sheet: DigitalWorksheet;
  words: LocalWord[];
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
): Promise<{ degrees: 0 | 90 | 180 | 270; scores: Record<number, number> }> {
  onProgress?.('Checking page orientation…');
  const worker = await createWorker('eng', 1, {});
  const scores: Record<number, number> = { 0: 0, 90: 0, 180: 0, 270: 0 };
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    for (const deg of [0, 90, 180, 270]) {
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
  } finally { await worker.terminate(); }
  let best: 0 | 90 | 180 | 270 = 0, bestScore = scores[0];
  for (const deg of [90, 180, 270] as const) if (scores[deg] > bestScore) { bestScore = scores[deg]; best = deg; }
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
  const worker = await createWorker('eng', 1, {
    logger: event => {
      if (event.status === 'recognizing text') onProgress?.(`Reading text locally · ${Math.round((event.progress || 0) * 100)}%`);
    },
  });
  try {
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
  } finally { await worker.terminate(); }
}

/** OCR and rebuild a usable teacher-editable draft without a paid API call. */
export async function digitizeWorksheetOnDevice(
  imageDataUrl: string,
  createdBy: string,
  onProgress?: (message: string) => void,
): Promise<LocalVisionResult> {
  onProgress?.('Loading private on-device OCR…');
  const worker = await createWorker('eng', 1, {
    logger: event => {
      if (event.status === 'recognizing text') onProgress?.(`Reading locally · ${Math.round((event.progress || 0) * 100)}%`);
    },
  });
  try {
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
    const lines = collectLines(data.blocks || [], width, height);
    if (!lines.length && String(data.text || '').trim()) {
      String(data.text).split(/\r?\n/).map((text, index, all) => ({ text: text.trim(), box: { x: 6, y: 8 + index * (84 / Math.max(1, all.length)), width: 88, height: 4 }, confidence: .45 })).filter(x => x.text).forEach(x => lines.push(x));
    }
    const questionLines = lines.filter(line => /(^|\s)(\d{1,3}[.)]|[A-Z][.)])\s|\?|_{2,}|\b(true|false)\b/i.test(line.text));
    const source = questionLines.length ? questionLines : lines.filter((_, index) => index > 0).slice(0, 30);
    const fields: WorksheetField[] = source.map((line, index) => inferField(line, index));
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
    return { sheet, words, engine: 'tesseract-js' };
  } finally { await worker.terminate(); }
}

/** Extract recognized marks inside the already-known answer boxes of a completed paper copy. */
export interface CompletedReadOptions {
  /** 'auto' uses the handwriting model when it is already installed; 'require' loads it; 'skip'
   *  stays on Tesseract + ink-density. The reader always degrades honestly. */
  handwriting?: 'auto' | 'require' | 'skip';
  onProgress?: (message: string) => void;
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
    const { flattenWorksheet } = await import('./worksheetReprint');
    flat = await flattenWorksheet(imageDataUrl);
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

  const local = await digitizeWorksheetOnDevice(cleaned, sheet.createdBy);
  const answers: Record<string, string> = {};
  const confidence: Record<string, number> = {};
  const answered: Record<string, boolean> = {};
  for (const field of sheet.fields) {
    const inBox = local.words.filter(word => {
      const cx = word.box.x + word.box.width / 2, cy = word.box.y + word.box.height / 2;
      return cx >= field.box.x && cx <= field.box.x + field.box.width && cy >= field.box.y && cy <= field.box.y + field.box.height;
    });
    const inkDensity = density ? density(field.box) : 0;
    const hasInk = inkDensity > .018;
    answered[field.id] = inBox.length > 0 || hasInk;
    if (inBox.length) {
      answers[field.id] = inBox.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x).map(word => word.text).join(' ');
      confidence[field.id] = inBox.reduce((sum, word) => sum + word.confidence, 0) / inBox.length;
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
        const targets = sheet.fields.filter(f => answered[f.id]);
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
    message: anyAnswered ? undefined : 'No writing was detected inside the answer regions. You can still enter answers manually.',
  };
}

function collectLines(blocks: any[], width: number, height: number) {
  const lines: { text: string; box: LocalWord['box']; confidence: number }[] = [];
  for (const block of blocks) for (const paragraph of block.paragraphs || []) for (const line of paragraph.lines || []) {
    const text = String(line.text || '').trim(); if (!text) continue;
    lines.push({ text, box: pctBox(line.bbox, width, height), confidence: clamp(Number(line.confidence || 0) / 100, .55) });
  }
  return lines.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
}

function inferField(line: { text: string; box: LocalWord['box']; confidence: number }, index: number): WorksheetField {
  const ordinal = line.text.match(/^\s*([\dA-Z]+[.)])/i)?.[1];
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
