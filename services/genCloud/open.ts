// services/genCloud/open.ts — open the Plajah Cloud generate panel from any room.
// The panel lives once in App (GenCloudDock); rooms call openGenCloud() with what they want back.

import type { GenKind } from './types';
import type { JobOutput } from './client';

export interface GenCloudOpenRequest {
  /** Which room asked (shown in the header, e.g. "for Tela"). */
  source?: 'tela' | 'reello' | 'fabula' | 'app';
  /** Limit the engine list (e.g. Reello → ['video']). */
  kinds?: GenKind[];
  prompt?: string;
  aspect?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  /** Open on the Credits tab (e.g. after Stripe Checkout). */
  tab?: 'create' | 'credits';
  /** Called when the user presses "Use" on a result. Absent = results can only be opened/downloaded. */
  onUse?: (outputs: JobOutput[], meta: { engine: string; prompt: string }) => void | Promise<void>;
  /** Label for the Use button ("Add to canvas", "Add to uploads", "Add to bin"). */
  useLabel?: string;
}

export const GEN_CLOUD_OPEN_EVENT = 'plajah:gencloud-open';

export function openGenCloud(req: GenCloudOpenRequest = {}) {
  window.dispatchEvent(new CustomEvent<GenCloudOpenRequest>(GEN_CLOUD_OPEN_EVENT, { detail: req }));
}
