// Blood and dirt on the lens: when a fight gets close (the hero hit, a monster cut down at arm's
// length, a troll's fists or a kraken arm hammering the deck) it lands on the camera glass.
// Painted like liquid, not ink: each impact is a dense core inside a thin translucent film with the
// darker rim drying blood leaves, a wet highlight while fresh, satellite droplets and streaks flung
// out from the hit. Heavy drops then run down the glass under gravity (stopping and starting,
// leaving thinning trails, a bead at the tip). Everything lands on a persistent "film" layer that
// slowly smears (soft blur, a slight downward creep), browns as it dries and wipes away.
// A 2D canvas at half resolution, only redrawn while something is on the glass.
interface Drip { x: number; y: number; w: number; v: number; stopT: number; left: number }
interface Fresh { x: number; y: number; r: number; t: number }

export class LensSplatter {
  private cv = document.createElement('canvas');
  private g = this.cv.getContext('2d')!;
  private film = document.createElement('canvas');
  private f = this.film.getContext('2d')!;
  private drips: Drip[] = [];
  private fresh: Fresh[] = [];
  private wet = 0;          // seconds of activity left (stops redrawing when the glass is clean)
  private smearT = 0;

  constructor() {
    this.cv.id = 'lensSplatter';
    this.cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9';
    document.body.appendChild(this.cv);
    const fit = () => {
      for (const c of [this.cv, this.film]) { c.width = Math.round(innerWidth * 0.5); c.height = Math.round(innerHeight * 0.5); }
    };
    addEventListener('resize', fit); fit();
  }

  /** `amount` 0…1: how much lands (more drops, bigger). Blood favours the edges of the frame. */
  hit(kind: 'blood' | 'dirt', amount = 0.5) {
    const W = this.cv.width, H = this.cv.height, k = W / 960;
    const n = Math.round(1 + amount * (kind === 'blood' ? 1.5 : 3));
    for (let i = 0; i < n; i++) {
      // Never over the action: the outer fifth of the frame, mostly the sides.
      const x = (Math.random() < 0.5 ? Math.random() * 0.2 : 1 - Math.random() * 0.2) * W;
      const y = (0.05 + Math.random() * 0.8) * H;
      const big = kind === 'blood' && Math.random() < 0.25;   // now and then a heavy one
      const r = (kind === 'blood' ? (big ? 12 + Math.random() * 14 : 4 + Math.random() * 10) : 3 + Math.random() * 7) * (0.6 + amount) * k;
      if (kind === 'blood') this.bloodImpact(x, y, r); else this.dirtImpact(x, y, r);
    }
    this.wet = 6;
  }

  private bloodImpact(x: number, y: number, r: number) {
    const f = this.f;
    // Thin film around the drop: translucent, fading out.
    let gr = f.createRadialGradient(x, y, r * 0.3, x, y, r * 1.35);
    gr.addColorStop(0, 'rgba(120,4,6,0.55)'); gr.addColorStop(0.6, 'rgba(110,6,8,0.22)'); gr.addColorStop(1, 'rgba(90,0,0,0)');
    f.fillStyle = gr; this.blob(f, x, y, r * 1.35, 0.18);
    // Dense core, darkest where it's thickest.
    gr = f.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.1, x, y, r);
    gr.addColorStop(0, 'rgba(70,0,2,0.95)'); gr.addColorStop(0.7, 'rgba(105,2,6,0.9)'); gr.addColorStop(1, 'rgba(120,8,10,0.65)');
    f.fillStyle = gr; this.blob(f, x, y, r, 0.12);
    // Drying rim.
    f.strokeStyle = 'rgba(55,0,0,0.55)'; f.lineWidth = Math.max(0.8, r * 0.07); this.blob(f, x, y, r, 0.12, true);
    // Spray: satellite drops and outward streaks.
    const sprays = 4 + Math.floor(Math.random() * 7);
    for (let s = 0; s < sprays; s++) {
      const a = Math.random() * Math.PI * 2, d = r * (1.2 + Math.random() * 1.8), sr = Math.max(0.6, r * (0.04 + Math.random() * 0.14));
      const sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d;
      f.fillStyle = `rgba(${95 + Math.random() * 30},2,6,${0.6 + Math.random() * 0.35})`;
      f.beginPath(); f.ellipse(sx, sy, sr * (1.6 + Math.random() * 2.2), sr, a, 0, Math.PI * 2); f.fill();
    }
    // Heavy drops run.
    const runs = Math.random() < 0.85 ? 1 + Math.floor(Math.random() * 3) : 0;
    for (let d = 0; d < runs; d++) this.drips.push({ x: x + (Math.random() - 0.5) * r * 1.1, y: y + r * 0.6, w: Math.max(1.2, r * (0.12 + Math.random() * 0.12)), v: 25 + Math.random() * 45, stopT: 0, left: r * (2.5 + Math.random() * 4.5) });
    this.fresh.push({ x, y, r, t: 0 });
  }

  private dirtImpact(x: number, y: number, r: number) {
    const f = this.f;
    for (let s = 0; s < 10 + Math.random() * 14; s++) {
      const a = Math.random() * Math.PI * 2, d = r * Math.random() * 2.2, sr = Math.max(0.6, r * (0.06 + Math.random() * 0.25));
      f.fillStyle = `rgba(${60 + Math.random() * 25},${50 + Math.random() * 18},${38 + Math.random() * 12},${0.45 + Math.random() * 0.45})`;
      f.beginPath(); f.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, sr * 1.3, sr, a, 0, Math.PI * 2); f.fill();
    }
  }

  /** An irregular, lobed liquid outline. */
  private blob(g: CanvasRenderingContext2D, x: number, y: number, r: number, wobble: number, stroke = false) {
    g.beginPath();
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI * 2, w = 1 + wobble * (Math.sin(a * 3 + x) + 0.6 * Math.sin(a * 5 + y) + 0.4 * Math.sin(a * 9 + x * 0.3));
      const px = x + Math.cos(a) * r * w, py = y + Math.sin(a) * r * w;
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    if (stroke) g.stroke(); else g.fill();
  }

  update(dt: number) {
    if (this.wet <= 0) return;
    this.wet -= dt;
    const { g, f } = this;
    const W = this.cv.width, H = this.cv.height;
    // Runnels: gravity with surface tension, stopping and starting, thinning as they lose blood.
    for (let i = this.drips.length - 1; i >= 0; i--) {
      const d = this.drips[i];
      if (d.stopT > 0) { d.stopT -= dt; continue; }
      const step = d.v * dt;
      f.fillStyle = 'rgba(100,2,6,0.85)';
      f.fillRect(d.x - d.w / 2, d.y, d.w, step + 0.5);
      d.y += step; d.left -= step; d.w *= 1 - dt * 0.12; d.x += (Math.random() - 0.5) * 0.4;
      if (Math.random() < dt * 0.8) { d.stopT = 0.15 + Math.random() * 0.5; d.v *= 0.75; }
      if (d.left <= 0 || d.w < 0.7 || d.y > H) {
        f.beginPath(); f.arc(d.x, d.y, d.w * 0.9, 0, Math.PI * 2); f.fill();       // the bead at the end
        this.drips.splice(i, 1);
      }
    }
    // The film smears and dries: a soft blur with a slight downward creep, browning, wiping away.
    this.smearT += dt;
    if (this.smearT > 0.12) {
      this.smearT = 0;
      f.save();
      f.globalAlpha = 0.5; f.filter = 'blur(0.8px)';
      f.drawImage(this.film, 0, 0.35);
      f.restore();
      f.save();
      f.globalCompositeOperation = 'source-atop'; f.fillStyle = 'rgba(60,24,10,0.025)'; f.fillRect(0, 0, W, H);   // oxidising to brown
      f.globalCompositeOperation = 'destination-out'; f.fillStyle = `rgba(0,0,0,${this.drips.length ? 0.03 : 0.06})`; f.fillRect(0, 0, W, H);
      f.restore();
    }
    // Compose: the film, plus a wet highlight on fresh drops.
    g.clearRect(0, 0, W, H);
    g.drawImage(this.film, 0, 0);
    for (let i = this.fresh.length - 1; i >= 0; i--) {
      const s = this.fresh[i];
      s.t += dt;
      const a = Math.max(0, 1 - s.t / 1.2) * 0.35;
      if (a <= 0) { this.fresh.splice(i, 1); continue; }
      g.fillStyle = `rgba(255,225,225,${a})`;
      g.beginPath(); g.ellipse(s.x - s.r * 0.3, s.y - s.r * 0.35, s.r * 0.26, s.r * 0.12, -0.6, 0, Math.PI * 2); g.fill();
    }
    if (this.wet <= 0) { f.clearRect(0, 0, W, H); g.clearRect(0, 0, W, H); this.drips.length = 0; this.fresh.length = 0; }
  }
}
