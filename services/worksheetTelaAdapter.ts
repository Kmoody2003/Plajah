import type { DigitalWorksheet, WorksheetField } from './worksheetDigitizer';
import type { TelaBaseDevice, TelaDoc, TelaField, TelaFormDevice, TelaFrame, TelaImageDevice, TelaVectorDevice, TelaVectorObject, TelaWriterDevice } from '../types';

const fieldType = (field: WorksheetField): TelaField['type'] => field.type === 'numeric' ? 'NUMBER' : field.type === 'multiple-choice' || field.type === 'true-false' ? 'SELECT' : 'TEXT';

export interface WorksheetLayeredReconstruction {
  width: number;
  height: number;
  objects: TelaVectorObject[];
  engine?: string;
  layers?: { layout: number; artwork: number; text: number; interaction: number };
  understanding?: { summary: string; classifiedAfterRebuild: boolean };
  stats?: { regionCount?: number; vectorPathCount?: number; vectorizedRegionCount?: number; fallbackRegionCount?: number };
}

function scaleReconstruction(reconstruction: WorksheetLayeredReconstruction, width: number, height: number): TelaVectorObject[] {
  const sx = width / Math.max(1, reconstruction.width), sy = height / Math.max(1, reconstruction.height);
  return reconstruction.objects.map(object => ({
    ...object,
    x: object.x * sx, y: object.y * sy, w: object.w * sx, h: object.h * sy,
    points: object.points?.map((value, index) => value * (index % 2 === 0 ? sx : sy)),
    fontSize: object.fontSize ? object.fontSize * sy : undefined,
  }));
}

/** Convert a reviewed worksheet and its accepted layered rebuild into a native Tela document bundle. */
export function worksheetToTelaDoc(sheet: DigitalWorksheet, ownerId: string, originalSrc?: string, reconstruction?: WorksheetLayeredReconstruction): TelaDoc {
  const stamp = Date.now(); const id = sheet.telaDocId || `tela_ws_${stamp}`;
  const writerId = `${id}_writer`; const baseId = `${id}_base`; const formId = `${id}_form`; const imageId = `${id}_original`; const vectorId = `${id}_vectors`;
  const writer: TelaWriterDevice = { id: writerId, type: 'WRITER', blocks: [
    { id: `${id}_title`, kind: 'h1', text: sheet.title },
    { id: `${id}_objective`, kind: 'p', text: `<strong>Learning target:</strong> ${sheet.objective}` },
    ...sheet.fields.flatMap((f, i) => [{ id: `${id}_q_${i}`, kind: 'h2' as const, text: `${f.ordinal ? `${f.ordinal}. ` : `${i + 1}. `}${f.label}` }, { id: `${id}_hint_${i}`, kind: 'p' as const, text: f.type === 'multiple-choice' ? (f.choices || []).join(' · ') : 'Response' }]),
  ] };
  const baseFields: TelaField[] = sheet.fields.map(f => ({
    id: f.id, name: f.label, type: fieldType(f), semanticRole: 'RESPONSE',
    layout: { x: f.box.x, y: f.box.y, w: f.box.width, h: f.box.height, pageId: `${id}_faithful` },
    validation: f.correctAnswer === undefined ? { mode: 'MANUAL' } : f.type === 'numeric'
      ? { mode: 'NUMERIC_TOLERANCE', expected: f.correctAnswer, tolerance: f.tolerance || 0, formula: `=ABS(VALUE-${f.correctAnswer})<=${f.tolerance || 0}` }
      : f.type === 'multiple-choice' || f.type === 'true-false' ? { mode: 'CHOICE', expected: f.correctAnswer } : { mode: 'EXACT', expected: f.correctAnswer },
    ...(f.choices?.length ? { options: f.choices } : f.type === 'true-false' ? { options: ['true','false'] } : {}),
  }));
  const base: TelaBaseDevice = { id: baseId, type: 'BASE', name: `${sheet.title} responses`, fields: baseFields, rows: [] };
  const form: TelaFormDevice = { id: formId, type: 'FORM', baseDeviceId: baseId, title: sheet.title, presentation: 'POSITIONED', pageDeviceId: originalSrc ? imageId : vectorId };
  const fallbackObjects: TelaVectorObject[] = (sheet.segments || []).filter(segment => segment.text || ['image','diagram','table'].includes(segment.kind)).map((segment, index) => ({
    id: `${vectorId}_${index}`, kind: segment.text ? 'TEXT' : 'RECT', x: segment.box.x * 8.16, y: segment.box.y * 10.56, w: segment.box.width * 8.16, h: segment.box.height * 10.56,
    fill: segment.text ? '#17121d' : 'none', stroke: segment.text ? 'none' : '#746a80', strokeWidth: segment.text ? 0 : 1, rotation: 0, opacity: 1,
    ...(segment.text ? { text: segment.text, fontSize: Math.max(8, Math.min(32, segment.box.height * 2.2)), fontFamily: 'Arial, sans-serif', fontWeight: segment.kind === 'heading' ? 700 : 400, fontMatch: { family: 'Arial', source: 'SYSTEM' as const, confidence: .35, fallbackFamilies: ['Liberation Sans','Noto Sans'] } } : {}),
    sourceSegmentId: segment.id, semanticRole: segment.text ? 'PRINTED_CONTENT' as const : 'ARTWORK' as const,
    reconstructionLayer: segment.text ? 'TEXT' as const : 'ARTWORK' as const,
  }));
  const vectorObjects = reconstruction ? scaleReconstruction(reconstruction, 816, 1056) : fallbackObjects;
  let guideIndex = 0;
  const linkedObjects = vectorObjects.map(object => object.semanticRole === 'RESPONSE_GUIDE' && baseFields[guideIndex]
    ? { ...object, assignmentFieldId: baseFields[guideIndex++].id }
    : object);
  const vector: TelaVectorDevice = {
    id: vectorId, type: 'VECTOR', name: reconstruction ? 'Layered editable worksheet reconstruction' : 'Editable worksheet reconstruction', width: 816, height: 1056,
    objects: linkedObjects,
    ...(reconstruction ? { trace: {
      preset: 'DETAILED' as const, createdAt: Date.now(), pathCount: linkedObjects.filter(object => object.kind === 'PATH').length,
      layoutObjectCount: reconstruction.layers?.layout, artworkObjectCount: reconstruction.layers?.artwork,
      textObjectCount: reconstruction.layers?.text, interactionObjectCount: reconstruction.layers?.interaction,
      recognizedRegions: reconstruction.stats?.regionCount, understandingSummary: reconstruction.understanding?.summary,
    } } : {}),
  };
  const devices: TelaDoc['devices'] = { [writerId]: writer, [baseId]: base, [formId]: form, [vectorId]: vector };
  const frames: TelaFrame[] = [{ id: `${id}_reconstructed`, kind: 'PAPER', preset: 'LETTER', x: 976, y: 80, w: 816, h: 1056, deviceIds: [vectorId, formId], label: 'Editable vector reconstruction' }];
  if (originalSrc) {
    const image: TelaImageDevice = { id: imageId, type: 'IMAGE', name: 'Original scan', width: 816, height: 1056, layers: [{ id: `${imageId}_layer`, name: 'Original', src: originalSrc, sessionOnly: originalSrc.startsWith('blob:') || originalSrc.startsWith('data:'), x: 0, y: 0, scale: 1, opacity: 1, blend: 'normal', visible: true, adjust: { brightness: 1, contrast: 1, saturate: 1, exposure: 0, blur: 0 } }] };
    devices[imageId] = image; frames.unshift({ id: `${id}_faithful`, kind: 'PAPER', preset: 'LETTER', x: 80, y: 80, w: 816, h: 1056, deviceIds: [imageId, formId], label: 'Faithful fillable worksheet' });
  }
  return { id, ownerId, title: sheet.title, frames, devices, bindings: [], createdAt: stamp, updatedAt: stamp };
}
