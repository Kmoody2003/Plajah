import { FrameRequests } from './frameRequests';

let activeWorkers = 0;
const MAX_WORKERS = 2;
export function indexedVideoAvailable() { return typeof Worker !== 'undefined' && typeof VideoDecoder !== 'undefined'; }
export function indexedVideoDiagnostics() { return { activeWorkers, maxWorkers: MAX_WORKERS }; }

/** Browser adapter: worker-owned demux/decode, transferred frames, bounded demand. */
export class IndexedVideo {
  private worker: Worker;
  private requests: FrameRequests<VideoFrame>;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private alive = true;
  private ready = false;
  private lastRequest: {time:number; seek:boolean} | null = null;
  constructor(source: {blob?: Blob; url?: string}, onFrame: (frame: VideoFrame, time: number) => void, onError: (error: Error) => void,
    createWorker = () => new Worker(new URL('./indexedVideo.worker.ts', import.meta.url), {type:'module'})) {
    if (activeWorkers >= MAX_WORKERS) throw new Error('Indexed decoder budget in use');
    this.worker = createWorker(); activeWorkers++;
    const fail = (message: string) => { if (this.alive) { this.dispose(); onError(new Error(message)); } };
    const arm = () => { if (this.timer) clearTimeout(this.timer); this.timer = setTimeout(()=>fail('Indexed decoder timed out'),15000); };
    this.requests = new FrameRequests((id,time)=>{ try { arm(); this.worker.postMessage({type:'frame',id,time}); } catch(error) { fail(String(error)); } },onFrame);
    this.worker.onmessage = event => {
      const m=event.data;
      if (!this.alive) { m.frame?.close(); return; }
      if (this.timer) clearTimeout(this.timer);
      if (m.type==='error') { fail(m.message); return; }
      if (m.type==='ready') { this.ready=true; if(this.lastRequest) this.requests.request(this.lastRequest.time,this.lastRequest.seek); }
      else if (m.type==='frame') { try { this.requests.receive(m.id,m.frame); } catch(error) { fail(error instanceof Error ? error.message : String(error)); } }
    };
    this.worker.onerror = event => { event.preventDefault(); fail(event.message || 'Indexed worker failed'); };
    try { arm(); this.worker.postMessage({type:'open',...source}); } catch(error) { fail(String(error)); }
  }
  request(time: number, seek = false) {
    if (!this.alive) return;
    this.lastRequest={time,seek}; if(this.ready) this.requests.request(time,seek);
  }
  dispose() {
    if (!this.alive) return; this.alive=false;
    if(this.timer) clearTimeout(this.timer);
    this.requests?.dispose(); this.worker.terminate(); activeWorkers--;
  }
}
