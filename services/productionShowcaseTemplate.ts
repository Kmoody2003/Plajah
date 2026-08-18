import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import {
  createProduction, generateCallSheet, permissionsForRole,
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

export const FILM_SHOWCASE_TEMPLATE_KEY = 'plajah-afterlight-production';
export const FILM_SHOWCASE_TEMPLATE_VERSION = 1;
export const FILM_SHOWCASE_TITLE = 'Afterlight · Plajah Production Showcase';
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

/** A coherent production graph used both by the universal showcase and user-owned copies. */
export function buildFilmShowcaseCorpus(productionId: string, ownerUid: string, ownerName = 'Plajah Producer', isShowcase = true, now = Date.now()): FilmShowcaseCorpus {
  const production: Production = {
    id: productionId, ownerUid, title: FILM_SHOWCASE_TITLE, format: 'Short Film', memberUids: [ownerUid],
    authority: { [ownerUid]: { roleKey: 'EXECUTIVE_PRODUCER', position: 'Executive Producer', department: 'PRODUCTION', permissions: permissionsForRole('EXECUTIVE_PRODUCER'), assignedBy: ownerUid, assignedAt: now } },
    totalDays: 3, productionOffice: 'Plajah Virtual Production Office', emergencyContact: 'Demo only · do not call',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, status: 'ACTIVE',
    approvedScheduleId: 'schedule_afterlight_v3', approvedScheduleVersion: 3,
    isShowcase, templateKey: FILM_SHOWCASE_TEMPLATE_KEY, templateVersion: FILM_SHOWCASE_TEMPLATE_VERSION,
    createdAt: now, updatedAt: now,
  };
  const member = (id: string, name: string, role: string, dept: ProductionMember['dept'], extra: Partial<ProductionMember> = {}): ProductionMember => ({ id, name, role, dept, status: 'ACTIVE', createdAt: now, ...extra });
  const members: ProductionMember[] = [
    member(ownerUid, ownerName, 'Executive Producer', 'PRODUCTION', { uid: ownerUid, roleKey: 'EXECUTIVE_PRODUCER' }),
    member('crew_mara', 'Mara Bell', 'Producer', 'PRODUCTION', { roleKey: 'PRODUCER' }),
    member('crew_jonah', 'Jonah Reed', 'Director', 'DIRECTION', { roleKey: 'DIRECTOR' }),
    member('crew_iman', 'Iman Brooks', '1st Assistant Director', 'PRODUCTION', { roleKey: 'FIRST_AD' }),
    member('crew_linh', 'Linh Tran', 'Director of Photography', 'CAMERA'),
    member('crew_tess', 'Tess Okafor', 'Production Designer', 'ART'),
    member('crew_rene', 'René Castillo', 'Location Manager', 'LOCATIONS'),
    member('crew_ava', 'Ava James', 'Sound Mixer', 'SOUND'),
    member('cast_nia', 'Nia Cole', 'EVE', 'CAST', { isCast: true, character: 'EVE', dietary: ['vegetarian'] }),
    member('cast_malik', 'Malik Stone', 'NOAH', 'CAST', { isCast: true, character: 'NOAH' }),
  ];
  const scenes: ProductionScene[] = [
    { id: 'scene_1', sceneNum: '1', intExt: 'EXT', dayNight: 'DUSK', set: 'LAKE OVERLOOK', synopsis: 'Eve records a final message as the city loses power.', characters: ['EVE'], pages: 1.5, shootDay: 1, status: 'SHOT', locationId: 'loc_overlook', notes: 'Protect the sunset window.' },
    { id: 'scene_2', sceneNum: '2', intExt: 'INT', dayNight: 'NIGHT', set: 'ABANDONED RADIO STATION', synopsis: 'Eve discovers Noah broadcasting to an empty city.', characters: ['EVE', 'NOAH'], pages: 2.25, shootDay: 1, status: 'PARTIAL', locationId: 'loc_station', notes: 'Practical console lights and rain bars.' },
    { id: 'scene_3', sceneNum: '3', intExt: 'INT/EXT', dayNight: 'DAWN', set: 'RADIO STATION ROOFTOP', synopsis: 'They restore the transmitter and hear an answer.', characters: ['EVE', 'NOAH'], pages: 2, shootDay: 2, status: 'NOT_SHOT', locationId: 'loc_station' },
    { id: 'scene_4', sceneNum: '4', intExt: 'EXT', dayNight: 'NIGHT', set: 'FLOODED UNDERPASS', synopsis: 'The equipment truck stalls in rising water.', characters: ['EVE', 'NOAH'], pages: 1.25, shootDay: 3, status: 'NOT_SHOT', locationId: 'loc_underpass', notes: 'Controlled water, stunt coordinator, and wet-weather electrical plan.' },
  ];
  const locations: ProductionLocation[] = [
    { id: 'loc_overlook', name: 'Lake Overlook', type: 'EXT', address: '1200 Skyline Drive', city: 'Detroit, MI', contactName: 'Demo Film Office', contactPhone: '—', permitStatus: 'APPROVED', rentalFee: 1800, notes: 'Hard out 20 minutes after sunset.', createdAt: now },
    { id: 'loc_station', name: 'WPLJ Radio Station', type: 'BOTH', address: '88 Signal Avenue', city: 'Detroit, MI', contactName: 'Site Representative', contactPhone: '—', permitStatus: 'APPROVED', rentalFee: 4200, notes: 'Roof access requires fall protection.', createdAt: now },
    { id: 'loc_underpass', name: 'Jefferson Underpass', type: 'EXT', address: 'Jefferson at Rivard', city: 'Detroit, MI', contactName: 'City Film Office', contactPhone: '—', permitStatus: 'PENDING', rentalFee: 2500, notes: 'Lane closure and water-effect permit pending.', createdAt: now },
  ];
  const budgetLines: ProductionBudgetLine[] = [
    { id: 'budget_cast', department: 'Cast', lineItem: 'Principal cast', estimated: 12000, actual: 9600, notes: 'Two principals', createdAt: now },
    { id: 'budget_camera', department: 'Camera', lineItem: 'Camera and lenses', estimated: 8500, actual: 8200, notes: 'Three-day package', createdAt: now },
    { id: 'budget_locations', department: 'Locations', lineItem: 'Locations and permits', estimated: 10000, actual: 6000, notes: 'Underpass permit unresolved', createdAt: now },
    { id: 'budget_post', department: 'Post', lineItem: 'Picture, sound, and delivery', estimated: 15000, actual: 0, notes: 'Reserved', createdAt: now },
  ];
  const festivals: ProductionFestival[] = [
    { id: 'fest_sundance', festival: 'Sundance Film Festival', tier: 'A', deadline: now + 70 * 86400000, fee: 85, status: 'PLANNING', category: 'U.S. Short Film', notes: 'Premiere strategy review required.', createdAt: now },
    { id: 'fest_detroit', festival: 'Freep Film Festival', tier: 'B', deadline: now + 110 * 86400000, fee: 45, status: 'PLANNING', category: 'Short', notes: 'Strong regional story fit.', createdAt: now },
  ];
  const tasks: ProdTask[] = [
    { id: 'task_permit', title: 'Close underpass water-effect permit', dept: 'LOCATIONS', assigneeMemberId: 'crew_rene', assigneeName: 'René Castillo', due: day(2), priority: 'URGENT', status: 'DOING', createdAt: now },
    { id: 'task_fall', title: 'Approve rooftop fall-protection plan', dept: 'PRODUCTION', assigneeMemberId: 'crew_iman', assigneeName: 'Iman Brooks', due: day(1), priority: 'HIGH', status: 'TODO', createdAt: now },
    { id: 'task_console', title: 'Test practical radio console lighting', dept: 'ART', assigneeMemberId: 'crew_tess', assigneeName: 'Tess Okafor', due: day(1), priority: 'MED', status: 'DONE', createdAt: now },
    { id: 'task_backup', title: 'Confirm rain cover and backup recorder', dept: 'SOUND', assigneeMemberId: 'crew_ava', assigneeName: 'Ava James', due: day(2), priority: 'HIGH', status: 'TODO', createdAt: now },
  ];
  const craftMenu: CraftItem[] = [
    { id: 'craft_bowl', name: 'Great Lakes Grain Bowl', category: 'MEAL', desc: 'Roasted vegetables, grains, tahini', dietaryTags: ['vegetarian'], available: true, createdAt: now },
    { id: 'craft_chili', name: 'Crew Turkey Chili', category: 'MEAL', desc: 'Hot night-shoot meal', dietaryTags: ['gluten-free'], available: true, createdAt: now },
    { id: 'craft_coffee', name: 'Night Exterior Coffee', category: 'COFFEE', desc: 'Hot coffee and oat milk', dietaryTags: [], available: true, createdAt: now },
  ];
  const craftOrders: CraftOrder[] = [{ id: 'order_1', itemId: 'craft_bowl', itemName: 'Great Lakes Grain Bowl', qty: 1, forMemberId: 'cast_nia', requestedByUid: ownerUid, requestedByName: 'Nia Cole', dept: 'CAST', dietary: ['vegetarian'], note: 'Hold for cast lunch', status: 'PREPPING', createdAt: now, updatedAt: now }];
  const schedule: SchedulePlan = {
    id: 'schedule_afterlight_v3', productionId, label: 'Afterlight Main Unit', status: 'APPROVED', version: 3,
    days: [1, 2, 3].map((number, index) => ({ id: `day_${number}`, dayNumber: number, date: day(index + 1), label: number === 1 ? 'Station interiors' : number === 2 ? 'Rooftop dawn' : 'Underpass night', generalCall: number === 2 ? '04:30' : number === 3 ? '18:00' : '13:00', unit: 'MAIN' })),
    strips: scenes.map((scene, index) => ({ id: `strip_${scene.id}`, type: 'SCENE', dayId: `day_${scene.shootDay}`, order: index, sceneId: scene.id, unit: 'MAIN', estimatedMinutes: Math.round(scene.pages * 55) })),
    createdBy: ownerUid, createdAt: now - 86400000, updatedAt: now, approvedBy: ownerUid, approvedAt: now - 3600000,
  };
  const callSheets: CallSheet[] = schedule.days.slice(0, 2).map(scheduleDay => {
    const dayScenes = scenes.filter(scene => scene.shootDay === scheduleDay.dayNumber);
    const location = locations.find(row => row.id === dayScenes[0]?.locationId);
    const sheet = generateCallSheet(production, dayScenes, members, scheduleDay.dayNumber, { date: scheduleDay.date, generalCall: scheduleDay.generalCall, locationName: location?.name, locationAddress: location ? `${location.address}, ${location.city}` : '' });
    return { ...sheet, id: `callsheet_day_${scheduleDay.dayNumber}`, schedulePlanId: schedule.id, scheduleVersion: schedule.version, scheduleDayId: scheduleDay.id, status: 'PUBLISHED', publishedAt: now, version: scheduleDay.dayNumber === 1 ? 2 : 1, nearestHospital: 'Detroit Receiving Hospital', hospitalAddress: '4201 St Antoine, Detroit, MI', safetyNotes: scheduleDay.dayNumber === 2 ? 'Rooftop access: harness zone begins at marked line. Stop work for winds above threshold.' : 'Wet-down and practical electrical systems require GFCI inspection before first team.', parkingNote: 'Crew parking at basecamp. No street parking.', basecampNote: 'Follow yellow Plajah production signs.', updatedAt: now };
  });
  const breakdownElements: BreakdownElement[] = [
    { id: 'bd_transmitter', productionId, name: 'Hero radio transmitter', category: 'PROPS', department: 'ART', status: 'READY', occurrences: [{ id: 'occ_tx_2', sceneId: 'scene_2', sceneNum: '2', quantity: 1 }, { id: 'occ_tx_3', sceneId: 'scene_3', sceneNum: '3', quantity: 1 }], quantity: 1, continuityState: 'Damaged dial in Scene 2; repaired for Scene 3', ownerMemberId: 'crew_tess', ownerRole: 'Production Designer', dependencies: ['Practical console lighting'], notes: 'Interactive hero prop.', source: 'MANUAL', createdBy: ownerUid, createdAt: now, updatedAt: now },
    { id: 'bd_rooftop', productionId, name: 'Rooftop fall-protection system', category: 'SAFETY', department: 'PRODUCTION', status: 'BLOCKED', occurrences: [{ id: 'occ_roof_3', sceneId: 'scene_3', sceneNum: '3', quantity: 2 }], quantity: 2, ownerMemberId: 'crew_iman', ownerRole: '1st Assistant Director', dependencies: ['Location roof plan', 'Wind reading'], notes: 'Final anchor-point approval outstanding.', source: 'MANUAL', createdBy: ownerUid, createdAt: now, updatedAt: now },
    { id: 'bd_water', productionId, name: 'Controlled underpass water effect', category: 'SFX', department: 'STUNTS_SFX', status: 'BLOCKED', occurrences: [{ id: 'occ_water_4', sceneId: 'scene_4', sceneNum: '4', quantity: 1 }], quantity: 1, dependencies: ['City permit', 'Electrical safety plan', 'Water recovery'], notes: 'Permit pending; no test until approved.', source: 'MANUAL', createdBy: ownerUid, createdAt: now, updatedAt: now },
  ];
  const decisions: ProductionDecision[] = [{ id: 'decision_dawn', productionId, title: 'Keep rooftop scene at real dawn', detail: 'VFX extension was evaluated against the schedule.', status: 'DECIDED', outcome: 'Shoot the first two setups at civil dawn, then move to controlled closeups.', authorUid: ownerUid, authorName: 'Mara Bell', createdAt: now - 7200000, updatedAt: now - 7200000 }];
  const alerts: ProductionAlert[] = [{ id: 'alert_rooftop', productionId, title: 'Rooftop controlled-access zone', detail: 'Only harnessed essential crew may cross the marked line during Scene 3.', severity: 'URGENT', status: 'ACTIVE', authorUid: ownerUid, authorName: 'Iman Brooks', createdAt: now - 1800000, updatedAt: now - 1800000 }];
  const baseImpact = { affectedDepartments: ['PRODUCTION' as const], affectedUids: [ownerUid], affectedSceneIds: [] as string[], consequences: ['The live source record updates every connected production view.'], risks: [] as string[] };
  const productionActions: ProductionAction[] = [
    { id: 'action_schedule', productionId, trigger: 'SCHEDULE_APPROVED', title: 'Afterlight Main Unit v3 approved', summary: 'Three-day schedule approved after cast and location review.', entity: { productionId, entityType: 'SCHEDULE', entityId: schedule.id }, impact: { ...baseImpact, headline: '4 scenes across 3 shoot days are now production truth.', affectedSceneIds: scenes.map(row => row.id) }, routeChannelKeys: ['announcements', 'schedule-calls'], targetUids: [ownerUid], requiredAcknowledgementUids: [], requiredPermission: 'MANAGE_SCHEDULE', status: 'PUBLISHED', severity: 'IMPORTANT', actorUid: ownerUid, actorName: 'Mara Bell', deliveredChannelKeys: ['announcements', 'schedule-calls'], createdAt: now - 3600000, publishedAt: now - 3500000, updatedAt: now - 3500000 },
    { id: 'action_safety', productionId, trigger: 'SAFETY_ALERT', title: 'Rooftop controlled-access zone', summary: alerts[0].detail, entity: { productionId, entityType: 'ALERT', entityId: alerts[0].id }, impact: { ...baseImpact, headline: 'Urgent rooftop safety control requires acknowledgement.', affectedSceneIds: ['scene_3'], risks: ['Fall exposure until the anchor plan is approved.'] }, routeChannelKeys: ['safety'], targetUids: [ownerUid], requiredAcknowledgementUids: [ownerUid], requiredPermission: 'MANAGE_ROSTER', status: 'PUBLISHED', severity: 'URGENT', actorUid: ownerUid, actorName: 'Iman Brooks', deliveredChannelKeys: ['safety'], createdAt: now - 1800000, publishedAt: now - 1700000, dueAt: now + 3600000, updatedAt: now - 1700000 },
  ];
  const recipientDeliveries: RecipientDelivery[] = callSheets.map(sheet => ({ id: `delivery_${sheet.id}_${ownerUid}`, productionId, callSheetId: sheet.id, callSheetVersion: sheet.version, schedulePlanId: schedule.id, memberId: ownerUid, memberUid: ownerUid, memberName: ownerName, role: 'Executive Producer', department: 'PRODUCTION', channel: 'IN_APP', status: sheet.shootDay === 1 ? 'CONFIRMED' : 'VIEWED', packet: { yourCall: sheet.generalCall, sceneIds: sheet.sceneRows.map(row => row.sceneId!).filter(Boolean), includesSides: false, includesDepartmentBrief: true }, deliveredAt: now - 3600000, viewedAt: now - 3000000, confirmedAt: sheet.shootDay === 1 ? now - 2500000 : undefined, updatedAt: now - 2500000 }));
  const dprs: DailyProductionReport[] = [{ id: 'dpr_day_1', prodId: productionId, callSheetId: callSheets[0].id, shootDay: 1, date: schedule.days[0].date, crewCallSched: '13:00', crewCallActual: '13:04', firstShotActual: '15:12', wrapSched: '01:00', wrapActual: '01:18', sceneRows: scenes.filter(row => row.shootDay === 1).map(row => ({ sceneNum: row.sceneNum, set: row.set, intExt: row.intExt, dayNight: row.dayNight, status: row.status === 'SHOT' ? 'COMPLETED' : 'PARTIAL', scheduledPages: row.pages, pagesShot: row.status === 'SHOT' ? row.pages : 1.5, setups: row.sceneNum === '1' ? 5 : 7, takes: row.sceneNum === '1' ? 14 : 21 })), castRows: [{ memberId: 'cast_nia', character: 'EVE', actor: 'Nia Cole', work: 'SW' }, { memberId: 'cast_malik', character: 'NOAH', actor: 'Malik Stone', work: 'SW' }], bgCount: 0, weather: 'Cloudy, 68°F', delays: '18 minutes for practical console reset.', generalNotes: 'Scene 2 needs two inserts on Day 2.', preparedBy: 'Iman Brooks', status: 'FINAL', finalizedAt: now, createdAt: now, updatedAt: now }];
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
    { key: 'general', text: 'Welcome to Afterlight. This live roster card is the starting point for exploring the production.', entityType: 'MEMBER' as const, entityId: senderId },
    { key: 'schedule-calls', text: 'Main Unit schedule v3 is approved. Open the live schedule card to inspect the source plan.', entityType: 'SCHEDULE' as const, entityId: corpus.schedulePlans[0].id },
    { key: 'schedule-calls', text: 'Day 1 call sheet is published and linked to its personalized delivery workflow.', entityType: 'CALL_SHEET' as const, entityId: corpus.callSheets[0].id },
    { key: 'safety', text: 'Rooftop controlled-access zone is active. The original alert carries the acknowledgement state.', entityType: 'ALERT' as const, entityId: corpus.alerts[0].id },
    { key: 'crew-help', text: 'Rooftop fall protection is blocked pending final anchor approval.', entityType: 'BREAKDOWN' as const, entityId: 'bd_rooftop' },
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
  const production = await createProduction(uid, 'Afterlight · My Production Copy', 'Short Film');
  const corpus = buildFilmShowcaseCorpus(production.id, uid, displayName || 'Production Owner', false);
  corpus.production.title = 'Afterlight · My Production Copy';
  corpus.production.copiedFromTemplateKey = FILM_SHOWCASE_TEMPLATE_KEY;
  corpus.production.copiedAt = Date.now();
  await writeCorpus(corpus); return corpus.production;
}
