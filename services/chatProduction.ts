import { eligibleProductionParticipants, talkingHeadLayout, publishProductionFeed, removeProductionFeed, type ProductionParticipant } from './productionFeeds';
import type { Show, Slide } from './ambo/showModel';

/** Producer-owned canvas + audio graph. Never stops or mutates RTC-owned tracks. */
export class ChatProduction {
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private audio = new AudioContext();
  private destination = this.audio.createMediaStreamDestination();
  private entries = new Map<string, { participant: ProductionParticipant; video: HTMLVideoElement; audio?: MediaStreamAudioSourceNode; stream: MediaStream }>();
  private output: MediaStream;
  private raf = 0;
  private stopped = false;
  constructor(private roomId: string, private label: string) {
    this.canvas.width = 1920; this.canvas.height = 1080;
    this.ctx = this.canvas.getContext('2d')!;
    this.output = this.canvas.captureStream(30);
    this.destination.stream.getAudioTracks().forEach(t => this.output.addTrack(t));
    publishProductionFeed({ id: this.groupId, label: `${label} · Group`, stream: this.output, kind: 'chat' });
    void this.audio.resume();
    this.draw();
  }
  get groupId() { return `chat:${this.roomId}:group`; }
  update(participants: ProductionParticipant[]): void {
    if (this.stopped) return;
    const eligible = eligibleProductionParticipants(participants);
    const ids = new Set(eligible.map(p => p.id));
    for (const [id, entry] of this.entries) {
      const current = eligible.find(p => p.id === id);
      if (!ids.has(id) || current?.stream !== entry.participant.stream) {
        entry.audio?.disconnect(); entry.video.srcObject = null;
        removeProductionFeed(`chat:${this.roomId}:${id}`);
        this.entries.delete(id);
      }
    }
    for (const participant of eligible) {
      if (this.entries.has(participant.id)) continue;
      // Borrow the actual tracks so mute/camera-off changes remain authoritative.
      // Track.clone() would have an independent enabled flag and could bypass call mute.
      const stream = new MediaStream(participant.stream.getTracks());
      const video = document.createElement('video');
      video.muted = true; video.autoplay = true; video.playsInline = true; video.srcObject = stream;
      void video.play().catch(() => {});
      let audio: MediaStreamAudioSourceNode | undefined;
      if (stream.getAudioTracks().length) { audio = this.audio.createMediaStreamSource(stream); audio.connect(this.destination); }
      this.entries.set(participant.id, { participant, video, audio, stream });
      publishProductionFeed({ id: `chat:${this.roomId}:${participant.id}`, label: `${this.label} · ${participant.name}`, stream, kind: 'chat' });
    }
    // Repaint synchronously on revocation; no stale moderator frame survives the update.
    this.paint();
  }
  private paint() {
    const ctx = this.ctx;
    ctx.fillStyle = '#080b12'; ctx.fillRect(0, 0, 1920, 1080);
    const entries = [...this.entries.values()]; const layout = talkingHeadLayout(entries.length);
    entries.forEach((entry, i) => {
      const r = layout[i]; const x = r.x * 1920 + 12, y = r.y * 1080 + 12, w = r.w * 1920 - 24, h = r.h * 1080 - 24;
      ctx.fillStyle = '#172033'; ctx.fillRect(x, y, w, h);
      if (entry.video.readyState >= 2 && entry.video.videoWidth) {
        const scale = Math.max(w / entry.video.videoWidth, h / entry.video.videoHeight);
        const sw = w / scale, sh = h / scale;
        ctx.drawImage(entry.video, (entry.video.videoWidth - sw) / 2, (entry.video.videoHeight - sh) / 2, sw, sh, x, y, w, h);
      }
      ctx.fillStyle = '#000b'; ctx.fillRect(x, y + h - 56, w, 56);
      ctx.fillStyle = '#fff'; ctx.font = '24px sans-serif'; ctx.fillText(entry.participant.name, x + 20, y + h - 19, w - 40);
    });
  }
  private draw = () => { if (this.stopped) return; this.paint(); this.raf = requestAnimationFrame(this.draw); };
  show(): Show {
    const slide = (id: string, label: string): Slide => ({ id: `slide_${id}`, label, layers: [{ id: `live_${id}`, slot: 'slide', content: { kind: 'LIVE', inputId: id, label, fit: 'contain' } }] });
    return { id: `chat_show_${this.roomId}`, title: `${this.label} · Live call`, kind: 'PRESENTATION', slides: [slide(this.groupId, 'Group'), ...[...this.entries.values()].map(e => slide(`chat:${this.roomId}:${e.participant.id}`, e.participant.name))] };
  }
  dispose(): void {
    if (this.stopped) return;
    this.update([]); this.stopped = true;
    cancelAnimationFrame(this.raf); removeProductionFeed(this.groupId);
    this.output.getTracks().forEach(t => t.stop()); void this.audio.close();
  }
}
