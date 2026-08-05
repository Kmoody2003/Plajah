// demoAthletes.ts — four labeled DEMO ATHLETE accounts so people can see what an
// Athlete profile looks like (State Card, highlights & game photos, verified on-chain
// achievements). Fully static/bundled (like data/demoBusiness.ts) so they render with
// no auth and no Firestore seeding. Every one is clearly marked isDemo + "DEMO ATHLETE".
//
// Sports requested: HS basketball, girls volleyball, football, girls soccer.

export interface DemoStatLine { label: string; value: string; }

export interface DemoAchievement {
  id: string;
  type: string;
  title: string;
  description: string;
  gameLabel: string;
  occurredAt: number;            // ms
  status: 'minted' | 'verified' | 'pending';
  confidence: number;            // 0..1
  sources: { kind: string; label: string }[];
  badge: string;                 // emoji
  txHash?: string;
  explorerUrl?: string;
}

export interface DemoHighlight {
  id: string;
  caption: string;
  scoreline?: string;            // "W 62-58"
  kind: 'photo' | 'clip';
  // Demo media is drawn in-component (gradient + sport icon) so nothing depends on a
  // remote image that might 404. accent drives the tile color.
  accent: string;
}

export interface DemoAthlete {
  id: string;                    // e.g. "demo_athlete_basketball"
  isDemo: true;
  accountType: 'ATHLETE';
  name: string;
  handle: string;                // @handle
  sport: 'BASKETBALL' | 'VOLLEYBALL' | 'FOOTBALL' | 'SOCCER';
  sportLabel: string;            // "Boys Basketball" / "Girls Volleyball"
  position: string;
  jersey: number;
  school: string;
  city: string;
  state: string;                 // 2-letter
  classYear: number;             // graduating class
  heightWeight?: string;
  accent: string;                // brand color for the card
  accent2: string;
  bio: string;
  verified: boolean;
  gpa?: number;
  stats: DemoStatLine[];         // headline season/career stats
  achievements: DemoAchievement[];
  highlights: DemoHighlight[];
}

const TX = (seed: string) => '0x' + seed.padEnd(64, '0').slice(0, 64);
const EXP = (seed: string) => `https://polygonscan.com/tx/${TX(seed)}`;

// Stable fictional timestamps (no Date.now at module load — keeps things deterministic).
const T = (daysAgo: number) => 1_750_000_000_000 - daysAgo * 86_400_000;

export const DEMO_ATHLETES: DemoAthlete[] = [
  {
    id: 'demo_athlete_basketball',
    isDemo: true,
    accountType: 'ATHLETE',
    name: 'Marcus Bell',
    handle: '@marcusbell',
    sport: 'BASKETBALL',
    sportLabel: 'Boys Basketball',
    position: 'Point Guard',
    jersey: 3,
    school: 'Lincoln High School',
    city: 'Houston',
    state: 'TX',
    classYear: 2027,
    heightWeight: '6\'2" · 175 lb',
    accent: '#FF8C00',
    accent2: '#7a2bd6',
    bio: 'Floor general. Plays downhill, sees the whole court. 3.6 GPA. Demo athlete profile showing how Plajah verifies and mints every big play.',
    verified: true,
    gpa: 3.6,
    stats: [
      { label: 'PPG', value: '21.4' },
      { label: 'APG', value: '7.8' },
      { label: 'RPG', value: '4.1' },
      { label: '3PT%', value: '38%' },
    ],
    achievements: [
      { id: 'b1', type: 'THREE_POINTER', title: 'Buzzer-beater three', description: 'Game-winning triple at the horn to take the sectional.', gameLabel: 'vs. Westfield — Sectional Final', occurredAt: T(6), status: 'minted', confidence: 0.94, sources: [{ kind: 'sportscaster', label: 'Coach producer feed' }, { kind: 'parent-stream', label: 'Parent stream #2' }, { kind: 'parent-stream', label: 'Parent stream #5' }], badge: '🏀', txHash: TX('bball01'), explorerUrl: EXP('bball01') },
      { id: 'b2', type: 'MILESTONE', title: '1,000 career points', description: 'Crossed 1,000 career points as a junior.', gameLabel: 'vs. Memorial', occurredAt: T(20), status: 'minted', confidence: 0.9, sources: [{ kind: 'sportscaster', label: 'Coach producer feed' }, { kind: 'box-score', label: 'District box score' }], badge: '🏅', txHash: TX('bball02'), explorerUrl: EXP('bball02') },
      { id: 'b3', type: 'BIG_PLAY', title: 'Triple-double', description: '24 pts / 11 ast / 10 reb.', gameLabel: 'vs. Jefferson', occurredAt: T(34), status: 'verified', confidence: 0.71, sources: [{ kind: 'sportscaster', label: 'Coach producer feed' }], badge: '⭐' },
    ],
    highlights: [
      { id: 'bh1', caption: 'Sectional final buzzer-beater', scoreline: 'W 62-60', kind: 'clip', accent: '#FF8C00' },
      { id: 'bh2', caption: 'Crossover + finish', scoreline: 'W 74-58', kind: 'clip', accent: '#7a2bd6' },
      { id: 'bh3', caption: 'Senior night warmups', kind: 'photo', accent: '#2b6fd6' },
      { id: 'bh4', caption: 'No-look dime', scoreline: 'W 69-61', kind: 'clip', accent: '#d62b8f' },
    ],
  },
  {
    id: 'demo_athlete_volleyball',
    isDemo: true,
    accountType: 'ATHLETE',
    name: 'Sofia Reyes',
    handle: '@sofiareyes',
    sport: 'VOLLEYBALL',
    sportLabel: 'Girls Volleyball',
    position: 'Outside Hitter',
    jersey: 12,
    school: 'Valley View High School',
    city: 'Phoenix',
    state: 'AZ',
    classYear: 2026,
    heightWeight: '5\'11"',
    accent: '#e23b6d',
    accent2: '#ffb13b',
    bio: 'Outside hitter with a heavy arm and a 10\'6" touch. Team captain, 4.0 GPA. Demo athlete profile.',
    verified: true,
    gpa: 4.0,
    stats: [
      { label: 'Kills/Set', value: '4.6' },
      { label: 'Aces', value: '58' },
      { label: 'Digs', value: '312' },
      { label: 'Hit %', value: '.341' },
    ],
    achievements: [
      { id: 'v1', type: 'KILL', title: 'Match-point kill', description: 'Cross-court kill to win the state semifinal in five sets.', gameLabel: 'vs. Desert Ridge — State Semifinal', occurredAt: T(4), status: 'minted', confidence: 0.96, sources: [{ kind: 'sportscaster', label: 'Coach producer feed' }, { kind: 'live-stream', label: 'School stream' }, { kind: 'parent-stream', label: 'Parent stream #1' }], badge: '🏐', txHash: TX('vb01'), explorerUrl: EXP('vb01') },
      { id: 'v2', type: 'MILESTONE', title: '1,000 career kills', description: 'Reached 1,000 career kills.', gameLabel: 'vs. Mountain Pointe', occurredAt: T(15), status: 'minted', confidence: 0.92, sources: [{ kind: 'sportscaster', label: 'Coach producer feed' }, { kind: 'box-score', label: 'Conference box score' }], badge: '🏅', txHash: TX('vb02'), explorerUrl: EXP('vb02') },
      { id: 'v3', type: 'ACE', title: '5-ace night', description: 'Five service aces in a single match.', gameLabel: 'vs. Hamilton', occurredAt: T(28), status: 'verified', confidence: 0.7, sources: [{ kind: 'sportscaster', label: 'Coach producer feed' }], badge: '🎯' },
    ],
    highlights: [
      { id: 'vh1', caption: 'State semi match-point kill', scoreline: 'W 3-2', kind: 'clip', accent: '#e23b6d' },
      { id: 'vh2', caption: 'Service ace run', scoreline: 'W 3-0', kind: 'clip', accent: '#ffb13b' },
      { id: 'vh3', caption: 'Captain pre-match', kind: 'photo', accent: '#7a2bd6' },
      { id: 'vh4', caption: 'Block at the net', scoreline: 'W 3-1', kind: 'clip', accent: '#2bd6b0' },
    ],
  },
  {
    id: 'demo_athlete_football',
    isDemo: true,
    accountType: 'ATHLETE',
    name: 'DeShawn Carter',
    handle: '@deshawncarter',
    sport: 'FOOTBALL',
    sportLabel: 'Football',
    position: 'Wide Receiver',
    jersey: 7,
    school: 'Central High School',
    city: 'Atlanta',
    state: 'GA',
    classYear: 2026,
    heightWeight: '6\'1" · 190 lb · 4.48 40',
    accent: '#1f8f4e',
    accent2: '#f5c542',
    bio: 'Burner on the outside. Reliable hands, returns kicks. 3.4 GPA, D1 interest. Demo athlete profile.',
    verified: true,
    gpa: 3.4,
    stats: [
      { label: 'Rec', value: '74' },
      { label: 'Rec Yds', value: '1,288' },
      { label: 'TD', value: '16' },
      { label: 'YPC', value: '17.4' },
    ],
    achievements: [
      { id: 'f1', type: 'TOUCHDOWN', title: '80-yd game-winning TD', description: 'Caught a slant and took it 80 yards to win in the final minute.', gameLabel: 'vs. North Atlanta — Region Title', occurredAt: T(5), status: 'minted', confidence: 0.95, sources: [{ kind: 'sportscaster', label: 'Coach producer feed' }, { kind: 'live-stream', label: 'NFHS-style stream' }, { kind: 'parent-stream', label: 'Parent stream #4' }], badge: '🏈', txHash: TX('fb01'), explorerUrl: EXP('fb01') },
      { id: 'f2', type: 'MILESTONE', title: '1,000-yard season', description: 'Eclipsed 1,000 receiving yards on the season.', gameLabel: 'vs. Grady', occurredAt: T(19), status: 'minted', confidence: 0.9, sources: [{ kind: 'sportscaster', label: 'Coach producer feed' }, { kind: 'box-score', label: 'Region box score' }], badge: '🏅', txHash: TX('fb02'), explorerUrl: EXP('fb02') },
      { id: 'f3', type: 'BIG_PLAY', title: '3-TD game', description: 'Three receiving touchdowns in one game.', gameLabel: 'vs. Douglass', occurredAt: T(33), status: 'verified', confidence: 0.7, sources: [{ kind: 'sportscaster', label: 'Coach producer feed' }], badge: '⭐' },
    ],
    highlights: [
      { id: 'fh1', caption: 'Region-title walk-off TD', scoreline: 'W 28-24', kind: 'clip', accent: '#1f8f4e' },
      { id: 'fh2', caption: 'Kick return to the house', scoreline: 'W 35-14', kind: 'clip', accent: '#f5c542' },
      { id: 'fh3', caption: 'Pregame under the lights', kind: 'photo', accent: '#2b6fd6' },
      { id: 'fh4', caption: 'One-handed sideline grab', scoreline: 'W 21-17', kind: 'clip', accent: '#d6452b' },
    ],
  },
  {
    id: 'demo_athlete_soccer',
    isDemo: true,
    accountType: 'ATHLETE',
    name: 'Ava Nguyen',
    handle: '@avanguyen',
    sport: 'SOCCER',
    sportLabel: 'Girls Soccer',
    position: 'Forward',
    jersey: 9,
    school: 'Riverside High School',
    city: 'Portland',
    state: 'OR',
    classYear: 2027,
    heightWeight: '5\'6"',
    accent: '#2b8fd6',
    accent2: '#2bd67a',
    bio: 'Two-footed forward with a nose for goal. State Cup runner-up. 3.9 GPA. Demo athlete profile.',
    verified: true,
    gpa: 3.9,
    stats: [
      { label: 'Goals', value: '31' },
      { label: 'Assists', value: '14' },
      { label: 'GP', value: '22' },
      { label: 'G/Game', value: '1.4' },
    ],
    achievements: [
      { id: 's1', type: 'GOAL', title: 'Golden-goal winner', description: 'Overtime golden goal to win the league championship.', gameLabel: 'vs. Lincoln — League Final', occurredAt: T(3), status: 'minted', confidence: 0.95, sources: [{ kind: 'sportscaster', label: 'Coach producer feed' }, { kind: 'parent-stream', label: 'Parent stream #2' }, { kind: 'parent-stream', label: 'Parent stream #6' }], badge: '⚽', txHash: TX('soc01'), explorerUrl: EXP('soc01') },
      { id: 's2', type: 'MILESTONE', title: '30-goal season', description: 'Reached 30 goals on the season as a sophomore.', gameLabel: 'vs. Cleveland', occurredAt: T(17), status: 'minted', confidence: 0.91, sources: [{ kind: 'sportscaster', label: 'Coach producer feed' }, { kind: 'box-score', label: 'League box score' }], badge: '🏅', txHash: TX('soc02'), explorerUrl: EXP('soc02') },
      { id: 's3', type: 'BIG_PLAY', title: 'Hat trick', description: 'Three goals in a single match.', gameLabel: 'vs. Roosevelt', occurredAt: T(31), status: 'verified', confidence: 0.7, sources: [{ kind: 'sportscaster', label: 'Coach producer feed' }], badge: '⭐' },
    ],
    highlights: [
      { id: 'sh1', caption: 'League-final golden goal', scoreline: 'W 2-1 (OT)', kind: 'clip', accent: '#2b8fd6' },
      { id: 'sh2', caption: 'Free-kick top corner', scoreline: 'W 3-0', kind: 'clip', accent: '#2bd67a' },
      { id: 'sh3', caption: 'Team huddle', kind: 'photo', accent: '#7a2bd6' },
      { id: 'sh4', caption: 'Breakaway finish', scoreline: 'W 4-2', kind: 'clip', accent: '#d6a52b' },
    ],
  },
];

export const getDemoAthlete = (id: string): DemoAthlete | undefined => DEMO_ATHLETES.find(a => a.id === id);
