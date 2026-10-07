/**
 * Reconstruction scenes for the Ford dossier. Each is a labelled reconstruction, never a photograph,
 * and cites the claims it illustrates. Only documented persons with a CharacterBible (Ford) are
 * depicted; every other real person is deliberately absent, and crowds are unnamed and seen from
 * behind or at a distance. No scene depicts violence or the antisemitic campaign's content.
 * The earliest cleared Ford photograph dates from 1902 (age 39), so scenes with Ford younger than 39
 * resolve to silhouette/back-view compositions through the character gateway.
 */
import type { DossierScene } from './douglassScenes';

const STYLE =
  'museum-quality historical reconstruction painting, restrained naturalistic palette, soft period lighting, painterly but accurate period detail, no text';

export const fordScenes: DossierScene[] = [
  {
    id: 'recon-ford-road-engine', roomId: 'r1', title: 'A steam road engine on the Dearborn road',
    basis: 'Ford and Crowther, My Life and Work (1922): the road engine seen at age twelve', claimIds: ['c-engine-watch', 'c-farm'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a dirt farm road in Michigan in 1875, split-rail fences, a horse-drawn farm wagon, a portable steam engine and boiler on iron wheels with a tall smokestack, open fields and sky, no poles, no wires, no signs',
      action: 'stands by the wagon seat watching the steam engine pass, seen only from behind, face turned away from the viewer', cast: [{ characterId: 'ford', age: 12, eraKey: '1900s' }] },
  },
  {
    id: 'recon-ford-watch-table', roomId: 'r1', title: 'The kitchen-table watchmaker',
    basis: 'My Life and Work (1922): repairing watches as a boy', claimIds: ['c-engine-watch'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a Michigan farmhouse kitchen in the 1870s lit only by a kerosene lamp, a plain wooden table, small hand tools, a cloth with tiny watch gears, a wood stove, no electric fixtures of any kind',
      action: 'bends over the table with a small screwdriver and an open pocket watch, shown from behind in silhouette, hands and posture only, face not visible', cast: [{ characterId: 'ford', age: 15 }] },
  },
  {
    id: 'recon-ford-quadricycle', roomId: 'r2', title: 'The first run, June 1896',
    basis: 'Test drive of the Quadricycle, 4 June 1896 (The Henry Ford; Wikipedia, "Henry Ford")', claimIds: ['c-quadricycle'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a quiet Detroit side street at first light in June 1896, wet cobbles, gas street lamps with a faint flame, brick houses, a small four-wheeled gasoline carriage with bicycle-style wire wheels, a tiller and a seat, a kerosene hand lantern, no electric lighting, no power lines',
      action: 'a young man seated at the tiller of the small carriage, seen from behind in silhouette against the dawn, face not visible', cast: [{ characterId: 'ford', age: 32 }] },
  },
  {
    id: 'recon-ford-highland-line', roomId: 'r3', title: 'The chassis line at Highland Park, 1913',
    basis: 'The Henry Ford, "Ford Methods and the Ford Shops"; My Life and Work (1922)', claimIds: ['c-line-stages', 'c-93min'],
    spec: { style: STYLE, aspect: '16:9', setting: 'the Highland Park factory floor in 1913, a long moving line carrying open Model T chassis past rows of workers in caps and aprons, overhead leather belts and line shafts, rows of incandescent bulbs, tall factory windows, workers seen only from behind or in shadow with no identifiable faces',
      action: 'stands on the factory floor with arms folded, watching the line move, calm and attentive', cast: [{ characterId: 'ford', age: 50, eraKey: '1910s' }] },
  },
  {
    id: 'recon-fiveday-gate', roomId: 'r4', title: 'The crowd at the gate, January 1914',
    basis: 'The Henry Ford, "Ford\'s Five-Dollar Day"', claimIds: ['c-5day', 'c-crowds'],
    spec: { style: STYLE, aspect: '16:9', setting: 'the gate of the Highland Park plant on a bitterly cold January morning in 1914, hundreds of men in overcoats and caps gathered in the snow, seen from behind and from a distance with no identifiable faces, steam rising from their breath, plain brick factory wall, no signs or lettering',
      action: 'the crowd waits patiently in the cold in front of the gate', cast: [] },
  },
  {
    id: 'recon-ford-peaceship', roomId: 'r4', title: 'Leaving Hoboken on the Oscar II',
    basis: 'Ford Peace Expedition, sailing 4 December 1915 (Dartmouth Alumni Magazine, March 1961)', claimIds: ['c-peace-sail'],
    spec: { style: STYLE, aspect: '16:9', setting: 'the upper deck of a 1915 steamship leaving Hoboken harbor in winter, a single tall funnel, a Danish-flagged hull, grey water, gulls, distant cranes and warehouses, no other identifiable passengers',
      action: 'stands at the rail in a long overcoat holding his hat against the wind, gazing out toward the open sea', cast: [{ characterId: 'ford', age: 52, eraKey: '1910s' }] },
  },
  {
    id: 'recon-independent-press', roomId: 'r5', title: 'The press room, 1920',
    basis: 'The Dearborn Independent, 22 May 1920 (the first "International Jew" article); no person depicted and no page text shown', claimIds: ['c-series', 'c-paper'],
    spec: { style: STYLE, aspect: '16:9', setting: 'a Dearborn newspaper press room in 1920, a large rotary printing press, rolls of blank newsprint, bundles of folded unprinted newspapers tied with string, ink-stained wooden floor, overhead incandescent lamps, completely empty of people, all paper blank with no readable words or symbols',
      action: 'the idle press stands silent in the early morning light, ink drying on the rollers', cast: [] },
  },
  {
    id: 'recon-willow-run', roomId: 'r6', title: 'Inside the Willow Run bomber plant, 1943',
    basis: 'Office of War Information photograph series on Willow Run (Library of Congress), B-24 Liberator production', claimIds: ['c-willow', 'c-willow-labor'],
    spec: { style: STYLE, aspect: '16:9', setting: 'the interior of the Willow Run bomber plant in 1943, an enormous assembly hall with a long line of four-engine B-24 Liberator bomber fuselages under construction, overhead lights, workers in coveralls and caps seen only from behind or far away with no identifiable faces, wartime posters with no readable text',
      action: 'workers install an engine on a bomber while the line moves slowly down the hall', cast: [] },
  },
];
