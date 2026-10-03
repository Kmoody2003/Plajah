/**
 * Aria Home Conductor — The AI brain of Plajah Home
 *
 * This service extends Aria with the "Home Conductor" lens, making her
 * aware of the entire household: who's speaking (voice profiles), what
 * devices are active, what music is playing, what assignments are due,
 * and what the home needs.
 *
 * Aria's Home Conductor lens is built on the same `useAriaSurface()`
 * pattern used by every other Plajah studio (ArticleEditor, Melos,
 * Tela, etc.), but enriched with:
 *
 *  · Voice profile identification (who is speaking?)
 *  · Age-appropriate response adaptation
 *  · Home device state awareness
 *  · Academia integration (homework, teacher notes)
 *  · Proactive pattern detection (automation suggestions)
 *  · Multi-speaker audio routing context
 *
 * The conductor uses the same hybrid on-device → cloud AI cascade:
 *  1. Simple commands (lights, volume) → Local Qwen2.5 (~65% of commands)
 *  2. Complex queries (scene creation, study help) → MAI Thinking
 *  3. Creative/aesthetic decisions → Council deliberation (Claude)
 *
 * Example interactions:
 * ─────────────────────
 *  [Kenny's voice]:   "Hey Aria, dim the living room"
 *  Aria:              "Done. Living room at 30%."
 *
 *  [Junior's voice]:  "Hey Aria, help me with my math homework"
 *  Aria:              "Hey Junior! I see you have the Fraction Operations
 *                      worksheet due tomorrow. Want me to set up Study Mode?
 *                      I'll dim the lights and put on some focus music."
 *
 *  [Unknown voice]:   "Turn off all the lights"
 *  Aria:              "I don't recognise your voice. I can control the
 *                      living room light for you, but for security controls,
 *                      ask Kenny to add your voice profile."
 *
 *  [Kenny's voice]:   "What's Junior's homework situation?"
 *  Aria:              "Junior has a math worksheet due tomorrow — fractions,
 *                      he's about halfway done. Ms. Rodriguez also sent a note
 *                      about parent-teacher conferences next Thursday. Want me
 *                      to remind him after dinner?"
 */

import type { VoiceProfile, VoiceIdentificationResult } from './voiceProfileService';
import {
  getAriaPersonalityForSpeaker,
  isCommandAllowed,
  identifySpeaker,
} from './voiceProfileService';
import type {
  AcademiaStudentSnapshot,
  TeacherNoteHome,
  StudyModeConfig,
} from './academiaHomeService';
import {
  getAriaStudyModePrompt,
  generateAssignmentReminders,
  getDeliveryAction,
} from './academiaHomeService';
import type { HomeDevice, HomeRoom, HomeScene } from '../plajahHomeService';
import { getRoomSummary, getNowPlaying } from '../plajahHomeService';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AriaHomeContext {
  // Who is speaking
  speaker: VoiceIdentificationResult | null;
  speakerProfile: VoiceProfile | null;

  // Home state
  rooms: HomeRoom[];
  devices: HomeDevice[];
  scenes: HomeScene[];
  activeScene: HomeScene | null;

  // Media
  nowPlaying: ReturnType<typeof getNowPlaying>;
  speakerGroups: { name: string; deviceIds: string[] }[];

  // Academia
  students: AcademiaStudentSnapshot[];
  unreadTeacherNotes: TeacherNoteHome[];
  pendingReminders: ReturnType<typeof generateAssignmentReminders>;
  activeStudyMode: StudyModeConfig | null;

  // Environment
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: string;
  isWeekday: boolean;

  // Home stats
  totalDevicesOnline: number;
  totalLightsOn: number;
  averageTemperature: number | null;
  allDoorsLocked: boolean;
}

export interface AriaHomeAction {
  id: string;
  label: string;
  params: string[];
  requiresPermission?: keyof import('./voiceProfileService').VoicePermissions;
  description?: string;
}

export type CommandClassification =
  | 'device-control'    // "Turn on the lights"
  | 'scene-control'     // "Activate movie night"
  | 'media-control'     // "Play music", "Cast to speaker"
  | 'thermostat'        // "Set temperature to 72"
  | 'security'          // "Lock the door", "Arm security"
  | 'intercom'          // "Broadcast to kitchen"
  | 'homework-help'     // "Help with math homework"
  | 'study-mode'        // "Start study mode"
  | 'status-query'      // "What's the temperature?"
  | 'teacher-notes'     // "Any messages from school?"
  | 'schedule'          // "Remind me at 5pm"
  | 'automation'        // "Create a scene for..."
  | 'general';          // Conversation, weather, etc.

// ─── Aria Home Conductor ─────────────────────────────────────────────────────

/**
 * Build the complete Aria system prompt for a Home Conductor interaction.
 * This is what gets sent to the AI model alongside the user's voice command.
 */
export function buildAriaHomeConductorPrompt(ctx: AriaHomeContext): string {
  const sections: string[] = [];

  // Identity
  sections.push([
    'You are Aria, the Home Conductor for Plajah Home.',
    'You are the same Aria who lives across all of Plajah — one consistent personality.',
    'In this context, you wear the Home Conductor hat: warm, proactive, ambient.',
    'You manage this household\'s smart devices, music, lighting, security, and learning.',
  ].join(' '));

  // Speaker context
  if (ctx.speakerProfile) {
    sections.push(getAriaPersonalityForSpeaker(ctx.speakerProfile));
  } else if (ctx.speaker && !ctx.speaker.isAboveThreshold) {
    sections.push(getAriaPersonalityForSpeaker(null));
  }

  // Study mode override
  if (ctx.activeStudyMode && ctx.speakerProfile?.role === 'child') {
    const student = ctx.students.find(s => s.studentId === ctx.speakerProfile?.academiaStudentId);
    if (student) {
      sections.push(getAriaStudyModePrompt(student, ctx.activeStudyMode));
    }
  }

  // Time awareness
  sections.push(`Current time context: ${ctx.dayOfWeek} ${ctx.timeOfDay}. ${ctx.isWeekday ? 'Weekday' : 'Weekend'}.`);

  // Home state summary
  const homeState: string[] = [
    `Home status: ${ctx.totalDevicesOnline} devices online, ${ctx.totalLightsOn} lights on.`,
  ];
  if (ctx.averageTemperature !== null) {
    homeState.push(`Average temperature: ${ctx.averageTemperature}°F.`);
  }
  homeState.push(`All doors ${ctx.allDoorsLocked ? 'locked' : 'UNLOCKED — mention this'}.`);
  if (ctx.activeScene) {
    homeState.push(`Active scene: "${ctx.activeScene.name}".`);
  }
  sections.push(homeState.join(' '));

  // Now playing
  if (ctx.nowPlaying.isPlaying) {
    sections.push(
      `Now playing: "${ctx.nowPlaying.title}" by ${ctx.nowPlaying.artist} ` +
      `on ${ctx.nowPlaying.speakerCount} speaker(s): ${ctx.nowPlaying.speakerNames.join(', ')}.`
    );
  }

  // Academia context (for parents and students)
  if (ctx.students.length > 0 && (ctx.speakerProfile?.role === 'adult' || ctx.speakerProfile?.role === 'child')) {
    const academiaLines: string[] = ['ACADEMIA CONTEXT:'];

    for (const student of ctx.students) {
      const dueToday = student.classrooms.flatMap(c => c.upcomingDue).filter(a =>
        a.dueDate <= Date.now() + 86_400_000 && a.status !== 'submitted'
      );
      const missing = student.classrooms.reduce((sum, c) => sum + c.missingAssignments, 0);

      academiaLines.push(`• ${student.studentName}: ${student.streakDays}-day streak, ${student.totalPoints} pts.`);
      if (dueToday.length > 0) {
        academiaLines.push(`  Due soon: ${dueToday.map(a => `"${a.title}" (${a.subject})`).join(', ')}.`);
      }
      if (missing > 0) {
        academiaLines.push(`  ⚠ ${missing} missing assignment(s).`);
      }
      if (student.isCurrentlyStudying) {
        academiaLines.push(`  📚 Currently studying ${student.currentSubject}.`);
      }
    }

    if (ctx.unreadTeacherNotes.length > 0) {
      academiaLines.push(`${ctx.unreadTeacherNotes.length} unread teacher note(s).`);
    }

    sections.push(academiaLines.join('\n'));
  }

  // Pending reminders
  if (ctx.pendingReminders.length > 0) {
    sections.push(
      'PENDING REMINDERS (deliver these proactively when appropriate):\n' +
      ctx.pendingReminders.map(r => `• [${r.urgency}] ${r.message}`).join('\n')
    );
  }

  // Available actions
  sections.push(
    'AVAILABLE ACTIONS (use <ARIA_ACTION> blocks):\n' +
    ARIA_HOME_ACTIONS.map(a => `• ${a.id}(${a.params.join(', ')}) — ${a.description || a.label}`).join('\n')
  );

  return sections.join('\n\n');
}

/**
 * Classify a voice command to determine routing and permission requirements.
 */
export function classifyCommand(transcript: string): CommandClassification {
  const t = transcript.toLowerCase();

  // Homework / study
  if (t.includes('homework') || t.includes('assignment') || t.includes('study'))
    return t.includes('help') || t.includes('explain') ? 'homework-help' : 'study-mode';
  if (t.includes('study mode') || t.includes('focus mode')) return 'study-mode';

  // Teacher notes / school
  if (t.includes('teacher') || t.includes('school') || t.includes('class') || t.includes('note from'))
    return 'teacher-notes';

  // Device control
  if (t.match(/\b(turn|switch|toggle|dim|brighten)\b.*\b(light|lamp|bulb)\b/)) return 'device-control';
  if (t.match(/\b(turn|switch|toggle)\b.*\b(on|off)\b/)) return 'device-control';

  // Scene
  if (t.match(/\b(activate|start|run|set)\b.*\b(scene|mode|mood)\b/)) return 'scene-control';
  if (t.includes('movie night') || t.includes('bedtime') || t.includes('good morning')) return 'scene-control';

  // Media
  if (t.match(/\b(play|pause|skip|next|stop|cast|volume)\b/)) return 'media-control';

  // Thermostat
  if (t.match(/\b(temperature|thermostat|heat|cool|warm|degrees)\b/)) return 'thermostat';

  // Security
  if (t.match(/\b(lock|unlock|arm|disarm|security|alarm|camera)\b/)) return 'security';

  // Intercom
  if (t.match(/\b(intercom|broadcast|announce|call|paging)\b/)) return 'intercom';

  // Status
  if (t.match(/\b(what|how|status|check|is the|are the)\b/)) return 'status-query';

  // Schedule
  if (t.match(/\b(remind|schedule|timer|alarm|set a)\b/)) return 'schedule';

  // Automation
  if (t.match(/\b(create|make|build|automate|when I)\b.*\b(scene|routine|automation)\b/)) return 'automation';

  return 'general';
}

/**
 * Check if the identified speaker is allowed to execute a classified command.
 */
export function isCommandAllowedForSpeaker(
  profile: VoiceProfile | null,
  classification: CommandClassification,
): { allowed: boolean; reason?: string } {
  const permissionMap: Partial<Record<CommandClassification, keyof import('./voiceProfileService').VoicePermissions>> = {
    'device-control': 'canControlLights',
    'thermostat': 'canControlThermostat',
    'security': 'canControlSecurity',
    'scene-control': 'canModifyScenes',
    'intercom': 'canMakeIntercomCalls',
  };

  const required = permissionMap[classification];
  if (!required) return { allowed: true }; // No permission needed for queries, study, media

  if (!isCommandAllowed(profile, required)) {
    const roleLabel = profile?.role || 'guest';
    return {
      allowed: false,
      reason: `${roleLabel === 'child' ? 'Kids' : 'Guests'} can't ${
        required === 'canControlSecurity' ? 'control security' :
        required === 'canControlLocks' ? 'control locks' :
        required === 'canControlThermostat' ? 'change the temperature' :
        required === 'canModifyScenes' ? 'modify scenes' :
        'do that'
      }. Ask ${profile ? 'a parent' : 'the homeowner'} for help.`,
    };
  }

  return { allowed: true };
}

/**
 * Get the current time-of-day classification.
 */
export function getTimeOfDay(): AriaHomeContext['timeOfDay'] {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

// ─── Available Aria Home Actions ─────────────────────────────────────────────

export const ARIA_HOME_ACTIONS: AriaHomeAction[] = [
  { id: 'setLight', label: 'Set Light', params: ['deviceId', 'brightness', 'color?', 'colorTemp?'], requiresPermission: 'canControlLights', description: 'Turn on/off or dim a light' },
  { id: 'setAllLights', label: 'Set All Room Lights', params: ['roomId', 'brightness'], requiresPermission: 'canControlLights', description: 'Control all lights in a room' },
  { id: 'setThermostat', label: 'Set Temperature', params: ['deviceId', 'targetTemp'], requiresPermission: 'canControlThermostat', description: 'Adjust thermostat' },
  { id: 'toggleLock', label: 'Toggle Lock', params: ['deviceId', 'locked'], requiresPermission: 'canControlLocks', description: 'Lock or unlock a door' },
  { id: 'playMusic', label: 'Play Music', params: ['query', 'targetSpeaker?', 'volume?'], description: 'Play music on a speaker' },
  { id: 'pauseMusic', label: 'Pause Music', params: ['targetSpeaker?'], description: 'Pause playback' },
  { id: 'setVolume', label: 'Set Volume', params: ['targetSpeaker', 'volume'], description: 'Adjust speaker volume' },
  { id: 'castMedia', label: 'Cast to Device', params: ['mediaUrl', 'targetDevice'], description: 'Cast media to a display or speaker' },
  { id: 'groupSpeakers', label: 'Group Speakers', params: ['speakerIds[]'], description: 'Create a multi-room speaker group' },
  { id: 'runScene', label: 'Run Scene', params: ['sceneId'], requiresPermission: 'canModifyScenes', description: 'Activate a home scene' },
  { id: 'broadcast', label: 'Intercom Broadcast', params: ['message', 'roomIds[]?'], requiresPermission: 'canMakeIntercomCalls', description: 'Announce message via intercom' },
  { id: 'startStudyMode', label: 'Start Study Mode', params: ['studentId', 'subject', 'durationMinutes?'], description: 'Activate study mode for a student' },
  { id: 'endStudyMode', label: 'End Study Mode', params: ['studentId'], description: 'Deactivate study mode' },
  { id: 'readTeacherNote', label: 'Read Teacher Note', params: ['noteId'], description: 'Read a teacher note aloud' },
  { id: 'setTimer', label: 'Set Timer', params: ['durationMinutes', 'label?'], description: 'Set a countdown timer' },
  { id: 'showOnDisplay', label: 'Show on Display', params: ['deviceId', 'contentType', 'contentUrl?'], description: 'Push content to a smart display' },
  { id: 'setDigitalFrame', label: 'Set Digital Frame', params: ['deviceId', 'albumId?', 'photoUrl?'], description: 'Change digital frame photo or album' },
];

/**
 * Build the AriaContextSnapshot for useAriaSurface() integration.
 * This is what gets published to the Aria context bus when Plajah Home is active.
 */
export function buildAriaSurfacePayload(ctx: AriaHomeContext) {
  const summary: string[] = [];
  summary.push(`${ctx.totalDevicesOnline} devices online`);
  summary.push(`${ctx.totalLightsOn} lights on`);
  if (ctx.averageTemperature) summary.push(`${ctx.averageTemperature}°F`);
  if (ctx.nowPlaying.isPlaying) summary.push(`Playing "${ctx.nowPlaying.title}"`);
  if (ctx.students.length > 0) {
    const totalDue = ctx.students.flatMap(s => s.classrooms.flatMap(c => c.upcomingDue)).length;
    summary.push(`${totalDue} assignments tracked`);
  }
  if (ctx.unreadTeacherNotes.length > 0) {
    summary.push(`${ctx.unreadTeacherNotes.length} unread teacher notes`);
  }

  return {
    surface: 'plajah-home' as const,
    domain: 'smart-home' as const,
    title: ctx.activeScene ? `Home — ${ctx.activeScene.name}` : 'Home',
    summary: summary.join(' · '),
    selection: ctx.speakerProfile?.name ?? undefined,
    documentText: JSON.stringify({
      speaker: ctx.speakerProfile?.name,
      speakerRole: ctx.speakerProfile?.role,
      rooms: ctx.rooms.map(r => ({
        name: r.name,
        ...getRoomSummary(r, ctx.devices),
      })),
      nowPlaying: ctx.nowPlaying,
      activeScene: ctx.activeScene?.name,
      students: ctx.students.map(s => ({
        name: s.studentName,
        streak: s.streakDays,
        dueCount: s.classrooms.flatMap(c => c.upcomingDue).filter(a => a.status !== 'submitted').length,
      })),
    }),
    actions: ARIA_HOME_ACTIONS.map(a => ({
      id: a.id,
      label: a.label,
      params: a.params,
    })),
  };
}
