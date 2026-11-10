// The workspaces of the unified Tela workspace (docs/TELA_UNIFIED_WORKSPACE_PLAN.md). Each one is
// a named layout over the same document. Live workspaces open a room that exists today; planned
// ones are listed honestly as coming, with the beginner door and the guide paths they'll offer.

import type { Two, PlannedPath } from './guidePath';

export type WorkspaceGroup = 'design' | 'make' | 'engineer' | 'science';
/** A room the shell can open today (services/build/launch.ts Room ids). */
export type RoomId = 'cad' | 'elec' | 'sew' | 'studio' | 'bio' | 'exchange';

export interface Workspace {
  id: string;
  group: WorkspaceGroup;
  name: string;
  /** Lucide icon name; the shell maps it. */
  icon: string;
  tone: string;
  /** Present when a room exists for it today. */
  room?: RoomId;
  status: 'live' | 'planned';
  /** Device kinds in focus. */
  focus: string[];
  door: Two;
  /** Guide paths offered here (live ones are wired by the room; planned ones are listed). */
  paths: Array<{ id: string; title: Two; live: boolean }>;
}

export const GROUPS: Array<{ id: WorkspaceGroup; name: string }> = [
  { id: 'design', name: 'Design' }, { id: 'make', name: 'Make' }, { id: 'engineer', name: 'Engineer' }, { id: 'science', name: 'Science' },
];

const p = (id: string, simple: string, pro: string, live = false) => ({ id, title: { simple, pro }, live });

export const WORKSPACES: Workspace[] = [
  { id: 'architecture', group: 'design', name: 'Architecture', icon: 'Ruler', tone: '#00DAF3', room: 'cad', status: 'live', focus: ['DRAFT_2D', 'BIM_MODEL', 'DRAWING_VIEW'],
    door: { simple: 'Draw a home room by room. Aria shows you each step and why.', pro: 'AutoCAD-style drafting with walls, rooms, schedules, IRC and ADA pre-checks, IFC.' },
    paths: [p('design-a-home', 'Design a home', 'Residential schematic design', true), p('add-a-deck', 'Add a deck', 'Deck framing plan')] },
  { id: 'landscape', group: 'design', name: 'Landscape', icon: 'Trees', tone: '#4ade80', status: 'planned', focus: ['DRAFT_2D', 'SITE'],
    door: { simple: 'Plan a garden: pick plants that grow where you live and see them grow over the years.', pro: 'Planting plans with USDA PLANTS data, grading on USGS 3DEP terrain, irrigation zones.' },
    paths: [p('plan-a-garden', 'Plan a garden', 'Residential planting plan')] },
  { id: 'render', group: 'design', name: 'Render', icon: 'Sun', tone: '#fbbf24', status: 'planned', focus: ['BIM_MODEL'],
    door: { simple: 'Turn your drawing into a picture of the finished place.', pro: 'Path-traced renders from the BIM model; daylight studies; AI restyle labelled as concept.' },
    paths: [p('first-render', 'Make your first render', 'Exterior and interior render set')] },
  { id: 'electronics', group: 'make', name: 'Electronics', icon: 'Cpu', tone: '#FF8C00', room: 'elec', status: 'live', focus: ['SCHEMATIC', 'PCB'],
    door: { simple: 'Say what you want to build and Plajah draws the circuit.', pro: 'Schematic, simulation, PCB routing, DRC, Gerbers and live part sourcing.' },
    paths: [p('describe-it', 'Describe it, we design it', 'Describe-to-schematic', true)] },
  { id: 'studio', group: 'make', name: 'Build Studio', icon: 'Blocks', tone: '#00DAF3', room: 'studio', status: 'live', focus: ['MODEL_3D', 'BREADBOARD'],
    door: { simple: 'Shapes, circuits and blocks: the free place to start.', pro: 'Beginner 3D, breadboard simulator, blocks to Arduino C++ and MicroPython.' },
    paths: [p('keychain', 'Print a keychain', 'Parametric keychain', true), p('blink', 'Make an LED blink', 'Blink sketch', true)] },
  { id: 'sewing', group: 'make', name: 'Sewing & Plush', icon: 'Scissors', tone: '#D40055', room: 'sew', status: 'live', focus: ['PATTERN'],
    door: { simple: 'Patterns made to your size, printed at home.', pro: 'Graded patterns, 3D fit, markers, tech packs.' },
    paths: [p('first-plush', 'Sew your first plush', 'Plush pattern to tech pack', true)] },
  { id: 'mechanical', group: 'engineer', name: 'Mechanical', icon: 'Cog', tone: '#ffb020', room: 'cad', status: 'live', focus: ['MODEL_PART', 'MODEL_ASSEMBLY'],
    door: { simple: 'Make a part from a library, change its size, and 3D-print it.', pro: 'Parametric parts, watertight checks, slicing, CNC and sheet metal.' },
    paths: [p('first-part', 'Print your first part', 'Part to G-code', true)] },
  { id: 'automotive', group: 'engineer', name: 'Automotive', icon: 'Car', tone: '#f87171', status: 'planned', focus: ['MODEL_ASSEMBLY', 'SIM_STUDY'],
    door: { simple: 'Design a soapbox car and see how fast it rolls.', pro: 'Assemblies with joints, multibody dynamics (Chrono/MuJoCo), FMVSS references.' },
    paths: [p('soapbox', 'Build a soapbox car', 'Gravity racer chassis')] },
  { id: 'robotics', group: 'engineer', name: 'Robotics', icon: 'Bot', tone: '#a78bfa', status: 'planned', focus: ['MODEL_ASSEMBLY', 'SIM_STUDY', 'CALC'],
    door: { simple: 'Build a robot that follows a line, in the computer first.', pro: 'URDF export, MuJoCo simulation, ROS 2 bridge, ISO 10218 references.' },
    paths: [p('line-follower', 'Build a line-following robot', 'Differential-drive line follower')] },
  { id: 'aerospace', group: 'engineer', name: 'Aerospace', icon: 'Rocket', tone: '#60a5fa', status: 'planned', focus: ['MODEL_ASSEMBLY', 'SIM_STUDY'],
    door: { simple: 'Design a model rocket and check it flies straight before you launch.', pro: 'Stability margin, flight sim, OpenVSP and PX4 links, FAA Part 101/107 references.' },
    paths: [p('model-rocket', 'Launch a model rocket', 'Model rocket stability and flight')] },
  { id: 'compute', group: 'science', name: 'Compute', icon: 'Sigma', tone: '#34d399', status: 'planned', focus: ['CALC'],
    door: { simple: 'Ask a question with numbers and see the answer as a chart.', pro: 'Notebook with matrices, signals, control and optimisation (Pyodide, python-control).' },
    paths: [p('fit-a-curve', 'Fit a curve to data', 'Regression and residuals')] },
  { id: 'astronomy', group: 'science', name: 'Astronomy', icon: 'Telescope', tone: '#c4b5fd', status: 'planned', focus: ['SKY', 'CALC'],
    door: { simple: 'Find the Moon and planets tonight from where you live.', pro: 'Ephemerides (JPL Horizons), star catalogues, INDI/ASCOM mount control.' },
    paths: [p('photograph-the-moon', 'Photograph the Moon', 'Lunar imaging session')] },
  { id: 'biology', group: 'science', name: 'Biology', icon: 'Dna', tone: '#5eead4', room: 'bio', status: 'live', focus: ['STRUCTURE', 'SBML'],
    door: { simple: 'Spin a real protein in 3D.', pro: 'PDB and AlphaFold structures, SBML models on our own solver.' },
    paths: [] },
];

export const workspaceById = (id: string) => WORKSPACES.find(w => w.id === id);
/** The workspace a room belongs to (the CAD room serves both Architecture and Mechanical; Architecture wins). */
export const workspaceForRoom = (room: RoomId) => WORKSPACES.find(w => w.room === room);

/** Paths listed but not built yet, for the "coming" cards. */
export const PLANNED_PATHS: PlannedPath[] = WORKSPACES.flatMap(w => w.paths.filter(x => !x.live).map(x => ({ id: x.id, workspace: w.id, title: x.title, blurb: w.door })));
