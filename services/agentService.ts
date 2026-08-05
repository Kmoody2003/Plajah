/**
 * agentService.ts — Plajah Aria agent client layer.
 *
 * ── Profitability model (estimated MAI Thinking pricing, June 2026) ───────────
 *
 * Cost drivers per user/month at average engagement:
 *   Chat (MAI Thinking): ~$0.006/message → 60% routed locally = $0.0024 effective
 *   MAI Voice 2:         ~$15/1M chars  → MAIN cost driver for authors
 *   Image generation:    ~$0.04/image
 *   Bing Search:         ~$3/1K queries
 *   MAI Transcribe 1.5:  ~$1.00/hr
 *
 * CRITICAL INSIGHT: Voice characters — not chat messages — determine whether
 * author-heavy tiers are profitable.  The tier structure caps voice separately.
 *
 * Local inference (Phi-4-mini via Windows ML / ONNX Runtime Android) routes
 * ~65% of messages locally, reducing server chat cost by ~60-70%.  This does
 * not reduce voice/image costs.
 *
 * ── Tier margins (estimated, at volume Azure pricing) ────────────────────────
 *  FREE         $0       COGS ~$0.02   acquisition cost
 *  STARTER      $4.99    COGS ~$0.45   margin ~91%
 *  CREATOR      $9.99    COGS ~$0.80   margin ~92%
 *  AUTHOR PRO   $24.99   COGS ~$10.00  margin ~60%   (voice-heavy tier)
 *  PLAJAH+      $29.99   COGS ~$8.50   margin ~72%   (general power tier)
 *  STUDIO PRO   $59.99   COGS ~$18.00  margin ~70%   (unlimited everything)
 *
 * ── Add-on pack margins ──────────────────────────────────────────────────────
 *  Thinking Token Boost  $4.99   COGS ~$0.08   margin ~98%  ← best margin
 *  Research Pack         $9.99   COGS ~$1.50   margin ~85%  ← great
 *  Image Pack            $14.99  COGS ~$5.60   margin ~63%
 *  Voice Pack S (500K)   $7.99   COGS ~$5.00   margin ~37%  ← thin; needs volume
 *  Voice Pack M (2M)     $24.99  COGS ~$14.00  margin ~44%
 *  Voice Pack L (5M)     $49.99  COGS ~$30.00  margin ~40%
 *  Transcription Pack    $9.99   COGS ~$5.00   margin ~50%
 */

import { auth } from './backendService';
import { collection, doc, getDoc, getDocs, addDoc, updateDoc, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import { db } from './firebase';

// ── Tier definitions ──────────────────────────────────────────────────────────

export type AgentTier =
  | 'FREE'
  | 'STARTER'
  | 'CREATOR'
  | 'AUTHOR_PRO'    // Writer/author focused — voice-heavy
  | 'PLAJAH_PLUS'   // General power tier
  | 'STUDIO_PRO';   // Unlimited everything

export interface AgentTierConfig {
  tier: AgentTier;
  label: string;
  price: number;            // USD/month
  // Chat
  dailyMessages: number;          // -1 = unlimited
  thinkingBudgetTokens: number;   // per message max thinking budget
  localInferenceFirst: boolean;   // route simple queries to Phi-4 local before server
  // Web
  webSearchesPerDay: number;
  // Files
  uploadsPerSession: number;
  // Builds
  moduleBuildsPerMonth: number;   // -1 = unlimited
  galleryBuildsPerMonth: number;
  // Voice (MAI Voice 2)
  voiceCharsPerMonth: number;     // -1 = unlimited; chars of TTS synthesis
  voiceHDUpgrade: boolean;        // access HD 30$/1M voice
  // Transcription (MAI Transcribe 1.5)
  transcriptionHoursPerMonth: number;
  // Image generation
  imagesPerMonth: number;
  hdImagesPerMonth: number;
  // Writer-specific
  writerToolsEnabled: boolean;    // style analysis, plot continuity, character guard
  articleAssistEnabled: boolean;
  // UI
  color: string;
  badge: string;
  description: string;
}

export const AGENT_TIERS: Record<AgentTier, AgentTierConfig> = {
  FREE: {
    tier: 'FREE', label: 'Free', price: 0,
    dailyMessages: 5, thinkingBudgetTokens: 1000, localInferenceFirst: true,
    webSearchesPerDay: 0, uploadsPerSession: 0,
    moduleBuildsPerMonth: 1, galleryBuildsPerMonth: 0,
    voiceCharsPerMonth: 0, voiceHDUpgrade: false,
    transcriptionHoursPerMonth: 0,
    imagesPerMonth: 0, hdImagesPerMonth: 0,
    writerToolsEnabled: false, articleAssistEnabled: false,
    color: '#6b7280', badge: '',
    description: 'Try Aria with 5 messages a day',
  },
  STARTER: {
    tier: 'STARTER', label: 'Starter', price: 4.99,
    dailyMessages: 15, thinkingBudgetTokens: 2000, localInferenceFirst: true,
    webSearchesPerDay: 0, uploadsPerSession: 1,
    moduleBuildsPerMonth: 3, galleryBuildsPerMonth: 1,
    voiceCharsPerMonth: 50_000,   // ~3 minutes of narration
    voiceHDUpgrade: false,
    transcriptionHoursPerMonth: 0,
    imagesPerMonth: 5, hdImagesPerMonth: 0,
    writerToolsEnabled: false, articleAssistEnabled: true,
    color: '#22c55e', badge: '🌱',
    description: 'Light creative assistance',
  },
  CREATOR: {
    tier: 'CREATOR', label: 'Creator', price: 9.99,
    dailyMessages: 30, thinkingBudgetTokens: 3000, localInferenceFirst: true,
    webSearchesPerDay: 3, uploadsPerSession: 3,
    moduleBuildsPerMonth: 10, galleryBuildsPerMonth: 5,
    voiceCharsPerMonth: 200_000,  // ~12 minutes of narration
    voiceHDUpgrade: false,
    transcriptionHoursPerMonth: 0.5,
    imagesPerMonth: 20, hdImagesPerMonth: 5,
    writerToolsEnabled: false, articleAssistEnabled: true,
    color: '#3b82f6', badge: '⚡',
    description: 'Build modules, galleries, and articles',
  },
  AUTHOR_PRO: {
    tier: 'AUTHOR_PRO', label: 'Author Pro', price: 24.99,
    dailyMessages: 60, thinkingBudgetTokens: 6000, localInferenceFirst: true,
    webSearchesPerDay: 15, uploadsPerSession: 10,
    moduleBuildsPerMonth: -1, galleryBuildsPerMonth: 15,
    // Voice — the key differentiator for this tier
    voiceCharsPerMonth: 500_000,  // ~30 min of narration; one short book chapter
    voiceHDUpgrade: true,         // HD voice quality for books
    transcriptionHoursPerMonth: 3,  // record your own narration; MAI Transcribe verifies accuracy
    imagesPerMonth: 50, hdImagesPerMonth: 15,
    // Writer-specific tools (style matching, plot continuity, character guard)
    writerToolsEnabled: true, articleAssistEnabled: true,
    color: '#8b5cf6', badge: '✍️',
    description: 'Built for novelists, screenwriters, and journalists',
  },
  PLAJAH_PLUS: {
    tier: 'PLAJAH_PLUS', label: 'Plajah+', price: 29.99,
    dailyMessages: 80, thinkingBudgetTokens: 6000, localInferenceFirst: true,
    webSearchesPerDay: 20, uploadsPerSession: 10,
    moduleBuildsPerMonth: -1, galleryBuildsPerMonth: -1,
    voiceCharsPerMonth: 300_000,  // general use — less than Author Pro
    voiceHDUpgrade: true,
    transcriptionHoursPerMonth: 1,
    imagesPerMonth: 60, hdImagesPerMonth: 20,
    writerToolsEnabled: true, articleAssistEnabled: true,
    color: '#d946ef', badge: '🌟',
    description: 'Full platform power for serious creators',
  },
  STUDIO_PRO: {
    tier: 'STUDIO_PRO', label: 'Studio Pro', price: 59.99,
    dailyMessages: -1, thinkingBudgetTokens: 10000, localInferenceFirst: true,
    webSearchesPerDay: -1, uploadsPerSession: -1,
    moduleBuildsPerMonth: -1, galleryBuildsPerMonth: -1,
    voiceCharsPerMonth: 2_000_000, // ~2 full novels/month
    voiceHDUpgrade: true,
    transcriptionHoursPerMonth: 10,
    imagesPerMonth: -1, hdImagesPerMonth: 100,
    writerToolsEnabled: true, articleAssistEnabled: true,
    color: '#f59e0b', badge: '🏆',
    description: 'Unlimited AI for production studios and prolific authors',
  },
};

// ── Add-on token packs ────────────────────────────────────────────────────────
// Sold separately — can be stacked on any tier.
// Server enforces available balance from Firestore addons_balance document.

export type AddOnPackId =
  | 'THINKING_BOOST_S'   // +500K thinking tokens/month  — ~98% margin
  | 'THINKING_BOOST_M'   // +2M thinking tokens/month
  | 'RESEARCH_PACK_S'    // +500 web searches             — ~85% margin
  | 'RESEARCH_PACK_M'    // +2000 web searches
  | 'IMAGE_PACK_S'       // +100 standard + 20 HD images  — ~63% margin
  | 'IMAGE_PACK_M'       // +500 standard + 100 HD images
  | 'VOICE_PACK_S'       // +500K voice chars             — ~37% margin (needs volume)
  | 'VOICE_PACK_M'       // +2M voice chars               — ~44% margin
  | 'VOICE_PACK_L'       // +5M voice chars               — ~40% margin
  | 'VOICE_HD_PACK'      // +1M HD voice chars            — ~45% margin
  | 'TRANSCRIBE_PACK'    // +5 hours of MAI Transcribe    — ~50% margin
  | 'ARIA_DAY_PASS';     // Unlimited for 24 hours        — good for bursts

export interface AddOnPack {
  id: AddOnPackId;
  name: string;
  description: string;
  price: number;
  // What it grants (added to monthly balance)
  thinkingTokens?: number;
  webSearches?: number;
  standardImages?: number;
  hdImages?: number;
  voiceChars?: number;
  voiceHDChars?: number;
  transcriptionHours?: number;
  unlimitedHours?: number;   // for day pass
  emoji: string;
  bestFor: string[];         // tags: ['authors', 'general', 'filmmakers', etc.]
  highlightedFor?: AgentTier[];  // tiers where this is especially useful
}

export const ADD_ON_PACKS: Record<AddOnPackId, AddOnPack> = {
  THINKING_BOOST_S: {
    id: 'THINKING_BOOST_S', name: 'Thinking Boost', price: 4.99,
    description: 'Give Aria deeper reasoning capacity for 500K extra thinking tokens this month.',
    thinkingTokens: 500_000,
    emoji: '🧠', bestFor: ['authors', 'general', 'filmmakers'],
    highlightedFor: ['FREE', 'STARTER', 'CREATOR'],
  },
  THINKING_BOOST_M: {
    id: 'THINKING_BOOST_M', name: 'Thinking Boost XL', price: 14.99,
    description: '2M extra thinking tokens — for a month of intensive creative work.',
    thinkingTokens: 2_000_000,
    emoji: '🧠', bestFor: ['authors', 'general'],
  },
  RESEARCH_PACK_S: {
    id: 'RESEARCH_PACK_S', name: 'Research Pack', price: 9.99,
    description: '500 additional web searches for fact-checking, research, and discovery.',
    webSearches: 500,
    emoji: '🔍', bestFor: ['authors', 'journalists', 'general'],
    highlightedFor: ['STARTER', 'CREATOR'],
  },
  RESEARCH_PACK_M: {
    id: 'RESEARCH_PACK_M', name: 'Research Pack XL', price: 29.99,
    description: '2,000 additional web searches.',
    webSearches: 2000,
    emoji: '🔍', bestFor: ['authors', 'journalists'],
  },
  IMAGE_PACK_S: {
    id: 'IMAGE_PACK_S', name: 'Image Pack', price: 14.99,
    description: '100 standard + 20 HD AI-generated images for covers, illustrations, and assets.',
    standardImages: 100, hdImages: 20,
    emoji: '🎨', bestFor: ['authors', 'filmmakers', 'general'],
    highlightedFor: ['CREATOR', 'AUTHOR_PRO'],
  },
  IMAGE_PACK_M: {
    id: 'IMAGE_PACK_M', name: 'Image Pack XL', price: 39.99,
    description: '500 standard + 100 HD images.',
    standardImages: 500, hdImages: 100,
    emoji: '🎨', bestFor: ['filmmakers', 'general'],
  },
  VOICE_PACK_S: {
    id: 'VOICE_PACK_S', name: 'Voice Pack — Short Story', price: 7.99,
    description: '500K additional voice characters (~30 min narration) for your audiobook or podcast.',
    voiceChars: 500_000,
    emoji: '🎙️', bestFor: ['authors', 'podcasters'],
    highlightedFor: ['STARTER', 'CREATOR', 'AUTHOR_PRO'],
  },
  VOICE_PACK_M: {
    id: 'VOICE_PACK_M', name: 'Voice Pack — Novel', price: 24.99,
    description: '2M voice characters — enough for a full short novel narration.',
    voiceChars: 2_000_000,
    emoji: '🎙️', bestFor: ['authors'],
    highlightedFor: ['AUTHOR_PRO', 'PLAJAH_PLUS'],
  },
  VOICE_PACK_L: {
    id: 'VOICE_PACK_L', name: 'Voice Pack — Epic', price: 49.99,
    description: '5M voice characters — full-length novel + extras.',
    voiceChars: 5_000_000,
    emoji: '🎙️', bestFor: ['authors', 'publishers'],
  },
  VOICE_HD_PACK: {
    id: 'VOICE_HD_PACK', name: 'HD Voice Pack', price: 34.99,
    description: '1M HD voice characters — premium quality for commercial audiobooks.',
    voiceHDChars: 1_000_000,
    emoji: '✨', bestFor: ['authors', 'publishers'],
    highlightedFor: ['AUTHOR_PRO', 'STUDIO_PRO'],
  },
  TRANSCRIBE_PACK: {
    id: 'TRANSCRIBE_PACK', name: 'Author Recording Pack', price: 9.99,
    description: '5 additional hours of MAI Transcribe 1.5 — record your own narration with AI accuracy verification.',
    transcriptionHours: 5,
    emoji: '🎤', bestFor: ['authors'],
    highlightedFor: ['STARTER', 'CREATOR'],
  },
  ARIA_DAY_PASS: {
    id: 'ARIA_DAY_PASS', name: 'Day Pass', price: 4.99,
    description: 'Unlimited Aria access for 24 hours — great for writing sprints and hackathons.',
    unlimitedHours: 24,
    emoji: '⚡', bestFor: ['general'],
  },
};

// ── Add-on balance (per user, stored in Firestore) ────────────────────────────
export interface AddOnBalance {
  thinkingTokensRemaining: number;
  webSearchesRemaining: number;
  standardImagesRemaining: number;
  hdImagesRemaining: number;
  voiceCharsRemaining: number;
  voiceHDCharsRemaining: number;
  transcriptionHoursRemaining: number;
  dayPassExpiresAt?: number; // epoch ms
  lastUpdated: number;
}

// ── Writer tools available within Aria ───────────────────────────────────────
// These are system-prompt specialisations activated for AUTHOR_PRO / STUDIO_PRO
// or any user with accountType === 'WRITER'
export const WRITER_TOOLS = [
  {
    id: 'style_analysis',
    name: 'Style Analyser',
    description: 'Upload a writing sample — Aria learns your voice and matches it in all suggestions.',
    emoji: '🖊️',
  },
  {
    id: 'chapter_outliner',
    name: 'Chapter Outliner',
    description: 'Give Aria your premise and genre — get a structured chapter outline.',
    emoji: '📋',
  },
  {
    id: 'plot_continuity',
    name: 'Continuity Guard',
    description: 'Feed Aria your previous chapters — it flags inconsistencies in plot and character.',
    emoji: '🔍',
  },
  {
    id: 'character_voice',
    name: 'Character Voice Lock',
    description: 'Define your characters — Aria ensures each speaks in their distinctive voice.',
    emoji: '🎭',
  },
  {
    id: 'research_mode',
    name: 'Research Mode',
    description: 'Deep-dive factual research with web grounding — for non-fiction and historical fiction.',
    emoji: '📚',
  },
  {
    id: 'article_seo',
    name: 'Article Optimiser',
    description: 'Analyse your article structure, suggest SEO tags, and improve readability score.',
    emoji: '📰',
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AgentToolCall {
  name: string;
  label: string;
  status: 'running' | 'done' | 'error';
  result?: string;
}

export interface AgentBuildOutput {
  type: 'MODULE' | 'GALLERY' | 'PLAYLIST' | 'CURATION' | 'CHAPTER_OUTLINE' | 'ARTICLE_STRUCTURE';
  title: string;
  description: string;
  config: Record<string, any>;
  previewGradient?: string;
  previewEmoji?: string;
  createdAt: number;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'muse' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: AgentToolCall[];
  buildOutput?: AgentBuildOutput;
  attachmentNames?: string[];
  error?: boolean;
  servedLocally?: boolean;  // true when Phi-4 answered this without server round-trip
}

export interface AgentSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastSnippet: string;
}

export interface AgentUsage {
  dailyMessages: number;
  dailySearches: number;
  monthlyModules: number;
  monthlyGalleries: number;
  monthlyVoiceChars: number;
  monthlyImages: number;
  monthlyTranscriptionMinutes: number;
  resetDate: string;
  // Add-on balances (from separate addons_balance document)
  addOnBalance?: Partial<AddOnBalance>;
}

// ── Session helpers ───────────────────────────────────────────────────────────
async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try { return await user.getIdToken(); } catch { return null; }
}

export async function getAgentUsage(uid: string): Promise<AgentUsage> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'muse_usage', today));
    if (snap.exists()) return snap.data() as AgentUsage;
  } catch {}
  return {
    dailyMessages: 0, dailySearches: 0, monthlyModules: 0,
    monthlyGalleries: 0, monthlyVoiceChars: 0, monthlyImages: 0,
    monthlyTranscriptionMinutes: 0, resetDate: today,
  };
}

export async function createSession(uid: string): Promise<string> {
  const ref = await addDoc(collection(db, 'users', uid, 'muse_sessions'), {
    title: 'New Conversation',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    messageCount: 0,
    lastSnippet: '',
  });
  return ref.id;
}

export async function listSessions(uid: string): Promise<AgentSession[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'users', uid, 'muse_sessions'), orderBy('updatedAt', 'desc'), limit(20))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AgentSession));
  } catch { return []; }
}

export function listenToMessages(
  uid: string,
  sessionId: string,
  onMessages: (msgs: AgentMessage[]) => void,
): () => void {
  return onSnapshot(
    query(collection(db, 'users', uid, 'muse_sessions', sessionId, 'messages'), orderBy('timestamp', 'asc')),
    snap => onMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as AgentMessage))),
    () => {},
  );
}

// ── Send message ──────────────────────────────────────────────────────────────
export interface SendMessageOptions {
  uid: string;
  sessionId: string;
  message: string;
  attachments?: Array<{ name: string; dataUrl: string; type: string }>;
  tier: AgentTier;
  accountType?: string;
  activeTool?: string;    // active writer tool if any
  context?: {
    currentView?: string;
    currentAlbumId?: string;
    userInterests?: string[];
    currentBookId?: string;
    writingStyle?: string;  // style sample cached from style analyser
  };
  servedLocally?: boolean;  // if local Phi-4 handled this, still log but don't bill
}

export interface SendMessageResult {
  reply: string;
  toolCalls?: AgentToolCall[];
  buildOutput?: AgentBuildOutput;
  usage?: AgentUsage;
  error?: string;
  limitReached?: boolean;
  limitType?: 'messages' | 'voice' | 'images' | 'searches' | 'transcription';
}

export async function sendAgentMessage(opts: SendMessageOptions): Promise<SendMessageResult> {
  const token = await getIdToken();
  if (!token) return { reply: '', error: 'Not authenticated.' };

  try {
    const res = await fetch('/api/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        sessionId: opts.sessionId,
        message: opts.message,
        attachments: opts.attachments,
        tier: opts.tier,
        accountType: opts.accountType,
        activeTool: opts.activeTool,
        context: opts.context,
        servedLocally: opts.servedLocally,
      }),
    });

    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      return { reply: '', limitReached: true, limitType: body.limitType, error: body.error || 'Limit reached.' };
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { reply: '', error: err.error || 'Something went wrong.' };
    }
    return await res.json();
  } catch (e: any) {
    return { reply: '', error: e.message || 'Network error.' };
  }
}

// ── Add-on purchase (initiates Stripe checkout) ───────────────────────────────
export async function purchaseAddOn(
  uid: string,
  packId: AddOnPackId,
): Promise<{ checkoutUrl?: string; error?: string }> {
  const token = await getIdToken();
  if (!token) return { error: 'Not authenticated.' };
  try {
    const res = await fetch('/api/agent/addon/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ packId }),
    });
    if (!res.ok) return { error: 'Checkout failed.' };
    return await res.json();
  } catch (e: any) {
    return { error: e.message };
  }
}

// ── Tier determination helper (maps platform tiers to agent tiers) ─────────────
export function resolveAgentTier(
  platformTier?: string,
  accountType?: string,
  plajahPlus?: boolean,
): AgentTier {
  if (platformTier === 'ELITE' || platformTier === 'STUDIO_PRO') return 'STUDIO_PRO';
  if (plajahPlus || platformTier === 'PRO') return 'PLAJAH_PLUS';
  if (accountType === 'WRITER') return 'AUTHOR_PRO'; // WRITER accounts get Author Pro by default
  if (platformTier === 'PIONEER') return 'CREATOR';
  return 'FREE';
}

// ── Usage limit helpers ────────────────────────────────────────────────────────
export function isAtMessageLimit(usage: AgentUsage, tier: AgentTier, addOnBalance?: Partial<AddOnBalance>): boolean {
  const cfg = AGENT_TIERS[tier];
  if (cfg.dailyMessages === -1) return false;
  if (addOnBalance?.dayPassExpiresAt && addOnBalance.dayPassExpiresAt > Date.now()) return false;
  return usage.dailyMessages >= cfg.dailyMessages;
}

export function voiceCharsRemaining(usage: AgentUsage, tier: AgentTier, addOnBalance?: Partial<AddOnBalance>): number {
  const cfg = AGENT_TIERS[tier];
  const baseRemaining = cfg.voiceCharsPerMonth === -1 ? Infinity : Math.max(0, cfg.voiceCharsPerMonth - usage.monthlyVoiceChars);
  const addonRemaining = (addOnBalance?.voiceCharsRemaining ?? 0) + (addOnBalance?.voiceHDCharsRemaining ?? 0);
  return baseRemaining === Infinity ? Infinity : baseRemaining + addonRemaining;
}

export function imagesRemaining(usage: AgentUsage, tier: AgentTier, addOnBalance?: Partial<AddOnBalance>): number {
  const cfg = AGENT_TIERS[tier];
  const base = cfg.imagesPerMonth === -1 ? Infinity : Math.max(0, cfg.imagesPerMonth - usage.monthlyImages);
  const addon = (addOnBalance?.standardImagesRemaining ?? 0) + (addOnBalance?.hdImagesRemaining ?? 0);
  return base === Infinity ? Infinity : base + addon;
}
