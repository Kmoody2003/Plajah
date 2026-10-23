// churchEducationService — Sunday school, Bible study and discipleship programs for Elevate churches.
// A program is a week-by-week plan whose weeks point at Verse passages and Sacred Library readings,
// plus Academia courses, a dedicated Classroom Chat Room, and an Academia Classroom (roster, assignments,
// paper worksheet scanner, and Tela lesson builder).
import { opsDb, auth } from './firebase';
import { doc, collection, setDoc, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import { parseRef, refId, formatRef } from './scriptureRef';
import { createChurchClass } from './churchConsoleService';
import { classChatRoomId } from './orgChatService';
import type { Organization } from '../types';
import { isDemoOrg } from './elevateTruth';

export type ProgramKind = 'sunday-school' | 'bible-study' | 'youth' | 'adult' | 'confirmation' | 'vbs' | 'discipleship';
export interface PlanWeek {
  id: string;
  title: string;
  passage: string;
  refId?: string;
  note: string;
  library?: string;
  worksheetPrompt?: string;
}

export interface ClassChatMessage {
  id: string;
  senderName: string;
  senderRole: 'INSTRUCTOR' | 'STUDENT' | 'CATECHIST' | 'PASTOR';
  text: string;
  createdAt: number;
  attachmentLabel?: string;
}

export interface ChurchProgram {
  id: string;
  orgId: string;
  name: string;
  kind: ProgramKind;
  ageBand: string;
  description: string;
  meetingSchedule?: string;
  leadInstructor?: string;
  courseIds: string[];
  weeks: PlanWeek[];
  classroomId?: string;
  chatRoomId: string;
  chatMessages?: ClassChatMessage[];
  createdBy: string;
  createdAt: number;
}

export const KIND_LABEL: Record<ProgramKind, string> = {
  'sunday-school': 'Sunday school',
  'bible-study': 'Bible study',
  youth: 'Youth group',
  adult: 'Adult formation',
  confirmation: 'Confirmation / catechesis',
  vbs: 'Vacation Bible school',
  discipleship: 'Discipleship & ministry formation',
};

/** Resolve a typed passage ("Luke 15:11-32") to a Lectio ref id, or undefined when it does not parse. */
export const resolvePassage = (raw: string): { refId?: string; display?: string } => {
  const r = parseRef(raw.trim());
  return r ? { refId: refId(r), display: formatRef(r) } : {};
};

const wk = (title: string, passage: string, note: string, library?: string, worksheetPrompt?: string): Omit<PlanWeek, 'id'> => ({
  title,
  passage,
  note,
  library,
  worksheetPrompt,
});

/**
 * 7 classroom templates for Church Christian Education, wired to Verse, Sacred Library & Academia.
 * The named instructors, schedules and opening chat are sample content for the demo church only;
 * a real church that starts from a template gets the syllabus without them.
 */
export const STARTERS: Array<{
  id: string;
  name: string;
  kind: ProgramKind;
  ageBand: string;
  meetingSchedule: string;
  leadInstructor: string;
  description: string;
  courseIds: string[];
  weeks: Array<Omit<PlanWeek, 'id'>>;
  initialChat: Array<Omit<ClassChatMessage, 'id' | 'createdAt'>>;
}> = [
  {
    id: 'stories-of-jesus',
    name: 'Stories & Parables of Jesus (Children’s Sunday School)',
    kind: 'sunday-school',
    ageBand: 'Ages 5–10',
    meetingSchedule: 'Sundays · 9:15 AM · Children’s Chapel B-101',
    leadInstructor: 'Deaconess Sarah Vance & Primary Catechists',
    description: 'Twelve weeks through the parables Jesus told and the miracles He performed, with printable & fillable Academia worksheets.',
    courseIds: [],
    initialChat: [
      {
        senderName: 'Deaconess Sarah Vance',
        senderRole: 'INSTRUCTOR',
        text: 'Welcome parents and Sunday School teachers! This week we are reading Luke 15:11-32 (The Prodigal Father). The illustrated memory-verse worksheet is attached in the Academia tab.',
        attachmentLabel: 'Worksheet: Luke 15 Parable Map (Fillable)',
      },
      {
        senderName: 'Marcus Vance',
        senderRole: 'STUDENT',
        text: 'Thank you! Naomi practiced Psalm 23 and finished her drawing activity sheet.',
      },
    ],
    weeks: [
      wk('A baby in Bethlehem', 'Luke 2:1-20', 'Read it aloud, then act out the shepherds.', undefined, 'Draw the shepherds hearing the angels in the field and write the glory verse.'),
      wk('The good neighbour', 'Luke 10:25-37', 'Who is my neighbour? Talk about helping someone different from you.', undefined, 'List 3 ways we can be a Good Samaritan at school this week.'),
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
    ],
  },
  {
    id: 'old-testament-heroes',
    name: 'Junior Bible Explorers: Creation to the Prophets',
    kind: 'sunday-school',
    ageBand: 'Ages 6–11',
    meetingSchedule: 'Sundays · 9:15 AM · Classroom B-104',
    leadInstructor: 'Elder David Okafor',
    description: 'Creation, Covenant, Exodus, Davidic Psalms, and the Prophets — one narrative arc at a time with interactive timeline maps.',
    courseIds: [],
    initialChat: [
      {
        senderName: 'Elder David Okafor',
        senderRole: 'INSTRUCTOR',
        text: 'Class reminder: Bring your Old Testament covenant timeline notebooks on Sunday as we study Exodus 14.',
      },
    ],
    weeks: [
      wk('In the beginning', 'Genesis 1:1-2:3', 'Seven days of creation; what do we notice in the order?'),
      wk('Noah and the flood', 'Genesis 6:9-9:17', 'The rainbow as a promise.'),
      wk('Abraham and Sarah', 'Genesis 12:1-9', 'Following a call into the unknown.'),
      wk('Joseph forgives', 'Genesis 45:1-15', 'Choosing forgiveness.'),
      wk('Crossing the sea', 'Exodus 14:10-31', 'Fear and rescue.'),
      wk('The Ten Commandments', 'Exodus 20:1-17', 'Rules that protect love.'),
      wk('David and Goliath', '1 Samuel 17:32-50', 'Courage is more than size.'),
      wk('Daniel and the lions', 'Daniel 6:1-23', 'Staying faithful under pressure.'),
      wk('Jonah', 'Jonah 1:1-4:11', 'Running away, and mercy.'),
    ],
  },
  {
    id: 'youth-confirmation-catechism',
    name: 'Youth & Confirmation Catechism: Creeds, Sacraments & Faith',
    kind: 'confirmation',
    ageBand: 'Ages 12–18 (Middle & High School)',
    meetingSchedule: 'Sundays · 4:30 PM · Upper Room Youth Loft',
    leadInstructor: 'Pastor Elena Rostova & Youth Catechists',
    description: 'Preparation for Confirmation and mature discipleship: the Apostles’ & Nicene Creeds, the Lord’s Prayer, the Ten Commandments, and Christian apologetics.',
    courseIds: ['world-religions'],
    initialChat: [
      {
        senderName: 'Pastor Elena Rostova',
        senderRole: 'PASTOR',
        text: 'Confirmands: Please open the Nicene Creed plate in Verse Council Plates before Sunday’s seminar on John 1:1-18 and Council of Nicaea (325 AD).',
        attachmentLabel: 'Verse Plate: Patristic Folio (Nicaea 325 AD)',
      },
    ],
    weeks: [
      wk('The Word Made Flesh & The Nicene Creed', 'John 1:1-18', 'Compare John’s Prologue with the Nicene Creed in the Sacred Library.', 'Creeds & Confessions'),
      wk('Creator of Heaven and Earth', 'Genesis 1:26-31', 'Imago Dei, human dignity, and stewardship of creation.'),
      wk('Cross, Resurrection & Justification', 'Romans 5:1-11', 'Why the Cross is the hinge of human history.'),
      wk('The Holy Spirit & The Church Catholic', 'Acts 2:1-47', 'Pentecost, spiritual gifts, and the communion of saints.'),
      wk('Baptism & The Lord’s Supper', '1 Corinthians 11:23-26', 'Sacramental life and covenant remembrance.'),
      wk('The Ten Commandments & Beatitudes', 'Matthew 5:1-16', 'Interior transformation vs. external legalism.'),
    ],
  },
  {
    id: 'foundations-adult',
    name: 'Adult Foundations: Scripture, Patristics & Early Church',
    kind: 'adult',
    ageBand: 'Adults',
    meetingSchedule: 'Sundays · 9:15 AM · Sanctuary Lecture Hall A',
    leadInstructor: 'Rev. Dr. Nathaniel Sterling',
    description: 'An eight-week seminar pairing New Testament exegesis with the Apostolic Fathers, Desert Mothers & Fathers, and historic liturgy.',
    courseIds: ['world-religions'],
    initialChat: [
      {
        senderName: 'Rev. Dr. Nathaniel Sterling',
        senderRole: 'PASTOR',
        text: 'Welcome to Adult Foundations! Our syllabus links each week’s Scripture directly to Verse and the 12 Sacred Text Plates in Lorea.',
      },
    ],
    weeks: [
      wk('Who is Jesus?', 'John 1:1-18', 'Prologue; compare with a Gospel opening in the Sacred Library.', 'Primary texts: the Gospels'),
      wk('Grace', 'Ephesians 2:1-10', 'What does it mean that salvation is a gift?'),
      wk('Prayer', 'Matthew 6:5-15', 'The Lord’s Prayer; compare with historic prayers in the Sacred Library.', 'Prayers and hymns'),
      wk('Love', '1 Corinthians 13:1-13', 'What love looks like in practice.'),
      wk('The Spirit', 'Acts 2:1-21', 'Pentecost and the early community.'),
      wk('Community', 'Acts 2:42-47', 'What the first believers shared.'),
      wk('Hope', 'Romans 8:18-39', 'Suffering and hope.'),
      wk('Sent', 'Matthew 28:16-20', 'The Great Commission.'),
    ],
  },
  {
    id: 'wednesday-inductive-scripture-lab',
    name: 'Wednesday Inductive Scripture & Hermeneutics Lab',
    kind: 'bible-study',
    ageBand: 'Adults & Young Adults',
    meetingSchedule: 'Wednesdays · 7:00 PM · Fellowship Commons & Live Stream',
    leadInstructor: 'Minister Caleb Vance',
    description: 'Verse-by-verse Observation, Interpretation, and Application lab using Tela study sheets and scanned paper observation guides.',
    courseIds: [],
    initialChat: [
      {
        senderName: 'Minister Caleb Vance',
        senderRole: 'INSTRUCTOR',
        text: 'Tonight we are marking repeated transition words in Romans 8. You can scan your handwritten paper observation sheet directly into the classroom using the Paper Worksheet Scanner!',
      },
    ],
    weeks: [
      wk('No Condemnation in Christ', 'Romans 8:1-11', 'Circle every occurrence of "Spirit" vs. "flesh" in verses 1–11.'),
      wk('Adoption as Sons & Heirs', 'Romans 8:12-17', 'Trace the Roman and Hebrew legal background of adoption.'),
      wk('Groaning Creation & Future Glory', 'Romans 8:18-25', 'How cosmic redemption shapes Christian endurance.'),
      wk('More Than Conquerors', 'Romans 8:26-39', 'Intercession of the Spirit and the unbreakable love of God.'),
    ],
  },
  {
    id: 'baptism-new-members-covenant',
    name: 'Baptismal Preparation & Covenant Membership Class',
    kind: 'discipleship',
    ageBand: 'New Believers & Catechumens',
    meetingSchedule: 'First & Third Sundays · 12:45 PM · Fireside Study',
    leadInstructor: 'Senior Pastoral & Diaconate Team',
    description: 'Four-session onboarding into water baptism, church covenant, spiritual gifts discovery, and ministry department placement.',
    courseIds: [],
    initialChat: [
      {
        senderName: 'Deaconess Hannah Okafor',
        senderRole: 'CATECHIST',
        text: 'Excited for Baptismal Sunday! Please complete your testimony reflection in Tela or upload your paper spiritual-gifts worksheet here.',
      },
    ],
    weeks: [
      wk('Dying and Rising with Christ in Baptism', 'Romans 6:1-11', 'The biblical theology and ancient catechumenate practice of baptism.'),
      wk('The Local Body & One Another Ministries', '1 Corinthians 12:12-27', 'Discovering your spiritual gifts and joining a church department.'),
      wk('Stewardship, Family Discipleship & Prayer Rule', 'Acts 2:42-47', 'Building a household rhythm of Scripture, table fellowship, and generosity.'),
      wk('Commissioning & Testimony', 'Matthew 28:18-20', 'Sharing your story of grace before the congregation.'),
    ],
  },
  {
    id: 'sacred-music-liturgical-worship',
    name: 'Sacred Music, Hymnology & Liturgical Worship Formation',
    kind: 'discipleship',
    ageBand: 'Worship Teams, Choir, Band & Congregation',
    meetingSchedule: 'Thursdays · 6:30 PM · Choir Room & Chora Studio',
    leadInstructor: 'Minister of Music & Worship Arts Director',
    description: 'Biblical foundations of psalmody, historic hymnody, Gospel music heritage, sight-singing SATB scores, and songwriting in Chora Studio.',
    courseIds: [],
    initialChat: [
      {
        senderName: 'Worship Arts Director',
        senderRole: 'INSTRUCTOR',
        text: 'All Worship Team, Band, and Choir members: We are studying the history and SATB harmonic voicing of "Be Thou My Vision" (SLANE) and "His Eye Is on the Sparrow" in the Chora Song Scratchpad!',
        attachmentLabel: 'Chora Studio Score: SLANE (D Major SATB)',
      },
    ],
    weeks: [
      wk('Davidic Tabernacle & Temple Psalmody', '1 Chronicles 25:1-8', 'How Asaph, Heman, and Jeduthun organized prophetic sanctuary music.'),
      wk('Singing Psalms, Hymns & Spiritual Songs', 'Colossians 3:16-17', 'Word-centered worship and congregational singing as mutual teaching.'),
      wk('The Great Hymns & African American Spirituals', 'Psalm 40:1-3', 'From Ambrose and Luther to Fanny Crosby, Wallace Willis, and Charles A. Tindley.', 'Public-Domain Hymnal & Gospel Archive'),
      wk('Writing New Songs for the Sanctuary', 'Psalm 96:1-9', 'Lyric meter, scansion, and theological depth in the Chora Songwriting Scratchpad.'),
    ],
  },
];

const LOCAL_PROGRAMS_KEY = (orgId: string) => `plajah_church_programs_v2_${orgId}`;

function readLocalPrograms(orgId: string): ChurchProgram[] {
  try {
    const raw = localStorage.getItem(LOCAL_PROGRAMS_KEY(orgId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalPrograms(orgId: string, list: ChurchProgram[]): void {
  try {
    localStorage.setItem(LOCAL_PROGRAMS_KEY(orgId), JSON.stringify(list));
  } catch {
    // ignore storage quota errors
  }
}

const col = () => collection(opsDb, 'churchPrograms');

export async function listPrograms(orgId: string): Promise<ChurchProgram[]> {
  const local = readLocalPrograms(orgId);
  try {
    const snap = await getDocs(query(col(), where('orgId', '==', orgId)));
    const remote = snap.docs.map(d => d.data() as ChurchProgram);
    const byId = new Map<string, ChurchProgram>();
    for (const p of local) byId.set(p.id, p);
    for (const p of remote) byId.set(p.id, p);
    const merged = Array.from(byId.values()).sort((a, b) => a.createdAt - b.createdAt);
    if (merged.length > 0) writeLocalPrograms(orgId, merged);
    return merged;
  } catch {
    return local.sort((a, b) => a.createdAt - b.createdAt);
  }
}

export async function saveProgram(p: ChurchProgram): Promise<void> {
  const weeks = p.weeks.map(w => {
    const r = resolvePassage(w.passage);
    const o: PlanWeek = { id: w.id, title: w.title, passage: w.passage, note: w.note };
    if (r.refId) o.refId = r.refId;
    if (w.library) o.library = w.library;
    if (w.worksheetPrompt) o.worksheetPrompt = w.worksheetPrompt;
    return o;
  });
  const normalized: ChurchProgram = {
    ...p,
    chatRoomId: p.chatRoomId || classChatRoomId(p.orgId, p.id),
    weeks,
    courseIds: p.courseIds || [],
    chatMessages: p.chatMessages || [],
  };

  // Persist locally first so UI is immediate and resilient
  const current = readLocalPrograms(p.orgId).filter(x => x.id !== normalized.id);
  writeLocalPrograms(p.orgId, [...current, normalized]);

  try {
    await setDoc(doc(opsDb, 'churchPrograms', normalized.id), normalized);
  } catch {
    // Offline or demo org fallback already saved in localStorage
  }
}

export async function deleteProgram(id: string, orgId?: string): Promise<void> {
  if (orgId) {
    const remaining = readLocalPrograms(orgId).filter(x => x.id !== id);
    writeLocalPrograms(orgId, remaining);
  }
  try {
    await deleteDoc(doc(opsDb, 'churchPrograms', id));
  } catch {
    // ignore
  }
}

export function newProgram(church: Organization, partial: Partial<ChurchProgram> & { name: string }): ChurchProgram {
  const id = partial.id || `${church.id}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    orgId: church.id,
    kind: 'sunday-school',
    ageBand: '',
    description: '',
    courseIds: [],
    weeks: [],
    chatRoomId: classChatRoomId(church.id, id),
    chatMessages: [
      {
        id: `msg_${Date.now()}`,
        senderName: church.name || 'Christian Education Lead',
        senderRole: 'INSTRUCTOR',
        text: `Welcome to the ${partial.name} classroom chat! Syllabus readings, Academia worksheets, and Verse passages will be posted here.`,
        createdAt: Date.now(),
      },
    ],
    createdBy: auth.currentUser?.uid || 'elevate-catechist',
    createdAt: Date.now(),
    ...partial,
  } as ChurchProgram;
}

export function fromStarter(church: Organization, starterId: string, indexOffset = 0): ChurchProgram {
  const s = STARTERS.find(x => x.id === starterId) || STARTERS[0];
  const demo = isDemoOrg(church);
  // The demo church keeps one deterministic copy per template; a real church may start the same
  // template more than once, so each copy gets its own id.
  const id = demo
    ? `${church.id}_starter_${s.id}`
    : `${church.id}_tpl_${s.id}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const now = Date.now() + indexOffset;
  return newProgram(church, {
    id,
    name: s.name,
    kind: s.kind,
    ageBand: s.ageBand,
    // Sample instructors, rooms and chat messages are demo-only.
    meetingSchedule: demo ? s.meetingSchedule : '',
    leadInstructor: demo ? s.leadInstructor : '',
    description: s.description,
    courseIds: [...s.courseIds],
    classroomId: `acad_class_${church.id}_${s.id}`,
    chatRoomId: classChatRoomId(church.id, id),
    ...(demo
      ? {
          chatMessages: s.initialChat.map((m, idx) => ({
            ...m,
            id: `seed_msg_${s.id}_${idx}`,
            createdAt: now - (s.initialChat.length - idx) * 3600_000,
          })),
        }
      : {}),
    weeks: s.weeks.map((w, i) => {
      const r = resolvePassage(w.passage);
      return {
        id: `w${i + 1}`,
        ...w,
        ...(r.refId ? { refId: r.refId } : {}),
      };
    }),
    createdAt: now,
  });
}

/**
 * Earlier builds auto-provisioned every church with all seven templates, including sample
 * instructors, rooms and chat. For a real church, drop the copies nobody touched and strip the
 * sample people/chat from any copy that was edited.
 */
function stripSeededStarterPrograms(church: Organization, list: ChurchProgram[]): ChurchProgram[] {
  const out: ChurchProgram[] = [];
  for (const p of list) {
    const starter = STARTERS.find(s => p.id === `${church.id}_starter_${s.id}`);
    if (!starter) {
      out.push(p);
      continue;
    }
    const chat = p.chatMessages || [];
    const ownChat = chat.filter(m => !m.id.startsWith('seed_msg_'));
    const untouched =
      ownChat.length === 0 &&
      p.name === starter.name &&
      p.description === starter.description &&
      (p.weeks || []).length === starter.weeks.length &&
      (p.leadInstructor || '') === starter.leadInstructor &&
      (p.meetingSchedule || '') === starter.meetingSchedule;
    if (untouched) continue;
    out.push({
      ...p,
      leadInstructor: p.leadInstructor === starter.leadInstructor ? '' : p.leadInstructor,
      meetingSchedule: p.meetingSchedule === starter.meetingSchedule ? '' : p.meetingSchedule,
      chatMessages: ownChat,
    });
  }
  return out;
}

/**
 * Loads a church's Christian Education classrooms. The demo church is provisioned with all seven
 * templated classrooms (sample content); a real church sees only the classrooms it created.
 */
export async function ensureDefaultTemplatedClassrooms(church: Organization): Promise<ChurchProgram[]> {
  const demo = isDemoOrg(church);
  const listed = await listPrograms(church.id);
  const existing = demo ? listed : stripSeededStarterPrograms(church, listed);
  if (!demo) {
    // Delete untouched sample classrooms that older builds saved for this church (staff only; rules
    // refuse anyone else, and the copies are already hidden for them).
    const kept = new Set(existing.map(p => p.id));
    for (const p of listed) {
      if (!kept.has(p.id)) deleteDoc(doc(opsDb, 'churchPrograms', p.id)).catch(() => { /* not permitted / offline */ });
    }
  }
  if (existing.length > 0 || !demo) {
    // Ensure every existing program has a chatRoomId and classroomId
    const upgraded = existing.map(p => ({
      ...p,
      chatRoomId: p.chatRoomId || classChatRoomId(church.id, p.id),
      classroomId: p.classroomId || `acad_class_${p.id}`,
    }));
    writeLocalPrograms(church.id, upgraded);
    return upgraded;
  }

  const seeded = STARTERS.map((s, idx) => fromStarter(church, s.id, idx * 100));
  writeLocalPrograms(church.id, seeded);
  for (const prog of seeded) {
    try {
      await setDoc(doc(opsDb, 'churchPrograms', prog.id), prog);
    } catch {
      // ignore if offline / demo church
    }
  }
  return seeded;
}

/** Append a message to a classroom's dedicated chat room. */
export async function postClassChatMessage(
  program: ChurchProgram,
  msg: Omit<ClassChatMessage, 'id' | 'createdAt'>
): Promise<ChurchProgram> {
  const entry: ClassChatMessage = {
    ...msg,
    id: `cmsg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
  };
  const updated: ChurchProgram = {
    ...program,
    chatMessages: [...(program.chatMessages || []), entry],
  };
  await saveProgram(updated);
  return updated;
}

/** Attach a live Academia classroom (roster, assignments, gradebook records) to a program. */
export async function attachClassroom(church: Organization, p: ChurchProgram): Promise<ChurchProgram> {
  try {
    const room = await createChurchClass(church, { title: p.name, description: p.description });
    const classroomId = room?.id || room?.classroomId || `acad_class_${p.id}`;
    const next = { ...p, classroomId };
    await saveProgram(next);
    return next;
  } catch {
    const fallbackId = `acad_class_${p.id}`;
    const next = { ...p, classroomId: fallbackId };
    await saveProgram(next);
    return next;
  }
}

