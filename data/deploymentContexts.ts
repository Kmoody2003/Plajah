// deploymentContexts — Phase 7. The settings that make Plajah work for every learning context,
// not just a classroom: org types (classroom → district, plus homeschool & pods as FIRST-CLASS
// types) and selectable curriculum/framework overlays (secular, religious, classical, Montessori,
// Charlotte-Mason) that layer on or replace the public standards the ledger renders against.
//
// These are typed, persistable settings; the Context tab in Teacher Tools lets a teacher/admin/
// parent pick them. Overlays reference frameworks from educationStandards (or extend it via CASE).

import type { FrameworkId } from './educationStandards';

export type OrgType = 'CLASSROOM' | 'SCHOOL' | 'DISTRICT' | 'PRIVATE' | 'RELIGIOUS' | 'HOMESCHOOL' | 'POD' | 'MICROSCHOOL' | 'UNIVERSITY';

export interface OrgTypeDef { id: OrgType; label: string; icon: string; desc: string; native?: boolean; }

export const ORG_TYPES: OrgTypeDef[] = [
  { id: 'CLASSROOM', label: 'Classroom', icon: '🏫', desc: 'A single teacher and their roster.' },
  { id: 'SCHOOL', label: 'School', icon: '🏛️', desc: 'Multiple classrooms under one admin.' },
  { id: 'DISTRICT', label: 'District', icon: '🗂️', desc: 'Many schools; OneRoster/Ed-Fi sync + cohort analytics.' },
  { id: 'PRIVATE', label: 'Private School', icon: '🎓', desc: 'Independent school with its own framework choices.' },
  { id: 'RELIGIOUS', label: 'Religious School', icon: '✝️', desc: 'Faith-based school with a curriculum overlay.' },
  { id: 'HOMESCHOOL', label: 'Homeschool', icon: '🏡', desc: 'Parent-as-teacher; the ledger is the records-of-instruction + a portable transcript.', native: true },
  { id: 'POD', label: 'Learning Pod', icon: '👨‍👩‍👧‍👦', desc: 'Multiple families, rotating parent-teachers; the ledger spans the pod.', native: true },
  { id: 'MICROSCHOOL', label: 'Micro-school', icon: '🌱', desc: 'A tiny independent school; pod infrastructure at slightly larger scale.', native: true },
  { id: 'UNIVERSITY', label: 'University / Lifelong', icon: '🎯', desc: 'The graduated learner carries the same ledger into higher ed and work.' },
];

export interface FrameworkOverlay {
  id: string; label: string; icon: string;
  mode: 'replace' | 'augment';     // replace the public standards, or layer alongside them
  baseFramework?: FrameworkId;     // public framework it builds on (for augment)
  desc: string;
}

export const FRAMEWORK_OVERLAYS: FrameworkOverlay[] = [
  { id: 'secular', label: 'Standard (Secular)', icon: '📘', mode: 'replace', baseFramework: 'CCSS_ELA', desc: 'Public standards as-is (Common Core / NGSS / your selected framework).' },
  { id: 'catholic', label: 'Catholic', icon: '✝️', mode: 'augment', baseFramework: 'CCSS_ELA', desc: 'Public academics + a religion/faith-formation strand layered alongside.' },
  { id: 'christian', label: 'Christian', icon: '✝️', mode: 'augment', baseFramework: 'CCSS_ELA', desc: 'Public academics + Bible/worldview strand (works with Plajah Worship/Chora).' },
  { id: 'islamic', label: 'Islamic', icon: '☪️', mode: 'augment', baseFramework: 'CCSS_ELA', desc: 'Public academics + Quran/Islamic studies strand layered alongside.' },
  { id: 'montessori', label: 'Montessori', icon: '🧩', mode: 'replace', desc: 'Montessori scope & sequence (practical life, sensorial, multi-age) in place of grade bands.' },
  { id: 'classical', label: 'Classical', icon: '🏺', mode: 'augment', baseFramework: 'CCSS_ELA', desc: 'Trivium stages (grammar/logic/rhetoric) + Latin & great-books emphasis.' },
  { id: 'charlotte-mason', label: 'Charlotte Mason', icon: '🌿', mode: 'augment', baseFramework: 'CCSS_ELA', desc: 'Living books, narration, nature study — mapped to standards for record-keeping.' },
];

export interface LearningContextSettings {
  orgType: OrgType;
  overlayId: string;
  framework: FrameworkId;
}

export const DEFAULT_CONTEXT: LearningContextSettings = { orgType: 'CLASSROOM', overlayId: 'secular', framework: 'CCSS_ELA' };

export const orgTypeById = (id: OrgType) => ORG_TYPES.find(o => o.id === id);
export const overlayById = (id: string) => FRAMEWORK_OVERLAYS.find(o => o.id === id);
