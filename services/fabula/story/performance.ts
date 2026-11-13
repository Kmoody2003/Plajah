// performance — Fabula's emotional engine and acting-performance engine.
//
// Generators don't act; they render whatever the prompt implies, and a prompt that only says who is in
// frame gets a face with nothing behind it. This module turns what the production already knows — the
// scene bible's intent and subtext, each character's arc through the scene, where a shot sits in that
// arc, and (when Story Intelligence has inferred them) what the character wants and fears — into a
// playable direction for every character in every shot.
//
// It is deliberately MODEL-INDEPENDENT. The output is a `PerformanceBeat`: an objective, a tactic, an
// emotional state on valence/arousal/dominance axes, and the physical tells that carry it. The prompt
// compiler (promptCompiler.ts) decides how a given model wants that phrased; the same beat also drives
// voice delivery and the score/sound brief, so picture, voice and music are playing the same scene.
//
// Pure and deterministic: no model call, no I/O. An LLM pass can enrich `motivations`, but a shot gets
// usable direction without one.

export interface EmotionState {
  name: string;
  /** −1 (painful) … +1 (pleasant) */
  valence: number;
  /** 0 (still) … 1 (activated) */
  arousal: number;
  /** 0 (yielding) … 1 (in control) */
  dominance: number;
  /** 0 … 1 — how far the state is allowed to surface in this shot. */
  intensity: number;
}

export interface CharacterMotivation {
  /** The conscious goal — what they're trying to get in this story/scene. */
  want?: string;
  /** What they actually need (often what they're avoiding). */
  need?: string;
  fear?: string;
  /** What stands in the way in this scene — usually another character. */
  obstacle?: string;
}

export type BeatRole = 'speaking' | 'listening' | 'acting';

export interface PerformanceBeat {
  character: string;
  role: BeatRole;
  /** What they want, when Story Intelligence has read it from the story. Empty until then — the scene's
   *  intent is written from one side and is not every character's goal. */
  objective: string;
  obstacle?: string;
  /** A playable verb phrase — what they DO to the other person to get the objective. */
  tactic: string;
  emotion: EmotionState;
  /** Where the emotion is heading by the end of the shot (video only uses this). */
  toward?: EmotionState;
  subtext?: string;
  physical: { eyes: string; face: string; breath: string; body: string; tempo: string };
  vocal: { pitch: number; rate: number; energy: number; note: string };
}

export interface ScoreCue {
  tempoBpm: number;
  mode: string;
  dynamics: string;
  texture: string;
  soundDesign: string;
  /** One line usable as-is in a music or sound generator. */
  prompt: string;
}

export interface ShotPerformance {
  shotId: string;
  slug?: string;
  /** 0 … 1 position of the shot within the scene. */
  position: number;
  /** 0 … 1 dramatic tension at this shot. */
  tension: number;
  beats: PerformanceBeat[];
  score: ScoreCue;
}

export interface ScenePerformancePlan {
  sceneId?: string;
  shots: ShotPerformance[];
}

// ── the emotion lexicon ─────────────────────────────────────────────────────────
// Each entry is a point in VAD space plus the tells an actor would actually play. `keys` are the words
// a filmmaker or the scene bible is likely to use for it.

interface Lex {
  name: string; v: number; a: number; d: number; keys: string[];
  eyes: string; face: string; breath: string; body: string;
  voice: [pitch: number, rate: number, energy: number];
}

const L = (name: string, v: number, a: number, d: number, keys: string, eyes: string, face: string, breath: string, body: string, voice: [number, number, number]): Lex =>
  ({ name, v, a, d, keys: keys.split('|'), eyes, face, breath, body, voice });

export const EMOTION_LEXICON: Lex[] = [
  L('calm', 0.3, 0.15, 0.6, 'calm|composed|serene|at ease|settled|peace', 'steady, unhurried gaze', 'relaxed brow and jaw', 'slow even breathing', 'weight settled, shoulders down', [1.0, 0.95, 0.8]),
  L('neutral', 0, 0.3, 0.5, 'neutral|flat|matter-of-fact', 'level, attentive gaze', 'unforced, readable face', 'natural breathing', 'balanced, still posture', [1.0, 1.0, 1.0]),
  L('joy', 0.85, 0.65, 0.65, 'joy|happy|delight|elated|laugh|glad|bright', 'eyes crinkled and alive', 'an open, unguarded smile', 'light quick breath', 'chest open, movement loose', [1.08, 1.08, 1.2]),
  L('tender', 0.7, 0.25, 0.5, 'tender|loving|affection|gentle|warm|intimate|soft', 'soft gaze that lingers', 'a small private smile', 'slow breath, almost held', 'leaning in, hands careful', [0.98, 0.9, 0.7]),
  L('hopeful', 0.55, 0.45, 0.45, 'hope|hopeful|optimis|expectant|daring to', 'eyes lifted, searching', 'brow raised slightly, lips parted', 'a shallow breath caught high', 'leaning forward, tentative', [1.04, 1.0, 0.95]),
  L('relieved', 0.6, 0.2, 0.5, 'relief|relieved|exhale|unburdened|let go', 'eyes closing for a moment', 'the face going slack', 'a long breath finally let out', 'shoulders dropping, weight released', [0.96, 0.9, 0.75]),
  L('playful', 0.65, 0.6, 0.6, 'playful|teasing|mischie|flirt|wry|amused', 'a sidelong glint', 'a half-smile fighting to stay down', 'breath on the edge of a laugh', 'loose, tilted, a little off-axis', [1.06, 1.08, 1.1]),
  L('triumphant', 0.8, 0.8, 0.9, 'triumph|victor|vindicat|proud|exult', 'eyes blazing, fixed ahead', 'jaw lifted, a fierce smile', 'deep full breaths', 'chest out, planted, taking space', [1.02, 1.0, 1.35]),
  L('curious', 0.3, 0.5, 0.5, 'curious|intrigued|puzzled|wonder|studying|fascinat', 'narrowed, tracking gaze', 'head tilted, brow knit', 'breath held in attention', 'drawn forward, very still', [1.03, 0.98, 0.9]),
  L('determined', 0.2, 0.7, 0.85, 'determin|resolve|resolute|focus|steel|committed|decid', 'locked, unblinking stare', 'jaw set, mouth a line', 'controlled breath through the nose', 'squared up, economical movement', [0.96, 0.98, 1.2]),
  L('defiant', -0.1, 0.75, 0.8, 'defian|rebell|challeng|stand\\w* \\w+ ground|unbowed|refus', 'eyes holding the other without blinking', 'chin up, nostrils flared', 'breath tight and audible', 'spine straight, refusing to give an inch', [1.0, 1.02, 1.3]),
  L('guarded', -0.15, 0.4, 0.55, 'guard|wary|closed|careful|reserved|defensive|withh', 'eyes that check, then look away', 'a neutral mask held a beat too still', 'shallow, quiet breathing', 'arms close, body angled away', [0.97, 0.94, 0.8]),
  L('suspicious', -0.3, 0.55, 0.55, 'suspic|distrust|doubt|skeptic|accus', 'a hard sideways look', 'brow low, mouth tight', 'slow measured breath', 'still, weight back, watching', [0.95, 0.92, 0.9]),
  L('cold', -0.35, 0.3, 0.85, 'cold|icy|detached|ruthless|clinical|controlled menace|menac', 'flat, unreadable eyes', 'no expression at all', 'breathing that barely shows', 'utterly still, unhurried', [0.9, 0.88, 0.85]),
  L('contempt', -0.5, 0.45, 0.85, 'contempt|disdain|scorn|sneer|disgust|dismiss', 'a look down the nose', 'one corner of the mouth pulled back', 'a short dismissive exhale', 'leaning back, giving nothing', [0.94, 0.95, 1.0]),
  L('angry', -0.6, 0.8, 0.75, 'anger|angry|furious|rage|fury|livid|seeth|explod|snap', 'eyes hard and wide', 'brow drawn down, teeth set', 'fast breath through the nose', 'tension in neck and hands, crowding forward', [1.05, 1.12, 1.4]),
  L('anxious', -0.45, 0.7, 0.3, 'anxious|nervous|uneasy|on edge|tense|worr|dread|jitter', 'eyes darting, never settling', 'brow pinched, lips pressed', 'quick shallow breath', 'restless hands, weight shifting', [1.06, 1.12, 1.0]),
  L('afraid', -0.7, 0.85, 0.15, 'afraid|fear|scared|terrif|terror|panic|frighten|horror', 'eyes wide, whites showing', 'mouth open, face drained', 'breath ragged and high in the chest', 'frozen, then recoiling', [1.12, 1.18, 1.15]),
  L('shocked', -0.4, 0.85, 0.25, 'shock|stunned|blindsid|disbelief|reel|realiz', 'eyes fixed, not blinking', 'face gone blank and still', 'a breath that stops', 'arrested mid-movement', [1.04, 0.9, 0.85]),
  L('desperate', -0.65, 0.85, 0.25, 'desperat|plead|begging|frantic|cornered|last chance', 'eyes searching the other face', 'brow up and knotted, mouth trembling', 'breath breaking between words', 'reaching, closing distance, unsteady', [1.1, 1.15, 1.25]),
  L('exposed', -0.3, 0.5, 0.15, 'exposed|vulnerab|raw|naked|laid bare|undone', 'wet eyes that hold on anyway', 'the mask gone, nothing arranged', 'unsteady breath', 'shoulders dropped, defenses down', [1.0, 0.9, 0.7]),
  L('ashamed', -0.6, 0.4, 0.1, 'asham|shame|guilt|humiliat|embarrass|regret|remorse', 'eyes dropped, unable to hold a look', 'colour in the face, jaw tight', 'breath held, then let go slowly', 'shrinking, turned partly away', [0.96, 0.9, 0.65]),
  L('longing', -0.2, 0.35, 0.3, 'longing|yearn|ache|wistful|nostalg|missing|pining', 'a far gaze at something not in the room', 'soft, a little unfocused', 'a slow breath in, held', 'still, drawn toward what is absent', [0.98, 0.88, 0.7]),
  L('sad', -0.6, 0.25, 0.25, 'sad|sorrow|melanchol|hurt|wounded', 'lowered, glistening eyes', 'the mouth pulled down at the corners', 'slow heavy breathing', 'weight sinking, head lowered', [0.94, 0.86, 0.65]),
  L('grief', -0.85, 0.55, 0.1, 'grief|griev|mourn|bereft|devastat|heartbreak|weep|sob', 'eyes swollen and unfocused', 'the face collapsing, held together by effort', 'breath catching and shuddering', 'folding inward, barely upright', [0.95, 0.84, 0.8]),
  L('broken', -0.8, 0.2, 0.05, 'broken|defeated|hollow|empty|numb|crushed|surrender|gives up', 'eyes gone dull, seeing nothing', 'slack, emptied', 'breath shallow and slow', 'collapsed posture, no resistance left', [0.9, 0.8, 0.5]),
  L('exhausted', -0.4, 0.1, 0.25, 'exhaust|weary|spent|drained|worn|tired', 'heavy-lidded eyes', 'a face with nothing left to arrange', 'long tired exhale', 'slumped, moving only when necessary', [0.92, 0.82, 0.55]),
];

const NEUTRAL = EMOTION_LEXICON[1];
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lexFor = (name: string): Lex => EMOTION_LEXICON.find((e) => e.name === name) || NEUTRAL;

/** Map free text ("guarded", "barely holding it together", "from calm to fury") to the nearest
 *  lexicon entry. Returns neutral when nothing in the text reads as an emotion. */
export function resolveEmotion(text: string | undefined, intensity = 0.6): EmotionState {
  const t = (text || '').toLowerCase();
  let best: Lex | null = null, bestScore = 0;
  for (const e of EMOTION_LEXICON) {
    let score = 0;
    for (const k of e.keys) if (new RegExp(`\\b${k}`, 'i').test(t)) score += k.length;
    if (score > bestScore) { best = e; bestScore = score; }
  }
  const e = best || NEUTRAL;
  return { name: e.name, valence: e.v, arousal: e.a, dominance: e.d, intensity: clamp01(intensity) };
}

/** Split an arc phrase ("guarded → exposed", "from defiant to broken") into its start and end. A
 *  phrase with no turn is a held state: start and end are the same. */
export function parseArc(arc: string | undefined): { from: EmotionState; to: EmotionState } {
  const raw = (arc || '').replace(/^\s*from\s+/i, '');
  const parts = raw.split(/\s*(?:→|->|=>|—>|\bto\b|\binto\b|\bthen\b|\bbecom\w+\b|\bturn\w*\b)\s*/i).filter((s) => s.trim());
  const from = resolveEmotion(parts[0]);
  const to = parts.length > 1 ? resolveEmotion(parts[parts.length - 1]) : from;
  return { from, to };
}

/** Blend two states. The name follows whichever side is nearer — a blend has no word of its own. */
export function blendEmotion(a: EmotionState, b: EmotionState, t: number): EmotionState {
  const k = clamp01(t);
  return {
    name: k < 0.5 ? a.name : b.name,
    valence: lerp(a.valence, b.valence, k),
    arousal: lerp(a.arousal, b.arousal, k),
    dominance: lerp(a.dominance, b.dominance, k),
    intensity: lerp(a.intensity, b.intensity, k),
  };
}

/** Dramatic tension across a scene: builds to a peak around four-fifths through, then releases. Close
 *  shots sit above the curve (that's why the camera went in), wides and establishers below it. */
export function tensionAt(position: number, shotType = '', mode: 'dialogue' | 'action' = 'dialogue'): number {
  const p = clamp01(position);
  const floor = mode === 'action' ? 0.4 : 0.25;
  const base = p < 0.8 ? floor + (0.9 - floor) * Math.pow(p / 0.8, 1.3) : 0.9 - 0.35 * ((p - 0.8) / 0.2);
  const size = /\b(ECU|XCU|EXTREME)\b/i.test(shotType) ? 0.12 : /\b(CU|CLOSE|INSERT)\b/i.test(shotType) ? 0.07
    : /\b(EST|ESTABLISH|WIDE|MASTER|AERIAL)\b/i.test(shotType) ? -0.1 : 0;
  return clamp01(base + size);
}

/** Pick a playable action from where the character sits in arousal/dominance space. These are verbs an
 *  actor can do TO someone — the opposite of "look sad". */
export function tacticFor(e: EmotionState, role: BeatRole): string {
  if (role === 'listening') {
    return e.dominance >= 0.55 ? 'weigh every word and give nothing back' : 'absorb the blow and try not to show it';
  }
  const hot = e.arousal >= 0.55, strong = e.dominance >= 0.55;
  if (e.valence > 0.4) return hot ? 'draw the other in and lift them' : 'reassure and hold the moment open';
  if (hot && strong) return 'press the point and corner them';
  if (hot && !strong) return 'plead, deflect, reach for any way through';
  if (!hot && strong) return 'withhold and make them come forward';
  return 'conceal what it costs and retreat';
}

const intensityWord = (i: number) => (i < 0.35 ? 'barely perceptible' : i < 0.65 ? 'contained' : i < 0.85 ? 'unmistakable' : 'fully surfaced');
const tempoWord = (e: EmotionState) => (e.arousal < 0.3 ? 'slow, deliberate' : e.arousal < 0.6 ? 'measured' : e.arousal < 0.8 ? 'quick, clipped' : 'urgent, on top of the moment');

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Who is in this shot. The speaker comes from the shot's `character` field; anyone else is found by
 *  name in the subject/type/notes. Falls back to the whole cast only for a one-character scene. */
export function charactersInShot(shot: any, names: string[]): { name: string; role: BeatRole }[] {
  const out: { name: string; role: BeatRole }[] = [];
  const speaker = (shot?.character || '').trim();
  const hasLine = !!(shot?.lines || '').trim();
  const find = (n: string) => names.find((x) => x.toLowerCase() === n.toLowerCase());
  if (speaker && find(speaker)) out.push({ name: find(speaker)!, role: hasLine ? 'speaking' : 'acting' });
  const hay = `${shot?.subject || ''} ${shot?.type || ''} ${shot?.notes || ''}`;
  for (const n of names) {
    if (out.some((o) => o.name === n)) continue;
    if (new RegExp(`\\b${esc(n)}\\b`, 'i').test(hay)) out.push({ name: n, role: out.length && hasLine ? 'listening' : 'acting' });
  }
  if (!out.length && names.length === 1) out.push({ name: names[0], role: hasLine ? 'speaking' : 'acting' });
  return out;
}

function buildBeat(input: {
  name: string; role: BeatRole; position: number; tension: number; step: number;
  arc?: string; motivation?: CharacterMotivation; subtext?: string; others: string[];
}): PerformanceBeat {
  const { name, role, position, tension, step, arc, motivation, subtext, others } = input;
  const { from, to } = parseArc(arc);
  const at = (p: number): EmotionState => ({ ...blendEmotion(from, to, p), intensity: clamp01(0.25 + tension * 0.75) });
  const emotion = at(position);
  const toward = at(Math.min(1, position + step));
  const lex = lexFor(emotion.name);
  const [pitch, rate, energy] = lex.voice;
  // Intensity scales how far the voice leaves neutral — a contained beat stays close to the base voice.
  const k = emotion.intensity;
  return {
    character: name,
    role,
    objective: motivation?.want || '',
    obstacle: motivation?.obstacle || (others.length ? others.join(' and ') : undefined),
    tactic: tacticFor(emotion, role),
    emotion,
    toward: toward.name !== emotion.name || Math.abs(toward.intensity - emotion.intensity) > 0.08 ? toward : undefined,
    subtext: subtext || motivation?.fear ? [subtext, motivation?.fear && `afraid of ${motivation.fear}`].filter(Boolean).join('; ') : undefined,
    physical: {
      eyes: role === 'listening' ? `${lex.eyes} — the reaction lands in the eyes first` : lex.eyes,
      face: lex.face, breath: lex.breath, body: lex.body, tempo: tempoWord(emotion),
    },
    vocal: {
      pitch: +lerp(1, pitch, k).toFixed(3), rate: +lerp(1, rate, k).toFixed(3), energy: +lerp(1, energy, k).toFixed(3),
      note: `${intensityWord(k)} ${emotion.name}; ${tempoWord(emotion)} pace; ${lex.breath}`,
    },
  };
}

/** Music and sound for a moment, from the same emotional state the actors are playing. */
export function scoreCueFor(emotions: EmotionState[], tension: number): ScoreCue {
  const n = Math.max(1, emotions.length);
  const v = emotions.reduce((s, e) => s + e.valence, 0) / n;
  const a = emotions.length ? emotions.reduce((s, e) => s + e.arousal, 0) / n : 0.3;
  const d = emotions.length ? emotions.reduce((s, e) => s + e.dominance, 0) / n : 0.5;
  const tempoBpm = Math.round(56 + a * 70 + tension * 14);
  const mode = v > 0.25 ? (a > 0.6 ? 'major, lifted' : 'major, warm') : v < -0.25
    ? (d < 0.35 && a > 0.6 ? 'dissonant clusters, unresolved' : 'minor')
    : 'modal and ambiguous, suspended harmony';
  const dynamics = tension < 0.3 ? 'pp' : tension < 0.5 ? 'p' : tension < 0.7 ? 'mf' : tension < 0.85 ? 'f' : 'ff';
  const texture = tension < 0.35 ? 'sparse — a single voice or held tone' : tension < 0.7 ? 'layered, with a pulse underneath' : 'full, driving, percussion forward';
  const soundDesign = tension < 0.35
    ? 'room tone and small practical sounds carry the space; let silence sit'
    : tension < 0.7 ? 'tighten the ambience; foreground breath, cloth and footsteps'
      : (v < 0 ? 'ambience drops away; low sub pressure, sharp close detail' : 'wide open air, bright transients, movement in the surround');
  return {
    tempoBpm, mode, dynamics, texture, soundDesign,
    prompt: `${tempoBpm} bpm, ${mode}, ${dynamics}, ${texture}. Sound: ${soundDesign}.`,
  };
}

/** Plan the performance of a whole scene: one direction per character per shot, on an arc.
 *  `scene` is a SLATE scene (bible + shots). `motivations` is optional enrichment from Story
 *  Intelligence, keyed by character name. */
export function planScenePerformance(scene: any, motivations: Record<string, CharacterMotivation> = {}): ScenePerformancePlan {
  const shots: any[] = scene?.shots || [];
  const chars: any[] = scene?.bible?.characters || [];
  const names = chars.map((c) => c?.name).filter(Boolean);
  const mode = scene?.mode === 'action' ? 'action' : 'dialogue';
  const step = shots.length > 1 ? 1 / (shots.length - 1) : 0;
  const motive = (n: string) => motivations[n] || motivations[n.toLowerCase()] || motivations[n.toUpperCase()];

  return {
    sceneId: scene?.id,
    shots: shots.map((shot, i) => {
      const position = shots.length > 1 ? i / (shots.length - 1) : 0.5;
      const tension = tensionAt(position, shot?.type, mode);
      const present = charactersInShot(shot, names);
      const beats = present.map(({ name, role }) => buildBeat({
        name, role, position, tension, step,
        arc: chars.find((c) => c?.name === name)?.arc_in_scene,
        motivation: motive(name),
        subtext: role === 'speaking' ? scene?.bible?.subtext_read : undefined,
        others: present.filter((p) => p.name !== name).map((p) => p.name),
      }));
      return { shotId: shot?.id, slug: shot?.slug, position, tension, beats, score: scoreCueFor(beats.map((b) => b.emotion), tension) };
    }),
  };
}

// ── phrasing a beat ─────────────────────────────────────────────────────────────

/** A single frozen moment — what a still or a storyboard frame needs. */
export function stillDirection(b: PerformanceBeat): string {
  return `${b.character}: ${intensityWord(b.emotion.intensity)} ${b.emotion.name} — ${b.physical.eyes}, ${b.physical.face}, ${b.physical.body}.`;
}

/** A beat that moves — what a video model needs: where it starts, where it lands, and the intention
 *  driving it. `withVoice` adds delivery for models that generate the line themselves. */
export function motionDirection(b: PerformanceBeat, withVoice = false): string {
  const turn = b.toward && b.toward.name !== b.emotion.name
    ? ` shifting toward ${b.toward.name} by the end of the shot`
    : b.toward && b.toward.intensity > b.emotion.intensity ? ', building through the shot' : '';
  const parts = [
    `${b.character} plays to ${b.tactic}: ${intensityWord(b.emotion.intensity)} ${b.emotion.name}${turn}`,
    `${b.physical.eyes}; ${b.physical.breath}; ${b.physical.body}`,
    `${b.physical.tempo} tempo`,
  ];
  if (b.subtext) parts.push(`underneath: ${b.subtext}`);
  if (withVoice && b.role === 'speaking') parts.push(`delivery: ${b.vocal.note}`);
  return parts.join('. ') + '.';
}

/** Delivery direction for a TTS / voice model, in the same shape the voice-print presets use. */
export function voiceDelivery(b: PerformanceBeat): { pitch: number; rate: number; energy: number; direction: string } {
  return { pitch: b.vocal.pitch, rate: b.vocal.rate, energy: b.vocal.energy, direction: `${b.character} — ${b.vocal.note}. Intention: to ${b.tactic}.` };
}

/** The score and sound brief for a scene: one cue per shot, merged where neighbours agree, so the music
 *  side receives sections instead of a cue change on every cut. */
export function scoreBrief(plan: ScenePerformancePlan): { fromSlug?: string; toSlug?: string; shotIds: string[]; cue: ScoreCue }[] {
  const out: { fromSlug?: string; toSlug?: string; shotIds: string[]; cue: ScoreCue }[] = [];
  for (const s of plan.shots) {
    const last = out[out.length - 1];
    if (last && last.cue.mode === s.score.mode && last.cue.dynamics === s.score.dynamics && Math.abs(last.cue.tempoBpm - s.score.tempoBpm) <= 8) {
      last.shotIds.push(s.shotId); last.toSlug = s.slug;
    } else out.push({ fromSlug: s.slug, toSlug: s.slug, shotIds: [s.shotId], cue: s.score });
  }
  return out;
}
