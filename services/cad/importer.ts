// One door for every CAD file: detect the format, pick the engine, return a CadModel.
// WASM engines are passed in (engines.ts loads them in the browser; tests load them in node),
// so this module has no bundler-specific imports.

import type { IfcAPI } from 'web-ifc';
import { type CadModel, type CadFormat, emptyModel } from './model';
import { parseDxf } from './dxf';
import { parseStl, parseObj, parse3mf } from './mesh';
import { parseIfc } from './ifc';
import { parseStep, type OcctApi } from './step';

export interface CadEngines {
  ifc?: () => Promise<IfcAPI>;
  occt?: () => Promise<OcctApi>;
  /** GLB/GLTF is read by three.js in the browser; tests can leave it out. */
  gltf?: (bytes: Uint8Array, name: string) => Promise<CadModel>;
}

export interface CadFormatInfo { format: CadFormat; label: string; family: '2D drawing' | 'BIM' | 'Solid (B-rep)' | 'Mesh'; ready: boolean; note?: string }

export const CAD_FORMATS: Record<CadFormat, CadFormatInfo> = {
  dxf: { format: 'dxf', label: 'AutoCAD DXF', family: '2D drawing', ready: true },
  dwg: { format: 'dwg', label: 'AutoCAD DWG', family: '2D drawing', ready: false, note: 'DWG reading (ACadSharp, MIT) is next. For now save as DXF from any CAD program.' },
  ifc: { format: 'ifc', label: 'IFC (open BIM)', family: 'BIM', ready: true },
  step: { format: 'step', label: 'STEP', family: 'Solid (B-rep)', ready: true },
  iges: { format: 'iges', label: 'IGES', family: 'Solid (B-rep)', ready: true },
  brep: { format: 'brep', label: 'OpenCASCADE BREP', family: 'Solid (B-rep)', ready: true },
  stl: { format: 'stl', label: 'STL', family: 'Mesh', ready: true },
  obj: { format: 'obj', label: 'Wavefront OBJ', family: 'Mesh', ready: true },
  glb: { format: 'glb', label: 'glTF binary', family: 'Mesh', ready: true },
  gltf: { format: 'gltf', label: 'glTF', family: 'Mesh', ready: true, note: 'Embedded buffers only.' },
  '3mf': { format: '3mf', label: '3MF (3D printing)', family: 'Mesh', ready: true },
};

const EXT: Record<string, CadFormat> = { dxf: 'dxf', dwg: 'dwg', ifc: 'ifc', ifczip: 'ifc', stp: 'step', step: 'step', p21: 'step', igs: 'iges', iges: 'iges', brep: 'brep', brp: 'brep', stl: 'stl', obj: 'obj', glb: 'glb', gltf: 'gltf', '3mf': '3mf' };

export const CAD_ACCEPT = Object.keys(EXT).map(e => '.' + e).join(',');

export function isCadFileName(name: string) { return !!EXT[(name.split('.').pop() || '').toLowerCase()]; }

/** Extension first, then magic bytes when the extension is missing or wrong. */
export function detectCadFormat(name: string, bytes: Uint8Array): CadFormat | null {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 256));
  if (/^AC10\d\d/.test(head)) return 'dwg';
  if (head.startsWith('glTF')) return 'glb';
  if (head.startsWith('ISO-10303-21')) return /FILE_SCHEMA\s*\(\s*\(\s*'IFC/i.test(new TextDecoder('latin1').decode(bytes.subarray(0, 4096))) ? 'ifc' : 'step';
  const ext = EXT[(name.split('.').pop() || '').toLowerCase()];
  if (ext) return ext;
  if (/^\s*0\s*[\r\n]+\s*SECTION/.test(head)) return 'dxf';
  if (/^\s*solid\s/.test(head)) return 'stl';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return '3mf';
  return null;
}

export async function importCadFile(name: string, bytes: Uint8Array, engines: CadEngines = {}): Promise<CadModel> {
  const format = detectCadFormat(name, bytes);
  if (!format) { const m = emptyModel(name, 'dxf', 'none'); m.warnings.push('This file type is not a CAD format we know.'); return m; }
  let model: CadModel;
  switch (format) {
    case 'dxf': model = parseDxf(bytes, name); break;
    case 'stl': model = parseStl(bytes, name); break;
    case 'obj': model = parseObj(new TextDecoder().decode(bytes), name); break;
    case '3mf': model = parse3mf(bytes, name); break;
    case 'ifc': {
      if (!engines.ifc) throw new Error('IFC engine not available here');
      model = await parseIfc(await engines.ifc(), bytes, name); break;
    }
    case 'step': case 'iges': case 'brep': {
      if (!engines.occt) throw new Error('OpenCASCADE engine not available here');
      model = parseStep(await engines.occt(), bytes, name, format); break;
    }
    case 'glb': case 'gltf': {
      if (!engines.gltf) throw new Error('glTF reader not available here');
      model = await engines.gltf(bytes, name); break;
    }
    case 'dwg': default: {
      model = emptyModel(name, format, 'none'); model.is2D = true;
      model.warnings.push(CAD_FORMATS[format].note || 'Not readable yet.');
      model.meta.version = new TextDecoder('latin1').decode(bytes.subarray(0, 6));
    }
  }
  return model;
}
