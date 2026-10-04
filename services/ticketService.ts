// ticketService - client for the ticket engine (/api/tickets/*). The UI talks to the small `TicketApi`
// interface, so the dev preview can swap in the in-memory demo (services/ticketDemoApi.ts) with no server.
import { authedFetch, fetchRegisterSettings } from './registerService';
import { fetchOffers, bestOffer } from './offersService';
import type { Ticket } from './ticketCore';
import type { TaxSettings } from './taxCore';
import type { Tender } from './tenderCore';

export interface PayContext { tax: TaxSettings; tipPresets: number[]; discountCents: number }
export interface TicketApi {
  /** Set by serverTicketApi: lets pack plug-ins (laundry) build their own clients for the same business. */
  ctx?: { businessUid: string; packId: string; sessionToken?: string | null };
  list(q?: string): Promise<Ticket[]>;
  get(id: string): Promise<{ ticket: Ticket; link: string }>;
  create(input: { customer: { name: string; phone?: string; email?: string; uid?: string }; subject: Record<string, any>; templates?: string[] }): Promise<Ticket>;
  update(id: string, patch: Record<string, any>): Promise<Ticket>;
  line(id: string, body: Record<string, any>): Promise<Ticket>;
  transition(id: string, to: string, opts?: { override?: boolean; managerPin?: string; reason?: string }): Promise<{ ticket: Ticket; notified?: { push: boolean; email: boolean; sms: boolean } }>;
  deposit(id: string, amountCents: number, method: string, reference?: string): Promise<Ticket>;
  link(id: string, rotate?: boolean): Promise<string>;
  uploadPhoto(file: File, ticketId: string): Promise<string>;
  payContext(ticket: Ticket, subtotalCents: number): Promise<PayContext>;
  pay(ticket: Ticket, a: { tenders: Tender[]; tipCents: number; ageVerified: boolean }): Promise<{ orderId: string; paidCents: number }>;
  /** Plug-in seam for pack panels: POST /api/{route} with the business + register-session headers (e.g. 'auto/vin/decode'). */
  call?(route: string, body?: Record<string, any>): Promise<any>;
  /** Business uid + pack id, for panels. */
  businessUid?: string; packId?: string;
}

export function serverTicketApi(businessUid: string, packId: string, sessionToken?: string | null): TicketApi {
  const h = sessionToken ? { 'X-Register-Session': sessionToken } : {};
  const call = (name: string, body: any) => authedFetch(`/api/tickets/${name}`, { businessUid, ...body }, h);
  return {
    businessUid, packId,
    call: (route, body) => authedFetch(`/api/${route}`, { businessUid, ...(body || {}) }, h),
    ctx: { businessUid, packId, sessionToken: sessionToken || null },
    list: async q => (await call('list', { q })).tickets,
    get: id => call('get', { ticketId: id }),
    create: async input => (await call('create', { packId, ...input })).ticket,
    update: async (id, patch) => (await call('update', { ticketId: id, ...patch })).ticket,
    line: async (id, body) => (await call('line', { ticketId: id, ...body })).ticket,
    transition: (id, to, opts = {}) => call('transition', { ticketId: id, to, ...opts }),
    deposit: async (id, amountCents, method, reference) => (await call('deposit', { ticketId: id, amountCents, method, reference })).ticket,
    link: async (id, rotate) => (await call('link', { ticketId: id, rotate: !!rotate })).link,
    uploadPhoto: async (file, ticketId) => {
      // Lazy import keeps firebase/storage out of anything that only renders the board.
      const [{ ref, uploadBytesResumable, getDownloadURL }, { storage, auth }] = await Promise.all([import('firebase/storage'), import('./firebase')]);
      const uid = auth.currentUser?.uid; if (!uid) throw new Error('Sign in to upload.');
      const safe = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-60);
      const task = uploadBytesResumable(ref(storage, `users/${uid}/tickets/${ticketId}/${Date.now()}_${safe}`), file, { contentType: file.type || 'image/jpeg' });
      await new Promise<void>((res, rej) => task.on('state_changed', undefined, rej, () => res()));
      return getDownloadURL(task.snapshot.ref);
    },
    payContext: async (t, subtotalCents) => {
      const [s, offers] = await Promise.all([fetchRegisterSettings(businessUid), fetchOffers(businessUid).catch(() => [])]);
      return { tax: s.tax, tipPresets: s.tipPresets, discountCents: Math.min(subtotalCents, bestOffer(offers, subtotalCents, !!t.customer.uid)?.discountCents || 0) };
    },
    // Payment goes through the EXISTING pos-sale pipeline: the server loads the ticket's approved lines itself.
    pay: (t, a) => authedFetch('/api/store/pos-sale', { businessUid, items: [], ticketId: t.id, tenders: a.tenders, tipCents: a.tipCents, ageVerified: a.ageVerified, customerUid: t.customer.uid }, h),
  };
}
