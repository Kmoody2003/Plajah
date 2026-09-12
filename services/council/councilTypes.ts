// councilTypes — the Council of Art Directors as a working team.
//
// Six directors, each an agent with a durable lens and a profile that moves over time: style notes
// they write after a deliberation, influences they bring back from research, stances they took and
// how those landed, and the work they led. A deliberation is the team in a room: every director
// proposes, the disagreements are said out loud, Aria synthesises without averaging, and each
// director reflects on what the brief moved in their thinking. Aria is the only face the user
// meets; the directors are the team behind her, and she names them when it helps.
import type { TelaChartStyle } from '../../types';

export type CouncilDirectorId = 'CLASSICAL' | 'REBEL' | 'FUTURIST' | 'WORLD_ECLECTIC' | 'BAROQUE' | 'RADICAL_MINIMAL';
export const COUNCIL_DIRECTOR_IDS: CouncilDirectorId[] = ['CLASSICAL', 'REBEL', 'FUTURIST', 'WORLD_ECLECTIC', 'BAROQUE', 'RADICAL_MINIMAL'];

export interface CouncilDirector {
  id: CouncilDirectorId;
  name: string;
  /** how Aria refers to them in a sentence — "the Classical Mind" */
  epithet: string;
  /** the visual identity this director carries in the platform's art-direction spec */
  councilStyle: TelaChartStyle;
  medium: string;
  conviction: string;
  challenges: string;
  protects: string;
  /** how they talk — sentence length, temperature, what they reach for */
  voice: string;
  /** what they go looking for when they research */
  researchBeats: string[];
  /** the standing arguments — who they most often disagree with, and about what */
  tensions: Partial<Record<CouncilDirectorId, string>>;
  /** questions they always ask a brief */
  questions: string[];
}

export interface StyleNote { at: number; text: string; sessionId?: string }
export interface Influence { at: number; topic: string; finding: string; source?: { title: string; url?: string }; note: string }
export interface Stance { at: number; sessionId: string; brief: string; position: string; disagreedWith?: CouncilDirectorId; outcome: 'LEAD' | 'COUNTERPOINT' | 'EDITOR' | 'HEARD' }
export interface PortfolioItem { kind: 'BROADCAST_PACK' | 'SIGNATURE_SHADER' | 'TELA_TEMPLATE'; id: string; name: string }

/** The part of a director that changes. Global to the platform: the team is one team. */
export interface DirectorProfile {
  id: CouncilDirectorId;
  styleNotes: StyleNote[];
  influences: Influence[];
  stances: Stance[];
  portfolio: PortfolioItem[];
  /** running counts so Aria can say "the Rebel has led eleven of these" */
  ledCount: number;
  counterpointCount: number;
  editorCount: number;
  updatedAt: number;
}

export interface CouncilBrief {
  ask: string;
  surface?: string;
  domain?: string;
  audience?: string;
  feeling?: string;
  constraints?: string[];
  references?: string[];
}

export interface DirectorProposal {
  directorId: CouncilDirectorId;
  title: string;
  idea: string;
  geometry: string;
  typography: string;
  imageLogic: string;
  texture: string;
  motion: string;
  productionMethod: string;
  /** the perceptible sign of making — pressure, gesture, photographed material, physical light … */
  humanTrace: string;
  risk: string;
  arguesWith?: { directorId: CouncilDirectorId; why: string };
}

export interface Dispute {
  from: CouncilDirectorId;
  against: CouncilDirectorId;
  objection: string;
  concession?: string;
}

export interface Synthesis {
  lead: CouncilDirectorId;
  counterpoint: CouncilDirectorId;
  editor: CouncilDirectorId;
  direction: string;
  keepFromCounterpoint: string;
  editorCut: string;
  openDecision: string;
  /** Aria's words to the user, referring to the council or the team */
  ariaSummary: string;
  /** at most two directors quoted in their own words */
  quotes: Array<{ directorId: CouncilDirectorId; line: string }>;
}

export interface Reflection { directorId: CouncilDirectorId; note: string }

export type DeliberationDepth = 'QUICK' | 'FULL';
export type DeliberationStatus = 'RUNNING' | 'DONE' | 'FAILED';

export interface Deliberation {
  id: string;
  uid: string;
  createdAt: number;
  depth: DeliberationDepth;
  status: DeliberationStatus;
  brief: CouncilBrief;
  directors: CouncilDirectorId[];
  proposals: DirectorProposal[];
  disputes: Dispute[];
  synthesis?: Synthesis;
  reflections: Reflection[];
  userDecision?: { choice: 'LEAD' | 'COUNTERPOINT' | 'AGAIN' | 'OWN'; note?: string; at: number };
  error?: string;
}

export interface ResearchResult {
  directorId: CouncilDirectorId;
  topic: string;
  influences: Influence[];
  /** the director's note to the team, in their voice */
  note: string;
}
