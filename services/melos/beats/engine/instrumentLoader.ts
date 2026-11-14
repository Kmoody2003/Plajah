// Concurrent-safe loader & pre-warm helper for track instrument instances.
// Deduplicates parallel initialization calls (chords, CCs, scheduled playback) while keeping
// lifecycle logic pure and testable outside browser/Vite AudioWorklet bundles.

export class InstrumentLoader<T> {
  private readonly loaded = new Map<string, T>();
  private readonly loading = new Map<string, Promise<T | null>>();

  get(trackId: string): T | undefined {
    return this.loaded.get(trackId);
  }

  set(trackId: string, inst: T): this {
    this.loaded.set(trackId, inst);
    return this;
  }

  has(trackId: string): boolean {
    return this.loaded.has(trackId);
  }

  delete(trackId: string): boolean {
    return this.loaded.delete(trackId);
  }

  entries(): IterableIterator<[string, T]> {
    return this.loaded.entries();
  }

  values(): IterableIterator<T> {
    return this.loaded.values();
  }

  [Symbol.iterator](): IterableIterator<[string, T]> {
    return this.loaded.entries();
  }

  clear(): void {
    this.loaded.clear();
    this.loading.clear();
  }

  ensure(trackId: string, factory: () => Promise<T | null>): Promise<T | null> {
    const existing = this.loaded.get(trackId);
    if (existing !== undefined) return Promise.resolve(existing);
    const inflight = this.loading.get(trackId);
    if (inflight) return inflight;
    const pending = factory().then((inst) => {
      if (inst !== null) this.loaded.set(trackId, inst);
      return inst;
    });
    const tracked = pending.finally(() => {
      if (this.loading.get(trackId) === tracked) {
        this.loading.delete(trackId);
      }
    });
    this.loading.set(trackId, tracked);
    return tracked;
  }
}

export async function prepareUnmutedTracks<
  TTrack extends { id: string; kind: string; mute?: boolean },
  TInst,
>(
  arrangement: readonly TTrack[],
  ensure: (track: TTrack) => Promise<TInst | null>,
  trackIds?: Iterable<string>,
): Promise<void> {
  const filter = trackIds ? new Set(trackIds) : null;
  const tracks = arrangement.filter(
    (t) => t.kind === 'instrument' && !t.mute && (!filter || filter.has(t.id)),
  );
  if (!tracks.length) return;
  await Promise.all(tracks.map((t) => ensure(t)));
}
