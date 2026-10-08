/**
 * Reconstruction scenes for the Ford dossier. Each is a labelled reconstruction, never a photograph,
 * and cites the claims it illustrates. Only documented persons with a CharacterBible (Ford) are
 * depicted; every other real person is deliberately absent, and crowds are unnamed and seen from
 * behind or at a distance. No scene depicts violence or the antisemitic campaign's content.
 * The earliest cleared Ford photograph dates from 1902 (age 39), so scenes with Ford younger than 39
 * resolve to silhouette/back-view compositions through the character gateway.
 *
 * Room ids follow data/dossier/ford.ts: r1 boyhood, r2 Detroit and the first cars, r3 the Model T and the line,
 * r4 the Motor City engine, r5 V-8/Depression/union, r6 the war effort, r7 beliefs and morals, r8 legacy.
 * The first eight scenes below predate the automotive-and-war revision (their ids are unchanged so the
 * generated paintings in fordRecon.json stay valid); the last ten were added in that revision and have no painting yet.
 */
import type { DossierScene } from './douglassScenes';

const STYLE =
  `museum-quality historical reconstruction painting, restrained naturalistic palette, soft period lighting, painterly but accurate period detail, no text`;

export const fordScenes: DossierScene[] = [
  {
    id: 'recon-ford-road-engine', roomId: 'r1', title: `A steam road engine on the Dearborn road`,
    basis: `Ford and Crowther, My Life and Work (1922): the road engine seen at age twelve`, claimIds: ['c-engine-watch', 'c-farm'],
    spec: { style: STYLE, aspect: '16:9', setting: `a dirt farm road in Michigan in 1875, split-rail fences, a horse-drawn farm wagon, a portable steam engine and boiler on iron wheels with a tall smokestack, open fields and sky, no poles, no wires, no signs`,
      action: `stands by the wagon seat watching the steam engine pass, seen only from behind, face turned away from the viewer`, cast: [{ characterId: 'ford', age: 12, eraKey: '1900s' }] },
  },
  {
    id: 'recon-ford-watch-table', roomId: 'r1', title: `The kitchen-table watchmaker`,
    basis: `My Life and Work (1922): repairing watches as a boy`, claimIds: ['c-engine-watch'],
    spec: { style: STYLE, aspect: '16:9', setting: `a Michigan farmhouse kitchen in the 1870s lit only by a kerosene lamp, a plain wooden table, small hand tools, a cloth with tiny watch gears, a wood stove, no electric fixtures of any kind`,
      action: `bends over the table with a small screwdriver and an open pocket watch, shown from behind in silhouette, hands and posture only, face not visible`, cast: [{ characterId: 'ford', age: 15 }] },
  },
  {
    id: 'recon-ford-quadricycle', roomId: 'r2', title: `The first run, June 1896`,
    basis: `Test drive of the Quadricycle, 4 June 1896 (The Henry Ford; Wikipedia, "Henry Ford")`, claimIds: ['c-quadricycle'],
    spec: { style: STYLE, aspect: '16:9', setting: `a quiet Detroit side street at first light in June 1896, wet cobbles, gas street lamps with a faint flame, brick houses, a small four-wheeled gasoline carriage with bicycle-style wire wheels, a tiller and a seat, a kerosene hand lantern, no electric lighting, no power lines`,
      action: `a young man seated at the tiller of the small carriage, seen from behind in silhouette against the dawn, face not visible`, cast: [{ characterId: 'ford', age: 32 }] },
  },
  {
    id: 'recon-ford-highland-line', roomId: 'r3', title: `The chassis line at Highland Park, 1913`,
    basis: `The Henry Ford, "Ford Methods and the Ford Shops"; My Life and Work (1922)`, claimIds: ['c-line-stages', 'c-93min'],
    spec: { style: STYLE, aspect: '16:9', setting: `the Highland Park factory floor in 1913, a long moving line carrying open Model T chassis past rows of workers in caps and aprons, overhead leather belts and line shafts, rows of incandescent bulbs, tall factory windows, workers seen only from behind or in shadow with no identifiable faces`,
      action: `stands on the factory floor with arms folded, watching the line move, calm and attentive`, cast: [{ characterId: 'ford', age: 50, eraKey: '1910s' }] },
  },
  {
    id: 'recon-fiveday-gate', roomId: 'r3', title: `The crowd at the gate, January 1914`,
    basis: `The Henry Ford, "Ford's Five-Dollar Day"`, claimIds: ['c-5day', 'c-crowds'],
    spec: { style: STYLE, aspect: '16:9', setting: `the gate of the Highland Park plant on a bitterly cold January morning in 1914, hundreds of men in overcoats and caps gathered in the snow, seen from behind and from a distance with no identifiable faces, steam rising from their breath, plain brick factory wall, no signs or lettering`,
      action: `the crowd waits patiently in the cold in front of the gate`, cast: [] },
  },
  {
    id: 'recon-ford-peaceship', roomId: 'r7', title: `Leaving Hoboken on the Oscar II`,
    basis: `Ford Peace Expedition, sailing 4 December 1915 (Dartmouth Alumni Magazine, March 1961)`, claimIds: ['c-peace-sail'],
    spec: { style: STYLE, aspect: '16:9', setting: `the upper deck of a 1915 steamship leaving Hoboken harbor in winter, a single tall funnel, a Danish-flagged hull, grey water, gulls, distant cranes and warehouses, no other identifiable passengers`,
      action: `stands at the rail in a long overcoat holding his hat against the wind, gazing out toward the open sea`, cast: [{ characterId: 'ford', age: 52, eraKey: '1910s' }] },
  },
  {
    id: 'recon-independent-press', roomId: 'r7', title: `The press room, 1920`,
    basis: `The Dearborn Independent, 22 May 1920 (the first "International Jew" article); no person depicted and no page text shown`, claimIds: ['c-series', 'c-paper'],
    spec: { style: STYLE, aspect: '16:9', setting: `a Dearborn newspaper press room in 1920, a large rotary printing press, rolls of blank newsprint, bundles of folded unprinted newspapers tied with string, ink-stained wooden floor, overhead incandescent lamps, completely empty of people, all paper blank with no readable words or symbols`,
      action: `the idle press stands silent in the early morning light, ink drying on the rollers`, cast: [] },
  },
  {
    id: 'recon-willow-run', roomId: 'r6', title: `Inside the Willow Run bomber plant, 1943`,
    basis: `Office of War Information photograph series on Willow Run (Library of Congress), B-24 Liberator production`, claimIds: ['c-willow', 'c-willow-labor'],
    spec: { style: STYLE, aspect: '16:9', setting: `the interior of the Willow Run bomber plant in 1943, an enormous assembly hall with a long line of four-engine B-24 Liberator bomber fuselages under construction, overhead lights, workers in coveralls and caps seen only from behind or far away with no identifiable faces, wartime posters with no readable text`,
      action: `workers install an engine on a bomber while the line moves slowly down the hall`, cast: [] },
  },

  // ── Added in the automotive-and-war revision: no paintings generated yet ──────────────────────
  {
    id: 'recon-piquette-third-floor', roomId: 'r2', title: `The third floor at Piquette, October 1908`,
    basis: `Ford Piquette Avenue Plant museum and Wikipedia, "Ford Piquette Avenue Plant": the Model T was designed on the third floor and the first production car was completed on 27 September 1908`, claimIds: ['c-piquette-modelt', 'c-modelt'],
    spec: { style: STYLE, aspect: '16:9', setting: `the third floor of a Detroit brick factory in October 1908, heavy timber columns, tall multi-pane windows with soft autumn daylight, leather belts and line shafts overhead, wooden workbenches with hand tools, a newly finished black open touring car with brass lamps standing in the middle of the floor, a few workmen in caps and aprons seen only from behind in the far background, no signs or lettering`,
      action: `stands beside the new car with one hand resting on the fender, looking at the machine, calm and attentive`, cast: [{ characterId: 'ford', age: 45, eraKey: '1900s' }] },
  },
  {
    id: 'recon-model-t-street', roomId: 'r3', title: `Model Ts on a Detroit avenue, 1912`,
    basis: `Detroit Publishing Company street views of Detroit, about 1910; The Henry Ford on the Model T`, claimIds: ['c-modelt', 'c-price'],
    spec: { style: STYLE, aspect: '16:9', setting: `a broad Detroit avenue in 1912, early open touring cars with brass lamps and folding tops sharing the brick street with horse-drawn wagons and an electric streetcar, a church spire and brick commercial buildings, pedestrians in long coats and wide hats seen only from behind or far away with no identifiable faces, no signs or lettering, no cars from later decades`,
      action: `a line of cars and wagons moves slowly along the avenue in clear spring light`, cast: [] },
  },
  {
    id: 'recon-rouge-1927', roomId: 'r4', title: `The Rouge at dawn, 1927`,
    basis: `Detroit Publishing Company aerial view of the River Rouge plant (Library of Congress); Wikipedia, "Ford River Rouge Complex"`, claimIds: ['c-rouge', 'c-model-a'],
    spec: { style: STYLE, aspect: '16:9', setting: `the River Rouge plant in Dearborn in 1927, tall smokestacks, a long lake ore boat tied at the slip, conveyor galleries and coke-oven smoke, a freight railroad yard, a few tiny workers in caps seen only from great distance and from behind, hazy golden dawn light, no signs or lettering`,
      action: `the great plant wakes at dawn, steam and smoke rising over the slip`, cast: [] },
  },
  {
    id: 'recon-ford-trimotor-1927', roomId: 'r4', title: `A Ford Trimotor at Dearborn, 1927`,
    basis: `Wikipedia, "Ford Trimotor"; Library of Congress photograph of a Ford Trimotor, about 1927`, claimIds: ['c-trimotor'],
    spec: { style: STYLE, aspect: '16:9', setting: `a grass airfield in Dearborn, Michigan in 1927, a corrugated all-metal three-engine high-wing monoplane parked in front of a long brick hangar, ground crew in coveralls seen only from behind and at a distance, clear sky, no lettering or markings`,
      action: `the ground crew walk out toward the aircraft in the morning light, the propellers still`, cast: [] },
  },
  {
    id: 'recon-greenfield-1929', roomId: 'r4', title: `Greenfield Village, October 1929`,
    basis: `The Henry Ford, "Edison and Ford: A Lasting Friendship"; Wikipedia, "Greenfield Village": dedication on 21 October 1929 at Light's Golden Jubilee`, claimIds: ['c-greenfield', 'c-jubilee'],
    spec: { style: STYLE, aspect: '16:9', setting: `Greenfield Village in Dearborn, Michigan in October 1929, a dirt lane lined with relocated nineteenth-century wooden buildings, autumn maples with fallen leaves, a crowd of well-dressed visitors seen only from behind and at a distance, no signs or lettering`,
      action: `walks slowly along the lane with his hands clasped behind his back, looking up at an old wooden building, thoughtful`, cast: [{ characterId: 'ford', age: 66, eraKey: '1920s' }] },
  },
  {
    id: 'recon-v8-test-cell-1932', roomId: 'r5', title: `The new V-8 on the test stand, 1932`,
    basis: `Wikipedia, "Ford flathead engine": the 1932 flathead V-8 cast in a single block`, claimIds: ['c-v8'],
    spec: { style: STYLE, aspect: '16:9', setting: `an engineering test cell in Dearborn, Michigan in 1932, a gleaming V-shaped eight-cylinder car engine mounted on a dynamometer stand with exhaust pipes and dial gauges, a bare cast-iron engine block on a bench nearby, white-coated engineers seen only from behind at the edge of the frame, tiled walls, soft overhead light, no signs or lettering`,
      action: `the engine runs on the stand while the gauges climb`, cast: [] },
  },
  {
    id: 'recon-eagle-boat-hall-1918', roomId: 'r6', title: `An Eagle boat hull at the Rouge, 1918`,
    basis: `Ford and Crowther, My Life and Work (1922): the Eagle boat plant built at the Rouge in 1918; Wikipedia, "Eagle-class patrol craft"`, claimIds: ['c-eagle-boats', 'c-ww1-ford'],
    spec: { style: STYLE, aspect: '16:9', setting: `a huge new factory hall at the River Rouge in 1918, a long riveted steel patrol-boat hull on a cradle under a high roof, overhead traveling cranes, workers in caps and overalls seen only from behind or in shadow, shafts of light through high windows, no flags or lettering`,
      action: `workers move beneath the hull while a crane lifts a steel plate into place`, cast: [] },
  },
  {
    id: 'recon-jeep-line-1942', roomId: 'r6', title: `Jeeps on the line, 1942`,
    basis: `Wikipedia, "Willys MB" (Ford GPW production); Library of Congress Office of War Information photographs of 1942 war production`, claimIds: ['c-gpw'],
    spec: { style: STYLE, aspect: '16:9', setting: `a wartime automobile assembly plant in 1942, a long line of small olive-drab four-wheel-drive army utility vehicles with flat hoods and fold-down windshields moving past workers in caps and overalls seen only from behind, overhead lights, no markings, no lettering, no insignia`,
      action: `the vehicles move down the line past the workers, one every few minutes`, cast: [] },
  },
  {
    id: 'recon-willow-village-1943', roomId: 'r6', title: `Willow Village, 1943`,
    basis: `Wikipedia, "Willow Run": Willow Lodge (February 1943) and about 2,500 family homes at Willow Village by December 1943`, claimIds: ['c-willow-housing', 'c-willow-labor'],
    spec: { style: STYLE, aspect: '16:9', setting: `Willow Village, Michigan in 1943, rows of small plain wartime homes and long barracks-style dormitory buildings on bare ground with new dirt roads, a vast low factory and hangar on the far horizon, workers in coveralls and women in headscarves walking toward a bus stop seen only from behind and at a distance, no signs or lettering`,
      action: `workers walk along the dirt road toward the bus stop at the end of a shift`, cast: [] },
  },
  {
    id: 'recon-fair-lane-1947', roomId: 'r6', title: `Fair Lane on the night of the flood, April 1947`,
    basis: `ClickOnDetroit (WDIV), "77 years ago, while Rouge River floods Dearborn, Henry Ford dies at 83": flooding cut power to the house`, claimIds: ['c-death'],
    spec: { style: STYLE, aspect: '16:9', setting: `Fair Lane, the Ford estate in Dearborn, Michigan, on an April evening in 1947, a large stone house with candlelight in a few windows, the swollen Rouge River glinting in the dusk beyond the lawn, bare spring trees, completely empty of people, no signs`,
      action: `the house stands quiet at dusk with the river high beyond the lawn`, cast: [] },
  },
  // Faceless replacement for the folded-arms Highland Park painting: the old id above stays valid.
  {
    id: 'recon-highland-line-workers', roomId: 'r3', title: `Workers along the moving line, Highland Park, 1913`,
    basis: `The Henry Ford, "Ford Methods and the Ford Shops"; My Life and Work (1922); generic staging with no person identifiable`, claimIds: ['c-line-stages', 'c-93min'],
    spec: { style: STYLE, aspect: '16:9', setting: `a belt-driven machine shop at the Highland Park plant in 1913, a long moving assembly line carrying open Model T chassis on plain wooden floor, overhead line shafts with flat leather belts running down to the machines, large multi-pane factory windows and a glazed roof letting in daylight, a few bare incandescent bulbs hanging on cords, brick pillars, workers in flat caps and bib aprons seen only from behind or far away in shadow, none facing the viewer, no signs or lettering`,
      action: `workers bend over the passing chassis from both sides of the line, each at his own station`, cast: [] },
  },
];
