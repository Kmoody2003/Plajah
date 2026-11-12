/**
 * forgeSpec.ts — a Forge character as data: what art it comes from, how its body is set, what it wears, where it goes.
 *
 * Every Forge stage reads the character it works on from here (FORGE_SPEC, or Haru by default), so a new character is a
 * new folder, not new code:
 *
 *   scripts/eraclash3d/characters/<id>/
 *     forge.json          the spec (art, body, head, kit, outputs, quality gates)          written by a person
 *     intake.json         the art measured: the turnaround's views, sole, chin, face length  forge intake
 *     flatlay_pieces.json the flat-lay's pieces and how each lies                           forge intake (hints by a person)
 *     head_warp.json      the head fitted to the art's outline, row by row                   forge fit-head
 *     armour_fit.json     the kit's shape fitted to the art's parts                           forge fit-armour
 *     report.md           the last run: scores per view, per part, against the gates         forge score
 */
import fs from 'node:fs';
import path from 'node:path';
import type { HumanTune } from '../../services/argilla/creature/human';

export interface ForgeSpec {
  id: string; name: string; note?: string;
  art: { portrait: string; turnaround: string; views: ('front' | 'side' | 'back')[]; flatLay?: string };
  body: Omit<HumanTune, 'face' | 'head'>;
  head: NonNullable<HumanTune['head']>;
  kit: string;
  out: { character: string; kit: string };
  gates: { overall: number; part: number; head: number };
}
/** The turnaround measured (forge intake): each view's columns, the soles' row, the chin's row, the face's length. */
export interface SheetIntake {
  path: string;
  front: { x0: number; x1: number }; side: { x0: number; x1: number }; back: { x0: number; x1: number };
  sole: number; chin: number;
  /** Chin (152) to the top of the face oval (10) on the turnaround's front face, in sheet pixels. */
  faceLength: number;
}

export const SPEC_FILE = process.env.FORGE_SPEC ?? 'scripts/eraclash3d/characters/haru/forge.json';
export const spec: ForgeSpec = JSON.parse(fs.readFileSync(SPEC_FILE, 'utf8'));
export const DATA_DIR = path.dirname(SPEC_FILE);
export const dataFile = (name: string) => path.join(DATA_DIR, name);
/** The runtime folder for this character's intermediates (big, rebuildable, outside the repo). */
export const WORK_DIR = path.join(process.env.FORGE_WORK_ROOT ?? 'D:/Plajah Runtime/eraclash3d/forge', spec.id);

/** The measured turnaround; before an intake has run, the values Haru's was first measured by hand with. */
export function sheetIntake(): SheetIntake {
  const f = dataFile('intake.json');
  if (fs.existsSync(f)) return { path: spec.art.turnaround, ...JSON.parse(fs.readFileSync(f, 'utf8')).sheet };
  return { path: spec.art.turnaround, front: { x0: 100, x1: 700 }, side: { x0: 750, x1: 1300 }, back: { x0: 1350, x1: 1950 }, sole: 1322, chin: 264.2, faceLength: 134.7 };
}
/** The portrait's landmarks file (written beside it by intake). */
export const portraitLandmarks = () => spec.art.portrait.replace(/\.[a-z]+$/i, '.landmarks.json');
/** The flat-lay's cut-out pieces (intake writes them beside the work files). */
export const flatLayPieceDir = () => path.join(WORK_DIR, 'flatlay');
