import { useSyncExternalStore } from 'react';
import { buildSeededRichLesson, type LessonSourceKind, type LessonTemplateId, type RichLessonDraft, type RichLessonSource } from './richLessonStudio';

export type LessonStudioStage = 'advantage' | 'sources' | 'build' | 'experience' | 'personalize' | 'proof';
export interface RichLessonDemoState { stage: LessonStudioStage; draft: RichLessonDraft; generation: number; lastResetAt: number; }

const STAGES: LessonStudioStage[] = ['advantage','sources','build','experience','personalize','proof'];
const seed = (): RichLessonDemoState => ({ stage: 'advantage', draft: buildSeededRichLesson(), generation: 0, lastResetAt: 1_775_000_000_000 });
let state = seed();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const getSnapshot = () => state;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const update = (fn: (current: RichLessonDemoState) => RichLessonDemoState) => { state = fn(state); emit(); };

export function resetRichLessonDemo() { state = seed(); emit(); }
export function setRichLessonStage(stage: LessonStudioStage) { update(s => ({ ...s, stage })); }
export function nextRichLessonStage() { update(s => ({ ...s, stage: STAGES[Math.min(STAGES.indexOf(s.stage) + 1, STAGES.length - 1)] })); }
export function selectRichLessonTemplate(templateId: LessonTemplateId) { update(s => ({ ...s, draft: { ...s.draft, templateId } })); }
export function simulateRichLessonGeneration() { update(s => ({ ...s, generation: s.generation + 1, draft: buildSeededRichLesson(s.draft.templateId), stage: 'experience' })); }
export function addTeacherSource(input: { title: string; kind: LessonSourceKind; locator: string }) {
  const source: RichLessonSource = { id: `teacher-${state.draft.sources.length + 1}`, kind: input.kind, provider: 'teacher', title: input.title || 'Teacher source', ...(input.kind === 'link' ? { url: input.locator } : { fileName: input.locator }), license: input.kind === 'link' ? 'link-only' : 'teacher-owned', attribution: input.kind === 'link' ? `Linked source: ${input.locator}` : `Teacher-provided file: ${input.locator}`, quotationReady: input.kind === 'document' || input.kind === 'file', accent: '#FF8C00' };
  update(s => ({ ...s, draft: { ...s.draft, sources: [...s.draft.sources, source] } }));
}
export function useRichLessonDemo(): RichLessonDemoState { return useSyncExternalStore(subscribe, getSnapshot, getSnapshot); }
export const richLessonDemoStore = { getSnapshot, subscribe, reset: resetRichLessonDemo, setStage: setRichLessonStage, next: nextRichLessonStage, selectTemplate: selectRichLessonTemplate, generate: simulateRichLessonGeneration, addSource: addTeacherSource };

