/** Reconstruction contract for the USER-SELECTED residential concept sheet.
 * Rectangles are a draft visual trace in normalized floor-image coordinates:
 * x west→east, z north→south. They are not surveyed architectural dimensions.
 * Keep this engine-independent; runtime geometry/collision must derive together.
 */
export type ResidentialFloorId = 'basement' | 'ground' | 'queens' | 'kings' | 'observatory';
export type PlanRect = readonly [west: number, north: number, east: number, south: number];
export interface ResidentialRoom {
  id: string;
  name: string;
  kind: 'bedroom' | 'hall' | 'utility' | 'social' | 'balcony' | 'observatory';
  rect: PlanRect;
}
export interface ResidentialFloor {
  id: ResidentialFloorId;
  name: string;
  /** Draft crop bounds normalized to the entire concept sheet. */
  sourceRegion: PlanRect;
  rooms: ResidentialRoom[];
}

const room = (id: string, name: string, kind: ResidentialRoom['kind'], rect: PlanRect): ResidentialRoom => ({ id, name, kind, rect });
const bedrooms = (start: number): ResidentialRoom[] => [
  room(`bedroom_${start}`, `Bedroom ${start}`, 'bedroom', [0.04, 0.17, 0.30, 0.48]),
  room(`bedroom_${start + 1}`, `Bedroom ${start + 1}`, 'bedroom', [0.70, 0.17, 0.96, 0.48]),
  room(`bedroom_${start + 2}`, `Bedroom ${start + 2}`, 'bedroom', [0.04, 0.62, 0.30, 0.90]),
  room(`bedroom_${start + 3}`, `Bedroom ${start + 3}`, 'bedroom', [0.70, 0.62, 0.96, 0.90]),
];

export const RAVENCREST_RESIDENTIAL_PLAN = {
  source: '/models/halloween/ravencrest/floorplan_blueprint_2.jpg',
  original: 'halloween interactiv elayou/extracted/creation_3752884032.png',
  status: 'draft-trace-awaiting-overlay-review',
  north: 'negative-world-z',
  // Scale, heights, doors and stair geometry need plan-overlay approval together.
  interpretations: [
    'Use the printed bedroom breakdown when room labels duplicate or conflict.',
    'Twelve bedrooms means king and queen suites plus ten guest bedrooms.',
    'Normalize each floor separately; perspective illustrations are not orthographic surveys.',
    'Bathrooms shown within bedroom suites must be traced as subspaces before furnishing.',
    'Door apertures, tower interiors and stair flights are not yet traced; do not infer a finished navmesh from room rectangles.',
  ],
  floors: [
    {
      id: 'basement', name: 'Basement', sourceRegion: [0.735, 0.535, 0.985, 0.920],
      rooms: [
        room('wine_cellar', 'Wine Cellar', 'utility', [0.03, 0.03, 0.33, 0.35]),
        room('armory', 'Armory', 'utility', [0.36, 0.03, 0.65, 0.28]),
        room('laundry', 'Laundry', 'utility', [0.68, 0.03, 0.97, 0.35]),
        room('boiler_room', 'Boiler Room', 'utility', [0.03, 0.39, 0.33, 0.68]),
        room('workshop', 'Workshop', 'utility', [0.68, 0.39, 0.97, 0.68]),
        room('food_cellar', 'Cellar / Food Storage', 'utility', [0.03, 0.72, 0.33, 0.97]),
        room('staff_quarters', 'Staff Quarters', 'utility', [0.68, 0.72, 0.97, 0.97]),
        room('basement_stairs', 'Main Stairs & Circulation', 'hall', [0.36, 0.31, 0.65, 0.97]),
      ],
    },
    {
      id: 'ground', name: 'Ground · Grand Hall', sourceRegion: [0.240, 0.070, 0.480, 0.480],
      rooms: [
        room('grand_hall', 'Grand Hall', 'social', [0.33, 0.04, 0.66, 0.48]),
        room('dining_room', 'Dining Room', 'social', [0.04, 0.18, 0.30, 0.52]),
        room('kitchen_pantry', 'Kitchen & Pantry', 'utility', [0.69, 0.18, 0.96, 0.52]),
        room('library_study', 'Library / Study', 'social', [0.04, 0.56, 0.30, 0.85]),
        room('living_room', 'Living Room', 'social', [0.69, 0.56, 0.96, 0.85]),
        room('main_entrance', 'Main Entrance & Stair Hall', 'hall', [0.33, 0.52, 0.66, 0.96]),
      ],
    },
    {
      id: 'queens', name: "Second · Queen's Floor", sourceRegion: [0.505, 0.070, 0.745, 0.470],
      rooms: [
        room('queens_suite', "Queen's Suite", 'bedroom', [0.33, 0.04, 0.67, 0.42]),
        ...bedrooms(1),
        room('central_gallery', 'Central Gallery', 'hall', [0.33, 0.46, 0.67, 0.60]),
        room('queens_stair_hall', 'Stair Hall', 'hall', [0.33, 0.63, 0.67, 0.86]),
        room('queens_balcony', 'Balcony', 'balcony', [0.33, 0.89, 0.67, 0.99]),
      ],
    },
    {
      id: 'kings', name: "Third · King's Floor", sourceRegion: [0.235, 0.540, 0.475, 0.880],
      rooms: [
        room('kings_suite', "King's Suite", 'bedroom', [0.33, 0.04, 0.67, 0.42]),
        ...bedrooms(5),
        room('kings_hallway', 'Hallway', 'hall', [0.33, 0.46, 0.67, 0.60]),
        room('kings_stair_hall', 'Stair Hall', 'hall', [0.33, 0.63, 0.67, 0.86]),
        room('kings_balcony', 'Balcony', 'balcony', [0.33, 0.89, 0.67, 0.99]),
      ],
    },
    {
      id: 'observatory', name: 'Fourth · Observatory', sourceRegion: [0.495, 0.535, 0.725, 0.880],
      rooms: [
        room('bedroom_9', 'Bedroom 9', 'bedroom', [0.04, 0.17, 0.30, 0.48]),
        room('bedroom_10', 'Bedroom 10', 'bedroom', [0.70, 0.17, 0.96, 0.48]),
        room('recreation_north', 'Recreation Room · North', 'social', [0.33, 0.04, 0.67, 0.40]),
        room('recreation_gallery', 'Recreation Room · Gallery', 'social', [0.33, 0.44, 0.67, 0.62]),
        room('storage_west', 'West Storage', 'utility', [0.04, 0.65, 0.30, 0.89]),
        room('storage_east', 'East Storage', 'utility', [0.70, 0.65, 0.96, 0.89]),
        room('observatory_dome', 'Observatory', 'observatory', [0.32, 0.66, 0.68, 0.99]),
      ],
    },
  ] satisfies ResidentialFloor[],
} as const;
