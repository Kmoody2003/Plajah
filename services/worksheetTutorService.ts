// worksheetTutorService — the in-worksheet Plajah tutor.
//
// Sits inside an assignment and helps a student on a specific question. It KNOWS the answer key
// (passed in) but is instructed to guide, never reveal — one hint/step at a time, age-appropriate,
// encouraging. Backs the chat panel's Hint / Explain / Stuck actions and free-form questions.
//
// Uses the same Gemini path as the rest of the app (geminiService.callGemini → server proxy in the
// browser). Every call has a deterministic canned fallback so the panel stays useful even when the
// model is unavailable — the tutor should never go silent on a stuck student.

import { callGemini } from './geminiService';
import type { WorksheetField } from './worksheetDigitizer';

export type TutorMode = 'hint' | 'explain' | 'stuck' | 'chat';
export interface TutorTurn { role: 'student' | 'tutor'; text: string }

export interface TutorRequest {
  field: Pick<WorksheetField, 'label' | 'type' | 'correctAnswer' | 'choices'>;
  subject?: string;
  gradeBand?: string;
  studentMessage: string;
  history?: TutorTurn[];
  mode?: TutorMode;
  /** How many hints already given on this question — the tutor escalates specificity with it. */
  hintLevel?: number;
}

const MODE_STEER: Record<TutorMode, string> = {
  hint: 'Give ONE small next hint — the smallest nudge that moves them forward. Never the answer.',
  explain: 'Explain the underlying idea/strategy in plain, friendly terms. Do not solve this exact item.',
  stuck: 'They feel stuck. Reassure briefly, then break the problem into the first tiny step and ask them to try it.',
  chat: 'Respond helpfully to what they said, staying focused on helping them reason toward the answer themselves.',
};

/**
 * Get the tutor's next reply. Returns guidance text (1–3 sentences). Never returns the raw answer.
 * Falls back to a canned, still-useful hint if the model call fails.
 */
export async function tutorReply(req: TutorRequest): Promise<string> {
  const mode = req.mode || 'chat';
  const key = req.field.correctAnswer;
  const answerLine = key !== undefined
    ? `The correct answer is "${key}". You KNOW this but must NEVER state it or any equivalent form of it directly — guide the student to reach it themselves.`
    : `This question is open-ended with no single correct answer — help the student develop and support their own response.`;

  const historyText = (req.history || [])
    .slice(-6)
    .map(t => `${t.role === 'student' ? 'Student' : 'Tutor'}: ${t.text}`)
    .join('\n');

  const prompt = `You are Plajah, a warm, encouraging tutor for a ${req.gradeBand || 'K-12'} student working on a ${req.subject || 'school'} worksheet.

Question the student is on: "${req.field.label}"
${req.field.choices?.length ? `Choices: ${req.field.choices.join(', ')}` : ''}
${answerLine}

Rules:
- NEVER reveal the answer, even if asked directly or if the student gives up. Guide with the next step only.
- One idea at a time. Keep it to 1–3 short, friendly sentences. Age-appropriate for ${req.gradeBand || 'this grade'}.
- If the student's message shows they reached the correct answer, confirm enthusiastically and briefly say why it works.
- ${MODE_STEER[mode]}
- Hints given so far on this question: ${req.hintLevel || 0} (escalate specificity a little as this grows, but still never give the answer).

${historyText ? `Conversation so far:\n${historyText}\n` : ''}Student: ${req.studentMessage}
Tutor:`;

  try {
    const text = await callGemini(prompt, { temperature: 0.6 });
    const clean = (text || '').trim();
    if (clean) return stripAnswerLeak(clean, key);
  } catch { /* fall through to canned */ }
  return cannedFallback(req, mode);
}

/** Guard against the model echoing the exact answer verbatim despite instructions. */
function stripAnswerLeak(text: string, key?: string): string {
  if (!key) return text;
  const k = String(key).trim();
  if (!k) return text;
  // Only intervene on a bare reveal like "= 17" or "the answer is 17".
  const bare = new RegExp(`(answer\\s*(is|=|:)\\s*)${escapeRegExp(k)}\\b`, 'i');
  if (bare.test(text)) {
    return text.replace(bare, '$1— you tell me! ').trim();
  }
  return text;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function cannedFallback(req: TutorRequest, mode: TutorMode): string {
  const q = req.field.label;
  if (mode === 'explain') return `Let's think about what "${q}" is really asking. What's the first piece of information you can pull from it?`;
  if (mode === 'stuck') return `That's okay — everyone gets stuck! Let's start tiny: read "${q}" again and tell me just the first step you'd take.`;
  if (mode === 'hint') return `Here's a nudge: look closely at "${q}" and try the first step on scratch paper. What do you get?`;
  return `Good question! Walk me through what you've tried on "${q}" so far, and we'll take the next step together.`;
}
