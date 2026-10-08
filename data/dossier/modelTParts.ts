/**
 * Model T exploded view: part data (no three.js here, so it is cheap to test and import).
 *
 * Honesty rules: the 3D model is a PROCEDURAL teaching model, not measured CAD. A part's `claim` is
 * stated only when a source in the Ford ledger says it (see docs/dossier/ford-research-notes.md); otherwise
 * `claim` is null and the panel says the detail is a modelling choice, not a historical claim. Even when
 * a part has a claim, the claim covers that the part existed (and what the source says about it); the
 * exact shape, size and placement in the model are approximate.
 * `explode` is the displacement (inches, x = toward the radiator, y = up, z = toward the car's right)
 * applied when the slider is at "Exploded". Individual sub-parts (the four wheels, lamp pairs, doors,
 * fenders) are spread further inside the scene so each is separately visible.
 */

export type ModelTPartId =
  // chassis and running gear
  | 'frame' | 'front-axle' | 'front-spring' | 'front-radius-rod' | 'wheels-front'
  | 'rear-axle' | 'rear-spring' | 'rear-radius-rods' | 'brake-drums' | 'wheels-rear'
  | 'torque-tube' | 'running-boards' | 'fenders'
  // engine, cooling and exhaust
  | 'engine' | 'magneto' | 'transmission' | 'carburetor' | 'exhaust-manifold' | 'muffler'
  | 'fan' | 'radiator' | 'radiator-hoses' | 'crank' | 'coil-box' | 'fuel-tank'
  // controls
  | 'steering' | 'column-levers' | 'pedals' | 'hand-lever' | 'horn'
  // body
  | 'body' | 'doors' | 'seats' | 'windshield' | 'hood'
  // lamps
  | 'headlamps' | 'side-lamps' | 'tail-lamp'
  // folding top (optional)
  | 'top-bows' | 'top-cover';

export type ModelTGroup = 'chassis' | 'engine' | 'controls' | 'body' | 'lamps' | 'top';

export const MODEL_T_GROUP_LABELS: Record<ModelTGroup, string> = {
  chassis: 'Chassis and running gear',
  engine: 'Engine, cooling and exhaust',
  controls: 'Controls',
  body: 'Body',
  lamps: 'Lamps',
  top: 'Folding top (optional)',
};

export interface ModelTPart {
  id: ModelTPartId;
  label: string;
  group: ModelTGroup;
  /** One plain-language sentence for the panel. */
  sentence: string;
  /** A conservative, sourced statement, or null when the detail is only a modelling choice. */
  claim: string | null;
  explode: [number, number, number];
  /** True for parts the viewer can switch on and off (the folding top). */
  optional?: boolean;
}

export const MODEL_T_DISCLAIMER = 'Simplified reconstruction: a teaching model, not measured CAD';

/** Facts about the whole car that the model's proportions follow. */
export const MODEL_T_WHEELBASE_IN = 100;

const WHEELS_CLAIM = 'Model T wheels were wooden artillery wheels (steel wheels came only in 1926 and 1927).';
const SPRING_CLAIM = 'The Model T used a transversely mounted semi-elliptical spring for each of the front and rear beam axles.';
const LAMP_CLAIM = 'Early Model Ts used acetylene gas flame headlights, and electric lighting powered by the magneto was adopted in 1915. A 1913 touring car in The Henry Ford collection has headlights and side lamps.';
const TOURING_CLAIM = 'A 1913 touring car in The Henry Ford collection is 131 inches long and 65 inches wide, with a windshield frame and inner door panels.';

export const MODEL_T_PARTS: ModelTPart[] = [
  // ── chassis and running gear ─────────────────────────────────────────────
  {
    id: 'frame', label: 'Chassis frame', group: 'chassis',
    sentence: 'Two long side rails joined by cross-members carry the engine, axles and body.',
    claim: null, explode: [0, -10, 0],
  },
  {
    id: 'front-axle', label: 'Front axle', group: 'chassis',
    sentence: 'A beam carries the front wheels, which swivel on it to steer.',
    claim: null, explode: [40, -26, 0],
  },
  {
    id: 'front-spring', label: 'Front leaf spring', group: 'chassis',
    sentence: 'A stack of curved steel strips mounted sideways cushions the front of the car.',
    claim: SPRING_CLAIM, explode: [40, -10, 0],
  },
  {
    id: 'front-radius-rod', label: 'Front radius rod ("wishbone")', group: 'chassis',
    sentence: 'A V-shaped rod runs back from the front axle to a ball socket under the engine, so the axle swings on a fixed arc instead of sliding.',
    claim: 'The 1919 Ford Manual refers to front radius rods held in a socket underneath the crankcase.',
    explode: [24, -34, 0],
  },
  {
    id: 'wheels-front', label: 'Front wheels (two)', group: 'chassis',
    sentence: 'Wooden spokes inside a steel rim and a rubber tyre carry the front of the car.',
    claim: WHEELS_CLAIM, explode: [40, -26, 0],
  },
  {
    id: 'rear-axle', label: 'Rear axle and differential', group: 'chassis',
    sentence: 'The differential lets the two rear wheels turn at different speeds in a corner.',
    claim: 'The torque tube drove the rear axle. The differential is a general feature of such axles and is not separately sourced here.',
    explode: [-40, -26, 0],
  },
  {
    id: 'rear-spring', label: 'Rear leaf spring', group: 'chassis',
    sentence: 'The rear spring also lies across the car.',
    claim: SPRING_CLAIM, explode: [-40, -10, 0],
  },
  {
    id: 'rear-radius-rods', label: 'Rear radius rods', group: 'chassis',
    sentence: 'A pair of rods from the ends of the rear axle housing keep the axle square to the car while the spring flexes.',
    claim: 'The 1919 Ford Manual refers to radius rods and brake rods at the outer ends of the rear axle housing. The way the rods run in the model is simplified.',
    explode: [-24, -34, 0],
  },
  {
    id: 'brake-drums', label: 'Rear brake drums (two)', group: 'chassis',
    sentence: 'A drum on each rear wheel is gripped from inside by a brake band when the hand lever is pulled.',
    claim: 'The parking brake lever operated band brakes acting on the inside of the rear brake drums; the foot brake acted on the transmission.',
    explode: [-40, -26, 0],
  },
  {
    id: 'wheels-rear', label: 'Rear wheels (two)', group: 'chassis',
    sentence: 'The rear wheels are driven by the axle and carry most of the load.',
    claim: WHEELS_CLAIM, explode: [-40, -26, 0],
  },
  {
    id: 'torque-tube', label: 'Driveshaft in torque tube', group: 'chassis',
    sentence: 'A shaft inside a hollow tube carries the power back to the rear axle and keeps the axle in line.',
    claim: 'A single universal joint connected the drive to a torque tube that drove the rear axle.',
    explode: [-22, 20, 0],
  },
  {
    id: 'running-boards', label: 'Running boards', group: 'chassis',
    sentence: 'Steps along each side help passengers climb into the car.',
    claim: null, explode: [0, -6, 0],
  },
  {
    id: 'fenders', label: 'Fenders (four)', group: 'chassis',
    sentence: 'Curved metal guards over each wheel keep mud and stones off the passengers.',
    claim: null, explode: [0, 34, 0],
  },

  // ── engine, cooling and exhaust ──────────────────────────────────────────
  {
    id: 'engine', label: 'Engine block and head', group: 'engine',
    sentence: 'Four cylinders in a row, with the cylinder head cast as part of the block, make about 20 horsepower.',
    claim: 'The Model T had a 177-cubic-inch inline four-cylinder engine producing about 20 horsepower.',
    explode: [18, 30, 0],
  },
  {
    id: 'magneto', label: 'Flywheel magneto', group: 'engine',
    sentence: 'The heavy flywheel at the back of the engine also holds the magnets that make the electricity for the spark.',
    claim: 'The Model T had a low-voltage magneto built into the engine flywheel.',
    explode: [4, 30, 0],
  },
  {
    id: 'transmission', label: 'Planetary transmission', group: 'engine',
    sentence: 'Gears that are always meshed are engaged by foot pedals instead of a gear stick.',
    claim: 'The Model T transmission was a two-speed planetary gear set, worked by foot pedals.',
    explode: [-10, 30, 0],
  },
  {
    id: 'carburetor', label: 'Carburetor', group: 'engine',
    sentence: 'It mixes a fine spray of gasoline with air before the mixture goes into the cylinders.',
    claim: 'The carburetor was of the automatic float-feed type, with a single adjustment, the gasoline needle valve (Ford Manual, 1919).',
    explode: [18, 30, -26],
  },
  {
    id: 'exhaust-manifold', label: 'Exhaust manifold', group: 'engine',
    sentence: 'A cast pipe collects the burnt gas from all four cylinders and passes it to the exhaust pipe.',
    claim: 'The 1919 Ford Manual describes the exhaust manifold joined to the exhaust pipe by a large brass pack nut.',
    explode: [18, 30, 26],
  },
  {
    id: 'muffler', label: 'Exhaust pipe and muffler', group: 'engine',
    sentence: 'The exhaust pipe leads the gas under the car to a muffler that quietens the engine noise.',
    claim: 'The exhaust went from the engine through the exhaust pipe to a muffler, which quietened the noise (Ford Manual, 1919).',
    explode: [-6, -26, 40],
  },
  {
    id: 'fan', label: 'Cooling fan', group: 'engine',
    sentence: 'A belt-driven fan behind the radiator pulls air through the honeycomb to cool the water.',
    claim: 'The engine drove a fan by a belt that was tightened with an adjusting screw in the fan bracket (Ford Manual, 1919).',
    explode: [44, 30, 0],
  },
  {
    id: 'radiator', label: 'Radiator', group: 'engine',
    sentence: 'Hot water from the engine cools in the honeycomb behind the brass front.',
    claim: null, explode: [70, 24, 0],
  },
  {
    id: 'radiator-hoses', label: 'Radiator hoses', group: 'engine',
    sentence: 'Two rubber hoses carry the water between the engine and the radiator; there is no water pump, the hot water simply rises.',
    claim: 'The 1919 Ford Manual describes radiator hoses and a thermo-syphon cooling system.',
    explode: [56, 36, 0],
  },
  {
    id: 'crank', label: 'Starting crank', group: 'engine',
    sentence: 'The hand crank at the front turns the engine over by hand to start it.',
    claim: 'A car without a starter was started by lifting the starting crank at the front of the car; an electric starter was not offered until 1919.',
    explode: [48, 4, 0],
  },
  {
    id: 'coil-box', label: 'Coil box (on the dash)', group: 'engine',
    sentence: 'A wooden box with four coils, one for each cylinder, makes the high-voltage sparks; the ignition switch is on its face.',
    claim: 'The coil box on the dash held four coils and the ignition switch (Ford Manual, 1919).',
    explode: [-26, 72, 0],
  },
  {
    id: 'fuel-tank', label: 'Fuel tank', group: 'engine',
    sentence: 'On a touring car the gasoline tank sits under the front seat.',
    claim: 'On the Model T the fuel tank was placed under the front seat.',
    explode: [-10, 28, 0],
  },

  // ── controls ─────────────────────────────────────────────────────────────
  {
    id: 'steering', label: 'Steering column and wheel', group: 'controls',
    sentence: 'The wheel on its tilted column turns the front wheels through a gearbox at the bottom.',
    claim: null, explode: [-6, 56, -24],
  },
  {
    id: 'column-levers', label: 'Spark and throttle levers', group: 'controls',
    sentence: 'Two small levers under the steering wheel: the left one sets the spark timing and the right one the engine speed.',
    claim: 'Under the steering wheel the left-hand lever controlled the spark and the right-hand lever the throttle (Ford Manual, 1919).',
    explode: [-14, 68, -24],
  },
  {
    id: 'pedals', label: 'Floor pedals (three)', group: 'controls',
    sentence: 'Left pedal for low and high gear, centre pedal for reverse, right pedal for the brake.',
    claim: 'The left pedal engages the transmission, the centre pedal engages reverse and the right pedal operates the transmission brake.',
    explode: [6, 42, -22],
  },
  {
    id: 'hand-lever', label: 'Hand brake lever', group: 'controls',
    sentence: 'The long lever beside the driver sets the rear brakes and holds the car in neutral; the Model T has no gear stick.',
    claim: 'A hand lever through the floor at the driver\'s left held the clutch in neutral and set the brakes in the rear drums (Ford Manual, 1919).',
    explode: [-14, 42, -26],
  },
  {
    id: 'horn', label: 'Horn', group: 'controls',
    sentence: 'A horn warns people and animals ahead. Its type and mounting changed over the years; the model shows one simple version.',
    claim: null, explode: [20, 52, 26],
  },

  // ── body ─────────────────────────────────────────────────────────────────
  {
    id: 'body', label: 'Touring body', group: 'body',
    sentence: 'The open passenger body bolts onto the frame, with a cowl and dash at the front.',
    claim: TOURING_CLAIM, explode: [-4, 56, 0],
  },
  {
    id: 'doors', label: 'Doors (four panels)', group: 'body',
    sentence: 'Door panels close the sides of the body so passengers can climb in from the running boards. Door layouts changed over the years; the model shows four.',
    claim: 'A 1913 touring car in The Henry Ford collection has leatherette-lined inner door panels.',
    explode: [-4, 56, 0],
  },
  {
    id: 'seats', label: 'Seats', group: 'body',
    sentence: 'A front bench seat and a rear bench seat carry the passengers.',
    claim: null, explode: [-4, 80, 0],
  },
  {
    id: 'windshield', label: 'Windshield (frame and glass)', group: 'body',
    sentence: 'A frame holding a pane of glass stands on the cowl to keep wind off the driver and front passenger.',
    claim: 'A 1913 touring car in The Henry Ford collection has a windshield frame; its frame, steering wheel and side lamps were steel instead of brass that year.',
    explode: [12, 56, 0],
  },
  {
    id: 'hood', label: 'Hood', group: 'body',
    sentence: 'The metal cover over the engine opens so the engine can be reached.',
    claim: null, explode: [14, 56, 0],
  },

  // ── lamps ────────────────────────────────────────────────────────────────
  {
    id: 'headlamps', label: 'Headlamps (pair)', group: 'lamps',
    sentence: 'Two lamps light the road ahead. Early cars burned acetylene gas in them; later ones used electric bulbs. The model draws brass lamps.',
    claim: LAMP_CLAIM, explode: [40, 14, 0],
  },
  {
    id: 'side-lamps', label: 'Cowl side lamps (pair)', group: 'lamps',
    sentence: 'Two small lamps on the cowl mark the width of the car at night.',
    claim: 'A 1913 touring car in The Henry Ford collection has side lamps as well as headlights.',
    explode: [14, 60, 0],
  },
  {
    id: 'tail-lamp', label: 'Tail lamp', group: 'lamps',
    sentence: 'A small lamp at the back shows other drivers where the car is. Its type changed over the years; the model draws one simple lamp.',
    claim: null, explode: [-32, 28, -14],
  },

  // ── folding top (optional) ───────────────────────────────────────────────
  {
    id: 'top-bows', label: 'Top bows', group: 'top', optional: true,
    sentence: 'Hinged wooden hoops hold the top up and fold flat behind the rear seat when the top is lowered.',
    claim: 'The 1919 Ford Manual tells owners folding the top down to take care that the fabric is not pinched between the bow spacers.',
    explode: [-4, 96, 0],
  },
  {
    id: 'top-cover', label: 'Top cover (fabric)', group: 'top', optional: true,
    sentence: 'A waterproof fabric cover stretched over the bows keeps rain off the passengers.',
    claim: null, explode: [-4, 112, 0],
  },
];

export const MODEL_T_PART_IDS = MODEL_T_PARTS.map(p => p.id);
