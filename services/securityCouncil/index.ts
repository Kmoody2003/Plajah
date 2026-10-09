/**
 * Security & IT Council — server entry point. See docs/SECURITY_IT_COUNCIL.md.
 *
 *   const council = initSecurityCouncil({ getAccessToken: getGoogleAccessToken });
 *   app.use('/api', council.edge);                    // before the global rate limiter
 *   app.use('/api', createSecurityCouncilRouter({...})) // routes/securityCouncil.ts
 */
import { createFirestoreRestStore } from './store';
import { createCouncilEdge } from './telemetry';
import { registerCouncilStore, registerMitigationForgetter, getCouncilStore } from './registry';

export * from './types';
export { runCouncil, undoMitigation, updateFindingStatus, buildBrief, findingIdFor } from './council';
export { getCouncilStore } from './registry';
export { hashIp } from './telemetry';

export function initSecurityCouncil(opts: { getAccessToken: () => Promise<string | null>; projectId?: string; databaseId?: string }) {
  const store = createFirestoreRestStore(opts);
  registerCouncilStore(store);
  const edge = createCouncilEdge({ store: getCouncilStore });
  registerMitigationForgetter(edge.forgetMitigation);
  return { store, edge: edge.middleware, flushTelemetry: edge.flush };
}
