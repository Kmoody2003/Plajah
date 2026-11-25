// The radio follows the festival (docs/apex-elohim/chora-fest-design.md §4): the host on the air reacts to what the player just did (stars, records, a found site,
// a road driven end to end, a big skill chain, a Stage Pass, an outpost opening, its opening set) and, when nothing happens for a while, talks up the festival.
// Lines are templates filled ONLY with the facts the event carries (names, numbers, the act), in the host's own words (their catchphrases); nothing is invented.
// They play as an ON AIR caption with the music ducked; the host's voice is the device's speech engine, off unless the player turns it on (Settings > Audio).
import type { FestAbout, FestEvent } from './garage/fest';

export interface HostLike { stageName: string; personality: { catchphrases: string[] }; show?: { name: string } | null }

function pick<T>(arr: T[], seed: number): T { return arr[Math.abs(Math.floor(seed)) % arr.length]; }

/** what the host says about an event, or null when it is not worth a break */
export function festLine(a: FestAbout, host: HostLike, seed = 0, station = 'Plajah FM'): string | null {
  const cp = host.personality.catchphrases.length ? host.personality.catchphrases : ['Stay with us.'];
  const tag = pick(cp, seed + 1);
  const nm = a.name ?? '';
  switch (a.what) {
    case 'stars':
      if ((a.n ?? 0) < 2) return null;
      return a.n === 3
        ? pick([`Three stars at ${nm}. Somebody out there is driving like the festival owes them money. ${tag}`, `${nm}, three stars, full marks. ${tag}`], seed)
        : pick([`Two stars on ${nm}. Close to perfect. ${tag}`, `${nm} just went two stars. One more and it's a clean sweep.`], seed);
    case 'pb': return pick([`New personal best at ${nm}. ${tag}`, `They beat their own mark at ${nm}. That's the only rival that matters.`], seed);
    case 'site': return pick([`Welcome to ${nm}, everybody. You're listening to ${station}. ${tag}`, `Someone just rolled into ${nm}. Good to have you.`], seed);
    case 'road': return pick([`${nm}, start to finish. If you haven't driven it yet, put it on the list. ${tag}`, `All of ${nm} in one go. That road earns its name.`], seed);
    case 'chain': return (a.n ?? 0) >= 80 ? pick([`That skill chain was worth ${a.n} Fest Points. I saw that. ${tag}`, `${a.n} points off one chain. Keep it sideways.`], seed) : null;
    case 'pass': return pick([`Stage Pass number ${a.n} is in. Pick an outpost on the map and we open it up. ${tag}`, `That's Stage Pass ${a.n}. Chora Fest is getting bigger.`], seed);
    case 'opened': return `Big news on ${station}: ${nm} is open, and ${a.act} plays the opening set. Get yourself over there. ${tag}`;
    case 'opening': return pick([`We're live from ${nm}: ${a.act} on the stage, right now. ${tag}`, `${a.act}, live at ${nm}. Turn it up.`], seed);
  }
  return null;
}

/** what the host says when nothing has happened for a while: the festival's state, from facts only */
export function idleLine(host: HostLike, f: { fp: number; open: number; total: number; nextPass: number | null; freePasses: number; closedNear?: string }, seed = 0, station = 'Plajah FM'): string {
  const lines = [`${station}, the sound of Chora Fest. ${f.open} of ${f.total} sites open so far.`];
  if (f.freePasses) lines.push(`You've got a Stage Pass burning a hole in your pocket. Open an outpost from the map.`);
  else if (f.nextPass) lines.push(`${(f.nextPass - f.fp).toLocaleString()} Fest Points to the next Stage Pass. Speed traps, drift zones, danger signs: you know the drill.`);
  if (f.closedNear) lines.push(`${f.closedNear} is still closed. Earn a pass and we'll open it with a show.`);
  if (host.show?.name) lines.push(`This is ${host.show.name} with ${host.stageName}. ${pick(host.personality.catchphrases.length ? host.personality.catchphrases : [''], seed)}`);
  return pick(lines, seed);
}

/** the ON AIR caption, the duck, and the optional device voice; one line at a time, the rest queue (stale ones drop) */
export class RadioBreaks {
  private el: HTMLDivElement;
  private queue: { host: string; text: string; at: number }[] = [];
  private busy = 0;
  private idle = 0;
  voice = false;
  constructor(private duck: (on: boolean) => void) {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;left:24px;bottom:150px;max-width:420px;padding:10px 16px 11px;border-radius:18px;background:rgba(20,0,28,.78);backdrop-filter:blur(10px);border:1px solid rgba(255,45,154,.45);color:#fff;font:400 13px Inter,sans-serif;line-height:1.35;opacity:0;transform:translateY(8px);transition:opacity .35s,transform .35s;pointer-events:none;z-index:40';
    document.body.appendChild(this.el);
  }
  say(host: string, text: string): void { this.queue.push({ host, text, at: performance.now() }); if (this.queue.length > 3) this.queue.shift(); }
  /** seconds since the host last spoke (for the idle talk-ups) */
  get quiet(): number { return this.idle; }
  step(dt: number, station: string): void {
    this.idle += dt;
    if (this.busy > 0) { this.busy -= dt; if (this.busy <= 0) { this.el.style.opacity = '0'; this.el.style.transform = 'translateY(8px)'; this.duck(false); } return; }
    while (this.queue.length && performance.now() - this.queue[0].at > 20000) this.queue.shift();       // old news
    const b = this.queue.shift(); if (!b) return;
    const words = b.text.split(/\s+/).length;
    this.busy = Math.min(11, 2.2 + words / 2.6);
    this.idle = 0;
    const esc = (t: string): string => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
    this.el.innerHTML = `<div style="display:flex;align-items:center;gap:7px;margin-bottom:3px"><span style="width:7px;height:7px;border-radius:50%;background:#ff2d4a;box-shadow:0 0 8px #ff2d4a"></span><span style="font:600 10px Outfit,sans-serif;letter-spacing:.22em;color:#ff7ab8">ON AIR · ${esc(station.toUpperCase())}</span></div><b style="font:600 12px Outfit,sans-serif;color:#ffd166">${esc(b.host)}</b> ${esc(b.text)}`;
    this.el.style.opacity = '1'; this.el.style.transform = 'translateY(0)';
    this.duck(true);
    if (this.voice && typeof speechSynthesis !== 'undefined') { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(b.text); u.rate = 1.04; speechSynthesis.speak(u); } catch { /* no speech engine */ } }
  }
  hide(): void { this.queue.length = 0; this.busy = 0; this.el.style.opacity = '0'; this.duck(false); }
}

/** the events worth a break, newest first */
export function eventsForRadio(evs: FestEvent[]): FestAbout[] {
  const out: FestAbout[] = [];
  for (const e of evs) if (e.about) out.push(e.about);
  return out;
}
