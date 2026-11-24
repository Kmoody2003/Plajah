// playkit/platform/bridge.ts
//
// Unified Plajah Platform Bridge for ALL games (first-party & creator).
// Matches `services/iframeGameBridge.ts` and `packages/first-party-games/docs/shared-primitives.md`:
//   - XP crediting (with unique eventIds and daily cap awareness)
//   - Achievement unlocks (prefixed per gameId)
//   - Cloud save envelope (versioned JSON payload)
//   - Party / Session roster event hooks

export interface PlajahAchievementDef {
  trigger: string;
  title: string;
  description?: string;
  pointsBonus?: number;
}

export interface PlajahBridgeEvent {
  type: 'plajah.xp' | 'plajah.achievement' | 'plajah.save' | 'plajah.session';
  eventId: string;
  gameId: string;
  mode: string;
  [key: string]: unknown;
}

export interface PlajahBridgeTransport {
  post(payload: PlajahBridgeEvent): void;
}

export interface PlajahCloudSaveEnvelope<T = Record<string, unknown>> {
  schemaVersion: 1;
  gameId: string;
  savedAt: number;
  data: T;
}

export class PlajahPlatformBridge {
  readonly gameId: string;
  readonly mode: string;
  private seq = 0;
  private unlocked = new Set<string>();
  private defs = new Map<string, PlajahAchievementDef>();
  private transport: PlajahBridgeTransport;
  private onToast?: (def: PlajahAchievementDef) => void;
  readonly emitted: PlajahBridgeEvent[] = [];

  constructor(opts: {
    gameId: string;
    mode?: string;
    achievements?: PlajahAchievementDef[];
    transport?: PlajahBridgeTransport;
    onToast?: (def: PlajahAchievementDef) => void;
  }) {
    this.gameId = opts.gameId;
    this.mode = opts.mode ?? 'solo';
    this.onToast = opts.onToast;
    for (const a of opts.achievements ?? []) this.defs.set(a.trigger, a);

    this.transport = opts.transport ?? {
      post: (payload) => {
        if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
          window.parent.postMessage(payload, '*');
        }
      },
    };
  }

  private nextId(kind: string): string {
    this.seq += 1;
    return `${this.gameId}:${kind}:${Date.now()}:${this.seq}`;
  }

  private emit(ev: PlajahBridgeEvent): void {
    this.emitted.push(ev);
    this.transport.post(ev);
  }

  creditXp(xp: number, level = 1): void {
    const clean = Math.floor(xp);
    if (clean <= 0) return;
    this.emit({
      type: 'plajah.xp',
      eventId: this.nextId('xp'),
      gameId: this.gameId,
      mode: this.mode,
      xp: clean,
      level,
    });
  }

  unlockAchievement(trigger: string): boolean {
    if (this.unlocked.has(trigger)) return false;
    this.unlocked.add(trigger);
    const def = this.defs.get(trigger) ?? { trigger, title: trigger };
    this.onToast?.(def);
    this.emit({
      type: 'plajah.achievement',
      eventId: this.nextId(trigger),
      gameId: this.gameId,
      mode: this.mode,
      trigger,
    });
    return true;
  }

  isUnlocked(trigger: string): boolean {
    return this.unlocked.has(trigger);
  }

  emitSave<T extends Record<string, unknown>>(data: T): PlajahCloudSaveEnvelope<T> {
    const envelope: PlajahCloudSaveEnvelope<T> = {
      schemaVersion: 1,
      gameId: this.gameId,
      savedAt: Date.now(),
      data,
    };
    this.emit({
      type: 'plajah.save',
      eventId: this.nextId('save'),
      gameId: this.gameId,
      mode: this.mode,
      envelope,
    });
    return envelope;
  }

  emitSessionEvent(action: 'create' | 'join' | 'ready' | 'settle', detail: Record<string, unknown> = {}): void {
    this.emit({
      type: 'plajah.session',
      eventId: this.nextId(`session-${action}`),
      gameId: this.gameId,
      mode: this.mode,
      action,
      ...detail,
    });
  }
}
