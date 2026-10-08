// discovery.ts — finds Blackmagic gear on the LAN with mDNS / DNS-SD, and advertises this bridge so apps
// can find IT. Blackmagic products announce `_blackmagic._tcp`; some cameras are only visible as `_http._tcp`
// (their web media manager), so those are accepted only when the name looks like a Blackmagic product.
// Anything that does not announce (some ATEMs on locked-down VLANs, HyperDecks) is added by address.
// Which models announce which service type has not been checked against hardware from here.

import { hostname } from 'node:os';
import { Bonjour } from 'bonjour-service';
import { classifyBlackmagic, deviceId, type BmDevice } from '../../../services/mediaEngine/blackmagic/protocol.ts';

const NAME_HINT = /blackmagic|ursa|pyxis|atem|hyperdeck|videohub|studio camera|pocket|cinema|cine\b/i;

export interface DiscoveryEvents { up(d: BmDevice): void; down(id: string): void }

export function pickIPv4(addresses: string[] = []): string | undefined {
  const v4 = addresses.filter(a => /^\d{1,3}(\.\d{1,3}){3}$/.test(a));
  return v4.find(a => !a.startsWith('169.254.')) ?? v4[0];
}

export function deviceFromService(svc: { name: string; port?: number; addresses?: string[]; host?: string; txt?: any }, viaType: string, now = Date.now()): BmDevice | null {
  if (viaType === 'http' && !NAME_HINT.test(`${svc.name} ${svc.host ?? ''}`)) return null;
  const host = pickIPv4(svc.addresses) ?? svc.host;
  if (!host) return null;
  const c = classifyBlackmagic(svc.name, svc.txt ?? {});
  if (c.kind === 'unknown' && viaType === 'http') return null;
  return { id: deviceId(c.kind, host), kind: c.kind, name: svc.name, host, port: svc.port, model: c.model, origin: 'mdns', link: 'discovered', lastSeen: now };
}

export class Discovery {
  private bonjour = new Bonjour();
  private browsers: Array<{ stop(): void }> = [];
  private published: { stop?: (cb?: () => void) => void } | null = null;

  constructor(private ev: DiscoveryEvents) {}

  start() {
    for (const type of ['blackmagic', 'http']) {
      const b = this.bonjour.find({ type }, svc => {
        const d = deviceFromService(svc as any, type);
        if (d) this.ev.up(d);
      });
      b.on('down', svc => {
        const d = deviceFromService(svc as any, type);
        if (d) this.ev.down(d.id);
      });
      this.browsers.push(b as any);
    }
  }

  /** A second bridge on the same network (or a stale one) must not crash this one: the name carries host and
   *  port, and a name clash is reported rather than thrown. */
  advertise(port: number, name = `Plajah Bridge ${hostname()}:${port}`) {
    try {
      const svc: any = this.bonjour.publish({ name, type: 'plajah-bridge', port, txt: { v: '1' } });
      svc.on?.('error', (e: Error) => console.warn(`Not advertising on mDNS: ${e.message}`));
      this.published = svc;
    } catch (e: any) { console.warn(`Not advertising on mDNS: ${e.message}`); }
  }

  stop() {
    this.browsers.forEach(b => b.stop());
    try { this.published?.stop?.(); } catch { /* */ }
    this.bonjour.destroy();
  }
}
