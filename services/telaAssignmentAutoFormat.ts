import type {
  TelaBaseDevice, TelaDoc, TelaField, TelaFormDevice, TelaFrame, TelaResponseType,
  TelaVectorDevice, TelaVectorObject, TelaWriterDevice,
} from '../types';
import type { DigitalWorksheet, WorksheetSegment } from './worksheetDigitizer';
import { makeAnswerGuide, makeTelaQuestionField } from './telaAssignmentEngine';

const plain = (value = '') => value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
const stableId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const questionPattern = /(?:\?|_{3,}|\b(?:solve|calculate|explain|describe|identify|compare|choose|select|write|show your work|what|why|how|which|who|where|when)\b)/i;
const ordinalPattern = /^\s*(?:question\s*)?(\d+|[a-z]|[ivxlcdm]+)[\s.)\]:-]+/i;
const instructionPattern = /\b(?:directions?|instructions?|read each|answer the|show your work|circle|complete the|use the|name\s*[:_]|date\s*[:_])\b/i;

function responseTypeFor(text: string): TelaResponseType {
  if (/\b(?:true\s*(?:or|\/)\s*false|true|false)\b/i.test(text)) return 'TRUE_FALSE';
  if (/(?:\([a-d]\)|\b[a-d][.)]\s)/i.test(text)) return 'MULTIPLE_CHOICE';
  if (/\b(?:explain|describe|compare|justify|paragraph|show your work|write about)\b/i.test(text)) return 'LONG_TEXT';
  if (/[=+×÷*/]|\b(?:sum|difference|product|quotient|calculate|how many|number)\b/i.test(text)) return 'NUMBER';
  return 'SHORT_TEXT';
}

function isQuestion(text: string, object?: TelaVectorObject): boolean {
  return object?.semanticRole === 'QUESTION' || !!object?.assignmentFieldId || ordinalPattern.test(text) || questionPattern.test(text);
}

function isInstruction(text: string, object?: TelaVectorObject): boolean {
  return object?.semanticRole === 'INSTRUCTION' || instructionPattern.test(text);
}

function orderedTextObjects(vector: TelaVectorDevice): TelaVectorObject[] {
  return vector.objects
    .filter(object => object.kind === 'TEXT' && plain(object.text) && !object.objectLabel?.startsWith('Auto format ·'))
    .sort((a, b) => Math.abs(a.y - b.y) < 8 ? a.x - b.x : a.y - b.y);
}

function writerObjects(writer: TelaWriterDevice, width: number): TelaVectorObject[] {
  return writer.blocks.filter(block => plain(block.text)).map((block, index) => ({
    id: stableId('auto_text'), kind: 'TEXT', x: 72, y: 150 + index * 62, w: width - 144, h: 42,
    fill: 'var(--text-primary,#1B1523)', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1,
    text: plain(block.text), fontSize: block.kind === 'h1' ? 30 : block.kind === 'h2' ? 22 : 17,
    fontFamily: 'var(--font-body,Inter), sans-serif', fontWeight: block.kind === 'h1' ? 850 : block.kind === 'h2' ? 750 : 500,
    semanticRole: block.assignmentRole || (block.kind === 'h1' ? 'PRINTED_CONTENT' : undefined),
    assignmentFieldId: block.assignmentFieldId,
    objectLabel: `Writer block · ${block.id}`,
  }));
}

function headerObjects(width: number, title: string, questionCount: number): TelaVectorObject[] {
  return [
    {
      id: stableId('auto_band'), kind: 'RECT', x: 0, y: 0, w: width, h: 18,
      fill: 'var(--pj-purple,#6B0099)', gradient: { kind: 'LINEAR', angle: 0, stops: [{ offset: 0, color: 'var(--pj-purple,#6B0099)' }, { offset: 1, color: 'var(--pj-magenta,#D40055)' }] },
      stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, semanticRole: 'ARTWORK', objectLabel: 'Auto format · Plajah Plus brand rule',
    },
    {
      id: stableId('auto_eyebrow'), kind: 'TEXT', x: 64, y: 42, w: width - 128, h: 18,
      fill: 'var(--pj-purple,#6B0099)', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1,
      text: `PLAJAH PLUS  •  ASSIGNMENT  •  ${questionCount} QUESTION${questionCount === 1 ? '' : 'S'}`,
      fontSize: 11, fontFamily: 'var(--font-label,Outfit), sans-serif', fontWeight: 850,
      semanticRole: 'PRINTED_CONTENT', objectLabel: 'Auto format · eyebrow',
    },
    {
      id: stableId('auto_title'), kind: 'TEXT', x: 64, y: 68, w: width - 128, h: 48,
      fill: 'var(--text-primary,#1B1523)', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1,
      text: title, fontSize: 31, fontFamily: 'var(--font-display,Outfit), sans-serif', fontWeight: 900,
      semanticRole: 'PRINTED_CONTENT', objectLabel: 'Auto format · title',
    },
    {
      id: stableId('auto_student'), kind: 'TEXT', x: 64, y: 122, w: width - 128, h: 22,
      fill: 'var(--on-surface-variant,#655B70)', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1,
      text: 'Name ____________________________________     Date ____________________',
      fontSize: 13, fontFamily: 'var(--font-body,Inter), sans-serif', fontWeight: 600,
      semanticRole: 'PRINTED_CONTENT', objectLabel: 'Auto format · student header',
    },
  ];
}

export interface TelaAutoFormatReport {
  frameId: string;
  confidence: number;
  questionsDetected: number;
  fieldsCreated: number;
  objectsAligned: number;
  warnings: string[];
}

/**
 * Rebuild one Tela page as a structured Plajah Plus assignment. This is pure:
 * callers retain the original doc as their undo snapshot before accepting it.
 */
export function autoFormatTelaAssignment(source: TelaDoc, requestedFrameId?: string): { doc: TelaDoc; report: TelaAutoFormatReport } {
  const doc: TelaDoc = typeof structuredClone === 'function' ? structuredClone(source) : JSON.parse(JSON.stringify(source));
  const frame = doc.frames.find(item => item.id === requestedFrameId) || doc.frames.find(item => item.kind === 'PAPER') || doc.frames[0];
  if (!frame) throw new Error('Add or select a page before using Auto Format.');

  let vector = frame.deviceIds.map(id => doc.devices[id]).find((device): device is TelaVectorDevice => device?.type === 'VECTOR');
  const writer = frame.deviceIds.map(id => doc.devices[id]).find((device): device is TelaWriterDevice => device?.type === 'WRITER')
    || Object.values(doc.devices).find((device): device is TelaWriterDevice => device.type === 'WRITER');
  const width = vector?.width || frame.w || 816;
  const height = vector?.height || frame.h || 1056;
  if (!vector) {
    vector = { id: stableId('auto_vector'), type: 'VECTOR', name: `${doc.title} · Plajah Plus assignment`, width, height, objects: writer ? writerObjects(writer, width) : [] };
    doc.devices[vector.id] = vector;
    frame.deviceIds.unshift(vector.id);
  }

  const textObjects = orderedTextObjects(vector);
  const likelyTitle = textObjects.find(object => !isQuestion(plain(object.text), object) && !isInstruction(plain(object.text), object) && (object.fontSize || 0) >= 21)
    || textObjects.find(object => !isQuestion(plain(object.text), object) && !isInstruction(plain(object.text), object));
  const title = plain(likelyTitle?.text) || doc.title || 'Assignment';
  const content = textObjects.filter(object => object.id !== likelyTitle?.id);
  let questions = content.filter(object => isQuestion(plain(object.text), object));
  if (!questions.length) questions = content.filter(object => !isInstruction(plain(object.text), object));
  const questionIds = new Set(questions.map(object => object.id));
  const instructions = content.filter(object => !questionIds.has(object.id) && isInstruction(plain(object.text), object));

  let base = frame.deviceIds.map(id => doc.devices[id]).find((device): device is TelaBaseDevice => device?.type === 'BASE');
  if (!base) {
    base = { id: stableId('auto_base'), type: 'BASE', name: `${title} · student responses`, fields: [], rows: [] };
    doc.devices[base.id] = base;
    frame.deviceIds.push(base.id);
  }
  let form = frame.deviceIds.map(id => doc.devices[id]).find((device): device is TelaFormDevice => device?.type === 'FORM');
  if (!form) {
    form = { id: stableId('auto_form'), type: 'FORM', baseDeviceId: base.id, title, presentation: 'POSITIONED', pageDeviceId: vector.id };
    doc.devices[form.id] = form;
    frame.deviceIds.push(form.id);
  }
  form.baseDeviceId = base.id;
  form.title = title;
  form.presentation = 'POSITIONED';
  form.pageDeviceId = vector.id;
  form.assignment = {
    enabled: true, assignmentId: form.assignment?.assignmentId || stableId('assignment'), createdAt: form.assignment?.createdAt || Date.now(),
    previewRole: form.assignment?.previewRole || 'STUDENT', showStudentTips: true, maxRecordedVideoSeconds: 60,
    longerVideoPolicy: 'LINK_ONLY', externalVideoProviders: ['Reelo', 'YouTube', 'Vimeo', 'Google Drive', 'OneDrive'],
    quality: form.assignment?.quality,
  };

  const preservedArtwork = vector.objects.filter(object => object.kind !== 'TEXT' && object.semanticRole !== 'RESPONSE_GUIDE' && !object.objectLabel?.startsWith('Auto format ·'));
  const formatted: TelaVectorObject[] = [];
  const guides: TelaVectorObject[] = [];
  const existingFields = new Map(base.fields.map(field => [field.id, field]));
  const usedFieldIds = new Set<string>();
  const contentTop = instructions.length ? 205 : 170;
  const available = Math.max(260, height - contentTop - 50);
  const slot = clamp(available / Math.max(1, questions.length), 48, 108);

  instructions.slice(0, 3).forEach((object, index) => {
    formatted.push({ ...object, x: 64, y: 158 + index * 34, w: width - 128, h: 28, text: plain(object.text), fontSize: 14,
      fontFamily: 'var(--font-body,Inter), sans-serif', fontWeight: 600, fill: 'var(--on-surface-variant,#655B70)', stroke: 'none', strokeWidth: 0,
      semanticRole: 'INSTRUCTION', objectLabel: `Auto format · instruction · ${plain(object.text).slice(0, 60)}` });
  });

  let fieldsCreated = 0;
  questions.forEach((object, index) => {
    const prompt = plain(object.text).replace(ordinalPattern, '').trim() || `Question ${index + 1}`;
    const responseType = responseTypeFor(prompt);
    const questionY = contentTop + index * slot;
    const questionObject: TelaVectorObject = {
      ...object, x: 74, y: questionY, w: width - 148, h: Math.max(24, Math.min(42, slot * .36)),
      text: `${index + 1}. ${prompt}`, fontSize: questions.length > 12 ? 15 : 17,
      fontFamily: 'var(--font-body,Inter), sans-serif', fontWeight: 720,
      fill: 'var(--text-primary,#1B1523)', stroke: 'none', strokeWidth: 0,
      semanticRole: 'QUESTION', objectLabel: `Auto format · question ${index + 1} · ${prompt.slice(0, 54)}`,
    };
    let field = object.assignmentFieldId ? existingFields.get(object.assignmentFieldId) : undefined;
    if (!field) {
      const fieldId = object.assignmentFieldId || stableId('auto_field');
      const answerHeight = responseType === 'LONG_TEXT' ? Math.min(9, slot / height * 70) : 3.2;
      field = makeTelaQuestionField(fieldId, { prompt, responseType, required: true, points: 1 }, {
        x: 9.1, y: (questionY + questionObject.h + 5) / height * 100, w: 81.8, h: Math.max(2.1, answerHeight), pageId: vector!.id,
      });
      base!.fields.push(field); existingFields.set(field.id, field); fieldsCreated++;
    } else {
      field = { ...field, name: prompt, interaction: field.interaction ? { ...field.interaction, prompt } : field.interaction,
        layout: field.layout || { x: 9.1, y: (questionY + questionObject.h + 5) / height * 100, w: 81.8, h: 3.2, pageId: vector!.id } };
      base!.fields = base!.fields.map(item => item.id === field!.id ? field! : item);
    }
    usedFieldIds.add(field.id);
    questionObject.assignmentFieldId = field.id;
    formatted.push(questionObject);
    const guide = makeAnswerGuide(field, vector!);
    if (guide) guides.push({ ...guide, objectLabel: `Auto format · ${guide.objectLabel || 'answer'}` });
  });

  // Keep author-created fields even when they were not detected in this pass.
  base.fields = base.fields.map(field => usedFieldIds.has(field.id) || !field.interaction ? field : field);
  vector.objects = [...preservedArtwork, ...headerObjects(width, title, questions.length), ...formatted, ...guides];
  vector.name = `${title} · Plajah Plus assignment`;
  doc.title = title;
  frame.label = `${title} · assignment`;

  const confidence = clamp((textObjects.length ? .58 : .25) + Math.min(.25, questions.length * .04) + (base.fields.length ? .12 : 0), 0, .96);
  const report: TelaAutoFormatReport = {
    frameId: frame.id, confidence, questionsDetected: questions.length, fieldsCreated,
    objectsAligned: formatted.length + guides.length + 4,
    warnings: questions.length ? [] : ['No clear questions were detected. Review the page and mark questions manually.'],
  };
  doc.assignmentFormat = { profile: 'PLAJAH_PLUS', version: 1, appliedAt: Date.now(), frameId: frame.id, confidence,
    questionsDetected: questions.length, answerFieldsCreated: fieldsCreated, objectsAligned: report.objectsAligned };
  doc.updatedAt = Date.now();
  return { doc, report };
}

function autoHeaderSegments(sheet: DigitalWorksheet): WorksheetSegment[] {
  const existing = (sheet.segments || []).filter(segment => !segment.id.startsWith('auto_format_'));
  const titleExists = existing.some(segment => segment.kind === 'heading' && plain(segment.text).toLowerCase() === plain(sheet.title).toLowerCase());
  const inserted: WorksheetSegment[] = titleExists ? [] : [{
    id: 'auto_format_title', kind: 'heading', box: { x: 7, y: 4, width: 86, height: 5 }, text: sheet.title,
    confidence: 1, style: { fontSize: 26, fontWeight: 900, align: 'left', lineHeight: 1.1 },
  }];
  return [...inserted, ...existing].sort((a, b) => Math.abs(a.box.y - b.box.y) < 1 ? a.box.x - b.box.x : a.box.y - b.box.y);
}

/** Format scan output before it is converted into native Tela devices. */
export function autoFormatDigitalWorksheet(source: DigitalWorksheet): { sheet: DigitalWorksheet; summary: string } {
  const fields = [...source.fields].sort((a, b) => Math.abs(a.box.y - b.box.y) < 1.5 ? a.box.x - b.box.x : a.box.y - b.box.y).map((field, index) => ({
    ...field, ordinal: String(index + 1),
    box: {
      x: clamp(Math.round(field.box.x * 2) / 2, 4, 92), y: clamp(Math.round(field.box.y * 2) / 2, 4, 94),
      width: clamp(Math.round(field.box.width * 2) / 2, 8, 92), height: clamp(Math.round(field.box.height * 2) / 2, 2.5, 30),
    },
  }));
  const segments = autoHeaderSegments(source).map(segment => ({
    ...segment,
    style: segment.kind === 'heading'
      ? { ...segment.style, fontWeight: 900, fontSize: segment.style?.fontSize || 24, lineHeight: 1.1 }
      : segment.kind === 'question'
        ? { ...segment.style, fontWeight: 720, fontSize: segment.style?.fontSize || 15, lineHeight: 1.3 }
        : { ...segment.style, fontWeight: segment.style?.fontWeight || 500, lineHeight: segment.style?.lineHeight || 1.35 },
  }));
  const confidence = clamp(((source.scanAssessment?.layoutFidelity || 55) + (source.scanAssessment?.fieldCoverage || 55) + (source.scanAssessment?.textConfidence || 55)) / 300, .3, .98);
  const summary = `Plajah Plus organized ${fields.length} question${fields.length === 1 ? '' : 's'}, aligned ${fields.length} response field${fields.length === 1 ? '' : 's'}, and rebuilt the assignment header.`;
  return {
    sheet: {
      ...source, fields, segments,
      theme: { accent: 'var(--pj-purple,#6B0099)', background: 'var(--card-bg,#fff)', font: 'var(--font-body,Inter)', name: 'Plajah Plus' },
      autoFormat: { profile: 'PLAJAH_PLUS', version: 1, appliedAt: Date.now(), confidence, headingsCreated: segments.filter(segment => segment.id.startsWith('auto_format_')).length, questionsOrganized: fields.length, fieldsAligned: fields.length, summary },
    },
    summary,
  };
}
