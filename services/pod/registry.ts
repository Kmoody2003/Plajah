// Provider registry. Capabilities are the single source of truth for what the UI may claim.
import type { PodProvider, PrinterId } from './podTypes';
import { LuluProvider } from './providers/lulu';
import { GelatoProvider } from './providers/gelato';
import { kdpExport, ingramExport, draft2digitalExport, blurbExport } from './providers/exportPack';

let overrides: Partial<Record<PrinterId, PodProvider>> = {};
/** Test hook: inject mocked providers. */
export function setProviderOverrides(o: Partial<Record<PrinterId, PodProvider>>) { overrides = o; }

export function getProvider(id: PrinterId): PodProvider | null {
  if (overrides[id]) return overrides[id]!;
  switch (id) {
    case 'lulu': return new LuluProvider();
    case 'gelato': return new GelatoProvider();
    case 'kdp': return kdpExport;
    case 'ingramspark': return ingramExport;
    case 'draft2digital': return draft2digitalExport;
    case 'blurb': return blurbExport;
    default: return null;
  }
}

export const ALL_PRINTERS: PrinterId[] = ['lulu', 'gelato', 'kdp', 'ingramspark', 'draft2digital', 'blurb'];

export function listProviders() {
  return ALL_PRINTERS.map(id => {
    const p = getProvider(id)!;
    return { id, name: p.name, configured: p.configured(), capabilities: p.capabilities, mode: p.capabilities.directOrder ? 'direct' : 'export' as 'direct' | 'export' };
  });
}
