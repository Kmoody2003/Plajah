// The showroom and garage screens: buy cars, switch cars, fit and compare parts, tune, and follow objectives. DOM only; the 3D stage is in showroom.ts.
import { buildCar, ratings, type OwnedCar, type Ratings } from './garage/build';
import { CAR_DEFS, CAR_BY_ID, CLASS_COLORS, classFor, stockSpec, type CarDef } from './garage/catalog';
import { ACHIEVEMENTS, EVENT_IDS, EVENT_NAMES, OBJECTIVE_BY_ID } from './garage/objectives';
import { ACH_NAMES, PART_BY_ID, SLOTS, slotAvailable, slotLabel, TIER_NAMES, unlockText, type PartDef, type SlotId } from './garage/parts';
import { esc, cr } from './garage/outcomeHtml';
import type { Garage } from './garage/progress';
import { TUNE_PRESETS, TUNE_RANGES, type Tune } from './garage/tuning';

export type Tab = 'showroom' | 'garage' | 'upgrades' | 'tune' | 'goals';
export interface UiHooks { show(def: CarDef, owned: OwnedCar | null): void; spin?(on: boolean): void }

const TAB_LABEL: Record<Tab, string> = { showroom: 'Showroom', garage: 'My garage', upgrades: 'Upgrades', tune: 'Tuning', goals: 'Goals' };
const BARS: { k: keyof Ratings; label: string }[] = [{ k: 'speed', label: 'Top speed' }, { k: 'acceleration', label: 'Acceleration' }, { k: 'launch', label: 'Launch' }, { k: 'handling', label: 'Handling' }, { k: 'braking', label: 'Braking' }, { k: 'offroad', label: 'Off-road' }];
const MEDAL_COLOR: Record<string, string> = { bronze: '#d08a4e', silver: '#cfd8e3', gold: '#ffd166', elohim: '#00f5d4' };

export class GarageUi {
  tab: Tab = 'showroom';
  filter: 'all' | 'owned' | 'open' | 'locked' = 'all';
  selDef: string = CAR_DEFS[0].id;
  selUid: string | null = null;
  slot: SlotId = 'engine';
  preview: { slot: SlotId; partId: string } | null = null;
  private els: { side: HTMLElement; info: HTMLElement; tabs: HTMLElement; wallet: HTMLElement; modal: HTMLElement; toast: HTMLElement };

  constructor(private g: Garage, private hooks: UiHooks) {
    const q = (id: string): HTMLElement => document.getElementById(id)!;
    this.els = { side: q('side'), info: q('info'), tabs: q('tabs'), wallet: q('wallet'), modal: q('modal'), toast: q('toast') };
    this.selUid = g.active?.uid ?? null;
    if (this.selUid) this.selDef = g.car(this.selUid)!.carId;
    this.els.tabs.addEventListener('click', (e) => { const t = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null; if (t) this.go(t.dataset.tab as Tab); });
    for (const el of [this.els.side, this.els.info, this.els.modal]) {
      el.addEventListener('click', (e) => this.click(e));
      el.addEventListener('input', (e) => this.input(e));
      el.addEventListener('mouseover', (e) => this.hover(e));
      el.addEventListener('mouseout', (e) => { if ((e.target as HTMLElement).closest('[data-preview]')) this.setPreview(null); });
    }
    g.subscribe(() => this.drain());
    this.render();
    this.drain();
  }

  // ---------- helpers ----------
  go(t: Tab): void {
    this.tab = t; this.preview = null;
    if ((t === 'upgrades' || t === 'tune') && !this.selUid) this.selUid = this.g.active?.uid ?? null;
    if (this.selUid && (t === 'upgrades' || t === 'tune' || t === 'garage')) { const c = this.g.car(this.selUid); if (c) { this.selDef = c.carId; this.hooks.show(CAR_BY_ID[c.carId], c); } }
    this.render();
  }
  /** the car the screens are showing, for the 3D stage */
  current(): { def: CarDef; car: OwnedCar | null } { const c = this.owned(); return { def: CAR_BY_ID[c ? c.carId : this.selDef], car: c }; }
  private owned(): OwnedCar | null { return this.selUid ? this.g.car(this.selUid) ?? null : null; }
  private chip(letter: string, pi: number): string { return `<span class="cls" style="--c:${CLASS_COLORS[letter as keyof typeof CLASS_COLORS]}">${letter} <b>${Math.round(pi)}</b></span>`; }
  toast(msg: string, kind: 'ok' | 'bad' | 'info' = 'info'): void {
    const d = document.createElement('div'); d.className = 'tst ' + kind; d.innerHTML = msg; this.els.toast.appendChild(d);
    setTimeout(() => d.classList.add('out'), 4800); setTimeout(() => d.remove(), 5400);
  }
  /** rewards that fired while browsing (an objective finished by buying a car) */
  private drain(): void {
    for (const o of this.g.takePending()) {
      for (const x of o.objectives) this.toast(`Objective complete: <b>${esc(x.title)}</b>${x.reward.credits ? ` · +${cr(x.reward.credits)}` : ''}`, 'ok');
      for (const x of o.achievements) this.toast(`Achievement: <b>${esc(x.title)}</b>`, 'ok');
    }
    this.renderWallet();
  }

  // ---------- events ----------
  private click(e: MouseEvent): void {
    const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!el || el.hasAttribute('disabled')) return;
    const a = el.dataset.act!, id = el.dataset.id ?? '';
    const g = this.g;
    const say = (r: { ok: boolean; reason?: string }, ok: string): void => this.toast(r.ok ? ok : (r as { reason: string }).reason, r.ok ? 'ok' : 'bad');
    switch (a) {
      case 'pick-def': this.selDef = id; this.selUid = g.cars.find((c) => c.carId === id)?.uid ?? this.selUid; this.hooks.show(CAR_BY_ID[id], g.cars.find((c) => c.carId === id) ?? null); this.render(); break;
      case 'pick-uid': { const c = g.car(id); if (c) { this.selUid = id; this.selDef = c.carId; this.hooks.show(CAR_BY_ID[c.carId], c); this.render(); } break; }
      case 'filter': this.filter = id as typeof this.filter; this.render(); break;
      case 'buy': { const r = g.buyCar(id); say(r, `Bought the ${esc(CAR_BY_ID[id].name)}.`); if (r.ok) { this.selUid = r.car.uid; this.hooks.show(CAR_BY_ID[id], r.car); } this.render(); break; }
      case 'drive': { const r = g.setActive(id); say(r, 'This is now your active car. It is the one you drive in the game.'); this.render(); break; }
      case 'sell': {
        const v = g.sellValue(id);
        if (!confirm(`Sell the ${CAR_BY_ID[g.car(id)!.carId].name} for ${cr(v)}? Its upgrades go back to your shelf.`)) break;
        const r = g.sellCar(id); say(r, `Sold for ${cr(v)}.`); this.selUid = g.active?.uid ?? null; this.render(); break;
      }
      case 'slot': this.slot = id as SlotId; this.preview = null; this.render(); break;
      case 'fit': { if (!this.selUid) break; const r = g.install(this.selUid, id); say(r, `${esc(PART_BY_ID[id].name)} fitted${r.ok && r.paid ? ` for ${cr(r.paid)}` : ''}.`); this.preview = null; this.render(); break; }
      case 'strip': { if (!this.selUid) break; const r = g.uninstall(this.selUid, id as SlotId); say(r, 'Back to stock. The part is on your shelf.'); this.render(); break; }
      case 'preset': if (this.selUid) { g.applyPreset(this.selUid, id); this.render(); } break;
      case 'tune-reset': if (this.selUid) { g.resetTune(this.selUid); this.render(); } break;
      case 'starter': { const r = g.claimStarter(id); if (r.ok) { this.els.modal.style.display = 'none'; this.selUid = r.car.uid; this.selDef = id; this.hooks.show(CAR_BY_ID[id], r.car); this.render(); this.toast(`Welcome to the garage. The ${esc(CAR_BY_ID[id].name)} is yours.`, 'ok'); } break; }
      case 'close-modal': this.els.modal.style.display = 'none'; break;
      case 'export': { const b = new Blob([g.exportJson()], { type: 'application/json' }); const u = URL.createObjectURL(b); const a2 = document.createElement('a'); a2.href = u; a2.download = 'apex-elohim-garage.json'; a2.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); break; }
      case 'import': { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json'; inp.onchange = async () => { const f = inp.files?.[0]; if (!f) return; const r = g.importJson(await f.text()); say(r, 'Garage restored.'); this.selUid = g.active?.uid ?? null; this.render(); }; inp.click(); break; }
    }
  }
  private input(e: Event): void {
    const el = e.target as HTMLInputElement;
    if (el.dataset.tune && this.selUid) {
      const key = el.dataset.tune as keyof Tune;
      this.g.setTune(this.selUid, { [key]: parseFloat(el.value) });
      const out = el.parentElement?.querySelector('.tv'); if (out) out.textContent = this.fmtTune(key, parseFloat(el.value));
      this.renderInfo();
    }
    if (el.dataset.name && this.selUid) this.g.rename(this.selUid, el.value);
    if (el.dataset.paint && this.selUid) this.g.setPaint(this.selUid, el.value);
  }
  private hover(e: MouseEvent): void {
    const el = (e.target as HTMLElement).closest('[data-preview]') as HTMLElement | null;
    if (el) this.setPreview({ slot: el.dataset.slot as SlotId, partId: el.dataset.preview! });
  }
  private setPreview(p: UiPreview | null): void {
    if (JSON.stringify(p) === JSON.stringify(this.preview)) return;
    this.preview = p; this.renderInfo();
  }
  private fmtTune(k: keyof Tune, v: number): string {
    const r = TUNE_RANGES.find((x) => x.key === k)!;
    const n = r.step < 0.1 ? v.toFixed(2) : r.step < 1 ? v.toFixed(1) : String(Math.round(v));
    return `${n} ${r.unit}`;
  }

  // ---------- render ----------
  render(): void { this.renderTabs(); this.renderWallet(); this.renderSide(); this.renderInfo(); }

  private renderTabs(): void {
    this.els.tabs.innerHTML = (Object.keys(TAB_LABEL) as Tab[]).map((t) => `<button data-tab="${t}" class="${t === this.tab ? 'on' : ''}">${TAB_LABEL[t]}</button>`).join('');
  }
  private renderWallet(): void {
    const g = this.g, lp = g.levelProgress();
    this.els.wallet.innerHTML = `<div class="wl"><span class="lv">LV ${lp.level}</span><div class="xpb"><i style="width:${Math.round(lp.frac * 100)}%"></i></div><span class="xpt">${lp.level >= 50 ? 'MAX' : `${lp.into.toLocaleString()} / ${lp.need.toLocaleString()} XP`}</span></div><div class="cred">${cr(g.credits)}</div>`;
  }

  private renderSide(): void {
    const s = this.els.side;
    if (this.tab === 'showroom') s.innerHTML = this.sideShowroom();
    else if (this.tab === 'garage') s.innerHTML = this.sideGarage();
    else if (this.tab === 'upgrades') s.innerHTML = this.sideUpgrades();
    else if (this.tab === 'tune') s.innerHTML = this.sideTune();
    else s.innerHTML = this.sideGoals();
  }

  private sideShowroom(): string {
    const g = this.g;
    const chips = (['all', 'owned', 'open', 'locked'] as const).map((f) => `<button data-act="filter" data-id="${f}" class="chip ${this.filter === f ? 'on' : ''}">${{ all: 'All', owned: 'Owned', open: 'Available', locked: 'Locked' }[f]}</button>`).join('');
    const rows = CAR_DEFS.filter((d) => {
      const own = g.owns(d.id), un = g.carUnlocked(d);
      return this.filter === 'all' || (this.filter === 'owned' && own) || (this.filter === 'open' && !own && un) || (this.filter === 'locked' && !un && !own);
    }).sort((a, b) => a.pi - b.pi).map((d) => {
      const own = g.owns(d.id), un = g.carUnlocked(d), cl = classFor(d.pi);
      const status = own ? '<span class="own">OWNED</span>' : un ? (d.starter ? '<span class="own">STARTER</span>' : `<span class="pr">${cr(d.price)}</span>`) : `<span class="lk">LOCKED</span>`;
      return `<button class="row ${this.selDef === d.id ? 'on' : ''} ${!un && !own ? 'dim' : ''}" data-act="pick-def" data-id="${d.id}"><span class="rn"><b>${esc(d.make)}</b> ${esc(d.name)}</span>${this.chip(cl, d.pi)}<span class="rs">${esc(d.engineText)} · ${d.drivetrain}</span>${status}</button>`;
    }).join('');
    return `<h3>Showroom <small>${CAR_DEFS.length} cars</small></h3><div class="chips">${chips}</div><div class="list">${rows || '<p class="mut">Nothing here yet.</p>'}</div>`;
  }

  private sideGarage(): string {
    const g = this.g;
    if (!g.cars.length) return `<h3>My garage</h3><p class="mut">Your garage is empty. Pick a starter car or visit the showroom.</p>`;
    const rows = g.cars.map((c) => {
      const d = CAR_BY_ID[c.carId], b = buildCar(c), act = g.active?.uid === c.uid;
      return `<button class="row ${this.selUid === c.uid ? 'on' : ''}" data-act="pick-uid" data-id="${c.uid}"><span class="rn"><b>${esc(d.make)}</b> ${esc(c.nickname ?? d.name)}</span>${this.chip(b.cls, b.pi)}<span class="rs">${c.odometerKm.toFixed(1)} km · ${c.wins} wins · ${Object.keys(c.parts).length} upgrades</span>${act ? '<span class="own">ACTIVE</span>' : ''}</button>`;
    }).join('');
    return `<h3>My garage <small>${g.cars.length} cars · worth ${cr(g.garageValue())}</small></h3><div class="list">${rows}</div>
      <div class="btnrow"><button class="btn" data-act="export">Export save</button><button class="btn" data-act="import">Import save</button></div>`;
  }

  private carHeader(): string {
    const c = this.owned();
    if (!c) return `<h3>No car selected</h3><p class="mut">Pick a car in your garage first.</p>`;
    const d = CAR_BY_ID[c.carId], b = buildCar(c);
    return `<div class="carh"><b>${esc(d.make)} ${esc(c.nickname ?? d.name)}</b> ${this.chip(b.cls, b.pi)}</div>
      <div class="garselect">${this.g.cars.map((x) => `<button class="chip ${x.uid === c.uid ? 'on' : ''}" data-act="pick-uid" data-id="${x.uid}">${esc(CAR_BY_ID[x.carId].name)}</button>`).join('')}</div>`;
  }

  private sideUpgrades(): string {
    const c = this.owned(), g = this.g;
    if (!c) return this.carHeader();
    const pt = CAR_BY_ID[c.carId].powertrain;
    const slots = SLOTS.filter((s) => slotAvailable(s.id, pt)).map((s) => {
      const cur = g.fitted(c.uid, s.id);
      const nextLocked = g.slotOptions(c.uid, s.id).some((o) => !o.unlocked && o.part.tier > 0);
      return `<button class="row slot ${this.slot === s.id ? 'on' : ''}" data-act="slot" data-id="${s.id}"><span class="rn">${esc(slotLabel(s.id, pt))}</span><span class="tier t${cur.tier}">${TIER_NAMES[cur.tier]}</span><span class="rs">${esc(cur.name)}</span>${nextLocked ? '<span class="lk" title="more to unlock">🔒</span>' : ''}</button>`;
    }).join('');
    const opts = g.slotOptions(c.uid, this.slot).filter((o) => !o.part.only || o.part.only === pt).map((o) => this.partRow(o, c)).join('');
    const shelf = Object.entries(g.save.inventory).filter(([, n]) => n > 0).map(([id, n]) => `${esc(PART_BY_ID[id]?.name ?? id)} ×${n}`).join(' · ');
    return `${this.carHeader()}<div class="cols"><div class="slots">${slots}</div><div class="parts"><h4>${esc(slotLabel(this.slot, pt))}</h4>${opts}</div></div>
      <div class="shelf"><b>Shelf</b> ${shelf || '<span class="mut">empty. Parts you win or take off end up here.</span>'}</div>`;
  }

  private partRow(o: ReturnType<Garage['slotOptions']>[number], c: OwnedCar): string {
    const p = o.part, g = this.g;
    const objT = (id: string): string | undefined => OBJECTIVE_BY_ID[id]?.title;
    let state: string, btn = '';
    if (o.fitted) { state = '<span class="own">FITTED</span>'; btn = p.tier > 0 ? `<button class="btn sm" data-act="strip" data-id="${p.slot}">Remove</button>` : ''; }
    else if (o.spare > 0) { state = `<span class="own">ON SHELF ×${o.spare}</span>`; btn = `<button class="btn sm go" data-act="fit" data-id="${p.id}">Fit free</button>`; }
    else if (!o.unlocked) { state = `<span class="lk">${esc(unlockText(p.unlock, objT, (id) => EVENT_NAMES[id] ?? id))}</span>`; }
    else { state = `<span class="pr">${cr(o.price)}</span>`; btn = p.tier === 0 ? `<button class="btn sm" data-act="fit" data-id="${p.id}">Fit</button>` : `<button class="btn sm go" data-act="fit" data-id="${p.id}" ${g.credits < o.price ? 'disabled' : ''}>Buy &amp; fit</button>`; }
    return `<div class="part ${o.fitted ? 'on' : ''} ${!o.unlocked && !o.spare && !o.fitted ? 'dim' : ''}" data-preview="${p.id}" data-slot="${p.slot}"><div class="pn"><span class="tier t${p.tier}">${TIER_NAMES[p.tier]}</span> ${esc(p.name)}${p.variant ? ` <i class="var">${p.variant}</i>` : ''} <small>+${p.pi} PI</small></div><div class="pb">${esc(p.blurb)}</div><div class="pf">${state}${btn}</div></div>`;
  }

  private sideTune(): string {
    const c = this.owned();
    if (!c) return this.carHeader();
    const groups = ['Tyres', 'Gearing', 'Suspension', 'Aero', 'Brakes', 'Differential'] as const;
    const body = groups.map((gr) => `<div class="tg"><h4>${gr}</h4>${TUNE_RANGES.filter((r) => r.group === gr).map((r) => `<label class="tr" title="${esc(r.help)}"><span>${r.label}</span><input type="range" data-tune="${r.key}" min="${r.min}" max="${r.max}" step="${r.step}" value="${c.tune[r.key]}"><span class="tv">${this.fmtTune(r.key, c.tune[r.key])}</span></label>`).join('')}</div>`).join('');
    const pre = TUNE_PRESETS.map((p) => `<button class="chip" data-act="preset" data-id="${p.id}" title="${esc(p.blurb)}">${p.label}</button>`).join('');
    return `${this.carHeader()}<div class="chips">${pre}</div>${body}<div class="btnrow"><button class="btn" data-act="tune-reset">Reset to balanced</button></div><p class="mut sm">Every setting has a sweet spot. Tuning shifts grip by a few hundredths at most: parts do the heavy lifting, tuning finishes the job.</p>`;
  }

  private sideGoals(): string {
    const g = this.g, st = g.save.stats;
    const groups = ['Racing', 'Driving', 'Delivery', 'Garage', 'Career'] as const;
    const objs = g.objectives();
    const lists = groups.map((gr) => `<h4>${gr}</h4>${objs.filter((o) => o.obj.group === gr).map((o) => `<div class="obj ${o.done ? 'done' : ''}"><div class="ot"><b>${esc(o.obj.title)}</b><span>${o.done ? 'Done' : `${Math.min(o.value, o.obj.target).toLocaleString(undefined, { maximumFractionDigits: 0 })} / ${o.obj.target.toLocaleString()}`}</span></div><div class="od">${esc(o.obj.desc)}</div><div class="xpb"><i style="width:${Math.round(o.frac * 100)}%"></i></div><div class="or">${this.rewardText(o.obj.reward)}</div></div>`).join('')}`).join('');
    const medals = [...EVENT_IDS, 'delivery_rookie', 'delivery_pro', 'delivery_legend'].map((id) => { const m = g.save.medals[id]; return `<div class="md"><span>${esc(EVENT_NAMES[id])}</span><b style="color:${m ? MEDAL_COLOR[m] : '#6b7a90'}">${m ?? '—'}</b></div>`; }).join('');
    const ach = ACHIEVEMENTS.map((a) => `<span class="ach ${g.save.achievements.includes(a.id) ? 'on' : ''}">${esc(ACH_NAMES[a.id] ?? a.title)}</span>`).join('');
    return `<h3>Career <small>level ${g.level}</small></h3>
      <div class="stats"><div><b>${st.runs}</b>runs</div><div><b>${st.laps}</b>laps</div><div><b>${st.deliveries}</b>deliveries</div><div><b>${st.distanceKm.toFixed(0)}</b>km</div><div><b>${Math.round(st.topMph)}</b>top mph</div><div><b>${st.deliveryChainBest}</b>best chain</div></div>
      <h4>Medals</h4><div class="medals">${medals}</div><h4>Achievements</h4><div class="achs">${ach}</div>${lists}`;
  }
  private rewardText(r: { credits?: number; xp?: number; part?: string; car?: string }): string {
    const out: string[] = [];
    if (r.credits) out.push(cr(r.credits)); if (r.xp) out.push(`${r.xp} XP`);
    if (r.part) out.push(`part: ${esc(PART_BY_ID[r.part]?.name ?? r.part)}`);
    if (r.car) out.push(`car: ${esc(CAR_BY_ID[r.car]?.name ?? r.car)}`);
    return 'Reward: ' + out.join(' · ');
  }

  // ---------- the right-hand panel ----------
  renderInfo(): void {
    const g = this.g, own = this.owned();
    const useOwned = (this.tab === 'upgrades' || this.tab === 'tune' || this.tab === 'garage') ? own : (g.cars.find((c) => c.carId === this.selDef) ?? null);
    const def = CAR_BY_ID[useOwned ? useOwned.carId : this.selDef];
    if (!def) { this.els.info.innerHTML = ''; return; }
    const base = useOwned ? buildCar(useOwned) : null;
    const stock = stockSpec(def);
    const cur = base ? base.ratings : ratings(stock);
    const curPi = base ? base.pi : def.pi;
    let next: Ratings | null = null, nextPi = curPi;
    if (useOwned && this.preview) {
      const part = PART_BY_ID[this.preview.partId];
      if (part) { const clone: OwnedCar = { ...useOwned, parts: { ...useOwned.parts } }; if (part.tier === 0) delete clone.parts[part.slot]; else clone.parts[part.slot] = part.id; const nb = buildCar(clone); next = nb.ratings; nextPi = nb.pi; }
    }
    const bar = (k: keyof Ratings, label: string): string => {
      const v = cur[k] as number, n = next ? next[k] as number : v, d = n - v;
      return `<div class="bar"><span>${label}</span><div class="bt"><i style="width:${v * 10}%"></i>${d > 0.05 ? `<u class="up" style="left:${v * 10}%;width:${d * 10}%"></u>` : d < -0.05 ? `<u class="dn" style="left:${n * 10}%;width:${-d * 10}%"></u>` : ''}</div><em class="${d > 0.05 ? 'gu' : d < -0.05 ? 'gd' : ''}">${d > 0.05 ? '+' : d < -0.05 ? '' : ''}${Math.abs(d) > 0.05 ? d.toFixed(1) : v.toFixed(1)}</em></div>`;
    };
    const dl = (a: number, b: number, f: (n: number) => string, better: 'hi' | 'lo'): string => { if (Math.abs(b - a) < 1e-6) return f(a); const good = better === 'hi' ? b > a : b < a; return `${f(a)} <span class="${good ? 'gu' : 'gd'}">→ ${f(b)}</span>`; };
    const nx = next ?? cur;
    const spec = [
      ['Power', dl(cur.powerHp, nx.powerHp, (n) => `${Math.round(n)} hp`, 'hi')],
      ['Weight', dl(cur.massKg, nx.massKg, (n) => `${Math.round(n)} kg`, 'lo')],
      ['0–100 km/h', dl(cur.zeroTo100, nx.zeroTo100, (n) => `${n.toFixed(1)} s`, 'lo')],
      ['Top speed', dl(cur.topKmh, nx.topKmh, (n) => `${Math.round(n)} km/h`, 'hi')],
      ['Drivetrain', def.drivetrain], ['Engine', esc(def.engineText)],
    ].map(([k, v]) => `<div class="sg"><span>${k}</span><b>${v}</b></div>`).join('');
    const piBadge = next && nextPi !== curPi ? `${this.chip(classFor(curPi), curPi)} <span class="arrow">→</span> ${this.chip(classFor(nextPi), nextPi)}` : this.chip(classFor(curPi), curPi);

    let action = '';
    if (this.tab === 'showroom') {
      const own = g.owns(def.id), un = g.carUnlocked(def);
      if (own) action = `<div class="own big">In your garage</div><button class="btn go" data-act="drive" data-id="${g.cars.find((c) => c.carId === def.id)!.uid}">Make active car</button>`;
      else if (def.starter && g.needsStarter()) action = `<button class="btn go" data-act="starter" data-id="${def.id}">Take as my first car</button>`;
      else if (!un) action = `<div class="lk big">Locked</div><div class="mut">${esc(unlockText(def.unlock, (id) => OBJECTIVE_BY_ID[id]?.title, (id) => EVENT_NAMES[id] ?? id))}</div>`;
      else if (def.price === 0) action = `<div class="mut">A starter car. Pick one in the welcome screen.</div>`;
      else action = `<div class="price">${cr(def.price)}</div><button class="btn go" data-act="buy" data-id="${def.id}" ${g.credits < def.price ? 'disabled' : ''}>${g.credits < def.price ? `Need ${cr(def.price - g.credits)} more` : 'Buy'}</button>`;
    } else if (useOwned && (this.tab === 'garage')) {
      const act = g.active?.uid === useOwned.uid;
      action = `<input class="nm" data-name="1" maxlength="24" placeholder="Nickname" value="${esc(useOwned.nickname ?? '')}"><label class="pt">Paint <input type="color" data-paint="1" value="${useOwned.paint ?? '#d9381e'}"></label>
        ${act ? '<div class="own big">Active car</div>' : `<button class="btn go" data-act="drive" data-id="${useOwned.uid}">Make active car</button>`}
        <button class="btn danger" data-act="sell" data-id="${useOwned.uid}">Sell · ${cr(g.sellValue(useOwned.uid))}</button>`;
    }
    const body = def.body === 'pending' ? `<div class="note">3D model in production. This car drives with the Sovereign's body for now; its physics, power and handling are its own.</div>` : '';
    this.els.info.innerHTML = `<div class="ih"><div class="make">${esc(def.make)}</div><div class="name">${esc(useOwned?.nickname ?? def.name)}</div><div class="pi">${piBadge}</div></div>
      <p class="sum">${esc(def.summary)}</p>${body}
      <div class="bars">${BARS.map((b) => bar(b.k, b.label)).join('')}</div>
      <div class="specs">${spec}</div>
      <div class="act">${action}</div>`;
  }

  // ---------- starter ----------
  starterModal(): void {
    const m = this.els.modal;
    m.style.display = 'flex';
    m.innerHTML = `<div class="mbox"><h2>Welcome to the garage</h2><p>Pick the car you start your career in. You will earn credits and XP from events and deliveries, unlock parts, and buy better cars. You can sell it later.</p>
      <div class="starters">${CAR_DEFS.filter((d) => d.starter).map((d) => { const r = ratings(stockSpec(d)); return `<div class="sc"><div class="sh">${esc(d.make)}</div><div class="sn">${esc(d.name)}</div>${this.chip(classFor(d.pi), d.pi)}<p>${esc(d.summary)}</p><div class="ss">${Math.round(r.powerHp)} hp · ${Math.round(r.massKg)} kg · 0–100 in ${r.zeroTo100.toFixed(1)} s</div><button class="btn go" data-act="starter" data-id="${d.id}">Pick this car</button></div>`; }).join('')}</div></div>`;
  }
}
type UiPreview = { slot: SlotId; partId: string };
