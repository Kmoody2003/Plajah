// ticketPageHooks - tiny plug-in seam so a vertical pack can add a section to the customer ticket page (/t/:token)
// without editing the generic renderer. A hook returns ALREADY-ESCAPED html (or ''), never throws into the page:
// a failing hook is logged and skipped. Auto repair registers the inspection report here (services/autoServer.ts).
import type { Ticket, TicketConfig } from './ticketCore';

export type TicketPageExtra = (t: Ticket, cfg: TicketConfig) => Promise<string>;
export const ticketPageExtras: TicketPageExtra[] = [];

export async function renderTicketPageExtras(t: Ticket, cfg: TicketConfig): Promise<string> {
  let out = '';
  for (const fn of ticketPageExtras) {
    try { out += (await fn(t, cfg)) || ''; } catch (e: any) { console.error('[tickets] page extra failed', e?.message || e); }
  }
  return out;
}
