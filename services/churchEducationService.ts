// churchEducationService — Sunday school, Bible study and discipleship programs for Elevate churches.
// A program is a week-by-week plan whose weeks point at Lectio passages and Sacred Library readings,
// plus Academia courses, and (optionally) a classroom that holds the roster, assignments and records.
import { db, auth } from './firebase';
import { doc, collection, setDoc, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import { parseRef, refId, formatRef } from './scriptureRef';
import { createChurchClass } from './churchConsoleService';
import type { Organization } from '../types';

export type ProgramKind = 'sunday-school' | 'bible-study' | 'youth' | 'adult' | 'confirmation' | 'vbs' | 'discipleship';
export interface PlanWeek { id: string; title: string; passage: string; refId?: string; note: string; library?: string }
export interface ChurchProgram {
  id: string; orgId: string; name: string; kind: ProgramKind; ageBand: string; description: string;
  courseIds: string[]; weeks: PlanWeek[]; classroomId?: string; createdBy: string; createdAt: number;
}

export const KIND_LABEL: Record<ProgramKind, string> = { 'sunday-school': 'Sunday school', 'bible-study': 'Bible study', youth: 'Youth group', adult: 'Adult formation', confirmation: 'Confirmation / catechesis', vbs: 'Vacation Bible school', discipleship: 'Discipleship' };

/** Resolve a typed passage ("Luke 15:11-32") to a Lectio ref id, or undefined when it does not parse. */
export const resolvePassage = (raw: string): { refId?: string; display?: string } => {
  const r = parseRef(raw.trim()); return r ? { refId: refId(r), display: formatRef(r) } : {};
};

const wk = (title: string, passage: string, note: string, library?: string): Omit<PlanWeek, 'id'> => ({ title, passage, note, library });

/** Starter plans. Passages are standard, well-known readings; every one is parsed by Lectio before use. */
export const STARTERS: Array<{ id: string; name: string; kind: ProgramKind; ageBand: string; description: string; courseIds: string[]; weeks: Array<Omit<PlanWeek, 'id'>> }> = [
  { id: 'stories-of-jesus', name: 'Stories of Jesus', kind: 'sunday-school', ageBand: 'Ages 5-10', description: 'Twelve weeks through the stories Jesus told and the things he did.', courseIds: [], weeks: [
    wk('A baby in Bethlehem', 'Luke 2:1-20', 'Read it aloud, then act out the shepherds.'),
    wk('The good neighbour', 'Luke 10:25-37', 'Who is my neighbour? Talk about helping someone different from you.'),
    wk('The lost sheep', 'Luke 15:1-7', 'What does it feel like to be found?'),
    wk('The loving father', 'Luke 15:11-32', 'Two brothers, one father. Who are you in the story?'),
    wk('Blessed are...', 'Matthew 5:1-12', 'The Beatitudes in kid language.'),
    wk('Five loaves and two fish', 'Matthew 14:13-21', 'Share a snack; what happens when we share?'),
    wk('Jesus calms the storm', 'Mark 4:35-41', 'Talk about being afraid and being brave.'),
    wk('The sower', 'Mark 4:1-9', 'Plant seeds in cups together.'),
    wk('Jesus welcomes children', 'Mark 10:13-16', 'A story about being welcome.'),
    wk('Zacchaeus', 'Luke 19:1-10', 'Changing your mind and making things right.'),
    wk('Easter morning', 'Matthew 28:1-10', 'The empty tomb.'),
    wk('The Lord is my shepherd', 'Psalm 23', 'Learn the psalm together.'),
  ] },
  { id: 'old-testament-heroes', name: 'Stories from the Old Testament', kind: 'sunday-school', ageBand: 'Ages 6-11', description: 'Creation to the prophets, one story at a time.', courseIds: [], weeks: [
    wk('In the beginning', 'Genesis 1:1-2:3', 'Seven days of creation; what do we notice in the order?'),
    wk('Noah and the flood', 'Genesis 6:9-9:17', 'The rainbow as a promise.'),
    wk('Abraham and Sarah', 'Genesis 12:1-9', 'Following a call into the unknown.'),
    wk('Joseph forgives', 'Genesis 45:1-15', 'Choosing forgiveness.'),
    wk('Crossing the sea', 'Exodus 14:10-31', 'Fear and rescue.'),
    wk('The Ten Commandments', 'Exodus 20:1-17', 'Rules that protect love.'),
    wk('David and Goliath', '1 Samuel 17:32-50', 'Courage is more than size.'),
    wk('Daniel and the lions', 'Daniel 6:1-23', 'Staying faithful under pressure.'),
    wk('Jonah', 'Jonah 1:1-4:11', 'Running away, and mercy.'),
  ] },
  { id: 'foundations-adult', name: 'Foundations of Faith', kind: 'adult', ageBand: 'Adults', description: 'An eight-week discussion course with reading in Scripture, the early church and the Sacred Library.', courseIds: ['world-religions'], weeks: [
    wk('Who is Jesus?', 'John 1:1-18', 'Prologue; compare with a Gospel opening in the Sacred Library.', 'Primary texts: the Gospels'),
    wk('Grace', 'Ephesians 2:1-10', 'What does it mean that salvation is a gift?'),
    wk('Prayer', 'Matthew 6:5-15', 'The Lord’s Prayer; compare with historic prayers in the Sacred Library.', 'Prayers and hymns'),
    wk('Love', '1 Corinthians 13:1-13', 'What love looks like in practice.'),
    wk('The Spirit', 'Acts 2:1-21', 'Pentecost and the early community.'),
    wk('Community', 'Acts 2:42-47', 'What the first believers shared.'),
    wk('Hope', 'Romans 8:18-39', 'Suffering and hope.'),
    wk('Sent', 'Matthew 28:16-20', 'The Great Commission.'),
  ] },
];

const col = () => collection(db, 'churchPrograms');
export async function listPrograms(orgId: string): Promise<ChurchProgram[]> {
  const snap = await getDocs(query(col(), where('orgId', '==', orgId)));
  return snap.docs.map(d => d.data() as ChurchProgram).sort((a, b) => a.createdAt - b.createdAt);
}
export async function saveProgram(p: ChurchProgram): Promise<void> {
  const weeks = p.weeks.map(w => { const r = resolvePassage(w.passage); const o: PlanWeek = { id: w.id, title: w.title, passage: w.passage, note: w.note }; if (r.refId) o.refId = r.refId; if (w.library) o.library = w.library; return o; });
  await setDoc(doc(db, 'churchPrograms', p.id), { ...p, weeks, courseIds: p.courseIds || [] });
}
export const deleteProgram = (id: string) => deleteDoc(doc(db, 'churchPrograms', id));

export function newProgram(church: Organization, partial: Partial<ChurchProgram> & { name: string }): ChurchProgram {
  const id = `${church.id}_${Date.now().toString(36)}`;
  return { id, orgId: church.id, kind: 'sunday-school', ageBand: '', description: '', courseIds: [], weeks: [], createdBy: auth.currentUser?.uid || '', createdAt: Date.now(), ...partial } as ChurchProgram;
}
export function fromStarter(church: Organization, starterId: string): ChurchProgram {
  const s = STARTERS.find(x => x.id === starterId)!;
  return newProgram(church, { name: s.name, kind: s.kind, ageBand: s.ageBand, description: s.description, courseIds: [...s.courseIds], weeks: s.weeks.map((w, i) => ({ id: `w${i + 1}`, ...w })) });
}
/** Attach a classroom (roster, assignments, records) to a program. */
export async function attachClassroom(church: Organization, p: ChurchProgram): Promise<ChurchProgram> {
  const room = await createChurchClass(church, { title: p.name, description: p.description });
  const classroomId = room?.id || room?.classroomId || '';
  const next = { ...p, ...(classroomId ? { classroomId } : {}) };
  await saveProgram(next); return next;
}
