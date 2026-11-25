/**
 * Civic Desk — storage for the PREVIEW.
 *
 * The preview keeps everything in this browser (localStorage), seeded with the fictional sample in
 * deskSample.ts, so the desk can be demonstrated without a tenant, accounts or a backend. Nothing
 * leaves the device. The production store (a tenant-scoped, server-only Firestore collection with its
 * own rules file, like grantWorkspaces in routes/grants.ts) implements the same interface.
 */

import type { DeskData } from './deskSample';
import { buildSample, buildSubscribers } from './deskSample';

export interface DeskStore {
  load(): DeskData;
  save(d: DeskData): void;
  reset(): DeskData;
  readonly kind: 'preview' | 'tenant';
}

const KEY = 'plajah:terra:civicDesk:preview:v2';

export function createPreviewStore(now = Date.now()): DeskStore {
  let mem: DeskData | null = null;
  return {
    kind: 'preview',
    load() {
      if (mem) return mem;
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) { const d = JSON.parse(raw) as DeskData; mem = { ...d, subscribers: d.subscribers ?? buildSubscribers(), notices: d.notices ?? [], envelopes: d.envelopes ?? [] }; return mem; }
      } catch { /* storage blocked or corrupt — fall through to a fresh sample */ }
      mem = buildSample(now);
      return mem;
    },
    save(d) {
      mem = d;
      try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* preview keeps working in memory */ }
    },
    reset() {
      try { localStorage.removeItem(KEY); } catch { /* ignore */ }
      mem = buildSample(Date.now());
      return mem;
    },
  };
}
