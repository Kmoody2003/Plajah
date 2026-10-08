/**
 * Plajah Home — Matter controller worker process (PC only). Forked by
 * services/home/matterControllerService.ts with plain `node` (built-in type stripping, so this file
 * and matterCore.ts must stay erasable TypeScript), it runs MatterCore and answers over IPC.
 * Why: under the tsx dev loader the matter.js import graph takes minutes; plain Node takes seconds.
 * The Android hub does not use this file (no child_process there): MatterCore runs in-process.
 */
import { MatterCore, MatterHubError } from './matterCore.ts';

const core = new MatterCore();
type Req = { id: number; method: 'status' | 'listNodes' | 'getNode' | 'commission' | 'command' | 'removeNode' | 'parseCode' | 'shutdown'; args: any[] };

process.on('message', async (msg: Req) => {
  if (!msg || typeof msg.id !== 'number') return;
  try {
    const fn = (core as any)[msg.method];
    if (typeof fn !== 'function') throw new MatterHubError(`Unknown method ${msg.method}`, 400);
    const result = await fn.apply(core, msg.args || []);
    process.send?.({ id: msg.id, ok: true, result: JSON.parse(JSON.stringify(result ?? null, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) });
  } catch (e: any) {
    process.send?.({ id: msg.id, ok: false, error: e?.message || String(e), status: typeof e?.status === 'number' ? e.status : 500 });
  }
});
// The hub server went away: stop with it.
process.on('disconnect', () => { void core.shutdown().finally(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
process.on('unhandledRejection', e => console.warn('[MatterHub] unhandled rejection:', (e as any)?.message || e));
process.send?.({ ready: true });
// Boot right away so nodes this fabric already owns reconnect and start reporting.
void core.boot().catch(e => console.warn('[MatterHub]', e?.message || e));
