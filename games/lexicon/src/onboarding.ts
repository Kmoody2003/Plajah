// Interactive 6-Step Playable Onboarding ("First Gameplay Chip") for Lexicon: The Unwriting
// Walks the player naturally through every core mechanic by DOING it live in sunlit Glossa Hollow:
//   1. Move & Look Around       (WASD / LS + Mouse / RS)
//   2. Dodge Roll               (Space / B)
//   3. Speak with Elder Mira    (E / A)
//   4. Cast Your Word Lasso     (C / RB or RT -> catch HOME on the bridge)
//   5. Strike & Rescue a Word   (Shift/LT Lock + J/X Strike + 1-4/D-Pad Rescue)
//   6. Play the Lyre of Words   (Q / Y -> play LIGHT)
import type { PadGlyphs } from './gamepad';

export type OnboardStepId =
  | 'move_look'
  | 'roll'
  | 'talk_mira'
  | 'lasso_home'
  | 'first_rescue'
  | 'play_song'
  | 'done';

export interface OnboardView {
  stepIndex: number;   // 1..6
  totalSteps: number;  // 6
  id: OnboardStepId;
  title: string;
  actionHtml: string;
  sub: string;
  progress: number;    // 0..1
  checks?: Array<{ label: string; done: boolean }>;
  beaconAt?: [number, number];
}

export interface OnboardingState {
  id: OnboardStepId;
  movedDist: number;
  lookedAmt: number;
  rolled: boolean;
  talkedMira: boolean;
  lassoedHome: boolean;
  rescuedCombat: boolean;
  playedSong: boolean;
}

const k = (txt: string) => `<span class="key">${txt}</span>`;

export function createOnboarding(alreadyDone: boolean) {
  const st: OnboardingState = {
    id: alreadyDone ? 'done' : 'move_look',
    movedDist: 0,
    lookedAmt: 0,
    rolled: alreadyDone,
    talkedMira: alreadyDone,
    lassoedHome: alreadyDone,
    rescuedCombat: alreadyDone,
    playedSong: alreadyDone,
  };

  let celebrateT = 0;

  function syncStep(): boolean {
    if (st.id === 'done') return false;
    const prev = st.id;
    if (st.id === 'move_look' && st.movedDist >= 3.2 && st.lookedAmt >= 0.45) {
      st.id = 'roll';
    }
    if (st.id === 'roll' && st.rolled) {
      st.id = 'talk_mira';
    }
    if (st.id === 'talk_mira' && st.talkedMira) {
      st.id = 'lasso_home';
    }
    if (st.id === 'lasso_home' && st.lassoedHome) {
      st.id = 'first_rescue';
    }
    if (st.id === 'first_rescue' && st.rescuedCombat) {
      st.id = 'play_song';
    }
    if (st.id === 'play_song' && st.playedSong) {
      st.id = 'done';
    }
    if (st.id !== prev) {
      celebrateT = 0.7;
      return true;
    }
    return false;
  }

  return {
    get state() { return st; },
    get active() { return st.id !== 'done'; },
    get celebrating() { return celebrateT > 0; },

    tick(dt: number) {
      if (celebrateT > 0) celebrateT = Math.max(0, celebrateT - dt);
    },

    recordMove(distMeters: number): boolean {
      if (st.id !== 'move_look') return false;
      st.movedDist = Math.min(4, st.movedDist + distMeters);
      return syncStep();
    },

    recordLook(deltaRad: number): boolean {
      if (st.id !== 'move_look') return false;
      st.lookedAmt = Math.min(1, st.lookedAmt + Math.abs(deltaRad));
      return syncStep();
    },

    recordRoll(): boolean {
      if (st.id === 'done') return false;
      st.rolled = true;
      return syncStep();
    },

    recordTalkMira(): boolean {
      if (st.id === 'done') return false;
      st.talkedMira = true;
      return syncStep();
    },

    recordLassoHome(): boolean {
      if (st.id === 'done') return false;
      st.lassoedHome = true;
      return syncStep();
    },

    recordCombatRescue(): boolean {
      if (st.id === 'done') return false;
      st.rescuedCombat = true;
      return syncStep();
    },

    recordSongPlayed(): boolean {
      if (st.id === 'done') return false;
      st.playedSong = true;
      return syncStep();
    },

    skip() {
      st.id = 'done';
      st.rolled = st.talkedMira = st.lassoedHome = st.rescuedCombat = st.playedSong = true;
    },

    /** Render the live interactive Coach Card for the current playable step. */
    view(pad: PadGlyphs | null, enemyAt?: [number, number]): OnboardView | null {
      if (st.id === 'done') return null;

      if (st.id === 'move_look') {
        const moveDone = st.movedDist >= 3.2;
        const lookDone = st.lookedAmt >= 0.45;
        const movePct = Math.min(1, st.movedDist / 3.2);
        const lookPct = Math.min(1, st.lookedAmt / 0.45);
        return {
          stepIndex: 1, totalSteps: 6, id: 'move_look',
          title: 'Step 1 · Find Your Footing',
          actionHtml: pad
            ? `Walk with ${k(pad.move)} and look around with ${k(pad.look)}`
            : `Walk with ${k('W')}${k('A')}${k('S')}${k('D')} and turn camera with ${k('Mouse')} or ${k('Arrows')}`,
          sub: 'Take a few steps across sunlit Glossa Square and take in the valley.',
          progress: 0.5 * movePct + 0.5 * lookPct,
          checks: [
            { label: pad ? `Move (${pad.move})` : 'Walk (WASD)', done: moveDone },
            { label: pad ? `Look (${pad.look})` : 'Look (Mouse/Arrows)', done: lookDone },
          ],
        };
      }

      if (st.id === 'roll') {
        return {
          stepIndex: 2, totalSteps: 6, id: 'roll',
          title: 'Step 2 · Try a Dodge Roll',
          actionHtml: pad
            ? `Press ${k(pad.cancel)} (or ${k(pad.confirm)} in open space) to Dodge Roll`
            : `Press ${k('Space')} to Dodge Roll`,
          sub: 'Rolling slips cleanly past Unwritten lunges and hazards.',
          progress: 0.15,
        };
      }

      if (st.id === 'talk_mira') {
        return {
          stepIndex: 3, totalSteps: 6, id: 'talk_mira',
          title: 'Step 3 · Speak with Elder Mira',
          actionHtml: pad
            ? `Follow the gold beam to Elder Mira and press ${k(pad.confirm)}`
            : `Follow the gold beam to Elder Mira and press ${k('E')}`,
          sub: 'Villagers hold the clues to Glossa Hollow’s missing words.',
          progress: 0.35,
          beaconAt: [-6.5, -6.5],
        };
      }

      if (st.id === 'lasso_home') {
        return {
          stepIndex: 4, totalSteps: 6, id: 'lasso_home',
          title: 'Step 4 · Cast Your Word Lasso',
          actionHtml: pad
            ? `Walk onto the stone bridge and press ${k(pad.rb)} or ${k(pad.rt)} to catch <b>HOME</b>`
            : `Walk onto the stone bridge and press ${k('C')} (or ${k('L')}) to catch <b>HOME</b>`,
          sub: 'Your luminous cyan Word Lasso reels in wild words and pulls puzzle rings.',
          progress: 0.55,
          beaconAt: [-13, 6],
        };
      }

      if (st.id === 'first_rescue') {
        return {
          stepIndex: 5, totalSteps: 6, id: 'first_rescue',
          title: 'Step 5 · Strike & Rescue a Word',
          actionHtml: pad
            ? `Hold ${k(pad.lt)} Lock · Press ${k(pad.strike)} Strike · Answer with ${k(`D-Pad ${pad.dpadUp}${pad.dpadRight}${pad.dpadDown}${pad.dpadLeft}`)}`
            : `Hold ${k('Shift')} Lock · Press ${k('J')} / ${k('Click')} Strike · Answer with ${k('1–4')}`,
          sub: 'The Unwriting heard HOME! Defeat the Hushling in the white-paper patch to restore colour.',
          progress: 0.75,
          beaconAt: enemyAt ?? [14, -4],
        };
      }

      return {
        stepIndex: 6, totalSteps: 6, id: 'play_song',
        title: 'Step 6 · Play a Song on the Lyre',
        actionHtml: pad
          ? `Press ${k(pad.lyre)} to open the Lyre, then press ${k(pad.confirm)} to play <b>LIGHT</b>`
          : `Press ${k('Q')} to open the Lyre and click or type <b>LIGHT</b>`,
        sub: 'Gold words are living songs — try LIGHT near the Village Lantern or sigils!',
        progress: 0.9,
        beaconAt: [0, -18],
      };
    },
  };
}
