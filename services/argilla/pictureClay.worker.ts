// Bakes a picture into clay off the main thread, so the page keeps painting through a few seconds of work.
import { PictureClayOptions, PictureMaps, pictureToClay } from './pictureClay';

self.onmessage = async ({ data }: MessageEvent<{ maps: PictureMaps; options: PictureClayOptions }>) => {
  try {
    const field = await pictureToClay(data.maps, data.options);
    (self as unknown as Worker).postMessage({ field }, [field.states.buffer, field.cells.buffer, field.values.buffer]);
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Could not shape the clay.' });
  }
};
