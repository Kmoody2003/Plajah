// teleprompterCanvasSource — the teleprompter as a live VIDEO source.
//
// The talent PrompterScreen is DOM (can't be captureStream'd), but the Operator
// Console broadcasts the full scroll state over the same-origin `teleprompter_sync`
// BroadcastChannel. This mirrors that state onto a <canvas> and exposes
// canvas.captureStream() — so the TV Studio switcher can take the teleprompter as a
// source and route it to aux/confidence outs. One operator drives both the talent
// window AND this switcher feed.

type Theme = 'dark' | 'light' | 'amber' | 'cobalt';

const THEME_COLORS: Record<Theme, { bg: string; fg: string; accent: string }> = {
  dark:   { bg: '#0a0a0b', fg: '#f4f4f5', accent: '#FF8C00' },
  light:  { bg: '#fafafa', fg: '#18181b', accent: '#c2410c' },
  amber:  { bg: '#1a1206', fg: '#fcd34d', accent: '#f59e0b' },
  cobalt: { bg: '#0a1024', fg: '#dbeafe', accent: '#3b82f6' },
};

export class TeleprompterCanvasSource {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private channel: BroadcastChannel;
  private raf = 0;
  private disposed = false;

  // Mirrored state from the operator
  private content = '# [No Script]\nOpen the Teleprompter and start a script.';
  private title = 'Teleprompter';
  private scrollPercent = 0;
  private targetPercent = 0;
  private fontSize = 48;
  private lineHeight = 1.5;
  private alignment: CanvasTextAlign = 'left';
  private theme: Theme = 'dark';
  private margin = 0.1;   // 0..1 fraction

  constructor(width = 1280, height = 720) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;
    this.channel = new BroadcastChannel('teleprompter_sync');
    this.channel.onmessage = (e) => this.onSync(e.data);
    // Ask the operator to push current state.
    try { this.channel.postMessage({ type: 'PING', sender: 'prompter' }); } catch { /* */ }
    this.loop();
  }

  /** A MediaStream of the live teleprompter — hand this to the switcher. */
  captureStream(fps = 30): MediaStream {
    return (this.canvas as any).captureStream(fps);
  }

  private onSync(msg: any) {
    if (!msg) return;
    if (msg.type === 'STATE_UPDATE') {
      this.content = msg.scriptContent ?? this.content;
      this.title = msg.title ?? this.title;
      if (msg.state) this.targetPercent = msg.state.scrollPercent ?? this.targetPercent;
      const s = msg.settings || {};
      if (typeof s.fontSize === 'number') this.fontSize = s.fontSize;
      if (typeof s.lineHeight === 'number') this.lineHeight = s.lineHeight;
      if (s.alignment) this.alignment = (s.alignment === 'justify' ? 'left' : s.alignment) as CanvasTextAlign;
      if (s.theme) this.theme = s.theme as Theme;
      if (typeof s.marginWidth === 'number') this.margin = Math.min(0.4, s.marginWidth / 100);
    } else if (msg.type === 'SCROLL_TO_PERCENT') {
      this.targetPercent = msg.percent ?? this.targetPercent;
    }
  }

  private wrap(text: string, maxWidth: number): { text: string; heading: boolean }[] {
    const out: { text: string; heading: boolean }[] = [];
    for (const raw of text.split('\n')) {
      const heading = /^#|^\[.*\]$/.test(raw.trim());
      const line = raw.replace(/^#+\s*/, '').replace(/^\[|\]$/g, '');
      if (!line.trim()) { out.push({ text: '', heading: false }); continue; }
      const words = line.split(/\s+/);
      let cur = '';
      for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (this.ctx.measureText(test).width > maxWidth && cur) { out.push({ text: cur, heading }); cur = w; }
        else cur = test;
      }
      if (cur) out.push({ text: cur, heading });
    }
    return out;
  }

  private loop = () => {
    if (this.disposed) return;
    const { width: W, height: H } = this.canvas;
    const c = THEME_COLORS[this.theme];
    // ease toward target scroll
    this.scrollPercent += (this.targetPercent - this.scrollPercent) * 0.15;

    this.ctx.fillStyle = c.bg;
    this.ctx.fillRect(0, 0, W, H);

    const pad = W * this.margin;
    const maxW = W - pad * 2;
    const lh = this.fontSize * this.lineHeight;
    this.ctx.textBaseline = 'top';
    this.ctx.textAlign = this.alignment;
    this.ctx.font = `600 ${this.fontSize}px "Space Grotesk", Inter, system-ui, sans-serif`;

    const lines = this.wrap(this.content, maxW);
    const totalH = lines.length * lh;
    const scrollable = Math.max(0, totalH - H * 0.5);
    const offsetY = H * 0.4 - (this.scrollPercent / 100) * scrollable;

    const x = this.alignment === 'center' ? W / 2 : this.alignment === 'right' ? W - pad : pad;
    lines.forEach((ln, i) => {
      const y = offsetY + i * lh;
      if (y < -lh || y > H + lh) return;
      this.ctx.fillStyle = ln.heading ? c.accent : c.fg;
      this.ctx.globalAlpha = ln.heading ? 1 : 0.95;
      this.ctx.fillText(ln.text, x, y);
    });
    this.ctx.globalAlpha = 1;

    // Reading-line guide
    this.ctx.strokeStyle = c.accent + '55';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, H * 0.4);
    this.ctx.lineTo(W, H * 0.4);
    this.ctx.stroke();

    this.raf = requestAnimationFrame(this.loop);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    try { this.channel.close(); } catch { /* */ }
  }
}
