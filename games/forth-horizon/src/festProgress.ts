// Chora Fest progression in the game (logic in src/garage/fest.ts): Fest Points from PR stunts, skill chains, discoveries and opening sets; Stage Passes; the outpost
// panel on the map screen (open an outpost with a pass, fast travel to any open site); the stages' LED walls; FP toasts while driving. Saved with the garage.
import type { FestivalData, ChallengeEvent } from './openWorldEvents';
import { Fest, SkillChain, emptyFest, PASS_FP, FP, type FestEvent, type FestSave, type FestSite } from './garage/fest';
import { setSiteState } from './festival';
import { RadioBreaks, festLine, idleLine, eventsForRadio, type HostLike } from './festRadio';

interface Opts {
  festival: FestivalData;
  scenic: { name: string; xz: number[][] }[];
  save: { fest?: FestSave };
  persist: () => void;
  banner: (text: string, kind?: 'ok' | 'bad' | 'gold' | '') => void;
  /** the map-screen card: returns the element whose text the panel keeps current */
  card: (act: () => void) => HTMLElement;
  brief: HTMLElement; hideBrief: () => void; back: () => void;
  /** start free roam at p, facing q */
  travel: (p: [number, number], q: [number, number]) => void;
  /** other cars near the player, for near misses */
  cars: () => { x: number; z: number }[];
  /** every festival event as it happens (the radio hosts react to them) */
  onEvents?: (evs: FestEvent[]) => void;
  /** the radio: who is on the air on the current station, its name, and the music duck while they talk */
  radio?: { host: () => HostLike; station: () => string; duck: (on: boolean) => void; voice: () => boolean };
}

export interface FestProgress { fest: Fest; /** a drive ended: clear the radio */ quiet(): void; /** fast travel to an open site */ travel(id: string): void; /** spend a pass on an outpost */ openSite(id: string): boolean; step(dt: number, ps: { pos: { x: number; z: number }; speedMps: number; isDrifting: boolean; isAirborne: boolean }): void; challenge(ev: ChallengeEvent): void; refresh(): void }

export function createFestProgress(o: Opts): FestProgress {
  const sites: FestSite[] = o.festival.sites.map((s) => ({ id: s.id, name: s.name, kind: s.kind, x: s.x, z: s.z }));
  const fest = new Fest(o.save.fest ?? (o.save.fest = emptyFest(sites.find((s) => s.kind === 'main')?.id ?? 'main')), sites, o.persist);
  const chain = new SkillChain();
  let live: { id: string; t: number } | null = null;
  const cardSub = o.card(openPanel);
  const breaks = o.radio ? new RadioBreaks(o.radio.duck) : null;
  let seed = 0;
  const onAir = (evs: FestEvent[]): void => {
    if (!breaks || !o.radio || !active) return;
    const host = o.radio.host(), st = o.radio.station();
    for (const a of eventsForRadio(evs)) { const l = festLine(a, host, ++seed, st); if (l) breaks.say(host.stageName, l); }
  };
  let active = false;
  const show = (evs: FestEvent[]): void => {
    for (const e of evs) {
      if (e.kind === 'fp') o.banner(`+${e.fp} FP · ${e.text}`, 'gold');
      else if (e.kind === 'pass') o.banner(e.text, 'gold');
      else if (e.kind === 'opening' && e.site) { o.banner(e.text, 'gold'); setSiteState(e.site, 'live', fest.actFor(e.site)); live = { id: e.site, t: 0 }; }
    }
    if (evs.length) { refresh(); o.onEvents?.(evs); onAir(evs); }
  };
  function refresh(): void {
    const p = fest.passes;
    cardSub.textContent = `${fest.fp.toLocaleString()} FP · ${fest.save.open.length}/${sites.length} sites open` + (p.free ? ` · ${p.free} Stage Pass${p.free > 1 ? 'es' : ''} to spend` : p.next ? ` · next pass at ${p.next.toLocaleString()} FP` : '');
    for (const s of sites) if (!live || live.id !== s.id) setSiteState(s.id, fest.isOpen(s.id) ? 'open' : 'closed');
  }
  // the spot to start from: the mouth of the site's access track (on its road), facing the stage
  const spawn = (s: FestSite): [[number, number], [number, number]] => {
    const a = o.festival.access?.find((r) => r.site === s.id);
    if (a && a.xz.length >= 2) return [[a.xz[0][0], a.xz[0][1]], [a.xz[1][0], a.xz[1][1]]];
    return [[s.x + 40, s.z + 40], [s.x, s.z]];
  };
  function openPanel(): void {
    const p = fest.passes;
    const row = (s: FestSite): string => {
      const open = fest.isOpen(s.id);
      const btn = open ? `<button class="fx" data-s="${s.id}" data-a="go">FAST TRAVEL</button>` : p.free ? `<button class="fx" data-s="${s.id}" data-a="open">OPEN · 1 PASS</button>` : `<span style="font:500 11px Inter,sans-serif;color:rgba(255,255,255,.45)">locked</span>`;
      return `<div style="display:flex;align-items:center;gap:10px;margin:6px 0;padding:9px 14px;border-radius:16px;border:1px solid rgba(255,255,255,${open ? '.22' : '.10'});background:rgba(255,255,255,${open ? '.07' : '.03'})"><span style="width:8px;height:8px;border-radius:50%;background:${open ? '#ff2d9a' : '#555'}"></span><div style="flex:1"><div style="font:700 14px Outfit,sans-serif">${s.name}</div><div style="font:400 11px Inter,sans-serif;color:rgba(255,255,255,.6)">${s.kind === 'main' ? 'Main Site' : open ? (fest.save.seen.includes(s.id) ? 'Outpost · open' : `Outpost · opening set by ${fest.actFor(s.id)}: drive there`) : 'Outpost · closed'}</div></div>${btn}</div>`;
    };
    const nxt = p.next ? `Next Stage Pass at ${p.next.toLocaleString()} FP` : 'Every Stage Pass earned';
    o.brief.style.borderColor = '#ff2d9a88';
    o.brief.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:#ff2d9a;box-shadow:0 0 10px #ff2d9a"></span><span style="font:600 10px Outfit,sans-serif;letter-spacing:.28em;color:#ff2d9a">CHORA FEST</span></div>
      <div style="font:800 26px Outfit,sans-serif;margin:4px 0 2px">${fest.fp.toLocaleString()} Fest Points</div>
      <div style="font:400 12px Inter,sans-serif;color:rgba(255,255,255,.7);margin-bottom:6px">${p.earned} of ${PASS_FP.length} Stage Passes earned${p.free ? `, <b style="color:#ffd166">${p.free} to spend</b>` : ''}. ${nxt}. Earn FP from speed traps, speed and drift zones and danger signs (${FP.star} a star), drift, air and near-miss chains, finding sites (${FP.site}) and driving scenic roads end to end (${FP.road}).</div>
      <style>.fx{height:32px;padding:0 14px;border-radius:999px;border:1px solid #ff2d9a;background:rgba(255,45,154,.15);color:#fff;font:600 11px Outfit,sans-serif;letter-spacing:.12em;cursor:pointer}</style>
      ${sites.map(row).join('')}
      <button id="briefBack" style="margin-top:8px;height:42px;padding:0 24px;background:rgba(255,255,255,.06);color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:999px;font:600 12px Outfit,sans-serif;letter-spacing:.18em;cursor:pointer">BACK</button>`;
    o.brief.style.display = 'block';
    o.brief.querySelectorAll<HTMLButtonElement>('.fx').forEach((b) => {
      b.onclick = () => {
        const s = sites.find((x) => x.id === b.dataset.s)!;
        if (b.dataset.a === 'open') { show(fest.openOutpost(s.id)); refresh(); openPanel(); o.banner(`${s.name} is open: ${fest.actFor(s.id)} plays the opening set`, 'gold'); return; }
        o.hideBrief(); const [p0, q0] = spawn(s); o.travel(p0, q0);
      };
    });
    (o.brief.querySelector('#briefBack') as HTMLElement).onclick = o.back;
  }
  // scenic roads driven end to end: checkpoints every 60 m, all but one touched within 25 m
  const roads = o.scenic.map((r) => { const cps: [number, number][] = []; let acc = 60; for (let i = 1; i < r.xz.length; i++) { acc += Math.hypot(r.xz[i][0] - r.xz[i - 1][0], r.xz[i][1] - r.xz[i - 1][1]); if (acc >= 60) { cps.push([r.xz[i][0], r.xz[i][1]]); acc = 0; } } return { name: r.name, cps, hit: new Uint8Array(cps.length), n: 0 }; });
  let tArrive = 0, lastSpeed = 0, crashT = 0;
  refresh();
  return {
    fest,
    refresh,
    quiet() { active = false; breaks?.hide(); },
    travel(id) { const s = sites.find((x) => x.id === id); if (s && fest.isOpen(id)) { const [p0, q0] = spawn(s); o.travel(p0, q0); } },
    openSite(id) { const ev = fest.openOutpost(id); show(ev); refresh(); return ev.length > 0; },
    challenge(ev) { if (ev.status === 'completed') show(fest.challenge(ev.challengeId, ev.title, ev.stars, ev.value)); },
    step(dt, ps) {
      active = true;
      if (breaks && o.radio) {
        breaks.voice = o.radio.voice();
        const st = o.radio.station();
        breaks.step(dt, st);
        if (breaks.quiet > 150) {                                                     // two and a half quiet minutes: a festival talk-up
          const p = fest.passes, closed = fest.closed();
          const near = closed.sort((a, b) => Math.hypot(a.x - ps.pos.x, a.z - ps.pos.z) - Math.hypot(b.x - ps.pos.x, b.z - ps.pos.z))[0];
          const host = o.radio.host();
          breaks.say(host.stageName, idleLine(host, { fp: fest.fp, open: fest.save.open.length, total: sites.length, nextPass: p.next, freePasses: p.free, closedNear: near?.name }, ++seed, st));
        }
      }
      // a sudden stop (more than 12 m/s lost in a quarter second) is a crash
      crashT += dt; let crashed = false;
      if (crashT >= 0.25) { crashed = lastSpeed - ps.speedMps > 12; lastSpeed = ps.speedMps; crashT = 0; }
      let near = false;
      if (ps.speedMps > 15) for (const c of o.cars()) { const d = Math.hypot(c.x - ps.pos.x, c.z - ps.pos.z); if (d > 1.6 && d < 3.2) { near = true; break; } }
      const fp = chain.step(dt, { drifting: ps.isDrifting, airborne: ps.isAirborne, speed: ps.speedMps, nearMiss: near, crashed });
      if (fp > 0) show(fest.skill(fp));
      tArrive += dt;
      if (tArrive > 0.5) {
        tArrive = 0;
        show(fest.arrive(ps.pos.x, ps.pos.z));
        for (const r of roads) {
          if (fest.save.found.includes('road:' + r.name)) continue;
          for (let i = 0; i < r.cps.length; i++) if (!r.hit[i] && Math.hypot(r.cps[i][0] - ps.pos.x, r.cps[i][1] - ps.pos.z) < 25) { r.hit[i] = 1; r.n++; }
          if (r.cps.length >= 4 && r.n >= r.cps.length - 1) show(fest.discover('road:' + r.name, `${r.name} driven end to end`, FP.road, { what: 'road', name: r.name }));
        }
      }
      if (live) { live.t += dt; if (live.t > 240) { setSiteState(live.id, 'open'); live = null; } }     // the opening set runs four minutes
    },
  };
}
