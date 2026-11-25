import * as THREE from 'three/webgpu';

export type CircuitId = 'ironport_gp' | 'foundry_bridge' | 'great_lakes_raceway';

export interface CircuitDef {
  id: CircuitId;
  name: string;
  location: string;
  lengthLabel: string;
  description: string;
  spline: THREE.CatmullRomCurve3;
  samples: THREE.Vector3[];
  checkpoints: THREE.Vector3[];
  roadWidth: number;
}

export interface FastTravelPoint {
  id: string;
  name: string;
  subtitle: string;
  x: number;
  z: number;
  yaw: number;
  circuitId?: CircuitId;
}

// ── World Scale: ~17.4 km East-West (~10.8 miles from Lake Michigan coast to Ironport) ──
export const WORLD_BOUNDS = {
  minX: -8600,
  maxX: 8800,
  minZ: -5600,
  maxZ: 5600,
};

// 1. Ironport River (feeds from Lake Michigan at x=-8200, winds through River Deltas, splits Ironport City in two)
const RAW_RIVER: [number, number][] = [
  [-8300, 900],
  [-6200, 1100],
  [-3800, 1450], // River Deltas
  [-1500, 1150],
  [1200, 750],
  [4200, 420],
  [6400, 180],   // Splits Ironport North & South
  [7600, 120],
  [8900, 260],
];

// 2. Circuit 1 (City North): Ironport Grand Circuit (16-corner Detroit-style downtown street circuit)
const RAW_IRONPORT_GP: [number, number][] = [
  [6550, -340],  // Riverside North Straight (Start/Finish)
  [7250, -340],
  [7580, -390],  // RenCen Hairpin
  [7740, -680],  // Riverwalk Esses
  [7540, -1040],
  [7620, -1480], // Jefferson Kink
  [7120, -1840], // Woodward Dive
  [6760, -1490], // Campus Martius Chicane
  [6560, -1880], // Theatre Hairpin
  [6160, -1720], // Ballpark Curve
  [6100, -1180], // Gratiot Dip
  [6160, -720],  // Eastern Market Sweep
  [6100, -420],  // Penobscot Pinch
  [6280, -330],  // Final corner
];

// 3. Circuit 2 (City South & Bridges): Foundry & Bridge Street Circuit (crosses the river splitting Ironport!)
const RAW_FOUNDRY_BRIDGE: [number, number][] = [
  [6350, 780],   // South Foundry Straight (Start/Finish)
  [7150, 780],
  [7450, 520],   // East Harbor Bridge Northbound
  [7450, -120],  // North Bank Sweeper
  [6650, -120],  // West Ironport Bridge Southbound
  [6600, 420],   // Riverfront Quay
  [6200, 480],   // Steelworks Hairpin
  [6150, 740],   // Foundry Return
];

// 4. Circuit 3 (Countryside Coastal): Great Lakes International Raceway (Motorsport / Gran Turismo style, partial Lake Michigan view)
const RAW_GREAT_LAKES_RACEWAY: [number, number][] = [
  [-6550, -2100], // Main Pit Straight (Start/Finish)
  [-5850, -2100], // Turn 1 Heavy Braking
  [-5550, -2480], // Moraine Sweeper
  [-5820, -2980], // Forest Esses Entry
  [-6320, -2820], // Forest Esses Exit
  [-6780, -3280], // North Bluff Hairpin
  [-7380, -3050], // Lake Michigan Coastal Backstretch (bluff-top view of the lake!)
  [-7520, -2450], // Lighthouse Carousel (banked sweeper overlooking water)
  [-7120, -2080], // Final Chicane onto Pit Straight
];

// Highways connecting the 10-mile macro world seamlessly
const RAW_I196: [number, number][] = [
  [6120, -680],   // Ironport Downtown West
  [4400, -450],   // Suburban Loops
  [2200, -250],   // Outer Suburbs
  [0, 120],       // Farmland Grid East
  [-2400, 420],   // Harvest Valley
  [-4800, 720],   // Harborfest Approach
  [-6850, 980],   // Harborfest Waterfront
  [-7450, 160],   // Lakeshore Bluffs South
  [-7580, -1250], // Lakeshore Bluffs Mid
  [-7450, -2100], // Great Lakes Raceway Access
  [-7250, -3850], // Lighthouse Point North
];

const RAW_SUBURBAN_LOOP: [number, number][] = [
  [4400, -450],
  [4950, -1250],
  [4100, -1850],
  [3350, -1250],
  [3650, -550],
];

export function createWorldMapData() {
  const riverSpline = new THREE.CatmullRomCurve3(
    RAW_RIVER.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'catmullrom',
    0.4
  );
  const riverSamples = riverSpline.getSpacedPoints(220);

  const i196Spline = new THREE.CatmullRomCurve3(
    RAW_I196.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'catmullrom',
    0.45
  );
  const i196Samples = i196Spline.getSpacedPoints(380);

  const suburbSpline = new THREE.CatmullRomCurve3(
    RAW_SUBURBAN_LOOP.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'catmullrom',
    0.45
  );
  const suburbSamples = suburbSpline.getSpacedPoints(180);

  function buildCircuit(
    id: CircuitId,
    name: string,
    location: string,
    lengthLabel: string,
    description: string,
    raw: [number, number][],
    roadWidth: number
  ): CircuitDef {
    const spline = new THREE.CatmullRomCurve3(
      raw.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      'catmullrom',
      0.38
    );
    const samples = spline.getSpacedPoints(360);
    const checkpoints = Array.from({ length: 8 }, (_, i) => spline.getPointAt(i / 8));
    return { id, name, location, lengthLabel, description, spline, samples, checkpoints, roadWidth };
  }

  const circuits: Record<CircuitId, CircuitDef> = {
    ironport_gp: buildCircuit(
      'ironport_gp',
      'Ironport Grand Circuit',
      'Ironport North (Downtown)',
      '4.2 km · 16 Corners',
      'Detroit-style downtown street circuit along the riverfront and RenCen towers.',
      RAW_IRONPORT_GP,
      18
    ),
    foundry_bridge: buildCircuit(
      'foundry_bridge',
      'Foundry & Bridge Circuit',
      'Ironport River Crossing',
      '3.4 km · Twin Bridges',
      'High-speed industrial circuit crossing both river bridges splitting Ironport.',
      RAW_FOUNDRY_BRIDGE,
      18
    ),
    great_lakes_raceway: buildCircuit(
      'great_lakes_raceway',
      'Great Lakes International Raceway',
      'West Michigan Bluffs',
      '4.8 km · Coastal Circuit',
      'Purpose-built Motorsport/GT circuit with elevation, esses, and Lake Michigan views.',
      RAW_GREAT_LAKES_RACEWAY,
      20
    ),
  };

  const fastTravelPoints: FastTravelPoint[] = [
    {
      id: 'ironport_gp',
      name: 'Ironport Grand Circuit',
      subtitle: 'Downtown North · Start/Finish',
      x: 6550,
      z: -340,
      yaw: Math.PI * 0.5,
      circuitId: 'ironport_gp',
    },
    {
      id: 'foundry_bridge',
      name: 'Foundry & Bridge Circuit',
      subtitle: 'South Bank · River Bridges',
      x: 6350,
      z: 780,
      yaw: Math.PI * 0.5,
      circuitId: 'foundry_bridge',
    },
    {
      id: 'great_lakes_raceway',
      name: 'Great Lakes Int. Raceway',
      subtitle: 'Coastal Motorsport Track',
      x: -6550,
      z: -2100,
      yaw: Math.PI * 0.5,
      circuitId: 'great_lakes_raceway',
    },
    {
      id: 'suburbs',
      name: 'Ironport Suburban Loops',
      subtitle: 'Winding Neighborhood Roads',
      x: 4400,
      z: -450,
      yaw: -Math.PI * 0.5,
    },
    {
      id: 'farmland',
      name: 'Harvest Valley Farmland',
      subtitle: 'I-196 · Barns & Silos',
      x: -1800,
      z: 280,
      yaw: -Math.PI * 0.5,
    },
    {
      id: 'harborfest',
      name: 'Harborfest Waterfront',
      subtitle: 'Lake Michigan Festival Hub',
      x: -6850,
      z: 980,
      yaw: -Math.PI * 0.4,
    },
    {
      id: 'dune_sea',
      name: 'Silver Lake Dune Sea',
      subtitle: 'Western Sand Dunes · Off-Road',
      x: -7450,
      z: 2650,
      yaw: Math.PI,
    },
  ];

  return {
    riverSpline,
    riverSamples,
    i196Spline,
    i196Samples,
    suburbSpline,
    suburbSamples,
    circuits,
    fastTravelPoints,
  };
}
