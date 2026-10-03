/**
 * Plajah Home × Academia Integration Service
 *
 * Deep integration between the Plajah Home smart home platform and
 * Plajah Academia (Classrooms). This bridges the gap between school
 * and home by turning the smart home into an educational companion.
 *
 * Key Features:
 * ─────────────
 * 1. TEACHER NOTES HOME — Teachers send notes from Classrooms that
 *    arrive as smart home notifications (visual + voice + display).
 *
 * 2. ASSIGNMENT AWARENESS — Aria knows what homework is due and can
 *    proactively remind, help study, and set up "Study Mode" scenes.
 *
 * 3. STUDY MODE INTEGRATION — When a student starts homework, Aria:
 *    · Dims entertainment lighting to warm study light
 *    · Lowers music volume or switches to focus playlist
 *    · Silences non-essential notifications
 *    · Sets display devices to show assignment/timer
 *    · Blocks distracting apps (parental controls)
 *
 * 4. VOICE HOMEWORK HELP — Linked to voice profiles, when a child
 *    asks "Hey Aria, help me with my math homework", she knows:
 *    · Which student is asking (voice profile)
 *    · What assignments they have (Academia data)
 *    · What level they're at (Learner Ledger)
 *    · How to guide without giving answers (pedagogical AI)
 *
 * 5. PROGRESS NOTIFICATIONS — Parents see real-time updates on
 *    smart displays: grades posted, assignments turned in, badges earned.
 *
 * 6. FAMILY STUDY DASHBOARD — Kitchen or living room displays show
 *    a family overview of all students' academic status.
 *
 * Data Flow:
 * ──────────
 *  Firestore: classrooms/{id}/notes_home/{noteId}
 *       ↓  onSnapshot
 *  Plajah Home Hub
 *       ↓
 *  Smart Home Actions:
 *    · Visual notification on displays
 *    · Aria voice announcement
 *    · Push notification to parent phones
 *    · Calendar event created
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type NoteHomeType =
  | 'general'            // General class note
  | 'assignment'         // New assignment posted
  | 'grade'              // Grade posted
  | 'behavior'           // Behavior report (positive or concern)
  | 'event'              // School event (field trip, parent-teacher conference)
  | 'reminder'           // Reminder (picture day, bring supplies, etc.)
  | 'achievement'        // Student earned a badge/achievement
  | 'attendance'         // Attendance notification
  | 'emergency';         // Urgent school communication

export type NotePriority = 'low' | 'normal' | 'high' | 'urgent';

export type NoteDeliveryMethod = 'silent' | 'visual' | 'voice' | 'all';

export interface TeacherNoteHome {
  id: string;
  classroomId: string;
  classroomName: string;
  teacherId: string;
  teacherName: string;
  teacherAvatarUrl?: string;

  // Targeting
  studentId?: string;             // Specific student, or null = entire class
  studentName?: string;
  parentIds: string[];            // Parent Plajah UIDs to notify

  // Content
  type: NoteHomeType;
  priority: NotePriority;
  title: string;
  body: string;
  attachmentUrls?: string[];      // PDFs, images, etc.

  // Assignment-specific
  assignmentId?: string;
  assignmentTitle?: string;
  dueDate?: number;               // Timestamp
  subject?: string;               // "Mathematics", "Science", etc.

  // Grade-specific
  grade?: string;                 // "A-", "92%", "4/5"
  gradeNumeric?: number;          // 0–100
  rubricUrl?: string;

  // Delivery
  deliveryMethod: NoteDeliveryMethod;
  readByParent: boolean;
  readAt?: number;
  acknowledgedAt?: number;        // Parent tapped "Got it"

  // Metadata
  createdAt: number;
  expiresAt?: number;             // Auto-dismiss after this time
}

export interface AcademiaStudentSnapshot {
  studentId: string;
  studentName: string;
  avatarUrl?: string;
  voiceProfileId?: string;        // Link to VoiceProfile for voice identification

  // Current status
  classrooms: {
    id: string;
    name: string;
    subject: string;
    teacherName: string;
    currentGrade?: string;        // Overall grade in class
    missingAssignments: number;
    upcomingDue: AssignmentPreview[];
  }[];

  // Learner Ledger stats
  totalPoints: number;
  streakDays: number;
  recentAchievements: string[];

  // Study session tracking
  todayStudyMinutes: number;
  weekStudyMinutes: number;
  isCurrentlyStudying: boolean;
  currentSubject?: string;
}

export interface AssignmentPreview {
  id: string;
  title: string;
  subject: string;
  dueDate: number;
  isOverdue: boolean;
  status: 'not-started' | 'in-progress' | 'submitted' | 'graded';
  grade?: string;
}

export interface StudyModeConfig {
  studentId: string;
  subject: string;
  durationMinutes: number;

  // Scene changes
  lightBrightness: number;        // Study-appropriate brightness (e.g. 80%)
  lightColorTemp: number;         // Warm white for reading (3200K)
  musicVolume: number;            // Low background (15%)
  musicPlaylist?: string;         // Focus/study playlist from Chora
  muteNotifications: boolean;
  blockEntertainment: boolean;    // Block games, social media on child devices

  // Display
  showTimerOnDisplay: boolean;
  showAssignmentOnDisplay: boolean;

  // Aria behavior
  ariaStudyMode: boolean;         // Aria responds in "tutor mode"
  ariaSubjectContext: string;     // e.g., "5th grade mathematics - fractions"
}

export interface FamilyStudyDashboard {
  students: AcademiaStudentSnapshot[];
  unreadNotes: TeacherNoteHome[];
  upcomingEvents: TeacherNoteHome[];
  todayAssignmentsDue: AssignmentPreview[];
  weekAssignmentsDue: AssignmentPreview[];
}

// ─── Smart Home Actions ──────────────────────────────────────────────────────

/**
 * Determine how a teacher note should be delivered in the smart home.
 */
export function getDeliveryAction(note: TeacherNoteHome): {
  announce: boolean;
  displayRooms: string[];
  notificationStyle: 'toast' | 'banner' | 'fullscreen' | 'ambient';
  ariaScript?: string;
} {
  switch (note.type) {
    case 'emergency':
      return {
        announce: true,
        displayRooms: ['all'],
        notificationStyle: 'fullscreen',
        ariaScript: `Urgent message from ${note.teacherName} at ${note.classroomName}: ${note.title}. ${note.body}`,
      };

    case 'grade':
      return {
        announce: note.priority === 'high',
        displayRooms: ['kitchen', 'living-room'],
        notificationStyle: 'banner',
        ariaScript: note.gradeNumeric && note.gradeNumeric >= 90
          ? `Great news! ${note.studentName} got ${note.grade} on their ${note.subject} ${note.assignmentTitle || 'assignment'}! Way to go!`
          : `${note.studentName} received ${note.grade} on their ${note.subject} ${note.assignmentTitle || 'assignment'}.`,
      };

    case 'assignment':
      return {
        announce: false,
        displayRooms: ['kitchen'],
        notificationStyle: 'toast',
        ariaScript: `New ${note.subject} assignment for ${note.studentName}: "${note.assignmentTitle}". Due ${note.dueDate ? formatDueDate(note.dueDate) : 'soon'}.`,
      };

    case 'achievement':
      return {
        announce: true,
        displayRooms: ['all'],
        notificationStyle: 'banner',
        ariaScript: `Congratulations ${note.studentName}! ${note.body}`,
      };

    case 'behavior':
      // Behavior notes go only to parent displays, not announced publicly
      return {
        announce: false,
        displayRooms: ['office'], // Parent's private space
        notificationStyle: 'toast',
      };

    case 'event':
    case 'reminder':
      return {
        announce: false,
        displayRooms: ['kitchen'],
        notificationStyle: 'toast',
        ariaScript: `Reminder from ${note.classroomName}: ${note.title}.`,
      };

    default:
      return {
        announce: false,
        displayRooms: ['kitchen'],
        notificationStyle: 'toast',
      };
  }
}

/**
 * Generate the Aria study-mode system prompt enrichment.
 * When a child is studying, Aria becomes a Socratic tutor.
 */
export function getAriaStudyModePrompt(
  student: AcademiaStudentSnapshot,
  config: StudyModeConfig,
): string {
  const assignment = student.classrooms
    .flatMap(c => c.upcomingDue)
    .find(a => a.subject.toLowerCase() === config.subject.toLowerCase() && a.status !== 'submitted');

  return [
    `STUDY MODE ACTIVE for ${student.studentName}.`,
    `Subject: ${config.subject} (${config.ariaSubjectContext}).`,
    assignment
      ? `Current assignment: "${assignment.title}" — due ${formatDueDate(assignment.dueDate)}.`
      : `No specific assignment; general study/practice session.`,
    '',
    'TEACHING RULES (strictly follow):',
    '1. NEVER give the answer directly. Use the Socratic method — ask guiding questions.',
    '2. Break complex problems into smaller steps.',
    '3. Celebrate effort and progress, not just correct answers.',
    '4. If the student is frustrated, suggest a 5-minute break or switch to an easier warm-up problem.',
    '5. Use age-appropriate language and examples.',
    '6. Reference their Plajah Learner Ledger progress to encourage them.',
    `7. They have ${student.totalPoints} points and a ${student.streakDays}-day streak — acknowledge this.`,
    '8. After 25 minutes of focused study, suggest a Pomodoro break.',
    '9. When the session ends, summarise what they practiced and suggest next steps.',
    '',
    'You may use the smart home to support studying:',
    '- Adjust desk lamp brightness if they mention it\'s too bright/dark.',
    '- Play focus music from Chora if they want background sound.',
    '- Set timers for practice problems.',
    '- Show diagrams or visual aids on nearby smart displays.',
  ].join('\n');
}

/**
 * Generate proactive Aria reminders based on assignment due dates.
 * Called periodically to check what needs prompting.
 */
export function generateAssignmentReminders(
  students: AcademiaStudentSnapshot[],
  currentTime: number = Date.now(),
): { studentName: string; message: string; urgency: 'gentle' | 'firm' | 'urgent' }[] {
  const reminders: { studentName: string; message: string; urgency: 'gentle' | 'firm' | 'urgent' }[] = [];
  const ONE_HOUR = 3_600_000;
  const ONE_DAY = 86_400_000;

  for (const student of students) {
    for (const classroom of student.classrooms) {
      for (const assignment of classroom.upcomingDue) {
        if (assignment.status === 'submitted' || assignment.status === 'graded') continue;

        const timeUntilDue = assignment.dueDate - currentTime;

        if (timeUntilDue < 0) {
          // Overdue
          reminders.push({
            studentName: student.studentName,
            message: `${student.studentName}, your ${assignment.subject} assignment "${assignment.title}" was due ${formatDueDate(assignment.dueDate)}. Would you like to work on it now?`,
            urgency: 'urgent',
          });
        } else if (timeUntilDue < ONE_HOUR * 4) {
          // Due in less than 4 hours
          reminders.push({
            studentName: student.studentName,
            message: `${student.studentName}, your ${assignment.subject} assignment "${assignment.title}" is due in ${Math.ceil(timeUntilDue / ONE_HOUR)} hours. Want me to set up Study Mode?`,
            urgency: 'firm',
          });
        } else if (timeUntilDue < ONE_DAY && assignment.status === 'not-started') {
          // Due tomorrow and not started
          reminders.push({
            studentName: student.studentName,
            message: `Hey ${student.studentName}, just a heads up — "${assignment.title}" for ${assignment.subject} is due tomorrow and you haven't started yet. No rush, but want to get it going?`,
            urgency: 'gentle',
          });
        }
      }
    }
  }

  return reminders;
}

/**
 * Build the Family Study Dashboard data for kitchen/living room displays.
 */
export function buildFamilyDashboard(
  students: AcademiaStudentSnapshot[],
  notes: TeacherNoteHome[],
): FamilyStudyDashboard {
  const now = Date.now();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const endOfWeek = new Date();
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
  endOfWeek.setHours(23, 59, 59, 999);

  const allAssignments = students.flatMap(s =>
    s.classrooms.flatMap(c => c.upcomingDue)
  );

  return {
    students,
    unreadNotes: notes.filter(n => !n.readByParent),
    upcomingEvents: notes.filter(n => n.type === 'event' && n.dueDate && n.dueDate > now),
    todayAssignmentsDue: allAssignments.filter(a =>
      a.dueDate <= endOfToday.getTime() && a.status !== 'submitted' && a.status !== 'graded'
    ),
    weekAssignmentsDue: allAssignments.filter(a =>
      a.dueDate <= endOfWeek.getTime() && a.status !== 'submitted' && a.status !== 'graded'
    ),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDueDate(timestamp: number): string {
  const now = Date.now();
  const diff = timestamp - now;
  const ONE_HOUR = 3_600_000;
  const ONE_DAY = 86_400_000;

  if (diff < 0) {
    const absDiff = Math.abs(diff);
    if (absDiff < ONE_HOUR) return `${Math.ceil(absDiff / 60_000)} minutes ago`;
    if (absDiff < ONE_DAY) return `${Math.ceil(absDiff / ONE_HOUR)} hours ago`;
    return `${Math.ceil(absDiff / ONE_DAY)} days ago`;
  }
  if (diff < ONE_HOUR) return `in ${Math.ceil(diff / 60_000)} minutes`;
  if (diff < ONE_DAY) return `in ${Math.ceil(diff / ONE_HOUR)} hours`;
  if (diff < ONE_DAY * 2) return 'tomorrow';
  return `in ${Math.ceil(diff / ONE_DAY)} days`;
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

export const MOCK_STUDENT_SNAPSHOT: AcademiaStudentSnapshot = {
  studentId: 'student-junior-001',
  studentName: 'Junior',
  voiceProfileId: 'vp-child1',
  classrooms: [
    {
      id: 'classroom-math-5th',
      name: '5th Grade Mathematics',
      subject: 'Mathematics',
      teacherName: 'Ms. Rodriguez',
      currentGrade: 'B+',
      missingAssignments: 0,
      upcomingDue: [
        {
          id: 'a-fractions',
          title: 'Fraction Operations Worksheet',
          subject: 'Mathematics',
          dueDate: Date.now() + 86_400_000,  // Due tomorrow
          isOverdue: false,
          status: 'in-progress',
        },
        {
          id: 'a-geometry',
          title: 'Geometry: Area & Perimeter',
          subject: 'Mathematics',
          dueDate: Date.now() + 86_400_000 * 3,
          isOverdue: false,
          status: 'not-started',
        },
      ],
    },
    {
      id: 'classroom-science-5th',
      name: '5th Grade Science',
      subject: 'Science',
      teacherName: 'Mr. Chen',
      currentGrade: 'A-',
      missingAssignments: 0,
      upcomingDue: [
        {
          id: 'a-ecosystem',
          title: 'Ecosystem Observation Journal',
          subject: 'Science',
          dueDate: Date.now() + 86_400_000 * 5,
          isOverdue: false,
          status: 'in-progress',
        },
      ],
    },
  ],
  totalPoints: 2_340,
  streakDays: 12,
  recentAchievements: ['Fraction Master 🏆', '10-Day Streak 🔥', 'Science Explorer 🔬'],
  todayStudyMinutes: 25,
  weekStudyMinutes: 145,
  isCurrentlyStudying: false,
};

export const MOCK_TEACHER_NOTES: TeacherNoteHome[] = [
  {
    id: 'note-1',
    classroomId: 'classroom-math-5th',
    classroomName: '5th Grade Mathematics',
    teacherId: 'teacher-rodriguez',
    teacherName: 'Ms. Rodriguez',
    studentId: 'student-junior-001',
    studentName: 'Junior',
    parentIds: ['owner-uid'],
    type: 'assignment',
    priority: 'normal',
    title: 'New Math Assignment',
    body: 'Fraction Operations Worksheet has been posted. Please ensure your child completes it by tomorrow.',
    assignmentId: 'a-fractions',
    assignmentTitle: 'Fraction Operations Worksheet',
    dueDate: Date.now() + 86_400_000,
    subject: 'Mathematics',
    deliveryMethod: 'all',
    readByParent: false,
    createdAt: Date.now() - 3_600_000,
  },
  {
    id: 'note-2',
    classroomId: 'classroom-science-5th',
    classroomName: '5th Grade Science',
    teacherId: 'teacher-chen',
    teacherName: 'Mr. Chen',
    studentId: 'student-junior-001',
    studentName: 'Junior',
    parentIds: ['owner-uid'],
    type: 'achievement',
    priority: 'high',
    title: 'Science Explorer Badge Earned! 🔬',
    body: 'Junior earned the Science Explorer badge for outstanding work on the ecosystems unit. Keep up the great work!',
    deliveryMethod: 'all',
    readByParent: false,
    createdAt: Date.now() - 7_200_000,
  },
  {
    id: 'note-3',
    classroomId: 'classroom-math-5th',
    classroomName: '5th Grade Mathematics',
    teacherId: 'teacher-rodriguez',
    teacherName: 'Ms. Rodriguez',
    type: 'event',
    priority: 'normal',
    title: 'Parent-Teacher Conference',
    body: 'Parent-teacher conferences will be held next Thursday from 3:00-7:00 PM. Please sign up for a time slot.',
    dueDate: Date.now() + 86_400_000 * 6,
    parentIds: ['owner-uid'],
    deliveryMethod: 'visual',
    readByParent: false,
    createdAt: Date.now() - 86_400_000,
  },
];

export const MOCK_STUDY_MODE: StudyModeConfig = {
  studentId: 'student-junior-001',
  subject: 'Mathematics',
  durationMinutes: 30,
  lightBrightness: 80,
  lightColorTemp: 3200,
  musicVolume: 15,
  musicPlaylist: 'focus-classical',
  muteNotifications: true,
  blockEntertainment: true,
  showTimerOnDisplay: true,
  showAssignmentOnDisplay: true,
  ariaStudyMode: true,
  ariaSubjectContext: '5th grade mathematics — fraction operations (addition, subtraction, multiplication)',
};
