/**
 * oraJournalNudge.ts
 * Journal nudge scheduling logic and daypart prompt library for the Ora wellness system.
 */

export type JournalDaypart = 'MORNING' | 'MIDDAY' | 'EVENING';

export const DAYPART_LABELS: Record<JournalDaypart, string> = {
  MORNING: 'Morning intention',
  MIDDAY: 'Midday pause',
  EVENING: 'Evening reflection',
};

export const DAYPART_PROMPTS: Record<JournalDaypart, Array<{ prompt: string; insight: string }>> = {
  MORNING: [
    { prompt: 'What would make today meaningful?', insight: 'Setting an intention isn\'t planning. It\'s choosing how to show up.' },
    { prompt: 'What are you looking forward to?', insight: 'Anticipation is its own form of happiness.' },
    { prompt: 'How do you want to feel by tonight?', insight: 'Morning writing primes your brain\'s filter for what matters.' },
    { prompt: 'What\'s one thing you want to give your attention to today?', insight: 'A clear intention makes you 2-3x more likely to follow through.' },
    { prompt: 'What would your best self do today?', insight: 'Writing a future self into existence is how identity shifts begin.' },
    { prompt: 'What are you grateful for this morning?', insight: 'Gratitude before caffeine — it changes the chemical order of your day.' },
    { prompt: 'What did you dream about?', insight: 'Dream journaling strengthens the bridge between your conscious and unconscious mind.' },
    { prompt: 'If today were all you had, what would matter?', insight: 'Memento mori isn\'t morbid. It\'s clarifying.' },
    { prompt: 'What\'s one kind thing you can do for someone today?', insight: 'Acts of kindness boost serotonin — in you and in them.' },
    { prompt: 'What\'s weighing on you right now?', insight: 'Naming a worry on paper takes it out of the loop your mind keeps replaying.' },
  ],
  MIDDAY: [
    { prompt: 'Name one thing that\'s going well right now.', insight: 'Naming what\'s good trains your attention to find more of it.' },
    { prompt: 'What surprised you today?', insight: 'Noticing surprises keeps your brain from running on autopilot.' },
    { prompt: 'How is your energy right now?', insight: 'Checking in at midday is the single best predictor of a good evening.' },
    { prompt: 'What\'s one thing you\'re proud of so far today?', insight: 'Self-recognition is not vanity. It\'s fuel.' },
    { prompt: 'Who made your day a little better?', insight: 'Noticing other people\'s kindness strengthens social bonds.' },
    { prompt: 'What can you let go of for the rest of the day?', insight: 'Letting go isn\'t giving up. It\'s making room.' },
    { prompt: 'What\'s a small win from this morning?', insight: 'Celebrating progress, however small, builds momentum.' },
    { prompt: 'Are you where you want to be right now?', insight: 'Midday recalibration is an underrated superpower.' },
    { prompt: 'What would make the afternoon feel lighter?', insight: 'Even imagining relief activates the parasympathetic nervous system.' },
    { prompt: 'What are you avoiding?', insight: 'What we avoid often holds the most growth.' },
  ],
  EVENING: [
    { prompt: 'What went well today?', insight: 'Gratitude rewires the brain for calm.' },
    { prompt: 'What are three good things from today?', insight: 'Three good things, consistently — one of the most studied interventions in psychology.' },
    { prompt: 'What actually happened today?', insight: 'Writing about your day reduces its emotional load.' },
    { prompt: 'What took more out of you than it should have?', insight: 'Putting feelings into words shrinks the amygdala\'s response.' },
    { prompt: 'What are you carrying that isn\'t yours?', insight: 'Boundaries are easier to see when you write them down.' },
    { prompt: 'What would you tell someone else in your position?', insight: 'Self-compassion is more effective than self-criticism. Every time.' },
    { prompt: 'What did you learn today?', insight: 'The brain consolidates learning during evening reflection and sleep.' },
    { prompt: 'Who do you appreciate right now?', insight: 'Gratitude for people strengthens relationships even when unspoken.' },
    { prompt: 'How did you grow today, even a little?', insight: 'Growth happens in millimeters. Journaling is how you see them.' },
    { prompt: 'What do you want to remember about today?', insight: 'Your future self will thank you for writing this down.' },
  ],
};

export function currentJournalDaypart(): JournalDaypart | null {
  const h = new Date().getHours();
  if (h >= 8 && h < 10) return 'MORNING';
  if (h >= 12 && h < 14) return 'MIDDAY';
  if (h >= 19 && h < 21) return 'EVENING';
  return null;
}

export function isDaypartDismissed(daypart: JournalDaypart, day: string): boolean {
  try {
    return sessionStorage.getItem(`ora:nudge:dismissed:${daypart}:${day}`) === 'true';
  } catch (e) {
    return false;
  }
}

export function dismissDaypart(daypart: JournalDaypart, day: string): void {
  try {
    sessionStorage.setItem(`ora:nudge:dismissed:${daypart}:${day}`, 'true');
  } catch (e) {
    // Ignore in environments where sessionStorage is inaccessible
  }
}

export function hasWrittenToday(day: string): boolean {
  try {
    return sessionStorage.getItem(`ora:journal:written:${day}`) === 'true';
  } catch (e) {
    return false;
  }
}

export function markWrittenToday(day: string): void {
  try {
    sessionStorage.setItem(`ora:journal:written:${day}`, 'true');
  } catch (e) {
    // Ignore
  }
}

export function markAppOpened(): void {
  try {
    sessionStorage.setItem('ora:app:opened', Date.now().toString());
  } catch (e) {
    // Ignore
  }
}

export function shouldShowNudge(day: string): { show: boolean; daypart: JournalDaypart | null } {
  const daypart = currentJournalDaypart();
  if (!daypart) {
    return { show: false, daypart: null };
  }

  if (hasWrittenToday(day)) {
    return { show: false, daypart };
  }

  if (isDaypartDismissed(daypart, day)) {
    return { show: false, daypart };
  }

  try {
    const openedStr = sessionStorage.getItem('ora:app:opened');
    if (openedStr) {
      const openedAt = parseInt(openedStr, 10);
      if (!isNaN(openedAt)) {
        const diffMs = Date.now() - openedAt;
        if (diffMs < 2 * 60 * 1000) {
          // Less than 2 minutes since app opened
          return { show: false, daypart };
        }
      }
    }
  } catch (e) {
    // Ignore
  }

  return { show: true, daypart };
}

export function getNudgePrompt(daypart: JournalDaypart): { prompt: string; insight: string } {
  const pool = DAYPART_PROMPTS[daypart];
  const index = new Date().getDate() % pool.length;
  return pool[index];
}
