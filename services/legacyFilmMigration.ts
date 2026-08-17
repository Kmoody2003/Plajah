import * as FP from './filmProductionService';

const KEYS = {
  scenes: 'plajah_pm_film_scenes_v1', budget: 'plajah_pm_film_budget_v1',
  crew: 'plajah_pm_film_crew_v1', locations: 'plajah_pm_film_locations_v1',
  festivals: 'plajah_pm_film_festivals_v1',
} as const;

function rows<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]') as T[]; } catch { return []; }
}

export function hasLegacyFilmData(prodId?: string): boolean {
  if (prodId && localStorage.getItem(`plajah_legacy_imported_${prodId}`)) return false;
  return Object.values(KEYS).some(key => rows<unknown>(key).length > 0);
}

export async function importLegacyFilmData(prodId: string): Promise<number> {
  if (!hasLegacyFilmData(prodId)) return 0;
  let count = 0;
  const scenes = rows<any>(KEYS.scenes);
  const budgets = rows<FP.ProductionBudgetLine>(KEYS.budget);
  const crew = rows<any>(KEYS.crew);
  const locations = rows<FP.ProductionLocation>(KEYS.locations);
  const festivals = rows<FP.ProductionFestival>(KEYS.festivals);
  const deptMap: Record<string, FP.DeptKey> = {
    Direction: 'DIRECTION', Production: 'PRODUCTION', Camera: 'CAMERA', 'Lighting/Grip': 'GRIP_ELECTRIC',
    Sound: 'SOUND', 'Art/Design': 'ART', Wardrobe: 'WARDROBE', 'Makeup/Hair': 'HAIR_MAKEUP',
    VFX: 'STUNTS_SFX', Cast: 'CAST', Transport: 'TRANSPORT', 'Post-Production': 'POST', Other: 'OTHER',
  };
  await Promise.all([
    ...scenes.map(scene => FP.putScene(prodId, {
      id: scene.id, sceneNum: scene.sceneNum, intExt: scene.setting, set: scene.location,
      dayNight: scene.timeOfDay, synopsis: scene.synopsis,
      characters: String(scene.characters || '').split(',').map((x: string) => x.trim()).filter(Boolean),
      pages: scene.pages || 1, shootDay: scene.shootDay || 0, status: scene.status || 'NOT_SHOT', notes: scene.notes,
    })),
    ...budgets.map(row => FP.putBudgetLine(prodId, row)),
    ...crew.map(member => FP.putMember(prodId, {
      id: member.id, name: member.name, role: member.role, dept: deptMap[member.department] || 'OTHER',
      email: member.email, phone: member.phone, status: member.status || 'PENDING', rate: member.rate,
      notes: member.notes, isCast: member.department === 'Cast', createdAt: member.createdAt || Date.now(),
    })),
    ...locations.map(row => FP.putLocation(prodId, row)),
    ...festivals.map(row => FP.putFestival(prodId, row)),
  ]);
  count = scenes.length + budgets.length + crew.length + locations.length + festivals.length;
  await FP.updateProduction(prodId, { legacyImportedAt: Date.now() });
  localStorage.setItem(`plajah_legacy_imported_${prodId}`, String(Date.now()));
  return count;
}
