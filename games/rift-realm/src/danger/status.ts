// Status effects on the player from the world's dangers: poison (spores, toxic water, mantis venom), burn (lava, vents),
// slow (thorns, swamp water, deep water), shock (electrified fungi, storm bats, wasp plasma) and breath (under deep
// water). Each shows as a chip under the health bar and a tint at the screen's edge; damage ticks through `hurt`.

export type StatusKind = 'poison' | 'burn' | 'slow' | 'shock';
const LOOK: Record<StatusKind, { label: string; col: string; dps: number }> = {
  poison: { label: 'POISONED', col: '#9be03a', dps: 4 },
  burn: { label: 'BURNING', col: '#ff7a1a', dps: 8 },
  slow: { label: 'SLOWED', col: '#8fb3d9', dps: 0 },
  shock: { label: 'SHOCKED', col: '#4ee8ff', dps: 0 },
};

export class PlayerStatus {
  /** Seconds left on each effect. */
  private left: Record<StatusKind, number> = { poison: 0, burn: 0, slow: 0, shock: 0 };
  /** Strength of the current slow (0…1 of speed taken away). */
  private slowAmt = 0;
  /** Breath under deep water, seconds (refills on the surface). */
  breath = 8;
  readonly maxBreath = 8;
  submerged = false;
  private acc = 0;
  private hud: HTMLDivElement;
  private edge: HTMLDivElement;
  private chips = new Map<string, HTMLDivElement>();
  /** Timed effects from forage (danger/forage.ts): regen, haste, fury, shield, blur, lure — a chip with a countdown. */
  private buffs = new Map<string, { label: string; col: string; left: number }>();

  constructor() {
    this.hud = document.createElement('div');
    this.hud.style.cssText = 'position:fixed;left:24px;bottom:96px;z-index:12;display:flex;gap:6px;pointer-events:none;font:800 10px/1 system-ui,sans-serif;letter-spacing:.12em';
    this.edge = document.createElement('div');
    this.edge.style.cssText = 'position:fixed;inset:0;z-index:9;pointer-events:none;opacity:0;transition:opacity .25s';
    document.body.append(this.hud, this.edge);
  }

  apply(kind: StatusKind, seconds: number, slow = 0) {
    this.left[kind] = Math.max(this.left[kind], seconds);
    if (kind === 'slow') this.slowAmt = Math.max(this.slowAmt, slow);
    if (kind === 'shock') this.slowAmt = Math.max(this.slowAmt, 0.55);
  }

  has(kind: StatusKind) { return this.left[kind] > 0; }

  /** Start (or extend) a timed effect shown as a chip with seconds left. */
  buff(id: string, label: string, col: string, seconds: number) {
    const b = this.buffs.get(id);
    if (b) { b.left = Math.max(b.left, seconds); b.label = label; } else this.buffs.set(id, { label, col, left: seconds });
  }
  buffLeft(id: string) { return this.buffs.get(id)?.left ?? 0; }
  endBuff(id: string) { this.buffs.delete(id); }

  /** Movement multiplier for the player this frame. */
  get moveMul() { return this.left.slow > 0 || this.left.shock > 0 ? 1 - this.slowAmt : 1; }

  clear() { this.buffs.clear(); for (const k of Object.keys(this.left) as StatusKind[]) this.left[k] = 0; this.breath = this.maxBreath; this.submerged = false; }

  /** Ticks damage over time through `hurt` (whole points, twice a second). */
  update(dt: number, hurt: (dmg: number, why: StatusKind | 'drown') => void) {
    let dps = 0;
    for (const k of Object.keys(this.left) as StatusKind[]) if (this.left[k] > 0) { this.left[k] = Math.max(0, this.left[k] - dt); dps += LOOK[k].dps; }
    if (this.left.slow <= 0 && this.left.shock <= 0) this.slowAmt = 0;
    for (const [id, b] of this.buffs) { b.left -= dt; if (b.left <= 0) this.buffs.delete(id); }
    if (this.submerged) this.breath = Math.max(0, this.breath - dt); else this.breath = Math.min(this.maxBreath, this.breath + dt * 3);
    const drown = this.submerged && this.breath <= 0 ? 12 : 0;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.acc -= 0.5;
      if (dps > 0) hurt(Math.max(1, Math.round(dps * 0.5)), this.left.burn > 0 ? 'burn' : 'poison');
      if (drown) hurt(Math.round(drown * 0.5), 'drown');
    }
    this.draw();
  }

  private draw() {
    const want: [string, string, string][] = [];
    for (const k of Object.keys(this.left) as StatusKind[]) if (this.left[k] > 0) want.push([k, LOOK[k].label, LOOK[k].col]);
    if (this.submerged || this.breath < this.maxBreath - 0.05) {
      const n = Math.ceil((this.breath / this.maxBreath) * 6);
      want.push(['breath', `AIR ${'●'.repeat(n)}${'○'.repeat(6 - n)}`, this.breath < 2.5 ? '#fb7185' : '#7dd3fc']);
    }
    for (const [id, b] of this.buffs) want.push([`b-${id}`, `${b.label} ${Math.ceil(b.left)}s`, b.col]);
    const keep = new Set(want.map((w) => w[0]));
    for (const [k, el] of this.chips) if (!keep.has(k)) { el.remove(); this.chips.delete(k); }
    for (const [k, label, col] of want) {
      let el = this.chips.get(k);
      if (!el) { el = document.createElement('div'); el.style.cssText = 'padding:4px 7px;border:1px solid currentColor;background:#020a12b0;text-shadow:0 0 6px currentColor'; this.hud.appendChild(el); this.chips.set(k, el); }
      if (el.textContent !== label) el.textContent = label;
      el.style.color = col;
    }
    // screen-edge tint of the strongest effect
    const top = this.left.burn > 0 ? '#ff5a10' : this.left.poison > 0 ? '#7fdc2a' : this.left.shock > 0 ? '#4ee8ff' : this.submerged ? '#1d4ed8' : '';
    this.edge.style.opacity = top ? '1' : '0';
    if (top) this.edge.style.boxShadow = `inset 0 0 ${this.left.shock > 0 ? 70 : 120}px ${top}88`;
  }
}
