// Combo comic: when a combo lands its third hit (or a finisher kills), the last three hits pop
// up as a slanted, inked three-panel comic strip over the action — halftone, heavy borders and
// SFX lettering — then fade. The game camera never leaves the fight; the panels are snapshots
// of what it actually saw at each hit.
const W = 480, H = 270;
const WORDS = ['SLASH!', 'KRAK!', 'THWACK!', 'SHNK!', 'KA-CHUNK!', 'SKREEE!'];

export class ComboComic {
  private el = document.createElement('div');
  private shots: { c: HTMLCanvasElement; word: string }[] = [];
  private pending: string | null = null;
  private cooldown = 0;
  private hideAt = 0;

  constructor() {
    this.el.id = 'comboComic';
    this.el.innerHTML = [0, 1, 2].map((i) => `<div class="cc-panel p${i}"><canvas width="${W}" height="${H}"></canvas><i class="cc-dots"></i><b></b></div>`).join('');
    document.body.appendChild(this.el);
  }

  /** A hit landed: snapshot the next rendered frame (with this SFX word, or a random one). */
  hit(word?: string) { this.pending = word ?? WORDS[Math.floor(Math.random() * WORDS.length)]; }

  /** Call right after each frame is rendered (same task, so the canvas still holds the image). */
  afterRender(src: HTMLCanvasElement, now: number) {
    if (this.hideAt && now > this.hideAt) { this.el.classList.remove('on'); this.hideAt = 0; }
    if (!this.pending || !src.width) return;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    // Crop around Jack: centred horizontally, low in the frame (the follow camera sits above him).
    const cw = src.width * 0.55, ch = Math.min(src.height, cw * H / W);
    const y = Math.min(src.height - ch, Math.max(0, src.height * 0.62 - ch / 2));
    c.getContext('2d')!.drawImage(src, (src.width - cw) / 2, y, cw, ch, 0, 0, W, H);
    this.shots.push({ c, word: this.pending });
    if (this.shots.length > 3) this.shots.shift();
    this.pending = null;
  }

  /** The combo connected: show the strip (rate-limited so it never gets in the way). */
  show(finale = 'FINISH!') {
    const now = performance.now();
    if (now < this.cooldown || this.shots.length < 3) return;
    this.cooldown = now + 6000;
    const panels = this.el.querySelectorAll('.cc-panel');
    this.shots.forEach((s, i) => {
      const p = panels[i];
      p.querySelector('canvas')!.getContext('2d')!.drawImage(s.c, 0, 0);
      p.querySelector('b')!.textContent = i === 2 ? finale : s.word;
    });
    this.el.classList.remove('on');
    void this.el.offsetWidth;            // restart the slam-in animation
    this.el.classList.add('on');
    this.hideAt = now + 1700;
    this.shots = [];
  }
}
