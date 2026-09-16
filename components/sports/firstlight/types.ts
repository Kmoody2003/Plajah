export type GameMode = 'MENU' | 'PRE_DRIVE' | 'PLAYING' | 'PLAY_OVER' | 'TOUCHDOWN' | 'TURNOVER' | 'STADIUM_CREATOR' | 'PRACTICE';

export type WeatherPreset = 'AURORA' | 'SUNSET' | 'NIGHT' | 'DAY' | 'RAIN' | 'SNOW';

export type CameraViewMode = 'BEHIND_QB' | 'BROADCAST' | 'FIRST_PERSON' | 'ALL_22' | 'ORBIT';

export interface TeamInfo {
  id: string;
  name: string;
  city: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  helmetColor: string;
  visorColor?: string;
  score: number;
}

export type PlayType = 'PASS_SLANTS' | 'PASS_VERTS' | 'PASS_POST_OUT' | 'PASS_SCREEN' | 'RUN_HB_DIVE';

export interface RouteWaypoint {
  x: number; // field lateral coordinate (-20 to 20)
  z: number; // field depth coordinate (yards relative to line of scrimmage)
  speed: number;
}

export interface ReceiverRoute {
  id: string;
  number: number;
  name: string;
  label: string; // e.g., "Pass 1 Left", "Pass 2 Mid", "Pass 3 Right", "Pass 4 Flat"
  position: 'WR_LEFT' | 'SLOT_MID' | 'WR_RIGHT' | 'TE' | 'RB';
  targetKey: '1' | '2' | '3' | '4';
  waypoints: RouteWaypoint[];
  currentWaypointIdx: number;
  separation: number; // 0 to 1
  isOpen: boolean;
  isCovered: boolean;
  contestedChance: number;
}

export interface Player3D {
  id: string;
  team: 'OFFENSE' | 'DEFENSE';
  role: 'QB' | 'WR' | 'OL' | 'RB' | 'DL' | 'LB' | 'CB' | 'S';
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
  state: 'STANCE' | 'DROPBACK' | 'RUNNING' | 'BLOCKING' | 'PASS_RUSH' | 'THROWING' | 'CATCHING' | 'TACKLED' | 'CELEBRATING';
  route?: ReceiverRoute;
  assignedDefenderId?: string;
  engagedWithId?: string;
  hasBall?: boolean;
}

export interface PlayerMovementInput {
  forward: number; // -1 (backward) to 1 (forward)
  lateral: number; // -1 (left) to 1 (right)
  sprint: boolean;
  juke: boolean;
}

export interface DriveState {
  down: 1 | 2 | 3 | 4;
  yardsToGo: number;
  ballYardLine: number; // 1 to 99 (e.g. 20 = Own 20 yard line, 80 = Opponent 20, 100 = Touchdown)
  playClock: number;
  quarter: number;
  timeRemaining: string;
  offenseTeam: TeamInfo;
  defenseTeam: TeamInfo;
  isRedZone: boolean;
  lastPlayResult?: string;
  driveYards: number;
  playsInDrive: number;
}

export interface PlayOutcome {
  result: 'INCOMPLETE' | 'COMPLETE' | 'TOUCHDOWN' | 'SACK' | 'INTERCEPTION' | 'RUSH_GAIN';
  yardsGained: number;
  description: string;
}
