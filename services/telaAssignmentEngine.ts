import type {
  TelaAssignmentAudienceRole, TelaBaseDevice, TelaField, TelaFieldGrade,
  TelaFieldType, TelaQuestionProperties, TelaResponseType, TelaSubmissionGrade,
  TelaVectorDevice, TelaVectorObject,
} from '../types';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const plain = (value: string) => value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();

export const TELA_NATIVE_RECORDING_LIMIT_SECONDS = 60;
export const TELA_EXTERNAL_VIDEO_PROVIDERS = ['Reelo', 'YouTube', 'Vimeo', 'Google Drive', 'OneDrive'];

export function responseTypeToFieldType(type: TelaResponseType): TelaFieldType {
  if (type === 'NUMBER') return 'NUMBER';
  if (type === 'MULTIPLE_CHOICE' || type === 'TRUE_FALSE') return 'SELECT';
  return 'TEXT';
}

export interface TelaQuestionDraft {
  prompt: string;
  responseType: TelaResponseType;
  required: boolean;
  points: number;
  correctAnswer?: string;
  acceptedAnswers?: string[];
  tolerance?: number;
  options?: string[];
  hints?: string[];
  standards?: string[];
  rubricTarget?: string;
  source?: TelaQuestionProperties['source'];
}

export function makeTelaQuestionField(id: string, draft: TelaQuestionDraft, layout?: TelaField['layout']): TelaField {
  const interaction: TelaQuestionProperties = {
    kind: 'QUESTION',
    prompt: plain(draft.prompt) || 'Question',
    responseType: draft.responseType,
    required: draft.required,
    points: Math.max(0, draft.points || 0),
    source: draft.source,
    correctAnswer: draft.correctAnswer?.trim() || undefined,
    acceptedAnswers: draft.acceptedAnswers?.map(value => value.trim()).filter(Boolean),
    tolerance: draft.responseType === 'NUMBER' ? Math.max(0, draft.tolerance || 0) : undefined,
    options: draft.responseType === 'TRUE_FALSE' ? ['True', 'False'] : draft.options?.map(value => value.trim()).filter(Boolean),
    hints: draft.hints?.map(value => value.trim()).filter(Boolean),
    standards: draft.standards?.map(value => value.trim()).filter(Boolean),
    rubricTarget: draft.rubricTarget?.trim() || undefined,
    allowedFileTypes: draft.responseType === 'ATTACHMENT' ? ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', 'image/*'] : undefined,
    maxRecordingSeconds: draft.responseType === 'AUDIO' || draft.responseType === 'VIDEO' ? TELA_NATIVE_RECORDING_LIMIT_SECONDS : undefined,
    longerVideoPolicy: draft.responseType === 'VIDEO' ? 'LINK_ONLY' : undefined,
    externalVideoProviders: draft.responseType === 'VIDEO' ? TELA_EXTERNAL_VIDEO_PROVIDERS : undefined,
    gradingVisibility: ['TEACHER', 'PARENT'],
  };
  const expected = interaction.correctAnswer;
  const validation: TelaField['validation'] = expected === undefined
    ? { mode: 'MANUAL' }
    : draft.responseType === 'NUMBER'
      ? { mode: 'NUMERIC_TOLERANCE', expected, tolerance: interaction.tolerance || 0 }
      : draft.responseType === 'MULTIPLE_CHOICE' || draft.responseType === 'TRUE_FALSE'
        ? { mode: 'CHOICE', expected }
        : { mode: 'EXACT', expected };
  return {
    id,
    name: interaction.prompt,
    type: responseTypeToFieldType(draft.responseType),
    semanticRole: 'RESPONSE',
    layout,
    validation,
    interaction,
    options: interaction.options,
  };
}

/** Place the generated response surface directly below the selected question. */
export function answerLayoutForObject(object: TelaVectorObject, device: TelaVectorDevice, type: TelaResponseType): NonNullable<TelaField['layout']> {
  const x = clamp(object.x / device.width * 100, 2, 92);
  const questionBottom = (object.y + Math.max(object.h, object.fontSize || 24)) / device.height * 100;
  const h = type === 'LONG_TEXT' || type === 'ATTACHMENT' || type === 'AUDIO' || type === 'VIDEO' ? 10 : 4.8;
  const w = type === 'TRUE_FALSE' ? 26 : type === 'NUMBER' ? 30 : clamp(object.w / device.width * 100, 34, 88);
  let y = questionBottom + 1.1;
  if (y + h > 97) y = clamp(object.y / device.height * 100 - h - 1, 2, 92);
  return { x, y, w: clamp(w, 12, 96 - x), h, pageId: device.id };
}

export function makeAnswerGuide(field: TelaField, device: TelaVectorDevice): TelaVectorObject | null {
  if (!field.layout) return null;
  const layout = field.layout;
  return {
    id: `answer_guide_${field.id}`,
    kind: 'RECT',
    x: layout.x / 100 * device.width,
    y: layout.y / 100 * device.height,
    w: layout.w / 100 * device.width,
    h: layout.h / 100 * device.height,
    fill: 'rgba(0,218,243,0.035)',
    stroke: '#00A8BC',
    strokeWidth: 1.25,
    rotation: 0,
    opacity: 1,
    semanticRole: 'RESPONSE_GUIDE',
    assignmentFieldId: field.id,
    objectLabel: `Answer · ${field.name}`,
  };
}

// ── Safe local math evaluation ───────────────────────────────────────────────

class MathReader {
  private at = 0;
  constructor(private readonly source: string) {}
  read(): number {
    const value = this.expression();
    this.space();
    if (this.at !== this.source.length || !Number.isFinite(value)) throw new Error('Invalid expression');
    return value;
  }
  private space() { while (/\s/.test(this.source[this.at] || '')) this.at++; }
  private expression(): number {
    let value = this.term();
    for (;;) { this.space(); const op = this.source[this.at]; if (op !== '+' && op !== '-') return value; this.at++; const rhs = this.term(); value = op === '+' ? value + rhs : value - rhs; }
  }
  private term(): number {
    let value = this.power();
    for (;;) { this.space(); const op = this.source[this.at]; if (op !== '*' && op !== '/') return value; this.at++; const rhs = this.power(); value = op === '*' ? value * rhs : value / rhs; }
  }
  private power(): number {
    let value = this.unary(); this.space();
    if (this.source[this.at] === '^') { this.at++; value = Math.pow(value, this.power()); }
    return value;
  }
  private unary(): number { this.space(); const op = this.source[this.at]; if (op === '+' || op === '-') { this.at++; const value = this.unary(); return op === '-' ? -value : value; } return this.primary(); }
  private primary(): number {
    this.space();
    if (this.source[this.at] === '(') { this.at++; const value = this.expression(); this.space(); if (this.source[this.at] !== ')') throw new Error('Missing parenthesis'); this.at++; return value; }
    const match = this.source.slice(this.at).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (!match) throw new Error('Number expected');
    this.at += match[0].length;
    return Number(match[0]);
  }
}

export function evaluateTelaMath(source: string): number | null {
  const normalized = source.trim().replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/[−–—]/g, '-').replace(/,/g, '');
  if (!normalized || !/^[\d\s.+\-*/^()]+$/.test(normalized)) return null;
  try { return new MathReader(normalized).read(); } catch { return null; }
}

const normalizedText = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

export function evaluateTelaField(field: TelaField, rawValue: string): TelaFieldGrade {
  const interaction = field.interaction;
  const possible = Math.max(0, interaction?.points ?? 1);
  const value = rawValue?.trim() || '';
  if (!value) return { fieldId: field.id, status: 'UNANSWERED', earned: 0, possible, studentTip: interaction?.required ? 'Add a response before you turn this in.' : 'This question is optional.' };
  if (!interaction || field.validation?.mode === 'MANUAL' || !interaction.correctAnswer) {
    return { fieldId: field.id, status: 'MANUAL_REVIEW', earned: 0, possible, studentTip: 'Your response is saved. Your teacher will review it.' };
  }
  let correct = false;
  if (interaction.responseType === 'NUMBER' || field.validation?.mode === 'NUMERIC_TOLERANCE' || field.validation?.mode === 'MATH_EXPRESSION') {
    const actual = evaluateTelaMath(value);
    const expected = evaluateTelaMath(interaction.correctAnswer);
    correct = actual !== null && expected !== null && Math.abs(actual - expected) <= (interaction.tolerance ?? field.validation?.tolerance ?? 0);
  } else {
    const accepted = [interaction.correctAnswer, ...(interaction.acceptedAnswers || [])].map(normalizedText);
    correct = accepted.includes(normalizedText(value));
  }
  const fallbackTip = interaction.responseType === 'NUMBER'
    ? 'Check each operation and try the calculation again.'
    : interaction.responseType === 'MULTIPLE_CHOICE' || interaction.responseType === 'TRUE_FALSE'
      ? 'Return to the evidence in the question before choosing again.'
      : 'Re-read the prompt and check whether every important idea is in your response.';
  return correct
    ? { fieldId: field.id, status: 'CORRECT', earned: possible, possible, studentTip: 'Nice work—your reasoning is on track.', evaluatorNote: `Matched the answer key.` }
    : { fieldId: field.id, status: 'INCORRECT', earned: 0, possible, studentTip: interaction.hints?.[0] || fallbackTip, evaluatorNote: `Expected ${interaction.correctAnswer}; received ${value}.` };
}

export function gradeTelaAssignment(base: TelaBaseDevice, values: Record<string, string>): TelaSubmissionGrade {
  const fields = base.fields.filter(field => field.interaction).map(field => evaluateTelaField(field, values[field.id] || ''));
  const earned = fields.reduce((sum, field) => sum + field.earned, 0);
  const possible = fields.reduce((sum, field) => sum + field.possible, 0);
  return {
    earned,
    possible,
    percent: possible > 0 ? Math.round(earned / possible * 100) : 0,
    needsManualReview: fields.some(field => field.status === 'MANUAL_REVIEW'),
    fields,
    evaluatedAt: Date.now(),
  };
}

export function visibleFieldFeedback(field: TelaField, result: TelaFieldGrade, role: TelaAssignmentAudienceRole): { label: string; detail?: string; tone: 'GOOD' | 'TRY' | 'WAIT' } {
  if (role === 'STUDENT') {
    if (result.status === 'CORRECT') return { label: 'Ready', detail: result.studentTip, tone: 'GOOD' };
    if (result.status === 'MANUAL_REVIEW') return { label: 'Saved for review', detail: result.studentTip, tone: 'WAIT' };
    return { label: result.status === 'UNANSWERED' ? 'Response needed' : 'Try another step', detail: result.studentTip, tone: 'TRY' };
  }
  if (result.status === 'CORRECT') return { label: `Correct · ${result.earned}/${result.possible}`, detail: result.evaluatorNote, tone: 'GOOD' };
  if (result.status === 'MANUAL_REVIEW') return { label: `Manual review · ${result.possible} pt`, detail: 'No answer key was set for this response.', tone: 'WAIT' };
  return { label: `${result.status === 'UNANSWERED' ? 'Unanswered' : 'Incorrect'} · 0/${result.possible}`, detail: result.evaluatorNote || `Answer key: ${field.interaction?.correctAnswer || 'not set'}`, tone: 'TRY' };
}

// ── Approved-layout memory ───────────────────────────────────────────────────

const LAYOUT_MEMORY_KEY = 'plajah.tela.assignment-layouts.v1';
export interface TelaAssignmentLayoutMemory {
  id: string;
  name: string;
  aspect: number;
  objectRoles: { role: string; x: number; y: number; w: number; h: number; label?: string }[];
  answerFields: { x: number; y: number; w: number; h: number; responseType?: TelaResponseType }[];
  approvals: number;
  updatedAt: number;
}

function readLayoutMemory(): TelaAssignmentLayoutMemory[] {
  if (typeof localStorage === 'undefined') return [];
  try { const value = JSON.parse(localStorage.getItem(LAYOUT_MEMORY_KEY) || '[]'); return Array.isArray(value) ? value.slice(0, 24) : []; } catch { return []; }
}

export function rememberApprovedTelaLayout(name: string, device: TelaVectorDevice, fields: TelaField[]): TelaAssignmentLayoutMemory {
  const profile: TelaAssignmentLayoutMemory = {
    id: `layout_${Date.now()}`,
    name,
    aspect: device.width / Math.max(1, device.height),
    objectRoles: device.objects.filter(object => object.semanticRole).slice(0, 160).map(object => ({ role: object.semanticRole!, x: object.x / device.width, y: object.y / device.height, w: object.w / device.width, h: object.h / device.height, label: object.objectLabel || plain(object.text || '').slice(0, 80) })),
    answerFields: fields.filter(field => field.layout).map(field => ({ x: field.layout!.x / 100, y: field.layout!.y / 100, w: field.layout!.w / 100, h: field.layout!.h / 100, responseType: field.interaction?.responseType })),
    approvals: 1,
    updatedAt: Date.now(),
  };
  if (typeof localStorage !== 'undefined') {
    const existing = readLayoutMemory();
    const similar = existing.findIndex(item => Math.abs(item.aspect - profile.aspect) < .025 && Math.abs(item.answerFields.length - profile.answerFields.length) <= 1 && Math.abs(item.objectRoles.length - profile.objectRoles.length) <= 4);
    if (similar >= 0) profile.approvals = (existing[similar].approvals || 1) + 1;
    const next = similar >= 0 ? [profile, ...existing.filter((_, index) => index !== similar)] : [profile, ...existing];
    try { localStorage.setItem(LAYOUT_MEMORY_KEY, JSON.stringify(next.slice(0, 24))); } catch { /* quota/private mode */ }
  }
  return profile;
}

export function findTelaLayoutMatch(width: number, height: number, objectCount: number, fieldCount: number): { profile: TelaAssignmentLayoutMemory; confidence: number } | null {
  const aspect = width / Math.max(1, height);
  const scored = readLayoutMemory().map(profile => {
    const aspectScore = 1 - clamp(Math.abs(profile.aspect - aspect) / .35, 0, 1);
    const fieldScore = 1 - clamp(Math.abs(profile.answerFields.length - fieldCount) / Math.max(3, profile.answerFields.length), 0, 1);
    const objectScore = 1 - clamp(Math.abs(profile.objectRoles.length - objectCount) / Math.max(8, profile.objectRoles.length), 0, 1);
    return { profile, confidence: aspectScore * .45 + fieldScore * .35 + objectScore * .20 };
  }).sort((a, b) => b.confidence - a.confidence);
  return scored[0] && scored[0].confidence >= .55 ? scored[0] : null;
}

export interface TelaAssignmentAssetRecommendation { kind: 'VECTOR' | 'PHOTO' | 'MODEL_3D' | 'VIDEO' | 'AUDIO'; label: string; reason: string; }
export function recommendAssignmentAssets(prompt: string): TelaAssignmentAssetRecommendation[] {
  const text = prompt.toLowerCase();
  const rows: TelaAssignmentAssetRecommendation[] = [
    { kind: 'VECTOR', label: 'Editable diagram', reason: 'Keeps labels, arrows, and answer targets selectable.' },
    { kind: 'PHOTO', label: 'Primary-source photograph', reason: 'Adds visual evidence without flattening the worksheet.' },
  ];
  if (/history|speech|music|language|interview|oral/.test(text)) rows.push({ kind: 'AUDIO', label: 'Historical or spoken recording', reason: 'Lets the question use listening as evidence.' });
  if (/shape|geometry|anatom|earth|molecule|artifact|architecture|space/.test(text)) rows.push({ kind: 'MODEL_3D', label: 'Inspectable 3D model', reason: 'Supports spatial understanding and multiple viewpoints.' });
  if (/process|experiment|motion|performance|demonstrat/.test(text)) rows.push({ kind: 'VIDEO', label: 'Short evidence clip', reason: 'Shows change over time directly beside the question.' });
  return rows.slice(0, 4);
}
