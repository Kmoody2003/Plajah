export type GameMode =
  | 'MENU'
  | 'PRE_DRIVE'
  | 'PLAYCALL'
  | 'PLAYING'
  | 'KICKING'
  | 'PAT_CHOICE'
  | 'PLAY_OVER'
  | 'TOUCHDOWN'
  | 'TURNOVER'
  | 'HALFTIME'
  | 'GAME_OVER'
  | 'STADIUM_CREATOR'
  | 'PRACTICE';

export type PlayStyleMode = 'SIMULATION' | 'ARCADE';

export type SkillLevel = 'ROOKIE' | 'PRO' | 'ALL_PRO' | 'LEGEND';

export type ControlSideMode = 'FULL_GAME' | 'OFFENSE_ONLY';

export type WeatherPreset = 'AURORA' | 'SUNSET' | 'NIGHT' | 'DAY' | 'RAIN' | 'SNOW';

export type CameraViewMode = 'BEHIND_QB' | 'BROADCAST' | 'FIRST_PERSON' | 'ALL_22' | 'ORBIT' | 'REPLAY';

export type TeamEmblem =
  | 'FLAME'
  | 'ANVIL'
  | 'WAVE'
  | 'COMPASS'
  | 'CROWN'
  | 'LANTERN'
  | 'SHIELD'
  | 'STAG';

export interface TeamRosterPlayer {
  number: number;
  name: string;
  pos: string;
  rating: number;
  speed: number;
}

export interface TeamInfo {
  id: string;
  abbr?: string;
  name: string;
  city: string;
  stadiumName?: string;
  division?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  helmetColor: string;
  awayPrimaryColor?: string;
  awaySecondaryColor?: string;
  visorColor?: string;
  emblem?: TeamEmblem;
  loreTagline?: string;
  schemeOffense?: string;
  schemeDefense?: string;
  ratings?: {
    ovr: number;
    off: number;
    def: number;
    spd: number;
  };
  score: number;
  timeouts?: number;
  starPlayers?: {
    qb: TeamRosterPlayer;
    rb: TeamRosterPlayer;
    wr1: TeamRosterPlayer;
    wr2: TeamRosterPlayer;
    te: TeamRosterPlayer;
    edge: TeamRosterPlayer;
    mlb: TeamRosterPlayer;
    cb1: TeamRosterPlayer;
    fs: TeamRosterPlayer;
    k: TeamRosterPlayer;
  };
}

export type PlayType =
  | 'PASS_SLANTS'
  | 'PASS_VERTS'
  | 'PASS_POST_OUT'
  | 'PASS_MESH'
  | 'PASS_FLOOD'
  | 'PASS_SCREEN'
  | 'PASS_PA_DAGGER'
  | 'PASS_HAIL_MARY'
  | 'PASS_GOAL_FADE'
  | 'RUN_HB_DIVE'
  | 'RUN_HB_SWEEP'
  | 'RUN_COUNTER'
  | 'RUN_READ_OPTION'
  | 'RUN_JET_SWEEP'
  | 'ST_FIELD_GOAL'
  | 'ST_PUNT';

export type DefensePlayType =
  | 'DEF_COVER_2'
  | 'DEF_COVER_3'
  | 'DEF_COVER_1_MAN'
  | 'DEF_BLITZ_ZERO'
  | 'DEF_PREVENT'
  | 'DEF_GOAL_LINE';

export type OffensiveFormation =
  | 'SHOTGUN_SPREAD'
  | 'SINGLEBACK_ACE'
  | 'I_FORM_PRO'
  | 'EMPTY_TRIPS'
  | 'GOAL_LINE'
  | 'SPECIAL_TEAMS';

export type PlayCategory = 'PASS' | 'RUN' | 'PLAY_ACTION' | 'SPECIAL';

export interface RouteWaypoint {
  x: number; // field lateral coordinate (-26 to 26)
  z: number; // field depth coordinate (yards relative to line of scrimmage)
  speed: number;
}

export interface ReceiverRoute {
  id: string;
  number: number;
  name: string;
  label: string; // e.g., "Pass 1 · D. Cross"
  position: 'WR_LEFT' | 'SLOT_MID' | 'WR_RIGHT' | 'TE' | 'RB';
  targetKey: '1' | '2' | '3' | '4';
  waypoints: RouteWaypoint[];
  currentWaypointIdx: number;
  separation: number; // 0 to 1
  isOpen: boolean;
  isCovered: boolean;
  contestedChance: number;
}

export type PlayerActionMove = 'NONE' | 'JUKE' | 'SPIN' | 'TRUCK' | 'DIVE' | 'SWAT' | 'HIT_STICK';

export interface Player3D {
  id: string;
  team: 'OFFENSE' | 'DEFENSE';
  role: 'QB' | 'WR' | 'TE' | 'OL' | 'RB' | 'DL' | 'LB' | 'CB' | 'S' | 'K';
  number: number;
  name: string;
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetZ: number;
  vx?: number;
  vz?: number;
  speed: number;
  heading: number; // radians
  state:
    | 'STANCE'
    | 'DROPBACK'
    | 'RUNNING'
    | 'BLOCKING'
    | 'PASS_RUSH'
    | 'THROWING'
    | 'CATCHING'
    | 'TACKLED'
    | 'CELEBRATING'
    | 'KICKING';
  route?: ReceiverRoute;
  assignedDefenderId?: string;
  engagedWithId?: string;
  hasBall?: boolean;
  rating?: number;
  bulkScale?: number;
  heightScale?: number;
  isUserControlled?: boolean;
  isOnFire?: boolean;
  stunTimer?: number;
  moveAction?: PlayerActionMove;
  moveTimer?: number;
  zoneAnchor?: { x: number; zOffset: number };
  isBlitzer?: boolean;
  isSpy?: boolean;
  assignmentType?: 'MAN' | 'ZONE_DEEP' | 'ZONE_HOOK' | 'ZONE_FLAT' | 'RUSH' | 'SPY';
}

export interface PlayerMovementInput {
  forward: number; // -1 (backward) to 1 (forward)
  lateral: number; // -1 (left) to 1 (right)
  sprint: boolean;
  juke: boolean;
  spin?: boolean;
  truck?: boolean;
  dive?: boolean;
}

export interface DriveState {
  down: 1 | 2 | 3 | 4;
  yardsToGo: number;
  ballYardLine: number; // 1 to 99 (Own 1 to Opp 1, 100 = Touchdown)
  playClock: number;
  quarter: number;
  timeRemaining: string;
  gameClockSeconds?: number;
  quarterLengthSeconds?: number;
  offenseTeam: TeamInfo;
  defenseTeam: TeamInfo;
  homeTeam?: TeamInfo;
  awayTeam?: TeamInfo;
  possession?: 'USER' | 'CPU';
  playStyle?: PlayStyleMode;
  skillLevel?: SkillLevel;
  controlSide?: ControlSideMode;
  isRedZone: boolean;
  lastPlayResult?: string;
  driveYards: number;
  playsInDrive: number;
  patPending?: boolean;
  isTwoMinuteWarning?: boolean;
}

export interface ArcadeState {
  streakCount: number;
  heatLevel: 0 | 1 | 2; // 0 = Normal, 1 = Heating Up, 2 = ON FIRE!
  fireTimeRemaining: number;
  turbo: number; // 0..100
  stylePoints: number;
  comboMultiplier: number;
  calloutText: string | null;
  calloutColor: string;
}

export interface KickMeterState {
  active: boolean;
  kind: 'FG' | 'PAT' | 'PUNT';
  phase: 'POWER' | 'ACCURACY' | 'LAUNCHED';
  power: number; // 0..1
  accuracy: number; // -1..1 (0 = sweet spot)
  distanceYards: number;
  windX: number;
}

export interface TeamBoxStats {
  passingYards: number;
  completions: number;
  attempts: number;
  passingTDs: number;
  interceptions: number;
  rushingYards: number;
  rushAttempts: number;
  rushingTDs: number;
  sacks: number;
  firstDowns: number;
  bigHits: number;
  fumblesLost: number;
  fgMade: number;
  fgAttempts: number;
}

export interface MatchBoxScore {
  user: TeamBoxStats;
  cpu: TeamBoxStats;
}

export interface PlayOutcome {
  result:
    | 'INCOMPLETE'
    | 'COMPLETE'
    | 'TOUCHDOWN'
    | 'SACK'
    | 'INTERCEPTION'
    | 'RUSH_GAIN'
    | 'FUMBLE'
    | 'FIELD_GOAL_GOOD'
    | 'FIELD_GOAL_MISS'
    | 'PUNT'
    | 'SAFETY'
    | 'TURNOVER_DOWNS'
    | 'PAT_GOOD'
    | 'PAT_MISS'
    | 'TWO_PT_GOOD'
    | 'TWO_PT_FAIL';
  yardsGained: number;
  description: string;
  headline?: string;
  playTag?: string;
  isBigPlay?: boolean;
  pointsScored?: number;
  turnover?: boolean;
  hasReplay?: boolean;
}
