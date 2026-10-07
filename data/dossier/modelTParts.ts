/**
 * Model T exploded view: part data (no three.js here, so it is cheap to test and import).
 *
 * Honesty rules: the 3D model is a PROCEDURAL teaching model, not measured CAD. A part's `claim` is
 * stated only when a source consulted says it (see docs/dossier/ford-research-notes.md); otherwise
 * `claim` is null and the panel says the detail is a modelling choice, not a historical claim.
 * `explode` is the displacement (inches, x = toward the radiator, y = up, z = toward the car's right)
 * applied when the slider is at "Exploded".
 */

export type ModelTPartId =
  | 'frame' | 'engine' | 'magneto' | 'transmission' | 'torque-tube' | 'rear-axle' | 'front-axle'
  | 'front-spring' | 'rear-spring' | 'wheels-front' | 'wheels-rear' | 'radiator' | 'hood'
  | 'fuel-tank' | 'steering' | 'pedals' | 'fenders' | 'running-boards' | 'body' | 'seats' | 'lamps';

export interface ModelTPart {
  id: ModelTPartId;
  label: string;
  /** One plain-language sentence for the panel. */
  sentence: string;
  /** A conservative, sourced statement, or null when the detail is only a modelling choice. */
  claim: string | null;
  explode: [number, number, number];
}

export const MODEL_T_DISCLAIMER = 'Simplified reconstruction: a teaching model, not measured CAD';

/** Facts about the whole car that the model's proportions follow. */
export const MODEL_T_WHEELBASE_IN = 100;

export const MODEL_T_PARTS: ModelTPart[] = [
  {
    id: 'frame', label: 'Chassis frame',
    sentence: 'Two long side rails joined by cross-members carry the engine, axles and body.',
    claim: null, explode: [0, -12, 0],
  },
  {
    id: 'engine', label: 'Engine block and head',
    sentence: 'Four cylinders in a row, with the cylinder head cast as part of the block, make about 20 horsepower.',
    claim: 'The Model T had a 177-cubic-inch inline four-cylinder engine producing about 20 horsepower.',
    explode: [8, 42, 0],
  },
  {
    id: 'magneto', label: 'Flywheel magneto',
    sentence: 'The heavy flywheel at the back of the engine also holds the magnets that make the electricity for the spark.',
    claim: 'The Model T had a low-voltage magneto built into the engine flywheel.',
    explode: [-6, 28, 0],
  },
  {
    id: 'transmission', label: 'Planetary transmission',
    sentence: 'Gears that are always meshed are engaged by foot pedals instead of a gear stick.',
    claim: 'The Model T transmission was a two-speed planetary gear set, worked by foot pedals.',
    explode: [-14, 56, 0],
  },
  {
    id: 'torque-tube', label: 'Driveshaft in torque tube',
    sentence: 'A shaft inside a hollow tube carries the power back to the rear axle and keeps the axle in line.',
    claim: 'A single universal joint connected the drive to a torque tube that drove the rear axle.',
    explode: [-16, 4, 0],
  },
  {
    id: 'rear-axle', label: 'Rear axle and differential',
    sentence: 'The differential lets the two rear wheels turn at different speeds in a corner.',
    claim: 'The torque tube drove the rear axle. The differential is a general feature of such axles and is not separately sourced here.',
    explode: [-34, -22, 0],
  },
  {
    id: 'front-axle', label: 'Front axle',
    sentence: 'A beam carries the front wheels, which swivel on it to steer.',
    claim: null, explode: [30, -22, 0],
  },
  {
    id: 'front-spring', label: 'Front leaf spring',
    sentence: 'A stack of curved steel strips mounted sideways cushions the front of the car.',
    claim: 'The Model T used a transversely mounted semi-elliptical spring for each of the front and rear beam axles.',
    explode: [46, -34, 0],
  },
  {
    id: 'rear-spring', label: 'Rear leaf spring',
    sentence: 'The rear spring also lies across the car.',
    claim: 'The Model T used a transversely mounted semi-elliptical spring for each of the front and rear beam axles.',
    explode: [-48, -34, 0],
  },
  {
    id: 'wheels-front', label: 'Front wheels',
    sentence: 'Wooden spokes bound by a steel tyre carry the front of the car.',
    claim: 'Model T wheels were wooden artillery wheels (steel wheels came only in 1926 and 1927).',
    explode: [40, -4, 0],
  },
  {
    id: 'wheels-rear', label: 'Rear wheels',
    sentence: 'The rear wheels are driven by the axle and carry most of the load.',
    claim: 'Model T wheels were wooden artillery wheels (steel wheels came only in 1926 and 1927).',
    explode: [-40, -4, 0],
  },
  {
    id: 'radiator', label: 'Radiator',
    sentence: 'Hot water from the engine cools in the honeycomb behind the brass front.',
    claim: null, explode: [52, 10, 0],
  },
  {
    id: 'hood', label: 'Hood',
    sentence: 'The metal cover over the engine opens so the engine can be reached.',
    claim: null, explode: [8, 72, 0],
  },
  {
    id: 'fuel-tank', label: 'Fuel tank',
    sentence: 'On a touring car the gasoline tank sits under the front seat.',
    claim: 'On the Model T the fuel tank was placed under the front seat.',
    explode: [-24, -2, 0],
  },
  {
    id: 'steering', label: 'Steering column, wheel and levers',
    sentence: 'The wheel turns the front wheels, and small levers under it set the engine speed and spark timing.',
    claim: 'The Model T throttle was a lever on the steering wheel. The separate spark lever is not separately sourced here.',
    explode: [-4, 44, -22],
  },
  {
    id: 'pedals', label: 'Floor pedals (three)',
    sentence: 'Left pedal for low and high gear, centre pedal for reverse, right pedal for the brake.',
    claim: 'The left pedal engages the transmission, the centre pedal engages reverse and the right pedal operates the transmission brake.',
    explode: [10, -4, -20],
  },
  {
    id: 'fenders', label: 'Fenders',
    sentence: 'Curved metal guards keep mud and stones off the passengers.',
    claim: null, explode: [0, 26, 0],
  },
  {
    id: 'running-boards', label: 'Running boards',
    sentence: 'Steps along each side help passengers climb into the car.',
    claim: null, explode: [0, -4, 0],
  },
  {
    id: 'body', label: 'Touring body',
    sentence: 'The open four-door passenger body bolts onto the frame, with a cowl and windshield at the front.',
    claim: null, explode: [0, 34, 0],
  },
  {
    id: 'seats', label: 'Seats',
    sentence: 'A front bench seat and a rear bench seat carry the passengers.',
    claim: null, explode: [0, 66, 0],
  },
  {
    id: 'lamps', label: 'Brass lamps',
    sentence: 'Brass lamps light the road ahead and the sides of the car.',
    claim: null, explode: [14, 38, 0],
  },
];

export const MODEL_T_PART_IDS = MODEL_T_PARTS.map(p => p.id);
