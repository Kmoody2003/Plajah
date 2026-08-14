// NKS content-tier types. Scope note (be honest in UI copy): .nksf files carry preset METADATA
// plus opaque plugin state (PCHK) meant for a desktop VST/Kontakt host. A browser cannot load
// the instrument. What we CAN do: index, tag-browse, audition the .previews/*.ogg render, and
// read the NICA knob pages to label macros. Sound loading needs the native shell.

export interface NksItem {
  path: string;             // relative path inside the picked library folder
  name: string;
  vendor: string;
  author?: string;
  comment?: string;
  bankchain: string[];      // e.g. ['Massive', 'Massive Factory', 'Bass']
  types: string[][];        // tag hierarchy, e.g. [['Bass','Sub Bass'], ['Sound','Analog']]
  modes: string[];
  uuid?: string;
  deviceType?: string;      // 'INST' | 'FX' | …
  previewPath?: string;     // sibling .previews/<file>.ogg when present
  macros: string[];         // NICA page-1 parameter names (display only in this build)
}

export interface NksIndexState {
  items: NksItem[];
  scannedAt: number;
  rootName: string;
  fileCount: number;
  skipped: number;
}

export const NKS_IDB_KEY = 'melos:nks:index';
export const NKS_HANDLE_KEY = 'melos:nks:handle';
