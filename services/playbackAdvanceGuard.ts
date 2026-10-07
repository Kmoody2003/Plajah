// playbackAdvanceGuard — one gate that every "go to the next track" signal must pass.
//
// WHY THIS EXISTS. The Chora player has many independent things that can say "advance":
// the <audio> `ended` event, an end-of-track stall watchdog, a silence/health watchdog, the
// Media Session `nexttrack` action, the native Android remote command (notification / Bluetooth /
// headset), TV remote keys, and failure handlers. Each one called next() directly, so two of them
// firing for the same moment advanced TWO tracks, and a failing network could advance a track every
// few seconds ("it skips songs / plays one three tracks later").
//
// This module is pure (no DOM, no React, injected clock) so the rules can be unit-tested:
//
//   • Per-track-instance token. begin() is called whenever a track starts. An automatic signal may
//     advance a given instance at most ONCE, and a signal armed for an older instance is stale.
//   • External commands (Media Session / native remote / TV keys) can arrive duplicated by the OS or
//     by two layers reporting the same button press — they are de-duplicated inside a short window.
//     A UI tap ('user') is never blocked.
//   • Failure skips are chain-limited: after ONE automatic skip because a track would not load, the
//     next failure does NOT skip again — the caller pauses and tells the listener. A track that plays
//     for real (markHealthy) resets the chain. So a dead network can never run through the queue.

export type AdvanceReason =
  // natural completion signals (automatic)
  | 'ended' | 'ended-fallback' | 'stall-watchdog'
  // failure signals (automatic, chain-limited)
  | 'start-failed' | 'stream-failed'
  // somebody pressed a button somewhere (external; de-duplicated)
  | 'media-session' | 'remote-command' | 'tv-remote'
  // in-app tap (never blocked)
  | 'user';

export type ClaimRefusal = 'duplicate' | 'stale' | 'external-duplicate' | 'failure-chain-limit';

export interface ClaimResult {
  ok: boolean;
  /** Set when ok is false. */
  why?: ClaimRefusal;
}

export interface AdvanceGuardOptions {
  /** Injected clock (ms). Defaults to Date.now. */
  now?: () => number;
  /** Window in which a second external command is treated as a duplicate of the first. */
  externalDedupeMs?: number;
  /** How many failure-skips may happen back to back before the guard refuses. */
  maxFailureChain?: number;
}

export interface AdvanceGuard {
  /** A new track instance started. Returns its token. */
  begin(): number;
  /** The token of the track instance currently loaded. */
  current(): number;
  /**
   * May this signal advance the queue? `armedInstance` is the token the signal was created for
   * (omit it for signals that read the current state at fire time, e.g. the `ended` event).
   * A true result CONSUMES the claim: callers must advance when it returns ok.
   */
  claim(reason: AdvanceReason, armedInstance?: number): ClaimResult;
  /** The current track has really been playing — clears the failure chain. */
  markHealthy(): void;
  /** How many failure-skips have happened back to back. */
  failureChain(): number;
}

const EXTERNAL: ReadonlySet<AdvanceReason> = new Set(['media-session', 'remote-command', 'tv-remote']);
const FAILURE: ReadonlySet<AdvanceReason> = new Set(['start-failed', 'stream-failed']);

export function isExternalReason(r: AdvanceReason): boolean { return EXTERNAL.has(r); }
export function isFailureReason(r: AdvanceReason): boolean { return FAILURE.has(r); }

export function createAdvanceGuard(opts: AdvanceGuardOptions = {}): AdvanceGuard {
  const now = opts.now ?? (() => Date.now());
  const externalDedupeMs = opts.externalDedupeMs ?? 700;
  const maxFailureChain = opts.maxFailureChain ?? 1;

  let instance = 0;
  let claimedInstance = -1;       // the instance an automatic signal has already advanced
  let lastAcceptedAt = -Infinity; // when the last advance of ANY kind was accepted
  let chain = 0;

  const accept = (reason: AdvanceReason): ClaimResult => {
    claimedInstance = instance;
    lastAcceptedAt = now();
    if (isFailureReason(reason)) chain++;
    else chain = 0;                // any deliberate or natural advance ends a failure streak
    return { ok: true };
  };

  return {
    begin() { return ++instance; },
    current() { return instance; },

    claim(reason, armedInstance) {
      if (armedInstance !== undefined && armedInstance !== instance) return { ok: false, why: 'stale' };

      if (reason === 'user') return accept(reason);

      if (isExternalReason(reason)) {
        if (now() - lastAcceptedAt < externalDedupeMs) return { ok: false, why: 'external-duplicate' };
        return accept(reason);
      }

      // Automatic signals: one advance per track instance, whoever gets there first.
      if (claimedInstance === instance) return { ok: false, why: 'duplicate' };
      if (isFailureReason(reason) && chain >= maxFailureChain) return { ok: false, why: 'failure-chain-limit' };
      return accept(reason);
    },

    markHealthy() { chain = 0; },
    failureChain() { return chain; },
  };
}
