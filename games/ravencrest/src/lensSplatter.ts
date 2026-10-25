// Blood and dirt on the lens: when a fight gets close (the hero hit, a monster cut down at arm's
// length, a troll's fists or a kraken arm hammering the deck) it lands on the camera glass.
// Each drop is its own small body of liquid, not paint on a film: it lands near the edge of the
// frame, sits while surface tension holds it, then (if it's heavy enough) slides down the glass in
// stick-slip steps, leaving a thinning trail and losing volume until it beads and stops. Every drop
// and trail fades on its own clock, and there is a hard cap on how many can be on the glass, so a
// long fight can never paint over the view. Redrawn from scratch each frame while anything's left.
// A 2D canvas at half resolution.
interface Drop {
  x: number; y: number;
  vol: number;          // radius-equivalent volume (px at half res); shrinks as it leaves a trail
  vy: number;           // current slide speed
  hold: number;         // seconds surface tension still holds it in place
  age: number; life: number;
  blood: boolean;
  tone: number;         // 0…1 colour jitter
  last: { x: number; y: number } | null;   // where the trail last ended
}
interface Trail { x0: number; y0: number; x1: number; y1: number; w: number; age: number; life: number; blood: boolean }

const MAX_DROPS = 26;
const MAX_TRAILS = 220;

export class LensSplatter {
  private cv = document.createElement('canvas');
  private g = this.cv.getContext('2d')!;
  private drops: Drop[] = [];
  private trails: Trail[] = [];
  private dirty = false;

  constructor() {
    this.cv.id = 'lensSplatter';
    this.cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9';
    document.body.appendChild(this.cv);
    const fit = () => { this.cv.width = Math.round(innerWidth * 0.5); this.cv.height = Math.round(innerHeight * 0.5); };
    addEventListener('resize', fit); fit();
  }

  /** `amount` 0…1: how much lands. Blood stays out of the middle of the frame. */
  hit(kind: 'blood' | 'dirt', amount = 0.5) {
    const W = this.cv.width, H = this.cv.height, k = Math.min(W, H) / 540;
    const blood = kind === 'blood';
    const n = Math.round((blood ? 1 : 2) + amount * (blood ? 2 : 3));
    for (let i = 0; i < n; i++) {
      // A cluster around one impact point in the outer quarter of the frame, mostly the sides.
      const side = Math.random();
      const cx = side < 0.42 ? Math.random() * 0.22 * W : side < 0.84 ? (1 - Math.random() * 0.22) * W : (0.25 + Math.random() * 0.5) * W;
      const cy = side < 0.84 ? (0.08 + Math.random() * 0.7) * H : (Math.random() < 0.5 ? 0.04 + Math.random() * 0.12 : 0.84 + Math.random() * 0.1) * H;
      const heavy = blood && Math.random() < 0.22;
      const vol = (heavy ? 5 + Math.random() * 4 : 1.6 + Math.random() * 3) * (0.7 + amount * 0.6) * k;
      this.add(cx, cy, vol, blood);
      // Fine satellite droplets flung from the impact.
      const sats = blood ? 2 + Math.floor(Math.random() * 4) : 3 + Math.floor(Math.random() * 4);
      for (let s = 0; s < sats; s++) {
        const a = Math.random() * Math.PI * 2, d = vol * (2 + Math.random() * 3);
        this.add(cx + Math.cos(a) * d, cy + Math.sin(a) * d, vol * (0.15 + Math.random() * 0.25), blood);
      }
    }
    this.dirty = true;
  }

  private add(x: number, y: number, vol: number, blood: boolean) {
    // Over the cap, the oldest drops make room (they were nearly faded anyway).
    while (this.drops.length >= MAX_DROPS) this.drops.shift();
    this.drops.push({
      x, y, vol, vy: 0, blood,
      hold: 0.15 + Math.random() * 0.5,
      age: 0, life: (blood ? 3.2 : 2.4) + Math.random() * 2.8 + vol * 0.08,
      tone: Math.random(), last: null,
    });
  }

  update(dt: number) {
    if (!this.dirty) return;
    const { g } = this;
    const W = this.cv.width, H = this.cv.height, k = Math.min(W, H) / 540;
    // Physics: a drop only runs once it's heavy enough to beat surface tension; it slides in
    // stick-slip steps (viscosity), spending volume on its trail, and stops as a bead when spent.
    const RUN = 3.2 * k;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      if (d.age >= d.life || d.y > H + 10) { this.drops.splice(i, 1); continue; }
      if (!d.blood || d.vol < RUN) continue;
      if (d.hold > 0) { d.hold -= dt; d.vy = 0; continue; }
      const target = 18 * k + (d.vol - RUN) * 9;            // heavier runs faster
      d.vy += (target - d.vy) * Math.min(1, dt * 2.5);      // viscous: eases toward its speed
      const step = d.vy * dt;
      const x0 = d.x, y0 = d.y;
      d.y += step;
      d.x += Math.sin(d.y * 0.09 + d.tone * 6) * 0.08 * k;   // a slight meander down the glass
      d.vol -= step * 0.045;                                 // the trail costs volume
      if (Math.random() < dt * 1.1) { d.hold = 0.12 + Math.random() * 0.45; d.vy *= 0.3; }   // snags on the glass
      if (this.trails.length < MAX_TRAILS && step > 0) {
        this.trails.push({ x0, y0, x1: d.x, y1: d.y, w: Math.max(0.6, d.vol * 0.55), age: 0, life: 1.6 + Math.random() * 1.4, blood: true });
      }
    }
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i];
      t.age += dt;
      if (t.age >= t.life) this.trails.splice(i, 1);
    }

    g.clearRect(0, 0, W, H);
    g.lineCap = 'round';
    // Trails first: thin translucent smears that thin and fade behind each runner.
    for (const t of this.trails) {
      const a = (1 - t.age / t.life) * 0.5;
      g.strokeStyle = `rgba(92,4,8,${a})`;
      g.lineWidth = t.w * (1 - 0.5 * t.age / t.life);
      g.beginPath(); g.moveTo(t.x0, t.y0); g.lineTo(t.x1, t.y1); g.stroke();
    }
    for (const d of this.drops) {
      // Fades out over the last 40% of its life; fresh drops are glossier.
      const fade = Math.min(1, (d.life - d.age) / (d.life * 0.4));
      const r = Math.max(0.5, d.vol);
      const running = d.vy > 1;
      const sx = running ? r * 0.85 : r, sy = running ? r * 1.25 : r;   // a runner stretches downward
      if (d.blood) {
        const gr = g.createRadialGradient(d.x - r * 0.25, d.y - r * 0.3, r * 0.1, d.x, d.y, Math.max(sx, sy));
        const deep = 60 + d.tone * 25;
        gr.addColorStop(0, `rgba(${deep},0,3,${0.92 * fade})`);
        gr.addColorStop(0.75, `rgba(${deep + 45},4,8,${0.85 * fade})`);
        gr.addColorStop(1, `rgba(${deep + 35},2,6,${0.35 * fade})`);
        g.fillStyle = gr;
      } else {
        g.fillStyle = `rgba(${58 + d.tone * 22},${48 + d.tone * 14},${36 + d.tone * 10},${0.7 * fade})`;
      }
      g.beginPath(); g.ellipse(d.x, d.y, sx, sy, 0, 0, Math.PI * 2); g.fill();
      // Wet highlight: the glass catches light on fresh blood.
      if (d.blood && r > 1.4) {
        const shine = Math.max(0, 1 - d.age / 1.5) * 0.4 * fade;
        if (shine > 0.01) {
          g.fillStyle = `rgba(255,220,220,${shine})`;
          g.beginPath(); g.ellipse(d.x - sx * 0.3, d.y - sy * 0.35, sx * 0.28, sy * 0.14, -0.5, 0, Math.PI * 2); g.fill();
        }
      }
    }
    if (!this.drops.length && !this.trails.length) { g.clearRect(0, 0, W, H); this.dirty = false; }
  }
}
