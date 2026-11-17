// Cloud saves for first-party games, host side: Firestore storage in the plajah-ops database (collection gameSaves, one doc per player per game, id `${uid}_${gameId}`),
// and the window.postMessage bridge that iframe games talk to. Protocol and limits are in gameSaveCore.ts. Games that are React components in the app can call
// loadGameSave / storeGameSave directly.
import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { opsDb } from './firebase';
import { GAME_ID_RE, SaveHost, docIdFor, type CloudSaveDoc, type SaveStore, type StoreOutcome } from './gameSaveCore';

const toDoc = (d: { rev?: unknown; data?: unknown; updatedAt?: unknown }): CloudSaveDoc => ({
  rev: typeof d.rev === 'number' ? d.rev : 0,
  data: typeof d.data === 'string' ? d.data : '',
  updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : null,
});

export const firestoreSaveStore: SaveStore = {
  async load(uid, gameId) {
    const s = await getDoc(doc(opsDb, 'gameSaves', docIdFor(uid, gameId)));
    return s.exists() ? toDoc(s.data()) : null;
  },
  async store(uid, gameId, baseRev, data, device): Promise<StoreOutcome> {
    const ref = doc(opsDb, 'gameSaves', docIdFor(uid, gameId));
    return runTransaction(opsDb, async (tx) => {
      const cur = await tx.get(ref);
      const rev = cur.exists() ? toDoc(cur.data()).rev : 0;
      if (rev !== baseRev) return { ok: false, conflict: true, doc: cur.exists() ? toDoc(cur.data()) : null } as StoreOutcome;
      const at = Date.now();       // checked by the rules to be within 5 minutes of the server's clock
      tx.set(ref, { uid, gameId, rev: rev + 1, v: 1, device: device.slice(0, 40), data, updatedAt: at });
      return { ok: true, doc: { rev: rev + 1, data, updatedAt: at } } as StoreOutcome;
    });
  },
};

/** direct use by in-app games */
export const loadGameSave = (uid: string, gameId: string) => firestoreSaveStore.load(uid, gameId);
export const storeGameSave = (uid: string, gameId: string, baseRev: number, data: string) => firestoreSaveStore.store(uid, gameId, baseRev, data, 'web');

/**
 * Serves the cloud save to one embedded game. `frame()` returns the game's window; messages from anything else, or from another origin, are ignored.
 * `gameId` is decided by the host (the catalog entry being shown), never by what the game claims. Returns a detach function.
 */
export function attachGameSaveBridge(args: { gameId: string; userId: string | null; gameOrigin: string; frame: () => Window | null; store?: SaveStore }): () => void {
  const { gameId, userId, gameOrigin, frame } = args;
  if (!GAME_ID_RE.test(gameId)) return () => { /* nothing attached */ };
  const host = userId ? new SaveHost(args.store ?? firestoreSaveStore, userId, gameId, deviceName()) : null;
  const onMessage = async (e: MessageEvent): Promise<void> => {
    const win = frame();
    if (!win || e.source !== win || e.origin !== gameOrigin) return;
    const d = e.data as { type?: unknown; gameId?: unknown } | null;
    if (typeof d?.type !== 'string' || !d.type.startsWith('plajah.save.') || d.gameId !== gameId) return;
    if (!host) {                                                   // a guest: tell the game there is no cloud, so it keeps its save on the device
      if (d.type === 'plajah.save.hello') win.postMessage({ type: 'plajah.save.hello.result', available: false }, gameOrigin);
      return;
    }
    const reply = await host.handle(d);
    if (reply) frame()?.postMessage(reply, gameOrigin);
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

function deviceName(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return /Android/i.test(ua) ? 'android' : /iPhone|iPad/i.test(ua) ? 'ios' : /Windows/i.test(ua) ? 'windows' : /Mac/i.test(ua) ? 'mac' : 'web';
}
