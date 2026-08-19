import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import {
  createProduction, generateCallSheet, generateDPR, permissionsForRole,
  type CallSheet, type CraftItem, type CraftOrder, type DailyProductionReport,
  type ProdTask, type Production, type ProductionBudgetLine, type ProductionFestival,
  type ProductionLocation, type ProductionMember, type ProductionScene,
} from './filmProductionService';
import type { BreakdownElement } from './productionBreakdownService';
import type { ProductionAction } from './productionActionService';
import type { ProductionAlert, ProductionDecision } from './productionChatArtifacts';
import { provisionProductionChat } from './productionChatService';
import { productionRoomId } from './productionChatService';
import { sendMessage } from './backendService';
import { encryptText } from './cryptoService';
import type { RecipientDelivery, SchedulePlan } from './productionScheduleService';

export const FILM_SHOWCASE_TEMPLATE_KEY = 'plajah-halflight-production';
export const FILM_SHOWCASE_TEMPLATE_VERSION = 2;
export const FILM_SHOWCASE_TITLE = 'Halflight · Plajah Production Showcase';
export const showcaseProductionId = (uid: string) => `showcase_film_v${FILM_SHOWCASE_TEMPLATE_VERSION}_${uid}`;

export interface FilmShowcaseCorpus {
  production: Production;
  members: ProductionMember[];
  scenes: ProductionScene[];
  locations: ProductionLocation[];
  budgetLines: ProductionBudgetLine[];
  festivals: ProductionFestival[];
  tasks: ProdTask[];
  craftMenu: CraftItem[];
  craftOrders: CraftOrder[];
  callSheets: CallSheet[];
  dprs: DailyProductionReport[];
  schedulePlans: SchedulePlan[];
  breakdownElements: BreakdownElement[];
  decisions: ProductionDecision[];
  alerts: ProductionAlert[];
  productionActions: ProductionAction[];
  recipientDeliveries: RecipientDelivery[];
}

const clean = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const day = (offset: number) => {
  const value = new Date(); value.setHours(12, 0, 0, 0); value.setDate(value.getDate() + offset);
  return value.toISOString().slice(0, 10);
};

/**
 * A coherent Hollywood FEATURE production graph — "HALFLIGHT", a mid-budget
 * sci-fi thriller — used both by the universal showcase and user-owned copies.
 *
 * Logline: A grieving astrophysicist chasing a fading signal across the Nevada
 * desert discovers it is a message from a parallel version of herself — a warning
 * she has three days to act on before the two timelines collapse into one.
 */
export function buildFilmShowcaseCorpus(productionId: string, ownerUid: string, ownerName = 'Plajah Producer', isShowcase = true, now = Date.now()): FilmShowcaseCorpus {
  const production: Production = {
    id: productionId, ownerUid, title: FILM_SHOWCASE_TITLE, format: 'Feature', memberUids: [ownerUid],
    authority: { [ownerUid]: { roleKey: 'EXECUTIVE_PRODUCER', position: 'Executive Producer', department: 'PRODUCTION', permissions: permissionsForRole('EXECUTIVE_PRODUCER'), assignedBy: ownerUid, assignedAt: now } },
    totalDays: 26, productionOffice: 'Halflight Production Office · Insert Stage 4', emergencyContact: 'Demo only · do not call',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, status: 'ACTIVE',
    approvedScheduleId: 'schedule_halflight_v4', approvedScheduleVersion: 4,
    isShowcase, templateKey: FILM_SHOWCASE_TEMPLATE_KEY, templateVersion: FILM_SHOWCASE_TEMPLATE_VERSION,
    createdAt: now, updatedAt: now,
  };

  const member = (id: string, name: string, role: string, dept: ProductionMember['dept'], extra: Partial<ProductionMember> = {}): ProductionMember => ({ id, name, role, dept, status: 'ACTIVE', createdAt: now, ...extra });

  // ─── Full crew across every department + principal and supporting cast ──────
  const members: ProductionMember[] = [
    // Production / AD
    member(ownerUid, ownerName, 'Executive Producer', 'PRODUCTION', { uid: ownerUid, roleKey: 'EXECUTIVE_PRODUCER', rate: 'flat' }),
    member('crew_diane', 'Diane Alvarez', 'Producer', 'PRODUCTION', { roleKey: 'PRODUCER', rate: 'flat' }),
    member('crew_theo', 'Theo Marsh', 'Co-Producer', 'PRODUCTION', { roleKey: 'PRODUCER', rate: 'flat' }),
    member('crew_gloria', 'Gloria Sands', 'Unit Production Manager', 'PRODUCTION', { rate: '$3,800/wk' }),
    member('crew_benji', 'Benji Cole', 'Production Coordinator', 'PRODUCTION', { rate: '$1,900/wk' }),
    member('crew_marcuslin', 'Marcus Lin', '1st Assistant Director', 'PRODUCTION', { roleKey: 'FIRST_AD', rate: '$1,100/day' }),
    member('crew_petra', 'Petra Nilsson', '2nd Assistant Director', 'PRODUCTION', { rate: '$750/day' }),
    member('crew_chad', 'Chad Boone', '2nd 2nd Assistant Director', 'PRODUCTION', { rate: '$520/day' }),
    member('crew_riley', 'Riley Fox', 'Key Production Assistant', 'PRODUCTION', { rate: '$280/day' }),
    member('crew_devlin', 'Sam Devlin', 'Set Production Assistant', 'PRODUCTION', { rate: '$220/day' }),
    // Direction
    member('crew_director', 'Ava Solano', 'Director', 'DIRECTION', { roleKey: 'DIRECTOR', rate: 'flat' }),
    // Camera
    member('crew_dp', 'Lucia Ferrante', 'Director of Photography', 'CAMERA', { roleKey: 'DEPARTMENT_HEAD', rate: '$1,600/day' }),
    member('crew_opa', 'Kwame Boateng', 'A-Camera Operator', 'CAMERA', { rate: '$920/day' }),
    member('crew_opb', 'Nina Petrov', 'B-Camera Operator', 'CAMERA', { rate: '$920/day' }),
    member('crew_1aca', 'Toby Grant', '1st AC (A-Camera)', 'CAMERA', { rate: '$720/day' }),
    member('crew_1acb', 'Dana Kim', '1st AC (B-Camera)', 'CAMERA', { rate: '$720/day' }),
    member('crew_2ac', 'Felix Ortega', '2nd AC', 'CAMERA', { rate: '$560/day' }),
    member('crew_dit', 'Priya Shah', 'Digital Imaging Technician', 'CAMERA', { rate: '$780/day' }),
    member('crew_stills', 'Owen Blake', 'Unit Stills Photographer', 'CAMERA', { rate: '$650/day' }),
    // Grip & Electric
    member('crew_gaffer', 'Hank Rivera', 'Gaffer', 'GRIP_ELECTRIC', { roleKey: 'DEPARTMENT_HEAD', rate: '$880/day' }),
    member('crew_bbe', 'Iris Yoon', 'Best Boy Electric', 'GRIP_ELECTRIC', { rate: '$700/day' }),
    member('crew_keygrip', 'Dov Stein', 'Key Grip', 'GRIP_ELECTRIC', { rate: '$880/day' }),
    member('crew_bbg', 'Marla Chen', 'Best Boy Grip', 'GRIP_ELECTRIC', { rate: '$700/day' }),
    member('crew_dolly', 'Rueben Diaz', 'Dolly Grip', 'GRIP_ELECTRIC', { rate: '$720/day' }),
    // Sound
    member('crew_mixer', 'Ana Whitfield', 'Production Sound Mixer', 'SOUND', { roleKey: 'DEPARTMENT_HEAD', rate: '$850/day' }),
    member('crew_boom', 'Georgie Platt', 'Boom Operator', 'SOUND', { rate: '$620/day' }),
    member('crew_soundutil', 'Sean Doyle', 'Sound Utility', 'SOUND', { rate: '$480/day' }),
    // Art & Design
    member('crew_pd', 'Simone Clarke', 'Production Designer', 'ART', { roleKey: 'DEPARTMENT_HEAD', rate: '$1,400/wk' }),
    member('crew_artdir', 'Emil Novak', 'Art Director', 'ART', { rate: '$1,050/wk' }),
    member('crew_setdec', 'Paula Reynoso', 'Set Decorator', 'ART', { rate: '$980/wk' }),
    member('crew_props', 'Victor Han', 'Prop Master', 'ART', { rate: '$820/day' }),
    member('crew_swing', 'Cody Ruiz', 'Set Dresser / Swing', 'ART', { rate: '$540/day' }),
    // Wardrobe
    member('crew_costume', 'Renata Vaduva', 'Costume Designer', 'WARDROBE', { roleKey: 'DEPARTMENT_HEAD', rate: '$1,200/wk' }),
    member('crew_wardsup', 'Tia Brooks', 'Wardrobe Supervisor', 'WARDROBE', { rate: '$720/day' }),
    // Hair & Makeup
    member('crew_keymu', 'Lena Sorensen', 'Key Makeup Artist', 'HAIR_MAKEUP', { roleKey: 'DEPARTMENT_HEAD', rate: '$760/day' }),
    member('crew_hair', 'Desmond Pike', 'Key Hair Stylist', 'HAIR_MAKEUP', { rate: '$740/day' }),
    member('crew_sfxmu', 'Gaby Restrepo', 'SFX Makeup Artist', 'HAIR_MAKEUP', { rate: '$820/day' }),
    // Locations
    member('crew_locmgr', 'Ford Beckett', 'Location Manager', 'LOCATIONS', { roleKey: 'DEPARTMENT_HEAD', rate: '$1,150/wk' }),
    member('crew_asstloc', 'Nadia Halloran', 'Assistant Location Manager', 'LOCATIONS', { rate: '$820/wk' }),
    // Transportation
    member('crew_transpo', 'Mike Dolan', 'Transportation Coordinator', 'TRANSPORT', { rate: '$1,000/wk' }),
    member('crew_driver', 'Junior Sallow', 'Driver / Captain', 'TRANSPORT', { rate: '$620/day' }),
    // Stunts / SFX
    member('crew_stuntco', 'Rico Ventura', 'Stunt Coordinator', 'STUNTS_SFX', { roleKey: 'DEPARTMENT_HEAD', rate: '$1,300/day' }),
    member('crew_sfxsup', 'Delia Frost', 'Special Effects Supervisor', 'STUNTS_SFX', { rate: '$1,050/day' }),
    member('crew_armorer', 'Bill Trent', 'Armorer / Weapons', 'STUNTS_SFX', { rate: '$780/day' }),
    // Script / Continuity
    member('crew_scripty', 'Harriet Vale', 'Script Supervisor', 'SCRIPT', { roleKey: 'SCRIPT_SUPERVISOR', rate: '$720/day' }),
    member('crew_writer', 'Jonah Ellison', 'Writer (on set)', 'SCRIPT', { rate: 'flat' }),
    // Craft & Catering
    member('crew_craft', 'Rosa Ferro', 'Craft Service', 'CRAFT_CATERING', { rate: '$520/day' }),
    member('crew_caterer', 'Owen Park', 'Caterer', 'CRAFT_CATERING', { rate: '$26/head' }),
    // Post-Production
    member('crew_editor', 'Mira Kwon', 'Editor', 'POST', { rate: 'flat' }),
    member('crew_colorist', 'Sanjay Rao', 'Colorist', 'POST', { rate: 'flat' }),
    member('crew_sounddes', 'Wes Alderman', 'Supervising Sound Editor', 'POST', { rate: 'flat' }),
    member('crew_vfxsup', 'Talia Brandt', 'VFX Supervisor', 'POST', { rate: 'flat' }),
    member('crew_composer', 'Idris Faye', 'Composer', 'POST', { rate: 'flat' }),
    // Cast — principals + supporting
    member('cast_elena', 'Camille Osei', 'Dr. Elena Reyes (Lead)', 'CAST', { isCast: true, character: 'ELENA', roleKey: 'CAST', dietary: ['vegetarian'], rate: 'flat' }),
    member('cast_sam', 'Daniel Park', 'Sam Okada', 'CAST', { isCast: true, character: 'SAM', roleKey: 'CAST', rate: 'flat' }),
    member('cast_marcus', 'Andre Whitfield', 'Marcus Reyes', 'CAST', { isCast: true, character: 'MARCUS', roleKey: 'CAST', rate: '$4,500/wk' }),
    member('cast_drake', 'Katherine Vance', 'Col. Drake', 'CAST', { isCast: true, character: 'DRAKE', roleKey: 'CAST', rate: '$5,000/wk' }),
    member('cast_echo', 'Priya Nair', 'Echo (parallel Elena)', 'CAST', { isCast: true, character: 'ECHO', roleKey: 'CAST', rate: '$3,800/wk' }),
    member('cast_halsey', 'Robert Kline', 'Dr. Halsey', 'CAST', { isCast: true, character: 'HALSEY', roleKey: 'CAST', rate: '$3,200/wk' }),
    member('cast_cruz', 'Marisol Duarte', 'Deputy Cruz', 'CAST', { isCast: true, character: 'CRUZ', roleKey: 'CAST', rate: '$1,400/day' }),
    member('cast_june', 'Ella Brooks', 'June (waitress)', 'CAST', { isCast: true, character: 'JUNE', roleKey: 'CAST', rate: '$1,050/day', dietary: ['gluten-free'] }),
    member('cast_ravi', 'Nikhil Rao', 'Ravi (lab tech)', 'CAST', { isCast: true, character: 'RAVI', roleKey: 'CAST', rate: '$1,200/day' }),
    member('cast_voss', 'Gregor Alman', 'Dr. Voss', 'CAST', { isCast: true, character: 'VOSS', roleKey: 'CAST', rate: '$2,600/wk' }),
  ];

  // ─── Locations ──────────────────────────────────────────────────────────────
  const locations: ProductionLocation[] = [
    { id: 'loc_dish', name: 'Goldstone Deep-Space Array', type: 'EXT', address: '35000 Fort Irwin Road', city: 'Barstow, CA', contactName: 'Demo Film Office', contactPhone: '—', permitStatus: 'APPROVED', rentalFee: 6500, notes: 'Dish access requires a fall-protection plan and a hard sunset out.', createdAt: now },
    { id: 'loc_lab', name: 'Aeronomy Research Lab', type: 'BOTH', address: '4800 Oak Grove Drive', city: 'Pasadena, CA', contactName: 'Site Representative', contactPhone: '—', permitStatus: 'APPROVED', rentalFee: 5200, notes: 'Weekend-only access; server room is a live facility — no open flame.', createdAt: now },
    { id: 'loc_motel', name: 'Starlite Motel', type: 'BOTH', address: '2100 Twentynine Palms Hwy', city: 'Yucca Valley, CA', contactName: 'Owner / Operator', contactPhone: '—', permitStatus: 'APPROVED', rentalFee: 3400, notes: 'Practical neon; guest rooms 112–116 held for the company.', createdAt: now },
    { id: 'loc_diner', name: 'Route 375 Diner', type: 'INT', address: 'Mile Marker 44, State Route 375', city: 'Rachel, NV', contactName: 'Owner', contactPhone: '—', permitStatus: 'PENDING', rentalFee: 2800, notes: 'Business must stay open; night-before dressing only.', createdAt: now },
    { id: 'loc_house', name: 'Reyes Family House', type: 'INT', address: '18 Alameda Court', city: 'Ridgecrest, CA', contactName: 'Homeowner', contactPhone: '—', permitStatus: 'APPROVED', rentalFee: 3900, notes: 'Period dressing to 1994; protect the hardwood floors.', createdAt: now },
    { id: 'loc_highway', name: 'Route 375 Highway', type: 'EXT', address: 'State Route 375 corridor', city: 'Lincoln County, NV', contactName: 'County Film Office', contactPhone: '—', permitStatus: 'PENDING', rentalFee: 4500, notes: 'Rolling lane closure + CHP; process trailer and insert car permit pending.', createdAt: now },
    { id: 'loc_bunker', name: 'Decommissioned Missile Bunker', type: 'BOTH', address: 'Former LF-04 Complex', city: 'Kern County, CA', contactName: 'Property Manager', contactPhone: '—', permitStatus: 'SCOUTED', rentalFee: 8000, notes: 'Structural + air-quality survey required before company access.', createdAt: now },
    { id: 'loc_stage', name: 'Insert Stage 4', type: 'INT', address: '900 Soundstage Row', city: 'Sun Valley, CA', contactName: 'Stage Manager', contactPhone: '—', permitStatus: 'APPROVED', rentalFee: 7000, notes: 'Bluescreen cyc + wire-work rig; grid load approved.', createdAt: now },
  ];

  // ─── Scenes (spread across the 26-day schedule and every location) ──────────
  const scenes: ProductionScene[] = [
    { id: 's_01', sceneNum: '1', intExt: 'EXT', dayNight: 'DUSK', set: 'GOLDSTONE DEEP-SPACE ARRAY', synopsis: 'Elena aligns the dish and catches the first fragment of a signal that should not exist.', characters: ['ELENA', 'SAM'], pages: 1.5, shootDay: 1, status: 'SHOT', locationId: 'loc_dish', notes: 'Golden-hour window is unforgiving — two cameras.' },
    { id: 's_02', sceneNum: '2', intExt: 'EXT', dayNight: 'NIGHT', set: 'GOLDSTONE ARRAY - DISH BASE', synopsis: 'The signal loops back a recording of Elena’s own voice.', characters: ['ELENA', 'SAM'], pages: 2.0, shootDay: 1, status: 'SHOT', locationId: 'loc_dish' },
    { id: 's_03', sceneNum: '3', intExt: 'INT', dayNight: 'NIGHT', set: 'ARRAY CONTROL SHED', synopsis: 'Sam wants to log the anomaly; Elena wipes the timestamp.', characters: ['ELENA', 'SAM'], pages: 1.25, shootDay: 1, status: 'PARTIAL', locationId: 'loc_dish' },
    { id: 's_10', sceneNum: '10', intExt: 'INT', dayNight: 'DAY', set: 'AERONOMY LAB - BAY 7', synopsis: 'Elena decodes the waveform while Halsey questions her overnight hours.', characters: ['ELENA', 'HALSEY'], pages: 2.25, shootDay: 2, status: 'SHOT', locationId: 'loc_lab' },
    { id: 's_11', sceneNum: '11', intExt: 'INT', dayNight: 'DAY', set: 'LAB - SERVER ROOM', synopsis: 'Ravi proves the signal predates the array by forty years.', characters: ['ELENA', 'RAVI'], pages: 1.5, shootDay: 2, status: 'SHOT', locationId: 'loc_lab' },
    { id: 's_12', sceneNum: '12', intExt: 'INT', dayNight: 'DAY', set: 'LAB CORRIDOR', synopsis: 'Marcus arrives with news that pulls Elena home.', characters: ['ELENA', 'MARCUS'], pages: 1.0, shootDay: 2, status: 'PARTIAL', locationId: 'loc_lab' },
    { id: 's_20', sceneNum: '20', intExt: 'INT', dayNight: 'NIGHT', set: 'STARLITE MOTEL - ROOM 114', synopsis: 'Alone, Elena hears the warning hidden inside the noise.', characters: ['ELENA', 'ECHO'], pages: 1.75, shootDay: 3, status: 'NOT_SHOT', locationId: 'loc_motel', notes: 'ECHO is off-camera VO for this scene.' },
    { id: 's_21', sceneNum: '21', intExt: 'EXT', dayNight: 'NIGHT', set: 'STARLITE MOTEL - PARKING LOT', synopsis: 'A government sedan idles across the road.', characters: ['ELENA', 'DRAKE'], pages: 1.0, shootDay: 3, status: 'NOT_SHOT', locationId: 'loc_motel' },
    { id: 's_28', sceneNum: '28', intExt: 'INT', dayNight: 'DAY', set: 'ROUTE 375 DINER', synopsis: 'Elena and Sam argue about going public over cold coffee.', characters: ['ELENA', 'SAM', 'JUNE'], pages: 2.0, shootDay: 5, status: 'NOT_SHOT', locationId: 'loc_diner' },
    { id: 's_29', sceneNum: '29', intExt: 'INT', dayNight: 'DAY', set: 'DINER - BACK BOOTH', synopsis: 'Drake makes his offer and his threat.', characters: ['ELENA', 'DRAKE'], pages: 1.5, shootDay: 5, status: 'NOT_SHOT', locationId: 'loc_diner' },
    { id: 's_35', sceneNum: '35', intExt: 'INT', dayNight: 'DUSK', set: 'REYES FAMILY HOUSE - KITCHEN', synopsis: 'Elena and Marcus sort their mother’s things and old cassette tapes.', characters: ['ELENA', 'MARCUS'], pages: 2.5, shootDay: 8, status: 'NOT_SHOT', locationId: 'loc_house' },
    { id: 's_36', sceneNum: '36', intExt: 'INT', dayNight: 'NIGHT', set: 'REYES HOUSE - GARAGE', synopsis: 'A childhood recording matches the signal exactly.', characters: ['ELENA', 'MARCUS', 'ECHO'], pages: 1.75, shootDay: 8, status: 'NOT_SHOT', locationId: 'loc_house' },
    { id: 's_44', sceneNum: '44', intExt: 'EXT', dayNight: 'DAY', set: 'ROUTE 375 - OPEN HIGHWAY', synopsis: 'Elena races the empty desert as the sedan closes in.', characters: ['ELENA', 'DRAKE'], pages: 1.5, shootDay: 12, status: 'NOT_SHOT', locationId: 'loc_highway', notes: 'Picture car + insert car; process trailer.' },
    { id: 's_45', sceneNum: '45', intExt: 'EXT', dayNight: 'DAY', set: 'HIGHWAY SHOULDER', synopsis: 'Deputy Cruz pulls her over at the worst possible moment.', characters: ['ELENA', 'CRUZ'], pages: 1.25, shootDay: 12, status: 'NOT_SHOT', locationId: 'loc_highway' },
    { id: 's_52', sceneNum: '52', intExt: 'INT/EXT', dayNight: 'DUSK', set: 'MISSILE BUNKER - ENTRANCE', synopsis: 'Elena breaks into the source of the transmission.', characters: ['ELENA', 'SAM'], pages: 2.0, shootDay: 14, status: 'NOT_SHOT', locationId: 'loc_bunker' },
    { id: 's_53', sceneNum: '53', intExt: 'INT', dayNight: 'NIGHT', set: 'MISSILE BUNKER - CONTROL LEVEL', synopsis: 'The bunker is already running her experiment.', characters: ['ELENA', 'SAM', 'ECHO'], pages: 2.75, shootDay: 14, status: 'NOT_SHOT', locationId: 'loc_bunker', notes: 'Stunt rigging on the ladder; SFX spark hits.' },
    { id: 's_54', sceneNum: '54', intExt: 'INT', dayNight: 'NIGHT', set: 'BUNKER - LOWER SHAFT', synopsis: 'A fall in the dark — Sam is hurt.', characters: ['ELENA', 'SAM'], pages: 1.5, shootDay: 14, status: 'NOT_SHOT', locationId: 'loc_bunker', notes: 'Stunt coordinator + on-set medic required.' },
    { id: 's_60', sceneNum: '60', intExt: 'INT', dayNight: 'NIGHT', set: 'BUNKER - CONTROL LEVEL', synopsis: 'Echo speaks to Elena face to face for the first time.', characters: ['ELENA', 'ECHO'], pages: 3.0, shootDay: 16, status: 'NOT_SHOT', locationId: 'loc_bunker' },
    { id: 's_61', sceneNum: '61', intExt: 'INT', dayNight: 'NIGHT', set: 'BUNKER - ARCHIVE', synopsis: 'Voss reveals the program that opened the loop.', characters: ['ELENA', 'VOSS'], pages: 2.0, shootDay: 16, status: 'NOT_SHOT', locationId: 'loc_bunker' },
    { id: 's_66', sceneNum: '66', intExt: 'INT', dayNight: 'DAY', set: 'AERONOMY LAB - BAY 7', synopsis: 'Elena tries to send a message back through the array.', characters: ['ELENA', 'RAVI', 'HALSEY'], pages: 2.5, shootDay: 18, status: 'NOT_SHOT', locationId: 'loc_lab' },
    { id: 's_67', sceneNum: '67', intExt: 'INT', dayNight: 'DAY', set: 'LAB - ROOF', synopsis: 'Drake’s team moves in.', characters: ['ELENA', 'DRAKE', 'SAM'], pages: 1.75, shootDay: 18, status: 'NOT_SHOT', locationId: 'loc_lab', notes: 'Company move to roof; safety line for edge work.' },
    { id: 's_72', sceneNum: '72', intExt: 'INT', dayNight: 'DUSK', set: 'REYES HOUSE - KITCHEN', synopsis: 'Elena chooses which version of the past to save.', characters: ['ELENA', 'MARCUS'], pages: 2.25, shootDay: 20, status: 'NOT_SHOT', locationId: 'loc_house' },
    { id: 's_73', sceneNum: '73', intExt: 'EXT', dayNight: 'NIGHT', set: 'REYES HOUSE - DRIVEWAY', synopsis: 'Marcus covers her escape as Cruz arrives.', characters: ['ELENA', 'MARCUS', 'CRUZ'], pages: 1.5, shootDay: 20, status: 'NOT_SHOT', locationId: 'loc_house' },
    { id: 's_78', sceneNum: '78', intExt: 'INT', dayNight: 'NIGHT', set: 'INSERT STAGE - SIGNAL VOID (BLUESCREEN)', synopsis: 'Elena moves through the collapsing signal.', characters: ['ELENA', 'ECHO'], pages: 2.0, shootDay: 22, status: 'NOT_SHOT', locationId: 'loc_stage', notes: 'VFX bluescreen; wire work.' },
    { id: 's_79', sceneNum: '79', intExt: 'INT', dayNight: 'NIGHT', set: 'INSERT STAGE - TABLETOP INSERTS', synopsis: 'Close inserts of the decoded message resolving.', characters: ['ELENA'], pages: 0.75, shootDay: 22, status: 'NOT_SHOT', locationId: 'loc_stage' },
    { id: 's_84', sceneNum: '84', intExt: 'EXT', dayNight: 'DUSK', set: 'GOLDSTONE ARRAY - DISH BASE', synopsis: 'Elena returns to broadcast the answer.', characters: ['ELENA', 'SAM'], pages: 2.0, shootDay: 24, status: 'NOT_SHOT', locationId: 'loc_dish' },
    { id: 's_85', sceneNum: '85', intExt: 'EXT', dayNight: 'NIGHT', set: 'GOLDSTONE ARRAY - CATWALK', synopsis: 'Drake corners her at the transmitter.', characters: ['ELENA', 'DRAKE', 'SAM'], pages: 2.5, shootDay: 24, status: 'NOT_SHOT', locationId: 'loc_dish', notes: 'Height work; stunt + safety plan.' },
    { id: 's_92', sceneNum: '92', intExt: 'EXT', dayNight: 'DAWN', set: 'GOLDSTONE ARRAY - DISH', synopsis: 'The message goes out at first light.', characters: ['ELENA', 'ECHO'], pages: 2.0, shootDay: 26, status: 'NOT_SHOT', locationId: 'loc_dish', notes: 'Hard dawn window; two cameras, no resets.' },
    { id: 's_93', sceneNum: '93', intExt: 'EXT', dayNight: 'DAWN', set: 'GOLDSTONE ARRAY - FIELD', synopsis: 'Elena hears a new voice answer back.', characters: ['ELENA'], pages: 1.25, shootDay: 26, status: 'NOT_SHOT', locationId: 'loc_dish' },
    { id: 's_94', sceneNum: '94', intExt: 'EXT', dayNight: 'DAY', set: 'GOLDSTONE ARRAY - PARKING', synopsis: 'Wrap image: the array powers down.', characters: ['ELENA', 'MARCUS'], pages: 1.0, shootDay: 26, status: 'NOT_SHOT', locationId: 'loc_dish' },
  ];

  // ─── Budget — feature-scale, above-the-line + below-the-line + post ─────────
  const budgetLines: ProductionBudgetLine[] = [
    { id: 'budget_story', department: 'Above the Line', lineItem: 'Story & script rights', estimated: 120000, actual: 120000, notes: 'Optioned original screenplay', createdAt: now },
    { id: 'budget_writer', department: 'Above the Line', lineItem: 'Screenwriter', estimated: 180000, actual: 150000, notes: 'Production rewrite polish reserved', createdAt: now },
    { id: 'budget_producers', department: 'Above the Line', lineItem: 'Producers & EP fees', estimated: 350000, actual: 210000, notes: 'Deferred back-end for two producers', createdAt: now },
    { id: 'budget_director', department: 'Above the Line', lineItem: 'Director', estimated: 300000, actual: 180000, notes: 'Prep + shoot paid; post pending', createdAt: now },
    { id: 'budget_castprincipal', department: 'Cast', lineItem: 'Principal cast', estimated: 900000, actual: 540000, notes: 'Lead + three principals', createdAt: now },
    { id: 'budget_castsupport', department: 'Cast', lineItem: 'Supporting cast & day players', estimated: 220000, actual: 96000, notes: 'SAG scale + 10%', createdAt: now },
    { id: 'budget_caststunts', department: 'Cast', lineItem: 'Stunt performers & adjustments', estimated: 85000, actual: 12000, notes: 'Bunker + catwalk units', createdAt: now },
    { id: 'budget_adteam', department: 'Production', lineItem: 'AD team & coordinators', estimated: 140000, actual: 78000, notes: '1st/2nd/2nd-2nd AD + coordinator', createdAt: now },
    { id: 'budget_camera', department: 'Camera', lineItem: 'Camera package & crew', estimated: 320000, actual: 176000, notes: 'Two-camera anamorphic package', createdAt: now },
    { id: 'budget_lighting', department: 'Grip & Electric', lineItem: 'Lighting, grip & power', estimated: 280000, actual: 150000, notes: 'Genny + condor for desert nights', createdAt: now },
    { id: 'budget_sound', department: 'Sound', lineItem: 'Production sound', estimated: 90000, actual: 44000, notes: 'Mixer + boom + utility', createdAt: now },
    { id: 'budget_art', department: 'Art', lineItem: 'Art dept, sets & construction', estimated: 360000, actual: 190000, notes: 'Bunker build + array dressing', createdAt: now },
    { id: 'budget_props', department: 'Art', lineItem: 'Props & set dressing', estimated: 120000, actual: 62000, notes: 'Hero transmitter + period tapes', createdAt: now },
    { id: 'budget_wardrobe', department: 'Wardrobe', lineItem: 'Costumes', estimated: 95000, actual: 41000, notes: 'Multiples for stunt scenes', createdAt: now },
    { id: 'budget_hmu', department: 'Hair & Makeup', lineItem: 'Hair, makeup & SFX makeup', estimated: 78000, actual: 33000, notes: 'Injury effects for the shaft fall', createdAt: now },
    { id: 'budget_locations', department: 'Locations', lineItem: 'Locations, permits & fees', estimated: 210000, actual: 96000, notes: 'Highway + bunker permits unresolved', createdAt: now },
    { id: 'budget_transport', department: 'Transportation', lineItem: 'Transport & picture cars', estimated: 160000, actual: 70000, notes: 'Process trailer + insert car', createdAt: now },
    { id: 'budget_stunts', department: 'Stunts / SFX', lineItem: 'Stunts & special effects', estimated: 150000, actual: 24000, notes: 'Ladder rig, spark hits, wire work', createdAt: now },
    { id: 'budget_craft', department: 'Craft & Catering', lineItem: 'Catering & craft service', estimated: 130000, actual: 61000, notes: '~70 headcount on shoot days', createdAt: now },
    { id: 'budget_expendables', department: 'Production', lineItem: 'Expendables & equipment rentals', estimated: 90000, actual: 40000, notes: 'Rolling weekly', createdAt: now },
    { id: 'budget_editorial', department: 'Post', lineItem: 'Editorial', estimated: 220000, actual: 30000, notes: 'Editor started assembly during shoot', createdAt: now },
    { id: 'budget_vfx', department: 'Post', lineItem: 'Visual effects', estimated: 480000, actual: 0, notes: 'Signal-void environment + array extensions', createdAt: now },
    { id: 'budget_color', department: 'Post', lineItem: 'Color & finishing', estimated: 90000, actual: 0, notes: 'Reserved', createdAt: now },
    { id: 'budget_postsound', department: 'Post', lineItem: 'Sound design & mix', estimated: 140000, actual: 0, notes: 'Reserved', createdAt: now },
    { id: 'budget_music', department: 'Post', lineItem: 'Composer & score', estimated: 160000, actual: 20000, notes: 'Theme demo commissioned', createdAt: now },
    { id: 'budget_deliverables', department: 'Post', lineItem: 'Deliverables & DCP', estimated: 70000, actual: 0, notes: 'Reserved', createdAt: now },
    { id: 'budget_insurance', department: 'Production', lineItem: 'Insurance & legal', estimated: 140000, actual: 140000, notes: 'Production package bound', createdAt: now },
    { id: 'budget_contingency', department: 'Production', lineItem: 'Contingency (~5%)', estimated: 320000, actual: 0, notes: 'Held against permit + weather risk', createdAt: now },
  ];

  // ─── Festivals ──────────────────────────────────────────────────────────────
  const festivals: ProductionFestival[] = [
    { id: 'fest_sundance', festival: 'Sundance Film Festival', tier: 'A', deadline: now + 95 * 86400000, fee: 110, status: 'PLANNING', category: 'U.S. Dramatic Competition', notes: 'Premiere strategy review required.', createdAt: now },
    { id: 'fest_tiff', festival: 'Toronto International Film Festival', tier: 'A', deadline: now + 140 * 86400000, fee: 125, status: 'PLANNING', category: 'Special Presentations', notes: 'Targeting a fall world premiere.', createdAt: now },
    { id: 'fest_sxsw', festival: 'SXSW Film & TV Festival', tier: 'B', deadline: now + 60 * 86400000, fee: 85, status: 'SUBMITTED', category: 'Narrative Feature Competition', notes: 'Genre + tech-forward audience fit.', createdAt: now },
    { id: 'fest_fantastic', festival: 'Fantastic Fest', tier: 'B', deadline: now + 120 * 86400000, fee: 60, status: 'PLANNING', category: 'Features', notes: 'Strong sci-fi thriller programming.', createdAt: now },
    { id: 'fest_sitges', festival: 'Sitges Film Festival', tier: 'C', deadline: now + 175 * 86400000, fee: 55, status: 'PLANNING', category: 'Òrbita', notes: 'European genre launch option.', createdAt: now },
  ];

  // ─── Tasks ──────────────────────────────────────────────────────────────────
  const tasks: ProdTask[] = [
    { id: 'task_highway_permit', title: 'Close highway lane-closure + CHP permit', dept: 'LOCATIONS', assigneeMemberId: 'crew_locmgr', assigneeName: 'Ford Beckett', shootDay: 12, due: day(9), priority: 'URGENT', status: 'DOING', createdAt: now },
    { id: 'task_bunker_survey', title: 'Complete bunker structural + air-quality survey', dept: 'LOCATIONS', assigneeMemberId: 'crew_asstloc', assigneeName: 'Nadia Halloran', shootDay: 14, due: day(10), priority: 'URGENT', status: 'TODO', createdAt: now },
    { id: 'task_ladder_rig', title: 'Approve bunker ladder stunt rig & medic plan', dept: 'STUNTS_SFX', assigneeMemberId: 'crew_stuntco', assigneeName: 'Rico Ventura', shootDay: 14, due: day(11), priority: 'HIGH', status: 'TODO', createdAt: now },
    { id: 'task_process_trailer', title: 'Confirm process trailer + insert car rental', dept: 'TRANSPORT', assigneeMemberId: 'crew_transpo', assigneeName: 'Mike Dolan', shootDay: 12, due: day(8), priority: 'HIGH', status: 'DOING', createdAt: now },
    { id: 'task_transmitter', title: 'Finish hero transmitter build & practical lights', dept: 'ART', assigneeMemberId: 'crew_props', assigneeName: 'Victor Han', shootDay: 24, due: day(6), priority: 'MED', status: 'DOING', createdAt: now },
    { id: 'task_period_tapes', title: 'Clear period cassette dressing for Reyes house', dept: 'ART', assigneeMemberId: 'crew_setdec', assigneeName: 'Paula Reynoso', shootDay: 8, due: day(4), priority: 'MED', status: 'TODO', createdAt: now },
    { id: 'task_condor', title: 'Book condor + generator for desert nights', dept: 'GRIP_ELECTRIC', assigneeMemberId: 'crew_gaffer', assigneeName: 'Hank Rivera', shootDay: 1, due: day(-2), priority: 'HIGH', status: 'DONE', createdAt: now },
    { id: 'task_sun_windows', title: 'Lock dawn/sunset windows for array days', dept: 'PRODUCTION', assigneeMemberId: 'crew_marcuslin', assigneeName: 'Marcus Lin', shootDay: 26, due: day(1), priority: 'HIGH', status: 'DOING', createdAt: now },
    { id: 'task_wirework', title: 'Rig wire-work + safety for signal-void stage', dept: 'STUNTS_SFX', assigneeMemberId: 'crew_stuntco', assigneeName: 'Rico Ventura', shootDay: 22, due: day(16), priority: 'MED', status: 'TODO', createdAt: now },
    { id: 'task_bluescreen', title: 'Pre-light bluescreen cyc + tracking markers', dept: 'CAMERA', assigneeMemberId: 'crew_dit', assigneeName: 'Priya Shah', shootDay: 22, due: day(15), priority: 'MED', status: 'TODO', createdAt: now },
    { id: 'task_vfx_bid', title: 'Lock VFX vendor bid for array extensions', dept: 'POST', assigneeMemberId: 'crew_vfxsup', assigneeName: 'Talia Brandt', due: day(7), priority: 'HIGH', status: 'DOING', createdAt: now },
    { id: 'task_wardrobe_multiples', title: 'Build wardrobe multiples for shaft-fall stunt', dept: 'WARDROBE', assigneeMemberId: 'crew_costume', assigneeName: 'Renata Vaduva', shootDay: 14, due: day(9), priority: 'MED', status: 'TODO', createdAt: now },
    { id: 'task_injury_mu', title: 'Test Sam injury makeup continuity', dept: 'HAIR_MAKEUP', assigneeMemberId: 'crew_sfxmu', assigneeName: 'Gaby Restrepo', shootDay: 14, due: day(10), priority: 'MED', status: 'TODO', createdAt: now },
    { id: 'task_sound_wireless', title: 'Coordinate wireless plan for diner + bunker', dept: 'SOUND', assigneeMemberId: 'crew_mixer', assigneeName: 'Ana Whitfield', shootDay: 5, due: day(2), priority: 'MED', status: 'TODO', createdAt: now },
    { id: 'task_diner_permit', title: 'Confirm diner overnight dressing window', dept: 'LOCATIONS', assigneeMemberId: 'crew_locmgr', assigneeName: 'Ford Beckett', shootDay: 5, due: day(1), priority: 'HIGH', status: 'TODO', createdAt: now },
    { id: 'task_catering_count', title: 'Finalize catering headcount for week 3', dept: 'CRAFT_CATERING', assigneeMemberId: 'crew_caterer', assigneeName: 'Owen Park', due: day(3), priority: 'LOW', status: 'TODO', createdAt: now },
    { id: 'task_sides', title: 'Distribute sides for Day 3 motel night', dept: 'SCRIPT', assigneeMemberId: 'crew_scripty', assigneeName: 'Harriet Vale', shootDay: 3, due: day(0), priority: 'MED', status: 'DOING', createdAt: now },
    { id: 'task_insurance_rider', title: 'Add stunt rider to insurance for bunker unit', dept: 'PRODUCTION', assigneeMemberId: 'crew_gloria', assigneeName: 'Gloria Sands', shootDay: 14, due: day(8), priority: 'HIGH', status: 'TODO', createdAt: now },
    { id: 'task_editor_assembly', title: 'Deliver week 1 assembly to director', dept: 'POST', assigneeMemberId: 'crew_editor', assigneeName: 'Mira Kwon', due: day(5), priority: 'LOW', status: 'TODO', createdAt: now },
    { id: 'task_score_theme', title: 'Review composer theme demo', dept: 'POST', assigneeMemberId: 'crew_composer', assigneeName: 'Idris Faye', due: day(12), priority: 'LOW', status: 'TODO', createdAt: now },
  ];

  // ─── Craft menu + orders ─────────────────────────────────────────────────────
  const craftMenu: CraftItem[] = [
    { id: 'craft_bowl', name: 'High Desert Grain Bowl', category: 'MEAL', desc: 'Roasted vegetables, grains, tahini', dietaryTags: ['vegetarian', 'gluten-free'], available: true, createdAt: now },
    { id: 'craft_chili', name: 'Crew Turkey Chili', category: 'MEAL', desc: 'Hot night-shoot meal', dietaryTags: ['gluten-free'], available: true, createdAt: now },
    { id: 'craft_carnitas', name: 'Carnitas Tacos', category: 'MEAL', desc: 'Slow-roast pork, salsa verde', dietaryTags: [], available: true, createdAt: now },
    { id: 'craft_saladbar', name: 'Build-Your-Own Salad', category: 'MEAL', desc: 'Cold line with proteins', dietaryTags: ['vegan', 'vegetarian'], available: true, createdAt: now },
    { id: 'craft_wrap', name: 'Turkey Club Wrap', category: 'SNACK', desc: 'Grab-and-go from crafty', dietaryTags: [], available: true, createdAt: now },
    { id: 'craft_fruit', name: 'Fresh Fruit Cup', category: 'SNACK', desc: 'Seasonal', dietaryTags: ['vegan', 'gluten-free', 'nut-free'], available: true, createdAt: now },
    { id: 'craft_coffee', name: 'Night Exterior Coffee', category: 'COFFEE', desc: 'Hot coffee and oat milk', dietaryTags: [], available: true, createdAt: now },
    { id: 'craft_coldbrew', name: 'Cold Brew', category: 'COFFEE', desc: 'On tap all day', dietaryTags: [], available: true, createdAt: now },
    { id: 'craft_electrolyte', name: 'Electrolyte Water', category: 'DRINK', desc: 'Cold, restocked hourly for desert heat', dietaryTags: ['vegan', 'gluten-free'], available: true, createdAt: now },
    { id: 'craft_gfbox', name: 'Gluten-Free Snack Box', category: 'SPECIAL', desc: 'Certified GF', dietaryTags: ['gluten-free'], available: true, createdAt: now },
  ];
  const craftOrders: CraftOrder[] = [
    { id: 'order_elena', itemId: 'craft_bowl', itemName: 'High Desert Grain Bowl', qty: 1, forMemberId: 'cast_elena', requestedByUid: ownerUid, requestedByName: 'Camille Osei', dept: 'CAST', dietary: ['vegetarian'], note: 'Hold for lead lunch', status: 'PREPPING', createdAt: now, updatedAt: now },
    { id: 'order_june', itemId: 'craft_gfbox', itemName: 'Gluten-Free Snack Box', qty: 1, forMemberId: 'cast_june', requestedByUid: ownerUid, requestedByName: 'Ella Brooks', dept: 'CAST', dietary: ['gluten-free'], note: 'Between diner setups', status: 'READY', createdAt: now, updatedAt: now },
    { id: 'order_camera', itemId: 'craft_coldbrew', itemName: 'Cold Brew', qty: 8, forMemberId: 'crew_dp', requestedByUid: ownerUid, requestedByName: 'Lucia Ferrante', dept: 'CAMERA', note: 'Camera dept restock', status: 'DELIVERED', createdAt: now, updatedAt: now },
    { id: 'order_grip', itemId: 'craft_chili', itemName: 'Crew Turkey Chili', qty: 12, forMemberId: 'crew_gaffer', requestedByUid: ownerUid, requestedByName: 'Hank Rivera', dept: 'GRIP_ELECTRIC', note: 'Night unit hot meal', status: 'REQUESTED', createdAt: now, updatedAt: now },
    { id: 'order_stunts', itemId: 'craft_electrolyte', itemName: 'Electrolyte Water', qty: 24, forMemberId: 'crew_stuntco', requestedByUid: ownerUid, requestedByName: 'Rico Ventura', dept: 'STUNTS_SFX', note: 'Bunker unit hydration', status: 'PREPPING', createdAt: now, updatedAt: now },
  ];

  // ─── Schedule plan (approved v4) ─────────────────────────────────────────────
  const shootDate = (n: number) => day(n - 2); // Day 1 = yesterday, Day 2 = today → production is early.
  const callTimeFor = (dn?: ProductionScene['dayNight']) => dn === 'NIGHT' ? '15:00' : dn === 'DUSK' ? '13:30' : dn === 'DAWN' ? '04:30' : '07:00';
  const shootDayNumbers = [...new Set(scenes.map(scene => scene.shootDay))].sort((a, b) => a - b);
  const scheduleDays = shootDayNumbers.map(n => {
    const dayScenes = scenes.filter(scene => scene.shootDay === n);
    const location = locations.find(row => row.id === dayScenes[0]?.locationId);
    return { id: `day_${n}`, dayNumber: n, date: shootDate(n), label: location?.name || `Shoot Day ${n}`, generalCall: callTimeFor(dayScenes[0]?.dayNight), unit: 'MAIN' };
  });
  const schedule: SchedulePlan = {
    id: 'schedule_halflight_v4', productionId, label: 'Halflight Main Unit', status: 'APPROVED', version: 4,
    days: scheduleDays,
    strips: scenes.map((scene, index) => ({ id: `strip_${scene.id}`, type: 'SCENE', dayId: `day_${scene.shootDay}`, order: index, sceneId: scene.id, unit: 'MAIN', estimatedMinutes: Math.round(scene.pages * 55) })),
    createdBy: ownerUid, createdAt: now - 5 * 86400000, updatedAt: now, approvedBy: ownerUid, approvedAt: now - 2 * 86400000,
  };

  // ─── Call sheets — early days published, a mid-shoot day still in draft ─────
  const callSheetPlan: Array<{ day: number; status: CallSheet['status']; version: number; safety: string }> = [
    { day: 1, status: 'PUBLISHED', version: 3, safety: 'Dish/catwalk access: harness zone begins at the marked line. Hard sunset out — stop work at fading light.' },
    { day: 2, status: 'PUBLISHED', version: 2, safety: 'Live research facility. No open flame in the server room; follow the site fire warden.' },
    { day: 3, status: 'PUBLISHED', version: 1, safety: 'Night exterior in a live parking lot. Traffic control at the road; reflective vests after dark.' },
    { day: 14, status: 'DRAFT', version: 1, safety: 'Bunker unit: confined-space entry, ladder stunt rig, and on-set medic required before first team.' },
  ];
  const callSheets: CallSheet[] = callSheetPlan.map(cfg => {
    const scheduleDay = scheduleDays.find(row => row.dayNumber === cfg.day)!;
    const dayScenes = scenes.filter(scene => scene.shootDay === cfg.day);
    const location = locations.find(row => row.id === dayScenes[0]?.locationId);
    const sheet = generateCallSheet(production, dayScenes, members, cfg.day, { date: scheduleDay.date, generalCall: scheduleDay.generalCall, locationName: location?.name, locationAddress: location ? `${location.address}, ${location.city}` : '' });
    return {
      ...sheet, id: `callsheet_day_${cfg.day}`, schedulePlanId: schedule.id, scheduleVersion: schedule.version, scheduleDayId: scheduleDay.id,
      status: cfg.status, publishedAt: cfg.status === 'PUBLISHED' ? now : undefined, version: cfg.version,
      nearestHospital: 'Barstow Community Hospital', hospitalAddress: '820 E Mountain View St, Barstow, CA',
      safetyNotes: cfg.safety,
      parkingNote: 'Crew parking at basecamp; shuttle to set. No unit parking on the access road.',
      basecampNote: 'Follow the yellow Halflight signs from the highway gate.', updatedAt: now,
    };
  });

  // ─── Daily Production Reports for the shot days ──────────────────────────────
  const dprPlan: Array<{ day: number; crewCallActual: string; firstShotActual: string; wrapActual: string; weather: string; delays: string; generalNotes: string }> = [
    { day: 1, crewCallActual: '13:36', firstShotActual: '15:05', wrapActual: '01:22', weather: 'Clear, high 96°F / low 61°F', delays: '22 min for a generator swap at the dish.', generalNotes: 'Scene 3 needs two inserts on a later array day.' },
    { day: 2, crewCallActual: '07:04', firstShotActual: '08:38', wrapActual: '19:35', weather: 'Clear, high 78°F', delays: '15 min waiting on facility fire warden for the server room.', generalNotes: 'Scene 12 carried — Marcus coverage to be completed on Day 8.' },
  ];
  const dprs: DailyProductionReport[] = dprPlan.map(plan => {
    const sheet = callSheets.find(row => row.shootDay === plan.day)!;
    const base = generateDPR(production, sheet, 'Marcus Lin');
    return {
      ...base, id: `dpr_day_${plan.day}`, status: 'FINAL', finalizedAt: now,
      crewCallActual: plan.crewCallActual, firstShotActual: plan.firstShotActual, wrapActual: plan.wrapActual,
      weather: plan.weather, delays: plan.delays, generalNotes: plan.generalNotes,
      sceneRows: base.sceneRows.map((row, index) => {
        const scene = scenes.find(item => item.sceneNum === row.sceneNum);
        const completed = scene?.status === 'SHOT';
        return { ...row, status: completed ? 'COMPLETED' : 'PARTIAL', pagesShot: completed ? row.scheduledPages : Math.round(row.scheduledPages * 0.6 * 4) / 4, setups: completed ? 6 + index : 4, takes: completed ? 18 + index * 2 : 11 };
      }),
    };
  });

  // ─── Breakdown elements ──────────────────────────────────────────────────────
  const breakdownElements: BreakdownElement[] = [
    { id: 'bd_transmitter', productionId, name: 'Hero radio transmitter', category: 'PROPS', department: 'ART', status: 'READY', occurrences: [{ id: 'occ_tx_1', sceneId: 's_01', sceneNum: '1', quantity: 1 }, { id: 'occ_tx_2', sceneId: 's_02', sceneNum: '2', quantity: 1 }, { id: 'occ_tx_84', sceneId: 's_84', sceneNum: '84', quantity: 1 }], quantity: 1, continuityState: 'Weathered in Scene 84; pristine at the array in Scene 1', ownerMemberId: 'crew_props', ownerRole: 'Prop Master', dependencies: ['Practical console lighting'], notes: 'Interactive hero prop with functional dials.', source: 'MANUAL', createdBy: ownerUid, createdAt: now, updatedAt: now },
    { id: 'bd_ladderrig', productionId, name: 'Bunker ladder stunt rig', category: 'STUNTS', department: 'STUNTS_SFX', status: 'BLOCKED', occurrences: [{ id: 'occ_ladder_53', sceneId: 's_53', sceneNum: '53', quantity: 1 }, { id: 'occ_ladder_54', sceneId: 's_54', sceneNum: '54', quantity: 1 }], quantity: 1, ownerMemberId: 'crew_stuntco', ownerRole: 'Stunt Coordinator', dependencies: ['Structural survey', 'On-set medic', 'Rigging sign-off'], notes: 'No rehearsal until the bunker survey clears.', source: 'MANUAL', createdBy: ownerUid, createdAt: now, updatedAt: now },
    { id: 'bd_sparkhits', productionId, name: 'Control-level spark hits', category: 'SFX', department: 'STUNTS_SFX', status: 'ASSIGNED', occurrences: [{ id: 'occ_spark_53', sceneId: 's_53', sceneNum: '53', quantity: 4 }], quantity: 4, ownerMemberId: 'crew_sfxsup', ownerRole: 'SFX Supervisor', dependencies: ['Fire safety plan'], notes: 'Practical sparks synced to the console failure.', source: 'MANUAL', createdBy: ownerUid, createdAt: now, updatedAt: now },
    { id: 'bd_signalvoid', productionId, name: 'Signal-void environment', category: 'VFX', department: 'POST', status: 'ASSIGNED', occurrences: [{ id: 'occ_void_78', sceneId: 's_78', sceneNum: '78', quantity: 1 }], quantity: 1, ownerMemberId: 'crew_vfxsup', ownerRole: 'VFX Supervisor', dependencies: ['Bluescreen pre-light', 'Tracking markers'], notes: 'Full CG environment; wire removal in the same shots.', source: 'MANUAL', createdBy: ownerUid, createdAt: now, updatedAt: now },
    { id: 'bd_wirework', productionId, name: 'Signal-void wire work', category: 'STUNTS', department: 'STUNTS_SFX', status: 'APPROVED', occurrences: [{ id: 'occ_wire_78', sceneId: 's_78', sceneNum: '78', quantity: 1 }], quantity: 1, ownerMemberId: 'crew_stuntco', ownerRole: 'Stunt Coordinator', dependencies: ['Grid load approval'], notes: 'Descender rig on the stage grid.', source: 'MANUAL', createdBy: ownerUid, createdAt: now, updatedAt: now },
    { id: 'bd_picturecar', productionId, name: 'Elena picture car + process trailer', category: 'VEHICLES', department: 'TRANSPORT', status: 'READY', occurrences: [{ id: 'occ_car_44', sceneId: 's_44', sceneNum: '44', quantity: 1 }, { id: 'occ_car_45', sceneId: 's_45', sceneNum: '45', quantity: 1 }], quantity: 1, ownerMemberId: 'crew_transpo', ownerRole: 'Transportation Coordinator', dependencies: ['Highway permit'], notes: 'Insert car for driving coverage.', source: 'MANUAL', createdBy: ownerUid, createdAt: now, updatedAt: now },
    { id: 'bd_catwalk_safety', productionId, name: 'Array catwalk height safety plan', category: 'SAFETY', department: 'PRODUCTION', status: 'BLOCKED', occurrences: [{ id: 'occ_catwalk_85', sceneId: 's_85', sceneNum: '85', quantity: 2 }], quantity: 2, ownerMemberId: 'crew_marcuslin', ownerRole: '1st Assistant Director', dependencies: ['Anchor-point approval', 'Wind reading'], notes: 'Final fall-protection approval outstanding for the transmitter catwalk.', source: 'MANUAL', createdBy: ownerUid, createdAt: now, updatedAt: now },
    { id: 'bd_period_tapes', productionId, name: 'Reyes house period cassette dressing', category: 'SET_DRESSING', department: 'ART', status: 'READY', occurrences: [{ id: 'occ_tape_35', sceneId: 's_35', sceneNum: '35', quantity: 1 }, { id: 'occ_tape_36', sceneId: 's_36', sceneNum: '36', quantity: 1 }], quantity: 1, continuityState: 'Dressed to 1994; hero tape labeled in the mother’s handwriting', ownerMemberId: 'crew_setdec', ownerRole: 'Set Decorator', dependencies: ['Clearance on labels'], notes: 'Hero cassette plays the childhood recording.', source: 'MANUAL', createdBy: ownerUid, createdAt: now, updatedAt: now },
  ];

  // ─── Decisions + alerts ──────────────────────────────────────────────────────
  const decisions: ProductionDecision[] = [
    { id: 'decision_bunker', productionId, title: 'Shoot bunker interiors practical', detail: 'A stage build was priced against the real decommissioned bunker.', status: 'DECIDED', outcome: 'Shoot practical for atmosphere; safety survey and stunt rig are prerequisites.', authorUid: ownerUid, authorName: 'Diane Alvarez', createdAt: now - 4 * 86400000, updatedAt: now - 4 * 86400000 },
    { id: 'decision_void', productionId, title: 'Signal void as bluescreen + CG', detail: 'Practical smoke-and-mirror void vs. a full CG environment on the insert stage.', status: 'DECIDED', outcome: 'Bluescreen with wire work on Stage 4; environment and wire removal in post.', authorUid: ownerUid, authorName: 'Ava Solano', createdAt: now - 3 * 86400000, updatedAt: now - 3 * 86400000 },
    { id: 'decision_dawn', productionId, title: 'Protect the Day 26 dawn broadcast', detail: 'The finale can be shot day-for-dawn or on the real light.', status: 'OPEN', authorUid: ownerUid, authorName: 'Ava Solano', createdAt: now - 86400000, updatedAt: now - 86400000 },
  ];
  const alerts: ProductionAlert[] = [
    { id: 'alert_ladder', productionId, title: 'Bunker ladder controlled-stunt zone', detail: 'Only rigged, essential crew may work the ladder during Scenes 53 and 54. Medic on set before the first team.', severity: 'URGENT', status: 'ACTIVE', authorUid: ownerUid, authorName: 'Rico Ventura', createdAt: now - 1800000, updatedAt: now - 1800000 },
    { id: 'alert_highway', productionId, title: 'Highway permit still pending', detail: 'The Route 375 lane closure and process-trailer permit are unresolved for Day 12.', severity: 'IMPORTANT', status: 'ACTIVE', authorUid: ownerUid, authorName: 'Ford Beckett', createdAt: now - 3600000, updatedAt: now - 3600000 },
    { id: 'alert_heat', productionId, title: 'Desert heat protocol', detail: 'Sustained 95°F+ on array days. Electrolytes stocked; shade and rotation for exposed positions.', severity: 'INFO', status: 'ACTIVE', authorUid: ownerUid, authorName: 'Gloria Sands', createdAt: now - 7200000, updatedAt: now - 7200000 },
  ];

  // ─── Production actions (the live activity ledger) ──────────────────────────
  const baseImpact = { affectedDepartments: ['PRODUCTION' as const], affectedUids: [ownerUid], affectedSceneIds: [] as string[], consequences: ['The live source record updates every connected production view.'], risks: [] as string[] };
  const productionActions: ProductionAction[] = [
    { id: 'action_schedule', productionId, trigger: 'SCHEDULE_APPROVED', title: 'Halflight Main Unit v4 approved', summary: '26-day feature schedule approved after cast, location, and stunt review.', entity: { productionId, entityType: 'SCHEDULE', entityId: schedule.id }, impact: { ...baseImpact, headline: `${scenes.length} scenes across ${scheduleDays.length} shoot days are now production truth.`, affectedSceneIds: scenes.map(row => row.id) }, routeChannelKeys: ['announcements', 'schedule-calls'], targetUids: [ownerUid], requiredAcknowledgementUids: [], requiredPermission: 'MANAGE_SCHEDULE', status: 'PUBLISHED', severity: 'IMPORTANT', actorUid: ownerUid, actorName: 'Diane Alvarez', deliveredChannelKeys: ['announcements', 'schedule-calls'], createdAt: now - 2 * 86400000, publishedAt: now - 2 * 86400000 + 60000, updatedAt: now - 2 * 86400000 + 60000 },
    { id: 'action_callsheet_1', productionId, trigger: 'CALLSHEET_PUBLISHED', title: 'Call Sheet · Day 1', summary: 'Day 1 call sheet published to cast and crew with personalized calls.', entity: { productionId, entityType: 'CALL_SHEET', entityId: callSheets[0].id }, impact: { ...baseImpact, headline: 'Day 1 at Goldstone Array — dish access and a hard sunset out.', affectedSceneIds: ['s_01', 's_02', 's_03'] }, routeChannelKeys: ['schedule-calls', 'shoot-day-1'], targetUids: [ownerUid], requiredAcknowledgementUids: [ownerUid], requiredPermission: 'MANAGE_CALL_SHEETS', status: 'PUBLISHED', severity: 'ROUTINE', actorUid: ownerUid, actorName: 'Marcus Lin', deliveredChannelKeys: ['schedule-calls', 'shoot-day-1'], createdAt: now - 86400000, publishedAt: now - 86400000 + 60000, updatedAt: now - 86400000 + 60000 },
    { id: 'action_safety', productionId, trigger: 'SAFETY_ALERT', title: 'Bunker ladder controlled-stunt zone', summary: alerts[0].detail, entity: { productionId, entityType: 'ALERT', entityId: alerts[0].id }, impact: { ...baseImpact, headline: 'Urgent bunker stunt-safety control requires acknowledgement.', affectedSceneIds: ['s_53', 's_54'], risks: ['Fall exposure until the survey and rig plan are approved.'] }, routeChannelKeys: ['safety'], targetUids: [ownerUid], requiredAcknowledgementUids: [ownerUid], requiredPermission: 'MANAGE_ROSTER', status: 'PUBLISHED', severity: 'URGENT', actorUid: ownerUid, actorName: 'Rico Ventura', deliveredChannelKeys: ['safety'], createdAt: now - 1800000, publishedAt: now - 1700000, dueAt: now + 3600000, updatedAt: now - 1700000 },
    { id: 'action_breakdown', productionId, trigger: 'BREAKDOWN_BLOCKED', title: 'Bunker ladder stunt rig blocked', summary: 'The ladder stunt rig is blocked pending the survey, rigging sign-off, and medic plan.', entity: { productionId, entityType: 'BREAKDOWN', entityId: 'bd_ladderrig' }, impact: { ...baseImpact, affectedDepartments: ['STUNTS_SFX'], headline: 'Scenes 53–54 cannot rehearse until the rig clears.', affectedSceneIds: ['s_53', 's_54'], risks: ['Day 14 bunker unit is at risk if the survey slips.'] }, routeChannelKeys: ['crew-help', 'dept-stunts_sfx'], targetUids: [ownerUid], requiredAcknowledgementUids: [], requiredPermission: 'MANAGE_DEPARTMENT_BREAKDOWN', department: 'STUNTS_SFX', departmentChannel: 'dept-stunts_sfx', status: 'PUBLISHED', severity: 'IMPORTANT', actorUid: ownerUid, actorName: 'Rico Ventura', deliveredChannelKeys: ['crew-help', 'dept-stunts_sfx'], createdAt: now - 5400000, publishedAt: now - 5300000, updatedAt: now - 5300000 },
  ];

  // ─── Personalized call-sheet deliveries for a slice of the roster ───────────
  const deliveryRecipients = [ownerUid, 'crew_director', 'crew_dp', 'crew_marcuslin', 'crew_gaffer', 'cast_elena', 'cast_sam'];
  const publishedSheets = callSheets.filter(sheet => sheet.status === 'PUBLISHED');
  const recipientDeliveries: RecipientDelivery[] = publishedSheets.flatMap(sheet => deliveryRecipients.flatMap((memberId, index) => {
    const person = members.find(row => row.id === memberId);
    if (!person) return [];
    const isCast = !!person.isCast || person.dept === 'CAST';
    const castRow = sheet.castRows.find(row => row.memberId === memberId);
    if (isCast && !castRow) return []; // cast not called this day
    const yourCall = isCast ? (castRow?.pickup || castRow?.onSet || sheet.generalCall) : (sheet.deptCalls.find(row => row.dept === person.dept)?.callTime || sheet.generalCall);
    const status: RecipientDelivery['status'] = sheet.shootDay <= 2 ? 'CONFIRMED' : (index % 3 === 0 ? 'VIEWED' : 'DELIVERED');
    return [{
      id: `delivery_${sheet.id}_${memberId}`, productionId, callSheetId: sheet.id, callSheetVersion: sheet.version, schedulePlanId: schedule.id,
      memberId, memberUid: person.uid, memberName: person.name, role: person.role, department: person.dept, channel: 'IN_APP', status,
      packet: { yourCall, sceneIds: sheet.sceneRows.map(row => row.sceneId!).filter(Boolean), includesSides: isCast, includesDepartmentBrief: !isCast },
      deliveredAt: now - 3600000, viewedAt: status === 'DELIVERED' ? undefined : now - 3000000, confirmedAt: status === 'CONFIRMED' ? now - 2500000 : undefined, updatedAt: now - 2500000,
    }];
  }));

  return { production, members, scenes, locations, budgetLines, festivals, tasks, craftMenu, craftOrders, callSheets, dprs, schedulePlans: [schedule], breakdownElements, decisions, alerts, productionActions, recipientDeliveries };
}

async function writeCorpus(corpus: FilmShowcaseCorpus): Promise<void> {
  const id = corpus.production.id; const showcase = !!corpus.production.isShowcase;
  // Seed while the user-owned record is writable, then lock it as a showcase after
  // every child record and generated chat room exists.
  await setDoc(doc(db, 'productions', id), clean({ ...corpus.production, isShowcase: false, showcaseSeeding: showcase }));
  const batch = writeBatch(db);
  const collections: Array<[string, Array<{ id: string }>]> = [
    ['members', corpus.members], ['scenes', corpus.scenes], ['locations', corpus.locations], ['budgetLines', corpus.budgetLines],
    ['festivals', corpus.festivals], ['tasks', corpus.tasks], ['craftMenu', corpus.craftMenu], ['craftOrders', corpus.craftOrders],
    ['callsheets', corpus.callSheets], ['dprs', corpus.dprs], ['schedulePlans', corpus.schedulePlans], ['breakdownElements', corpus.breakdownElements],
    ['decisions', corpus.decisions], ['alerts', corpus.alerts], ['productionActions', corpus.productionActions], ['recipientDeliveries', corpus.recipientDeliveries],
  ];
  collections.forEach(([name, rows]) => rows.forEach(row => batch.set(doc(db, 'productions', id, name, row.id), clean(row))));
  await batch.commit();
  await provisionProductionChat(corpus.production, corpus.members, corpus.scenes, corpus.callSheets, corpus.production.ownerUid);
  const senderId = corpus.production.ownerUid; const senderName = corpus.members.find(member => member.uid === senderId)?.name || 'Plajah Producer';
  const chatSeeds = [
    { key: 'general', text: 'Welcome to Halflight, a 26-day feature. This live roster card is the starting point for exploring the production.', entityType: 'MEMBER' as const, entityId: senderId },
    { key: 'schedule-calls', text: 'Main Unit schedule v4 is approved. Open the live schedule card to inspect the source plan.', entityType: 'SCHEDULE' as const, entityId: corpus.schedulePlans[0].id },
    { key: 'schedule-calls', text: 'The Day 1 call sheet is published and linked to its personalized delivery workflow.', entityType: 'CALL_SHEET' as const, entityId: corpus.callSheets[0].id },
    { key: 'safety', text: 'Bunker ladder rig is a controlled stunt zone. The original alert carries the acknowledgement state.', entityType: 'ALERT' as const, entityId: corpus.alerts[0].id },
    { key: 'crew-help', text: 'The bunker ladder stunt rig is blocked pending the survey and medic plan.', entityType: 'BREAKDOWN' as const, entityId: 'bd_ladderrig' },
  ];
  for (const seed of chatSeeds) {
    const roomId = productionRoomId(id, seed.key);
    await sendMessage(roomId, { senderId, senderName, senderPhoto: '', type: 'ACTION', text: await encryptText(seed.text, roomId), productionEntity: { productionId: id, entityType: seed.entityType, entityId: seed.entityId } });
  }
  if (showcase) await setDoc(doc(db, 'productions', id), { isShowcase: true, showcaseSeeding: false, updatedAt: Date.now() }, { merge: true });
}

export async function ensureFilmShowcaseProduction(uid: string, displayName?: string): Promise<Production> {
  if (!uid) throw new Error('Sign in to open the production showcase.');
  const id = showcaseProductionId(uid); const existing = await getDoc(doc(db, 'productions', id));
  if (existing.exists() && existing.data().templateVersion === FILM_SHOWCASE_TEMPLATE_VERSION && existing.data().isShowcase === true) return existing.data() as Production;
  const corpus = buildFilmShowcaseCorpus(id, uid, displayName || 'Plajah Producer', true);
  await writeCorpus(corpus); return corpus.production;
}

export async function copyFilmShowcaseProduction(uid: string, displayName?: string): Promise<Production> {
  const production = await createProduction(uid, 'Halflight · My Production Copy', 'Feature');
  const corpus = buildFilmShowcaseCorpus(production.id, uid, displayName || 'Production Owner', false);
  corpus.production.title = 'Halflight · My Production Copy';
  corpus.production.copiedFromTemplateKey = FILM_SHOWCASE_TEMPLATE_KEY;
  corpus.production.copiedAt = Date.now();
  await writeCorpus(corpus); return corpus.production;
}
