// Understands and builds off the main thread: several trial builds and their checks take seconds.
import { build, type BuildOptions, type ImageReading } from './reconstruct';

self.onmessage = ({ data }: MessageEvent<{ reading: ImageReading; options: Omit<BuildOptions, 'onProgress'> }>) => {
  try {
    const result = build(data.reading, { ...data.options, onProgress: (fraction, label) => self.postMessage({ fraction, label }) });
    const f = result.field;
    (self as unknown as Worker).postMessage({ result }, [f.states.buffer, f.cells.buffer, f.values.buffer]);
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Could not build from this picture.' });
  }
};
