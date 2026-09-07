/** One in-flight decode plus the most recent demand. Seeks invalidate old results. */
export class FrameRequests<T extends { close(): void }> {
  private id = 0;
  private epoch = 0;
  private active: {id: number; epoch: number; time: number} | null = null;
  private pending: number | null = null;
  private disposed = false;
  constructor(private send: (id: number, time: number) => void, private present: (frame: T, time: number) => void) {}
  request(time: number, discontinuity = false) {
    if (this.disposed || !Number.isFinite(time)) return;
    if (discontinuity) this.epoch++;
    this.pending = Math.max(0,time); this.pump();
  }
  private pump() {
    if (this.active || this.pending === null || this.disposed) return;
    this.active = {id: ++this.id, epoch: this.epoch, time: this.pending}; this.pending = null;
    this.send(this.active.id, this.active.time);
  }
  receive(id: number, frame: T | null) {
    const active = this.active;
    if (!active || active.id !== id) { frame?.close(); return; }
    this.active = null;
    try { if (frame && !this.disposed && active.epoch === this.epoch) this.present(frame, active.time); }
    finally { frame?.close(); this.pump(); }
  }
  dispose() { this.disposed = true; this.epoch++; this.pending = null; }
}
