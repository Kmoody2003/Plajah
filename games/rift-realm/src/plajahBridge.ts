// Plajah Games iframe bridge client for Rift Realm (XP + Achievements).
// Matches the protocol in services/iframeGameBridge.ts.

export type RiftAchievementTrigger =
  | 'rift_realm_first_blood'
  | 'rift_realm_perfect_resonance'
  | 'rift_realm_soul_surge'
  | 'rift_realm_soul_rend'
  | 'rift_realm_trial_3'
  | 'rift_realm_vessel_master';

const ACHIEVEMENT_LABELS: Record<RiftAchievementTrigger, string> = {
  rift_realm_first_blood: 'First Soul Reclaimed',
  rift_realm_perfect_resonance: '4.0x Perfect Resonance',
  rift_realm_soul_surge: 'Void Shockwave',
  rift_realm_soul_rend: 'Soul-Rend Finisher',
  rift_realm_trial_3: 'Tournament Survivor (Trial 3)',
  rift_realm_vessel_master: 'Vessel Shifter',
};

export class PlajahGamesBridge {
  private unlocked = new Set<RiftAchievementTrigger>();
  private seq = 0;
  private onToast?: (title: string) => void;

  constructor(onToast?: (title: string) => void) {
    this.onToast = onToast;
  }

  private nextEventId(kind: string): string {
    this.seq += 1;
    return `rift-realm:${kind}:${Date.now()}:${this.seq}`;
  }

  private post(payload: Record<string, unknown>) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(payload, '*');
    }
  }

  creditXp(xp: number, level: number) {
    const cleanXp = Math.floor(xp);
    if (cleanXp <= 0) return;
    this.post({
      type: 'plajah.xp',
      eventId: this.nextEventId('xp'),
      gameId: 'rift-realm',
      mode: 'solo',
      xp: cleanXp,
      level,
    });
  }

  unlock(trigger: RiftAchievementTrigger) {
    if (this.unlocked.has(trigger)) return;
    this.unlocked.add(trigger);
    this.onToast?.(ACHIEVEMENT_LABELS[trigger]);
    this.post({
      type: 'plajah.achievement',
      eventId: this.nextEventId(trigger),
      gameId: 'rift-realm',
      mode: 'solo',
      trigger,
    });
  }
}
