// Licence boundaries for every outside engine the CAD suite uses or plans to use.
//
// The desktop app ships as an MSIX, so anything linked into it is distribution. The rules
// (docs/CAD_BIM_ENGINEERING_SUITE_PLAN.md section 1):
//   permissive      MIT/BSD/Apache/ISC: link anywhere.
//   weak-copyleft   LGPL/MPL: only as a separate, replaceable module (its own WASM or DLL),
//                   and any change we make to it is published.
//   copyleft        GPL: separate process only (server, or a helper the user installs).
//   network         AGPL: not on our servers; hand off to the user's own copy.
//   restricted      custom/non-commercial terms: not used without a written licence.
// tests/cad.test.ts fails if an entry breaks these rules.

export type LicenceTier = 'permissive' | 'weak-copyleft' | 'copyleft' | 'network' | 'restricted' | 'ours' | 'public-domain';
export type Linkage = 'linked' | 'separate-module' | 'separate-process' | 'user-installed' | 'not-used';
export type Runtime = 'browser' | 'desktop' | 'server';

export interface CadEngine {
  id: string;
  name: string;
  licence: string;
  tier: LicenceTier;
  linkage: Linkage;
  runs: Runtime[];
  /** What it does for us. */
  role: string;
  status: 'in-use' | 'planned' | 'avoid';
}

export const CAD_ENGINES: CadEngine[] = [
  { id: 'plajah-dxf', name: 'Plajah DXF reader/writer', licence: 'Plajah', tier: 'ours', linkage: 'linked', runs: ['browser', 'desktop', 'server'], role: 'DXF read and R12 write', status: 'in-use' },
  { id: 'plajah-mesh', name: 'Plajah STL / OBJ / 3MF readers', licence: 'Plajah', tier: 'ours', linkage: 'linked', runs: ['browser', 'desktop', 'server'], role: 'Printer and mesh formats, print checks', status: 'in-use' },
  { id: 'three', name: 'three.js + three-stdlib', licence: 'MIT', tier: 'permissive', linkage: 'linked', runs: ['browser', 'desktop'], role: 'Viewport, GLB read/write', status: 'in-use' },
  { id: 'web-ifc', name: 'web-ifc (That Open Company)', licence: 'MPL-2.0', tier: 'weak-copyleft', linkage: 'separate-module', runs: ['browser', 'desktop', 'server'], role: 'IFC 2x3/4/4.3 read', status: 'in-use' },
  { id: 'occt-import-js', name: 'occt-import-js (OpenCASCADE)', licence: 'LGPL-2.1', tier: 'weak-copyleft', linkage: 'separate-module', runs: ['browser', 'desktop', 'server'], role: 'STEP / IGES / BREP read', status: 'in-use' },
  { id: 'acadsharp', name: 'ACadSharp', licence: 'MIT', tier: 'permissive', linkage: 'linked', runs: ['desktop', 'server'], role: 'DWG to DXF (.NET: desktop app + cad-dwg tool)', status: 'in-use' },
  { id: 'opencascade-js', name: 'OpenCASCADE modelling kernel (opencascade.js / native)', licence: 'LGPL-2.1 + exception', tier: 'weak-copyleft', linkage: 'separate-module', runs: ['browser', 'desktop', 'server'], role: 'Solid modelling, booleans, fillets, HLR drawings', status: 'planned' },
  { id: 'manifold', name: 'Manifold', licence: 'Apache-2.0', tier: 'permissive', linkage: 'linked', runs: ['browser', 'desktop', 'server'], role: 'Mesh booleans and repair', status: 'planned' },
  { id: 'planegcs', name: 'PlaneGCS (FreeCAD)', licence: 'LGPL-2.1', tier: 'weak-copyleft', linkage: 'separate-module', runs: ['browser', 'desktop'], role: 'Sketch constraints until ours lands', status: 'planned' },
  { id: 'ifcopenshell', name: 'IfcOpenShell', licence: 'LGPL-3.0', tier: 'weak-copyleft', linkage: 'separate-process', runs: ['server', 'desktop'], role: 'IFC write, IDS checks', status: 'planned' },
  { id: 'kiri-moto', name: 'Kiri:Moto (Grid.Space)', licence: 'MIT', tier: 'permissive', linkage: 'linked', runs: ['browser', 'desktop'], role: 'Slicing for FDM, CNC, laser', status: 'planned' },
  { id: 'calculix', name: 'CalculiX', licence: 'GPL-2.0', tier: 'copyleft', linkage: 'separate-process', runs: ['server', 'desktop'], role: 'Solid FEA', status: 'planned' },
  { id: 'openfoam', name: 'OpenFOAM', licence: 'GPL-3.0', tier: 'copyleft', linkage: 'separate-process', runs: ['server', 'desktop'], role: 'Heavy CFD', status: 'planned' },
  { id: 'ngspice', name: 'ngspice', licence: 'BSD-3', tier: 'permissive', linkage: 'linked', runs: ['browser', 'desktop', 'server'], role: 'Circuit simulation', status: 'planned' },
  { id: 'libredwg', name: 'LibreDWG', licence: 'GPL-3.0', tier: 'copyleft', linkage: 'separate-process', runs: ['server'], role: 'DWG fallback, server only', status: 'planned' },
  { id: 'prusa-orca-cura', name: 'PrusaSlicer / OrcaSlicer / CuraEngine', licence: 'AGPL-3.0', tier: 'network', linkage: 'user-installed', runs: ['desktop'], role: 'Hand-off to the user\'s own slicer', status: 'planned' },
  { id: 'opensees', name: 'OpenSees', licence: 'UC Regents custom', tier: 'restricted', linkage: 'not-used', runs: [], role: 'Commercial redistribution needs a Berkeley licence', status: 'avoid' },
  { id: 'swmm-epanet', name: 'EPA SWMM / EPANET', licence: 'Public domain / MIT', tier: 'public-domain', linkage: 'linked', runs: ['browser', 'desktop', 'server'], role: 'Storm and water networks', status: 'planned' },
];

/** Returns a reason if the entry breaks the licence rules, else null. */
export function licenceViolation(e: CadEngine): string | null {
  if (e.tier === 'weak-copyleft' && e.linkage === 'linked') return `${e.name} (${e.licence}) must be a separate module, not linked`;
  if (e.tier === 'copyleft' && !['separate-process', 'user-installed', 'not-used'].includes(e.linkage)) return `${e.name} (${e.licence}) must run as a separate process`;
  if (e.tier === 'copyleft' && e.runs.includes('browser')) return `${e.name} (${e.licence}) cannot ship in the web bundle`;
  if (e.tier === 'network' && (e.runs.includes('server') || !['user-installed', 'not-used'].includes(e.linkage))) return `${e.name} (${e.licence}) must stay off our servers`;
  if (e.tier === 'restricted' && e.status !== 'avoid') return `${e.name} needs a written licence before use`;
  return null;
}

export const engineById = (id: string) => CAD_ENGINES.find(e => e.id === id);
