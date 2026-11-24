// playkit/modes/parlor.ts
//
// Unified Party & Parlor Game Engine Runtime.
// Unifies Brain Rush (trivia), Crowd Says (survey), Impostor Night (social deduction),
// Sketch Rush, Evite Play Gates, AND creator-built parlor games onto ONE deterministic
// phase/secret-isolation state machine that pairs with 2D OR 3D broadcast stage visual themes!

export type ParlorPhase = 'lobby' | 'prompt' | 'vote' | 'reveal' | 'ended';
export type BuiltInParlorKind = 'trivia' | 'crowd' | 'impostor' | 'sketch' | (string & {});

export interface ParlorPlayer {
  uid: string;
  name: string;
  score: number;
  streak: number;
  connected: boolean;
}

export interface ParlorRoundPrompt {
  prompt: string;
  options?: string[];
  category?: string;
  /** Server-only secret fields — NEVER exposed in publicState() before reveal! */
  secretCorrectOption?: number;
  secretWord?: string;
  secretImpostorUids?: string[];
}

export interface ParlorSubmission {
  uid: string;
  choiceIndex?: number;
  text?: string;
  voteForUid?: string;
  submittedAtMs: number;
}

export interface ParlorReveal {
  correctOption?: number;
  optionCounts?: number[];
  crowdBoard?: Array<{ text: string; count: number }>;
  secretWord?: string;
  impostorUids?: string[];
  impostorsCaught?: boolean;
  roundPoints: Record<string, number>;
}

/** Public-safe view sent to clients / 3D stage visualizers (strict secret isolation). */
export interface ParlorPublicState {
  roomId: string;
  kind: BuiltInParlorKind;
  title: string;
  stageThemeId: string;
  phase: ParlorPhase;
  round: number;
  totalRounds: number;
  prompt: string;
  options: string[];
  category?: string;
  answeredCount: number;
  clues: Array<{ uid: string; name: string; text: string }>;
  reveal: ParlorReveal | null;
  leaderboard: Array<{ uid: string; name: string; score: number; streak: number }>;
}

export interface ParlorConfig {
  roomId: string;
  kind: BuiltInParlorKind;
  title: string;
  totalRounds: number;
  answerWindowMs: number;
  /** Visual stage theme (e.g. 'studio-broadcast-3d', 'fable-tavern-3d', 'neon-arena-3d', 'classic-2d'). */
  stageThemeId?: string;
}

export class ParlorSession {
  readonly config: Required<ParlorConfig>;
  phase: ParlorPhase = 'lobby';
  round = 0;
  phaseStartedAtMs = 0;

  private players = new Map<string, ParlorPlayer>();
  private currentPrompt: ParlorRoundPrompt | null = null;
  private submissions = new Map<string, ParlorSubmission>();
  private votes = new Map<string, string>();
  private lastReveal: ParlorReveal | null = null;

  constructor(config: ParlorConfig) {
    this.config = {
      stageThemeId: 'studio-broadcast-3d',
      ...config,
    };
  }

  join(uid: string, name: string): ParlorPlayer {
    const existing = this.players.get(uid);
    if (existing) {
      existing.connected = true;
      existing.name = name;
      return existing;
    }
    const p: ParlorPlayer = { uid, name, score: 0, streak: 0, connected: true };
    this.players.set(uid, p);
    return p;
  }

  leave(uid: string): void {
    const p = this.players.get(uid);
    if (p) p.connected = false;
  }

  startRound(prompt: ParlorRoundPrompt, nowMs: number): void {
    if (this.phase === 'ended') return;
    this.round += 1;
    this.currentPrompt = prompt;
    this.submissions.clear();
    this.votes.clear();
    this.lastReveal = null;
    this.phase = 'prompt';
    this.phaseStartedAtMs = nowMs;
  }

  /** Private per-player role prompt (e.g. Impostor gets category only; crew gets secret word). */
  privatePromptFor(uid: string): { prompt: string; secretWord?: string; isImpostor: boolean } {
    const p = this.currentPrompt;
    if (!p) return { prompt: '', isImpostor: false };
    const isImp = Boolean(p.secretImpostorUids?.includes(uid));
    return {
      prompt: p.prompt,
      secretWord: isImp ? undefined : p.secretWord,
      isImpostor: isImp,
    };
  }

  submitAnswer(sub: ParlorSubmission): boolean {
    if (this.phase !== 'prompt' || !this.players.has(sub.uid)) return false;
    if (this.submissions.has(sub.uid)) return false;
    this.submissions.set(sub.uid, sub);
    return true;
  }

  openVote(nowMs: number): void {
    if (this.phase !== 'prompt') return;
    this.phase = 'vote';
    this.phaseStartedAtMs = nowMs;
  }

  castVote(voterUid: string, targetUid: string): boolean {
    if (this.phase !== 'vote' || !this.players.has(voterUid) || !this.players.has(targetUid)) return false;
    this.votes.set(voterUid, targetUid);
    return true;
  }

  /** Score the round and produce the public reveal (mirrors Brain Rush / Crowd Says / Impostor Night). */
  revealRound(nowMs: number): ParlorReveal {
    const p = this.currentPrompt;
    const roundPoints: Record<string, number> = {};
    const reveal: ParlorReveal = { roundPoints };

    if (p) {
      if (this.config.kind === 'trivia' && typeof p.secretCorrectOption === 'number') {
        const optionCounts = (p.options ?? []).map(() => 0);
        for (const sub of this.submissions.values()) {
          if (typeof sub.choiceIndex === 'number' && sub.choiceIndex >= 0 && sub.choiceIndex < optionCounts.length) {
            optionCounts[sub.choiceIndex]++;
          }
          const player = this.players.get(sub.uid);
          if (!player) continue;
          if (sub.choiceIndex === p.secretCorrectOption) {
            const elapsed = Math.max(0, sub.submittedAtMs - this.phaseStartedAtMs);
            const left = Math.max(0, Math.min(1, 1 - elapsed / Math.max(1, this.config.answerWindowMs)));
            const pts = 100 + Math.round(400 * left);
            player.score += pts;
            player.streak += 1;
            roundPoints[sub.uid] = pts;
          } else {
            player.streak = 0;
            roundPoints[sub.uid] = 0;
          }
        }
        reveal.correctOption = p.secretCorrectOption;
        reveal.optionCounts = optionCounts;
      } else if (this.config.kind === 'crowd') {
        const tallies = new Map<string, { text: string; uids: string[] }>();
        for (const sub of this.submissions.values()) {
          const clean = (sub.text ?? '').trim();
          const key = clean.toLowerCase();
          if (!key) continue;
          const entry = tallies.get(key) ?? { text: clean, uids: [] };
          entry.uids.push(sub.uid);
          tallies.set(key, entry);
        }
        const board = [...tallies.values()]
          .map((e) => ({ text: e.text, count: e.uids.length, uids: e.uids }))
          .sort((a, b) => b.count - a.count);
        for (const row of board) {
          const pts = row.count * 100;
          for (const uid of row.uids) {
            const pl = this.players.get(uid);
            if (pl) pl.score += pts;
            roundPoints[uid] = pts;
          }
        }
        reveal.crowdBoard = board.map(({ text, count }) => ({ text, count }));
      } else if (this.config.kind === 'impostor') {
        const voteCounts = new Map<string, number>();
        for (const target of this.votes.values()) {
          voteCounts.set(target, (voteCounts.get(target) ?? 0) + 1);
        }
        let topTarget: string | null = null;
        let topVotes = 0;
        for (const [uid, c] of voteCounts.entries()) {
          if (c > topVotes) { topVotes = c; topTarget = uid; }
        }
        const impostors = new Set(p.secretImpostorUids ?? []);
        const caught = topTarget !== null && impostors.has(topTarget);
        for (const pl of this.players.values()) {
          const isImp = impostors.has(pl.uid);
          const pts = caught ? (isImp ? 0 : 250) : (isImp ? 400 : 0);
          pl.score += pts;
          roundPoints[pl.uid] = pts;
        }
        reveal.secretWord = p.secretWord;
        reveal.impostorUids = [...impostors];
        reveal.impostorsCaught = caught;
      }
    }

    this.lastReveal = reveal;
    this.phase = this.round >= this.config.totalRounds ? 'ended' : 'reveal';
    this.phaseStartedAtMs = nowMs;
    return reveal;
  }

  /** Public state guaranteed never to leak secrets while a round is open. */
  publicState(): ParlorPublicState {
    const showClues = this.phase === 'vote' || this.phase === 'reveal' || this.phase === 'ended';
    const clues = showClues
      ? [...this.submissions.values()]
          .filter((s) => Boolean(s.text))
          .map((s) => ({ uid: s.uid, name: this.players.get(s.uid)?.name ?? s.uid, text: s.text! }))
      : [];

    const leaderboard = [...this.players.values()]
      .sort((a, b) => b.score - a.score)
      .map((p) => ({ uid: p.uid, name: p.name, score: p.score, streak: p.streak }));

    return {
      roomId: this.config.roomId,
      kind: this.config.kind,
      title: this.config.title,
      stageThemeId: this.config.stageThemeId,
      phase: this.phase,
      round: this.round,
      totalRounds: this.config.totalRounds,
      prompt: this.currentPrompt?.prompt ?? '',
      options: this.currentPrompt?.options ?? [],
      category: this.currentPrompt?.category,
      answeredCount: this.submissions.size,
      clues,
      reveal: this.phase === 'reveal' || this.phase === 'ended' ? this.lastReveal : null,
      leaderboard,
    };
  }
}
