/**
 * Plajah Home — Voice Profile Service
 *
 * Recognises individual household members by voice using on-device
 * speaker-embedding models (ECAPA-TDNN / TitaNet via ONNX Runtime Web
 * or Sherpa-ONNX WASM). Aria adapts her responses, permissions, and
 * personality based on who is speaking.
 *
 * Architecture
 * ────────────
 *  Mic → VAD → Whisper ASR (transcription)
 *                  ↓
 *         ECAPA-TDNN / TitaNet (speaker embedding)
 *                  ↓
 *         Cosine similarity vs enrolled profiles
 *                  ↓
 *         Identified speaker → Aria context enrichment
 *
 * Privacy: All inference runs on-device (WebGPU/WASM or Windows
 * DirectML). Voice embeddings are stored locally or encrypted in
 * Firestore — raw audio is never persisted.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type VoiceProfileRole = 'adult' | 'teen' | 'child' | 'guest';

export interface VoiceProfile {
  id: string;
  userId?: string;                // Plajah UID (if linked to a Plajah account)
  name: string;                   // "Kenny", "Mom", "Junior"
  role: VoiceProfileRole;
  avatarUrl?: string;

  // Speaker embedding (d-vector / x-vector)
  embedding: Float32Array | number[];
  embeddingModel: string;         // e.g. "ecapa-tdnn-v2" or "titanet-small"
  enrolledAt: number;
  enrollmentSamples: number;      // How many voice clips were used for enrollment

  // Personalisation
  preferredAriaVoice?: string;    // Kokoro voice ID — kids might prefer a different tone
  ariaPersonality?: string;       // Aria adapts: formal for adults, playful for kids
  contentFilter: 'none' | 'moderate' | 'strict'; // COPPA-compliant for children

  // Permissions — what this voice can control
  permissions: VoicePermissions;

  // Plajah Academia link (for students)
  academiaStudentId?: string;     // Links to `classroom_modules` / student data
  academiaClassroomIds?: string[]; // Enrolled classrooms
}

export interface VoicePermissions {
  canControlLights: boolean;
  canControlThermostat: boolean;
  canControlLocks: boolean;
  canControlSecurity: boolean;
  canMakeIntercomCalls: boolean;
  canPlayExplicitContent: boolean;
  canAccessSmartThings: boolean;
  canModifyScenes: boolean;
  canAddDevices: boolean;
  maxVolume?: number;             // Volume cap for kids (e.g. 60%)
  allowedRooms?: string[];        // Restrict which rooms they can control
  curfewStart?: string;           // "21:00" — after this time, limited control
  curfewEnd?: string;             // "07:00"
}

export interface VoiceIdentificationResult {
  profileId: string | null;       // null = unknown speaker
  profileName: string | null;
  confidence: number;             // 0–1 cosine similarity score
  isAboveThreshold: boolean;      // > IDENTIFICATION_THRESHOLD
  embedding: Float32Array;        // The raw embedding for this utterance
  latencyMs: number;              // How long identification took
}

export interface EnrollmentSession {
  profileId: string;
  samples: Float32Array[];        // Embeddings from each enrollment utterance
  prompts: string[];              // What the user was asked to say
  currentStep: number;
  totalSteps: number;
  isComplete: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Minimum cosine similarity to consider a match */
const IDENTIFICATION_THRESHOLD = 0.72;

/** Number of voice samples needed for reliable enrollment */
const MIN_ENROLLMENT_SAMPLES = 5;

/** Enrollment prompts — varied sentences to capture speaker range */
const ENROLLMENT_PROMPTS = [
  'Hey Aria, turn on the living room lights.',
  'What\'s the temperature in the kitchen?',
  'Play some music in the bedroom.',
  'Good morning, what\'s the weather today?',
  'Set a timer for fifteen minutes.',
  'Lock the front door and turn off all the lights.',
  'Tell me about my schedule for today.',
];

/** Model configs for on-device speaker embedding */
export const EMBEDDING_MODELS = {
  'ecapa-tdnn-v2': {
    name: 'ECAPA-TDNN v2',
    onnxPath: '/models/ecapa-tdnn-v2-int8.onnx',
    embeddingDim: 192,
    sampleRate: 16000,
    runtime: 'onnxruntime-web' as const,
    description: 'Gold-standard speaker embeddings, INT8 quantized for browser',
  },
  'titanet-small': {
    name: 'TitaNet Small',
    onnxPath: '/models/titanet-small-int8.onnx',
    embeddingDim: 192,
    sampleRate: 16000,
    runtime: 'onnxruntime-web' as const,
    description: 'NVIDIA edge-optimized, excellent accuracy/speed trade-off',
  },
  'sherpa-speaker': {
    name: 'Sherpa-ONNX Speaker ID',
    onnxPath: '/models/sherpa-speaker-id.onnx',
    embeddingDim: 512,
    sampleRate: 16000,
    runtime: 'sherpa-onnx' as const,
    description: 'Sherpa-ONNX all-in-one bundle with WASM support',
  },
} as const;

export type EmbeddingModelId = keyof typeof EMBEDDING_MODELS;

// ─── Default Profiles ────────────────────────────────────────────────────────

const DEFAULT_ADULT_PERMISSIONS: VoicePermissions = {
  canControlLights: true,
  canControlThermostat: true,
  canControlLocks: true,
  canControlSecurity: true,
  canMakeIntercomCalls: true,
  canPlayExplicitContent: true,
  canAccessSmartThings: true,
  canModifyScenes: true,
  canAddDevices: true,
};

const DEFAULT_TEEN_PERMISSIONS: VoicePermissions = {
  canControlLights: true,
  canControlThermostat: true,
  canControlLocks: false,
  canControlSecurity: false,
  canMakeIntercomCalls: true,
  canPlayExplicitContent: false,
  canAccessSmartThings: false,
  canModifyScenes: false,
  canAddDevices: false,
  maxVolume: 80,
};

const DEFAULT_CHILD_PERMISSIONS: VoicePermissions = {
  canControlLights: true,
  canControlThermostat: false,
  canControlLocks: false,
  canControlSecurity: false,
  canMakeIntercomCalls: true,
  canPlayExplicitContent: false,
  canAccessSmartThings: false,
  canModifyScenes: false,
  canAddDevices: false,
  maxVolume: 60,
  curfewStart: '21:00',
  curfewEnd: '07:00',
};

const DEFAULT_GUEST_PERMISSIONS: VoicePermissions = {
  canControlLights: true,
  canControlThermostat: false,
  canControlLocks: false,
  canControlSecurity: false,
  canMakeIntercomCalls: false,
  canPlayExplicitContent: false,
  canAccessSmartThings: false,
  canModifyScenes: false,
  canAddDevices: false,
  maxVolume: 70,
};

export function getDefaultPermissions(role: VoiceProfileRole): VoicePermissions {
  switch (role) {
    case 'adult': return { ...DEFAULT_ADULT_PERMISSIONS };
    case 'teen':  return { ...DEFAULT_TEEN_PERMISSIONS };
    case 'child': return { ...DEFAULT_CHILD_PERMISSIONS };
    case 'guest': return { ...DEFAULT_GUEST_PERMISSIONS };
  }
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two embedding vectors.
 * Used for speaker verification: compare incoming voice against enrolled profiles.
 */
export function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = typeof a[i] === 'number' ? a[i] : 0;
    const bi = typeof b[i] === 'number' ? b[i] : 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Identify a speaker from a voice embedding against all enrolled profiles.
 * Returns the best-matching profile (or null if below threshold).
 */
export function identifySpeaker(
  embedding: Float32Array,
  profiles: VoiceProfile[],
): VoiceIdentificationResult {
  const start = performance.now();
  let bestMatch: VoiceProfile | null = null;
  let bestScore = -1;

  for (const profile of profiles) {
    const score = cosineSimilarity(embedding, profile.embedding);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = profile;
    }
  }

  const isAboveThreshold = bestScore >= IDENTIFICATION_THRESHOLD;
  return {
    profileId: isAboveThreshold ? bestMatch?.id ?? null : null,
    profileName: isAboveThreshold ? bestMatch?.name ?? null : null,
    confidence: bestScore,
    isAboveThreshold,
    embedding,
    latencyMs: performance.now() - start,
  };
}

/**
 * Average multiple enrollment embeddings into a single centroid embedding.
 * More samples = more robust identification.
 */
export function computeCentroidEmbedding(samples: Float32Array[]): Float32Array {
  if (samples.length === 0) return new Float32Array(0);
  const dim = samples[0].length;
  const centroid = new Float32Array(dim);

  for (const sample of samples) {
    for (let i = 0; i < dim; i++) {
      centroid[i] += sample[i];
    }
  }
  // Normalize to unit vector
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    centroid[i] /= samples.length;
    norm += centroid[i] * centroid[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) centroid[i] /= norm;
  }
  return centroid;
}

/**
 * Create a new enrollment session for a household member.
 */
export function startEnrollment(profileId: string): EnrollmentSession {
  return {
    profileId,
    samples: [],
    prompts: ENROLLMENT_PROMPTS.slice(0, MIN_ENROLLMENT_SAMPLES),
    currentStep: 0,
    totalSteps: MIN_ENROLLMENT_SAMPLES,
    isComplete: false,
  };
}

/**
 * Add a voice sample to an enrollment session.
 * Returns true when enrollment is complete.
 */
export function addEnrollmentSample(
  session: EnrollmentSession,
  embedding: Float32Array,
): boolean {
  session.samples.push(embedding);
  session.currentStep++;
  if (session.currentStep >= session.totalSteps) {
    session.isComplete = true;
  }
  return session.isComplete;
}

/**
 * Check if a voice command is allowed based on the speaker's permissions.
 */
export function isCommandAllowed(
  profile: VoiceProfile | null,
  commandType: keyof VoicePermissions,
): boolean {
  // Unknown speaker = guest-level permissions
  if (!profile) {
    return DEFAULT_GUEST_PERMISSIONS[commandType] as boolean;
  }

  // Check curfew for children
  if (profile.role === 'child' && profile.permissions.curfewStart && profile.permissions.curfewEnd) {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const current = h * 60 + m;
    const [cH, cM] = profile.permissions.curfewStart.split(':').map(Number);
    const [eH, eM] = profile.permissions.curfewEnd.split(':').map(Number);
    const curfewStart = cH * 60 + cM;
    const curfewEnd = eH * 60 + eM;

    const isDuringCurfew = curfewStart > curfewEnd
      ? (current >= curfewStart || current < curfewEnd) // spans midnight
      : (current >= curfewStart && current < curfewEnd);

    if (isDuringCurfew && commandType !== 'canMakeIntercomCalls') {
      return false; // During curfew, only intercom is allowed
    }
  }

  return profile.permissions[commandType] as boolean;
}

/**
 * Get the Aria personality modifier based on who is speaking.
 * This enriches the Aria system prompt for voice interactions.
 */
export function getAriaPersonalityForSpeaker(profile: VoiceProfile | null): string {
  if (!profile) {
    return 'You are speaking with an unrecognised guest. Be polite and helpful but restrict actions to basic light control only. Suggest they ask the homeowner to add their voice profile.';
  }

  switch (profile.role) {
    case 'adult':
      return `You are speaking with ${profile.name}, an adult household member with full home control permissions. Be efficient, proactive, and conversational. If they have Plajah Academia children, proactively surface relevant school notifications.`;

    case 'teen':
      return `You are speaking with ${profile.name}, a teenager in the household. Be respectful and treat them maturely, but enforce content filters. They cannot control locks, security, or modify scenes. Volume is capped at ${profile.permissions.maxVolume ?? 80}%. If they have assignments due, gently remind them.`;

    case 'child':
      return `You are speaking with ${profile.name}, a child in the household. Be warm, encouraging, and age-appropriate. Use simpler language. They can only control lights and intercom. Volume is capped at ${profile.permissions.maxVolume ?? 60}%. Curfew is active from ${profile.permissions.curfewStart} to ${profile.permissions.curfewEnd}. If they have homework, offer to help with their Plajah Academia assignments in a fun, educational way. Never provide answers directly — guide them through the thinking process.`;

    case 'guest':
      return `You are speaking with ${profile.name}, a guest in the household. Be welcoming and helpful with basic controls (lights, music). Do not allow access to locks, security, or personal information about household members.`;
  }
}

// ─── Mock Voice Profiles ─────────────────────────────────────────────────────

export const MOCK_VOICE_PROFILES: VoiceProfile[] = [
  {
    id: 'vp-kenny',
    userId: 'owner-uid',
    name: 'Kenny',
    role: 'adult',
    embedding: new Float32Array(192), // placeholder
    embeddingModel: 'ecapa-tdnn-v2',
    enrolledAt: Date.now() - 86_400_000 * 30,
    enrollmentSamples: 7,
    contentFilter: 'none',
    permissions: { ...DEFAULT_ADULT_PERMISSIONS },
  },
  {
    id: 'vp-child1',
    userId: 'child1-uid',
    name: 'Junior',
    role: 'child',
    academiaStudentId: 'student-junior-001',
    academiaClassroomIds: ['classroom-math-5th', 'classroom-science-5th'],
    embedding: new Float32Array(192),
    embeddingModel: 'ecapa-tdnn-v2',
    enrolledAt: Date.now() - 86_400_000 * 14,
    enrollmentSamples: 5,
    preferredAriaVoice: 'af_bella',
    contentFilter: 'strict',
    permissions: { ...DEFAULT_CHILD_PERMISSIONS },
  },
];
