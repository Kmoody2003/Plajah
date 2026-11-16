// Plajah Games iframe bridge client for Forth Horizon (XP + Achievements).

export type ForthAchievementTrigger =
  | 'forth_first_lap'
  | 'forth_race_win'
  | 'forth_150_mph'
  | 'forth_coastal_explorer';

const ACHIEVEMENT_LABELS: Record<ForthAchievementTrigger, string> = {
  forth_first_lap: 'Ironport Circuit: First Lap',
  forth_race_win: 'King of the Great Lakes',
  forth_150_mph: '150 MPH Club',
  forth_coastal_explorer: 'West Coast Explorer',
};

export class PlajahGamesBridge {
  private unlocked = new Set<ForthAchievementTrigger>();
  private seq = 0;

  private nextEventId(kind: string): string {
    this.seq += 1;
    return `forth-horizon:${kind}:${Date.now()}:${this.seq}`;
  }

  private post(payload: Record<string, unknown>) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(payload, '*');
    }
  }

  creditXp(xp: number, level = 1) {
    const cleanXp = Math.floor(xp);
    if (cleanXp <= 0) return;
    this.post({
      type: 'plajah.xp',
      eventId: this.nextEventId('xp'),
      gameId: 'forth-horizon',
      xp: cleanXp,
      level,
    });
  }

  unlock(trigger: ForthAchievementTrigger) {
    if (this.unlocked.has(trigger)) return;
    this.unlocked.add(trigger);
    this.post({
      type: 'plajah.achievement',
      eventId: this.nextEventId('ach'),
      gameId: 'forth-horizon',
      achievementId: trigger,
      title: ACHIEVEMENT_LABELS[trigger],
    });
  }
}
