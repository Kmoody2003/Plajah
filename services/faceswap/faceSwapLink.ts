/**
 * faceSwapLink.ts
 *
 * Client for the local facelab face-swap sidecar (C:\Users\Kenne\facelab\swap_server.py):
 * InsightFace + inswapper on the PC's NVIDIA GPU, reached over a loopback WebSocket.
 *
 * INTERNAL ONLY. The inswapper / buffalo_l weights are non-commercial research licences,
 * so this only lights up on a machine that is running the sidecar; fans never see it.
 *
 * One frame in flight at a time: pushFrame() drops frames while the GPU is busy, and the
 * newest swapped frame is kept as an ImageBitmap for the render loop to draw.
 */

export const FACE_SWAP_URL = 'ws://127.0.0.1:8765';

type Reply = { op: string; id: number; ok: boolean; error?: string; [k: string]: unknown };

export class FaceSwapLink {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, (r: Reply) => void>();
  private busy = false;
  private encoder: HTMLCanvasElement | null = null;
  /** Newest swapped frame and when it arrived (performance.now()). */
  latest: ImageBitmap | null = null;
  latestAt = 0;
  providers: string[] = [];

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Resolves false (never throws) when no sidecar is listening. */
  connect(url = FACE_SWAP_URL, timeoutMs = 1500): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      };
      const timer = setTimeout(() => {
        ws.close();
        done(false);
      }, timeoutMs);
      const ws = new WebSocket(url);
      ws.binaryType = 'blob';
      ws.onopen = async () => {
        this.ws = ws;
        const hello = await this.call({ op: 'hello' });
        this.providers = (hello.providers as string[]) || [];
        done(hello.ok);
      };
      ws.onerror = () => done(false);
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        this.busy = false;
        this.pending.forEach((cb) => cb({ op: 'closed', id: 0, ok: false, error: 'disconnected' }));
        this.pending.clear();
        done(false);
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          const reply = JSON.parse(ev.data) as Reply;
          this.pending.get(reply.id)?.(reply);
          this.pending.delete(reply.id);
          return;
        }
        createImageBitmap(ev.data as Blob)
          .then((bmp) => {
            this.latest?.close();
            this.latest = bmp;
            this.latestAt = performance.now();
          })
          .catch(() => {})
          .finally(() => {
            this.busy = false;
          });
      };
    });
  }

  private call(msg: Record<string, unknown>): Promise<Reply> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.resolve({ op: String(msg.op), id: 0, ok: false, error: 'not connected' });
    }
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      ws.send(JSON.stringify({ ...msg, id }));
    });
  }

  /** How many faces the sidecar finds in each image (web paths under /public). */
  async scan(paths: string[]): Promise<Record<string, number>> {
    const r = await this.call({ op: 'scan', paths });
    return r.ok ? (r.faces as Record<string, number>) : {};
  }

  setSource(path: string): Promise<Reply> {
    return this.call({ op: 'source', path });
  }

  clearSource(): Promise<Reply> {
    this.latest?.close();
    this.latest = null;
    return this.call({ op: 'clear' });
  }

  /** Encode the current video frame and send it, unless the previous one is still on the GPU. */
  pushFrame(video: HTMLVideoElement, maxW = 640): void {
    const ws = this.ws;
    if (this.busy || !ws || ws.readyState !== WebSocket.OPEN || !video.videoWidth) return;
    const s = Math.min(1, maxW / video.videoWidth);
    const w = Math.round(video.videoWidth * s);
    const h = Math.round(video.videoHeight * s);
    const c = (this.encoder ??= document.createElement('canvas'));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    c.getContext('2d')?.drawImage(video, 0, 0, w, h);
    this.busy = true;
    c.toBlob(
      (blob) => {
        if (blob && ws.readyState === WebSocket.OPEN) ws.send(blob);
        else this.busy = false;
      },
      'image/jpeg',
      0.82
    );
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
    this.latest?.close();
    this.latest = null;
  }
}
