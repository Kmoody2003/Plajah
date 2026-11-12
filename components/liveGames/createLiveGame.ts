// Open a room for any live party game (and optionally post it so feed scrollers can jump in).
import { liveGame, liveParty, failed, postLiveGame, type AnyLiveKind } from '../../services/liveGames/client';

export interface CreateOpts { title?: string; pack?: string; rounds?: number; secs?: number; penMode?: 'host' | 'top-guesser'; streamId?: string; post?: boolean }

export async function createLiveGame(kind: AnyLiveKind, o: CreateOpts = {}): Promise<{ ok: true; gid: string } | { ok: false; error: string }> {
  if (kind === 'sketch') {
    const r = await liveGame.create({ title: o.title, streamId: o.streamId, settings: { ...(o.pack ? { pack: o.pack } : {}), ...(o.rounds ? { rounds: o.rounds } : {}), ...(o.secs ? { roundMs: o.secs * 1000 } : {}), ...(o.penMode ? { penMode: o.penMode } : {}) } });
    if (failed(r)) return { ok: false, error: r.error };
    if (o.post !== false) await postLiveGame(r.game);
    return { ok: true, gid: r.game.id };
  }
  const r = await liveParty.create(kind, { title: o.title, streamId: o.streamId, settings: { ...(o.pack ? { pack: o.pack } : {}), ...(o.rounds ? { rounds: o.rounds } : {}), ...(o.secs ? { answerMs: o.secs * 1000 } : {}) } });
  if (failed(r)) return { ok: false, error: r.error };
  if (o.post !== false) await postLiveGame(r.game);
  return { ok: true, gid: r.game.id };
}
