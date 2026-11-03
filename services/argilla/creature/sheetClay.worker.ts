// Carves a character sheet into clay off the main thread.
import { sheetToClay, type SheetView } from './sheetClay';

self.onmessage = ({ data }: MessageEvent<{ mask: Float32Array; size: number; aspect: number; views: SheetView[]; grid: number; band: number }>) => {
  try {
    const field = sheetToClay(data.mask, data.size, data.aspect, data.views, { grid: data.grid, band: data.band });
    (self as unknown as Worker).postMessage({ field }, [field.states.buffer, field.cells.buffer, field.values.buffer]);
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Could not read this sheet.' });
  }
};
