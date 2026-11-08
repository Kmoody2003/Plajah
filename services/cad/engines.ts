// Browser loaders for the WASM engines. Each engine is its own module and its own .wasm
// file, fetched only when a file of that type is opened (licence rule: separate module).

import type { IfcAPI } from 'web-ifc';
import ifcWasmUrl from 'web-ifc/web-ifc.wasm?url';
import occtWasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url';
import type { OcctApi } from './step';
import type { CadEngines } from './importer';
import type { CadModel } from './model';

let ifcP: Promise<IfcAPI> | null = null;
let occtP: Promise<OcctApi> | null = null;

export function loadIfc(): Promise<IfcAPI> {
  ifcP ??= (async () => {
    const WebIFC = await import('web-ifc');
    const api = new WebIFC.IfcAPI();
    await api.Init((path: string) => path.endsWith('.wasm') ? ifcWasmUrl : path, true);
    return api;
  })().catch(e => { ifcP = null; throw e; });
  return ifcP;
}

export function loadOcct(): Promise<OcctApi> {
  occtP ??= (async () => {
    const mod: any = await import('occt-import-js');
    const factory = mod.default ?? mod;
    return factory({ locateFile: (path: string) => path.endsWith('.wasm') ? occtWasmUrl : path }) as Promise<OcctApi>;
  })().catch(e => { occtP = null; throw e; });
  return occtP;
}

async function readGltf(bytes: Uint8Array, name: string): Promise<CadModel> {
  const { gltfToModel } = await import('./scene');
  return gltfToModel(bytes, name);
}

export const browserEngines: CadEngines = { ifc: loadIfc, occt: loadOcct, gltf: readGltf };
