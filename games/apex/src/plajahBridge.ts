// Plajah Games iframe bridge client for Plajah Motorsport Apex (XP + Achievements).

export type ApexAchievementTrigger =
  | 'apex_first_lap'
  | 'apex_race_win'
  | 'apex_150_mph'
  | 'apex_coastal_explorer'
  | 'apex_first_delivery'
  | 'apex_courier_streak'
  | 'apex_full_garage';

const ACHIEVEMENT_LABELS: Record<ApexAchievementTrigger, string> = {
  apex_first_lap: 'Ironport Circuit: First Lap',
  apex_race_win: 'King of the Great Lakes',
  apex_150_mph: '150 MPH Club',
  apex_coastal_explorer: 'West Coast Explorer',
  apex_first_delivery: 'First Drop',
  apex_courier_streak: 'Hot Streak',
  apex_full_garage: 'Collector',
};

export class PlajahGamesBridge {
  private unlocked = new Set<ApexAchievementTrigger>();
  private seq = 0;

  private nextEventId(kind: string): string {
    this.seq += 1;
    return `apex:${kind}:${Date.now()}:${this.seq}`;
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
      gameId: 'apex',
      xp: cleanXp,
      level,
    });
  }

  unlock(trigger: ApexAchievementTrigger) {
    if (this.unlocked.has(trigger)) return;
    this.unlocked.add(trigger);
    this.post({
      type: 'plajah.achievement',
      eventId: this.nextEventId('ach'),
      gameId: 'apex',
      achievementId: trigger,
      title: ACHIEVEMENT_LABELS[trigger],
    });
  }
}
