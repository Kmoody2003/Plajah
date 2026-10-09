// Browser-side: the real catalogues live in services/living/audio. Dynamic import keeps the audio engine out of the main chunk.
// Kept apart from catalog.ts so node unit tests (which must not load WebAudio code) can import catalog.ts alone.
export const audioCatalogLoader = async (): Promise<Record<string, unknown> | undefined> => {
  try { return (await import('../audio')) as unknown as Record<string, unknown>; } catch { return undefined; }
};
