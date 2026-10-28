/**
 * meetingRecordingCore — pure rules for meeting recordings, captions and recaps.
 * No Firebase imports (tests load it directly).
 *
 * Data (firestore.rules, chat_rooms/{roomId}/…):
 *   recordings/{recId}            one recording; only its host writes it, room members read it
 *   recordings/{recId}/captions/  one doc per finished sentence, written by the person who said it
 *
 * Cost model (see the chat gap page): recording happens on the host's device, so Plajah pays no
 * server compute. LOCAL keeps the file on that device (free for everyone). CLOUD uploads ~10 s
 * segments while recording; free accounts may cloud-record audio only (≈15 MB/hour), paid
 * accounts video too. Each person transcribes their own microphone on their own device.
 */

export type RecordingMode = 'LOCAL' | 'CLOUD';
export type RecordingKind = 'AUDIO' | 'VIDEO';
export type RecordingStatus = 'RECORDING' | 'ENDED';

export interface MeetingRecap {
  summary: string;
  actionItems: { text: string; owner?: string }[];
  decisions: string[];
  /** Where the recap was written: on this PC, in the cloud, or by simple rules (no model). */
  lane: 'local' | 'cloud' | 'rules';
  createdAt: number;
}

export interface MeetingRecording {
  id: string;
  hostUid: string;
  hostName: string;
  title: string;
  mode: RecordingMode;
  kind: RecordingKind;
  status: RecordingStatus;
  startedAt: number;
  endedAt?: number;
  durationSec?: number;
  sizeBytes?: number;
  mime?: string;
  /** CLOUD only: download URLs of the ~10 s segments, in order (join them to play). */
  segmentUrls?: string[];
  /** CLOUD only: Storage paths, for deletion. */
  segmentPaths?: string[];
  /** Cloud copies are removed after this (enforced by a cleanup job; see docs). */
  expiresAt?: number | null;
  recap?: MeetingRecap;
}

export interface CaptionLine {
  id?: string;
  uid: string;
  name: string;
  text: string;
  /** ms since the recording started. */
  at: number;
}

// ── Plan limits ──────────────────────────────────────────────────────────────

export interface RecordingAllowance {
  local: boolean;
  cloudAudio: boolean;
  cloudVideo: boolean;
  /** Longest single cloud recording. */
  maxCloudMinutes: number;
  /** How long cloud copies are kept. Transcripts and recaps are kept regardless. */
  cloudRetentionDays: number;
}

export const FREE_ALLOWANCE: RecordingAllowance = {
  local: true, cloudAudio: true, cloudVideo: false, maxCloudMinutes: 240, cloudRetentionDays: 30,
};
export const PAID_ALLOWANCE: RecordingAllowance = {
  local: true, cloudAudio: true, cloudVideo: true, maxCloudMinutes: 480, cloudRetentionDays: 365,
};
export const allowanceFor = (paid: boolean): RecordingAllowance => (paid ? PAID_ALLOWANCE : FREE_ALLOWANCE);

/** Why a mode isn't available, or null when it is. */
export function modeBlockedReason(mode: RecordingMode, kind: RecordingKind, allowance: RecordingAllowance): string | null {
  if (mode === 'LOCAL') return allowance.local ? null : 'Recording is not available on this account.';
  if (kind === 'AUDIO') return allowance.cloudAudio ? null : 'Cloud recording is not available on this account.';
  return allowance.cloudVideo ? null : 'Cloud video recording is part of Plajah+. Record video on this device, or record audio to the cloud.';
}

export const CLOUD_SEGMENT_MS = 10_000;

export function cloudExpiry(startedAt: number, allowance: RecordingAllowance): number {
  return startedAt + allowance.cloudRetentionDays * 24 * 60 * 60 * 1000;
}

// ── Captions ─────────────────────────────────────────────────────────────────

/**
 * Turns the transcriber's word stream (new words + a final flag) into whole sentences.
 * `feed` returns the finished line when an utterance ends, else null; `interim` is what's
 * being said right now.
 */
export class CaptionAssembler {
  private words = '';
  get interim(): string { return this.words.trim(); }
  feed(text: string, final: boolean): string | null {
    const t = (text || '').replace(/\s+/g, ' ');
    if (t.trim()) this.words = this.words ? `${this.words.trimEnd()} ${t.trim()}` : t.trim();
    if (!final) return null;
    const line = this.words.trim();
    this.words = '';
    return line.length >= 2 ? line : null;
  }
  reset() { this.words = ''; }
}

export interface TranscriptBlock { uid: string; name: string; at: number; text: string }

/** Lines in time order, with back-to-back lines from one speaker joined into one block. */
export function mergeTranscript(lines: CaptionLine[], gapMs = 20_000): TranscriptBlock[] {
  const sorted = [...lines].filter(l => l.text?.trim()).sort((a, b) => a.at - b.at);
  const out: TranscriptBlock[] = [];
  let lastAt = -Infinity;
  for (const l of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.uid === l.uid && l.at - lastAt <= gapMs) prev.text = `${prev.text} ${l.text.trim()}`;
    else out.push({ uid: l.uid, name: l.name, at: l.at, text: l.text.trim() });
    lastAt = l.at;
  }
  return out;
}

export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function transcriptText(blocks: TranscriptBlock[]): string {
  return blocks.map(b => `[${clock(b.at)}] ${b.name}: ${b.text}`).join('\n');
}

/** WebVTT captions file (one cue per line, ending at the next line or +4 s). */
export function transcriptVtt(lines: CaptionLine[]): string {
  const sorted = [...lines].filter(l => l.text?.trim()).sort((a, b) => a.at - b.at);
  const ts = (ms: number) => {
    const s = Math.max(0, ms) / 1000;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec.toFixed(3).padStart(6, '0')}`;
  };
  const cues = sorted.map((l, i) => {
    const end = Math.min(sorted[i + 1]?.at ?? l.at + 4000, l.at + 8000);
    return `${ts(l.at)} --> ${ts(Math.max(end, l.at + 800))}\n<v ${l.name.replace(/[<>]/g, '')}>${l.text.trim()}`;
  });
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

export function speakersOf(lines: CaptionLine[]): string[] {
  return [...new Set(lines.map(l => l.name).filter(Boolean))];
}

// ── Recap ────────────────────────────────────────────────────────────────────

const ACTION_RE = /\b(i'?ll|i will|we'?ll|we will|we need to|you'?ll|can you|could you|let'?s|follow up|send (?:out|over)?|by (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|end of (?:day|week)))\b/i;
const REQUEST_RE = /\b(can you|could you|you'?ll)\b/i;
const DECISION_RE =/\b(we decided|decided to|we agreed|agreed to|let'?s go with|we'?re going with|final answer|approved)\b/i;

const sentencesOf = (text: string) => text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 8);

/** A recap with no model at all: the longest contributions, plus lines that sound like actions or decisions. */
export function rulesRecap(lines: CaptionLine[], now = Date.now()): MeetingRecap {
  const blocks = mergeTranscript(lines);
  const actionItems: MeetingRecap['actionItems'] = [];
  const decisions: string[] = [];
  const speakers = speakersOf(lines);
  // "Sam, can you…" belongs to Sam, not to whoever asked; an unnamed request has no owner.
  const addressee = (s: string) => {
    const first = s.match(/^([A-Z][\w'-]+),/)?.[1]?.toLowerCase();
    return first ? speakers.find(n => n.split(/\s+/)[0].toLowerCase() === first) : undefined;
  };
  for (const b of blocks) {
    for (const s of sentencesOf(b.text)) {
      if (DECISION_RE.test(s) && decisions.length < 8) decisions.push(s);
      else if (ACTION_RE.test(s) && actionItems.length < 10) {
        const owner = REQUEST_RE.test(s) ? addressee(s) : b.name;
        actionItems.push(owner ? { text: s, owner } : { text: s });
      }
    }
  }
  const words = lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  const summary = blocks.length
    ? `${speakers.length} ${speakers.length === 1 ? 'person' : 'people'} spoke (${speakers.join(', ')}), about ${words} words. `
      + `Main points: ${[...blocks].sort((a, b) => b.text.length - a.text.length).slice(0, 3).map(b => `${b.name}: “${sentencesOf(b.text)[0] || b.text.slice(0, 140)}”`).join(' ')}`
    : 'No one was captioned during this recording.';
  return { summary: summary.slice(0, 1500), actionItems, decisions, lane: 'rules', createdAt: now };
}

export const RECAP_SYSTEM = [
  'You write meeting recaps for small teams, churches and nonprofits.',
  'Use only what is in the transcript. Never invent names, dates or commitments.',
  'Reply with JSON only: {"summary": string (3-5 plain sentences), "actionItems": [{"text": string, "owner": string|null}], "decisions": [string]}.',
  'Action items are things someone said they or others will do. Owner is the person responsible if it is clear, else null.',
].join(' ');

/** Transcript for the model, trimmed from the middle if it is very long. */
export function recapUserPrompt(title: string, lines: CaptionLine[], maxChars = 60_000): string {
  let text = transcriptText(mergeTranscript(lines));
  if (text.length > maxChars) {
    const half = Math.floor(maxChars / 2);
    text = `${text.slice(0, half)}\n[… middle of the meeting trimmed for length …]\n${text.slice(-half)}`;
  }
  return `Meeting: ${title}\n\nTranscript:\n${text}`;
}

/** Parse a model's recap reply; tolerant of code fences and extra prose. Null when unusable. */
export function parseRecap(reply: string, lane: 'local' | 'cloud', now = Date.now()): MeetingRecap | null {
  const m = (reply || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const summary = typeof j.summary === 'string' ? j.summary.trim() : '';
    if (!summary) return null;
    const actionItems = (Array.isArray(j.actionItems) ? j.actionItems : [])
      .map((a: any) => typeof a === 'string' ? { text: a } : { text: String(a?.text || '').trim(), ...(a?.owner ? { owner: String(a.owner).slice(0, 80) } : {}) })
      .filter((a: { text: string }) => a.text)
      .slice(0, 15);
    const decisions = (Array.isArray(j.decisions) ? j.decisions : []).map((d: unknown) => String(d).trim()).filter(Boolean).slice(0, 10);
    return { summary: summary.slice(0, 1500), actionItems, decisions, lane, createdAt: now };
  } catch { return null; }
}

/** Shape stored on the chat message that announces a recap (kept small; the full recap lives on the recording). */
export interface MeetingRecapRef {
  recordingId: string;
  title: string;
  durationSec: number;
  mode: RecordingMode;
  hostName: string;
  speakers: string[];
  actionCount: number;
}
