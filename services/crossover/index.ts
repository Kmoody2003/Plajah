import type {
  ConvertProgress,
  ConvertResult,
  MediaProbe,
  Recipe,
  SourceFile,
  Backend,
} from './types';
import {
  buildCommandPreview,
  buildFfmpegArgs,
  chooseBackend,
  type CrossoverEngine,
} from './engine';
import { ClientEngine } from './clientEngine';
import { ServerEngine } from './serverEngine';

// ─────────────────────────────────────────────────────────────────────────
// Public entry for the Crossover engine. The routed engine picks client vs
// server per job; all three Plajah consumers (standalone app, Fabula, Asset
// Manager) import from here.
// ─────────────────────────────────────────────────────────────────────────

const client = new ClientEngine();
const server = new ServerEngine();

class RoutedEngine implements CrossoverEngine {
  buildCommandPreview = buildCommandPreview;

  /** Which backend a given job would use — for honest UI labeling. */
  backendFor(source: SourceFile, recipe: Recipe): Backend {
    return chooseBackend(source, recipe);
  }

  async probe(source: SourceFile): Promise<MediaProbe> {
    // Local files probe instantly in-browser; remote sources use ffprobe.
    if (source.file && client.available()) return client.probe(source);
    return server.probe(source);
  }

  async convert(
    source: SourceFile,
    recipe: Recipe,
    onProgress: (p: ConvertProgress) => void,
    signal?: AbortSignal,
  ): Promise<ConvertResult> {
    const backend = chooseBackend(source, recipe);
    const engine = backend === 'client' && client.available() ? client : server;
    return engine.convert(source, recipe, onProgress, signal);
  }
}

export const crossover = new RoutedEngine();

export * from './types';
export * from './formats';
export { buildFfmpegArgs, buildCommandPreview, chooseBackend };
export type { CrossoverEngine };
