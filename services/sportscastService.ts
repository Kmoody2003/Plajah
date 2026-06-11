/**
 * sportscastService — real-time sports broadcast state layer
 * Built on top of Plajah's existing Firestore live_feeds infrastructure.
 * Game state lives at: live_feeds/{feedId}/sportscast/gameState
 * Highlights live at: live_feeds/{feedId}/sportscast_highlights (collection)
 */

import { db } from './firebase';
import { doc, collection, setDoc, addDoc, query, orderBy, limit } from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SportType = 'FOOTBALL' | 'BASKETBALL' | 'BASEBALL' | 'SOCCER' | 'HOCKEY' | 'OTHER';

export interface GameState {
  sport: SportType;
  homeTeam: string;
  awayTeam: string;
  homeColor: string;
  awayColor: string;
  homeScore: number;
  awayScore: number;
  period: number;
  periodLabel: string;
  timeRemaining: string;
  clockRunning: boolean;
  // Football-specific
  down?: number;
  distance?: number;
  ballOn?: number;
  possession?: 'home' | 'away' | null;
  // Replay state
  replayActive: boolean;
  // Processing architecture toggle
  processingMode: 'cloud' | 'local';
  updatedAt: number;
}

export type HighlightType =
  | 'TOUCHDOWN' | 'GOAL' | 'THREE_POINTER' | 'HOME_RUN'
  | 'INTERCEPTION' | 'BIG_PLAY' | 'SAVE' | 'CUSTOM';

export interface HighlightEvent {
  id?: string;
  type: HighlightType;
  label: string;
  team: 'home' | 'away' | null;
  commentaryText: string;
  timestamp: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export function defaultGameState(sport: SportType = 'FOOTBALL'): GameState {
  return {
    sport,
    homeTeam: 'HOME',
    awayTeam: 'AWAY',
    homeColor: '#3B82F6',
    awayColor: '#EF4444',
    homeScore: 0,
    awayScore: 0,
    period: 1,
    periodLabel: buildPeriodLabel(sport, 1),
    timeRemaining: getDefaultClock(sport),
    clockRunning: false,
    down: 1,
    distance: 10,
    ballOn: 25,
    possession: null,
    replayActive: false,
    processingMode: 'cloud',
    updatedAt: Date.now(),
  };
}

export function buildPeriodLabel(sport: SportType, period: number): string {
  if (sport === 'FOOTBALL') return `Q${period}`;
  if (sport === 'BASKETBALL') return `Q${period}`;
  if (sport === 'HOCKEY') return `P${period}`;
  if (sport === 'SOCCER') return period === 1 ? '1st Half' : period === 2 ? '2nd Half' : 'ET';
  if (sport === 'BASEBALL') {
    const s = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
    return s[period - 1] ?? `${period}th`;
  }
  return `${period}`;
}

function getDefaultClock(sport: SportType): string {
  if (sport === 'FOOTBALL' || sport === 'BASKETBALL') return '12:00';
  if (sport === 'HOCKEY') return '20:00';
  if (sport === 'SOCCER') return '0:00';
  return '0:00';
}

// ─── Firestore path helpers ───────────────────────────────────────────────────

const stateRef = (feedId: string) =>
  doc(db, 'live_feeds', feedId, 'sportscast', 'gameState');

const highlightsRef = (feedId: string) =>
  collection(db, 'live_feeds', feedId, 'sportscast_highlights');

// ─── Producer ops ─────────────────────────────────────────────────────────────

export async function initGameState(feedId: string, sport: SportType = 'FOOTBALL') {
  const state = defaultGameState(sport);
  await setDoc(stateRef(feedId), state);
  return state;
}

export async function updateGameState(feedId: string, delta: Partial<GameState>) {
  await setDoc(stateRef(feedId), { ...delta, updatedAt: Date.now() }, { merge: true });
}

export async function pushHighlight(
  feedId: string,
  event: Omit<HighlightEvent, 'id' | 'timestamp'>,
  options?: {
    athleteUserId?: string;
    gameState?: GameState;
    /** Optional: IPFS CID of the highlight clip if already archived */
    videoIpfsCid?: string;
    /** If true, writes the stat event to the Polygon blockchain */
    recordOnChain?: boolean;
  }
): Promise<void> {
  const timestamp = Date.now();
  await addDoc(highlightsRef(feedId), { ...event, timestamp });

  // ── Chain recording (fire-and-forget, non-blocking) ───────────────────────
  if (options?.recordOnChain && options.athleteUserId && options.gameState) {
    const { recordHighlightOnChain } = await import('./athleteChainService');
    recordHighlightOnChain(
      feedId,
      options.athleteUserId,
      { ...event, timestamp } as HighlightEvent,
      options.gameState,
      options.videoIpfsCid ?? '',
    ).catch(err => console.warn('[Sportscast] Chain record failed (non-fatal):', err));
  }
}

// ─── Subscriber ops ──────────────────────────────────────────────────────────

export function subscribeGameState(
  feedId: string,
  callback: (state: GameState | null) => void
): () => void {
  return onSnapshot(stateRef(feedId), snap => {
    callback(snap.exists() ? (snap.data() as GameState) : null);
  });
}

export function subscribeHighlights(
  feedId: string,
  callback: (events: HighlightEvent[]) => void
): () => void {
  const q = query(highlightsRef(feedId), orderBy('timestamp', 'desc'), limit(20));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as HighlightEvent)));
  });
}

// ─── Commentary text generation ───────────────────────────────────────────────

export function buildCommentaryLine(
  type: HighlightType,
  teamName: string,
  state: GameState
): string {
  const score = `${state.homeTeam} ${state.homeScore} - ${state.awayScore} ${state.awayTeam}`;
  switch (type) {
    case 'TOUCHDOWN':
      return `TOUCHDOWN ${teamName}! The crowd is going absolutely wild! Incredible play! ${score}`;
    case 'GOAL':
      return `GOAL! ${teamName} finds the back of the net! Unbelievable finish! ${score}`;
    case 'THREE_POINTER':
      return `TRIPLE! ${teamName} drains it from deep! The gym is erupting! ${score}`;
    case 'HOME_RUN':
      return `HOME RUN! ${teamName} sends it over the wall — that ball is GONE! ${score}`;
    case 'INTERCEPTION':
      return `INTERCEPTION! ${teamName} picks it off! What a heads-up defensive play!`;
    case 'SAVE':
      return `INCREDIBLE SAVE! The goalkeeper denies the attempt for ${teamName}!`;
    case 'BIG_PLAY':
      return `Big play by ${teamName}! This crowd is absolutely on their feet!`;
    default:
      return `${teamName} makes a move! The energy in this place is electric!`;
  }
}

// ─── Web Speech API commentary (free, no API key) ────────────────────────────

export function speakCommentary(text: string, pitch = 0.85, rate = 1.05): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  // Prefer a deep male voice for sports announcer feel
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v =>
    v.name.toLowerCase().includes('daniel') ||
    v.name.toLowerCase().includes('alex') ||
    v.name.toLowerCase().includes('google us english') ||
    v.name.toLowerCase().includes('en-us')
  ) || voices[0];
  if (preferred) utter.voice = preferred;
  utter.pitch = pitch;
  utter.rate = rate;
  utter.volume = 0.9;
  window.speechSynthesis.speak(utter);
}

// ─── ElevenLabs hook (swap in when key is available) ─────────────────────────
// export async function speakElevenLabs(text: string, voiceId: string, apiKey: string) {
//   const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
//     method: 'POST',
//     headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
//     body: JSON.stringify({ text, model_id: 'eleven_turbo_v2', voice_settings: { stability: 0.4, similarity_boost: 0.8 } }),
//   });
//   const blob = await res.blob();
//   const url = URL.createObjectURL(blob);
//   const audio = new Audio(url);
//   audio.play();
// }
