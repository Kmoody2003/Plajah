import { Input, ALL_FORMATS, BlobSource, UrlSource, VideoSampleSink, type VideoSample } from 'mediabunny';

let input: Input | null = null, sink: VideoSampleSink | null = null;
let iterator: AsyncGenerator<VideoSample, void, unknown> | null = null;
let current: VideoSample | null = null, next: VideoSample | null = null;
let firstTime = 0;
async function clearFrames() {
  current?.close(); next?.close(); current = next = null;
  await iterator?.return(); iterator = null;
}
async function frameAt(time: number) {
  if (!sink) throw new Error('Source not open');
  const target = Math.max(0, time) + firstTime;
  if (!iterator || !current || target < current.timestamp || target - current.timestamp > 0.5) {
    await clearFrames(); iterator = sink.samples(target);
    current = (await iterator.next()).value || null;
    next = (await iterator.next()).value || null;
  }
  while (next && next.timestamp <= target) {
    current?.close(); current = next;
    next = (await iterator!.next()).value || null;
  }
  return current?.toVideoFrame() || null;
}

// Client permits one outstanding request. Serial processing prevents decoder races.
let chain = Promise.resolve();
self.onmessage = (event: MessageEvent) => {
  const message = event.data;
  chain = chain.then(async () => {
    if (message.type === 'open') {
      await clearFrames(); input?.dispose();
      const source = message.blob ? new BlobSource(message.blob, { maxCacheSize: 8 * 1024 * 1024 })
        : new UrlSource(message.url, { maxCacheSize: 8 * 1024 * 1024, parallelism: 1, getRetryDelay: n => n < 2 ? 0.5 : null });
      input = new Input({ formats: ALL_FORMATS, source });
      const track = await input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode())) throw new Error('No supported indexed video decoder');
      if (await track.getRotation()) throw new Error('Rotated source uses compatibility playback');
      const color = await track.getColorSpace();
      // Canvas adapter currently targets SDR. Never silently label that path HDR.
      if (color.transfer && !['bt709', 'iec61966-2-1', 'smpte170m'].includes(color.transfer)) throw new Error('Unsupported transfer function uses compatibility renderer until float output migration');
      firstTime = await track.getFirstTimestamp();
      sink = new VideoSampleSink(track, { hardwareAcceleration: 'no-preference' });
      self.postMessage({ type: 'ready', color });
    } else if (message.type === 'frame') {
      const frame = await frameAt(message.time);
      if (frame) (self as any).postMessage({ type: 'frame', id: message.id, time: message.time, frame }, [frame]);
      else self.postMessage({type: 'frame', id: message.id, time: message.time, frame: null});
    }
  }).catch(error => {
    input?.dispose(); input = null; current?.close(); next?.close(); current = next = null;
    self.postMessage({type:'error',message:error instanceof Error ? error.message : String(error)});
  });
};
