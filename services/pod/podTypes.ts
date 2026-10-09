// Print-on-demand shared types. Pure types + tiny helpers, safe for client and server.

export type BindingType = 'PERFECT_PAPERBACK' | 'HARDCOVER_CASEWRAP' | 'SADDLE_STITCH';
export type PaperColor = 'white' | 'cream';
export type PaperWeight = 50 | 60 | 80;
export type PrinterId = 'lulu' | 'gelato' | 'blurb' | 'ingramspark' | 'kdp' | 'draft2digital';

/** Where a figure came from, so UI + docs never overclaim. */
export interface Sourced<T> { value: T; verified: boolean; source: string }

export interface PrintEditionConfig {
  trimId: string;               // key into TRIM_SIZES
  binding: BindingType;
  paperColor: PaperColor;
  paperWeight: PaperWeight;
  /** Color interior? Default false (B&W). Affects cost, not geometry. */
  colorInterior?: boolean;
  listPriceCents: number;       // author's retail price for the print edition
  printer: PrinterId;           // which printer fulfils / which export pack
}

export interface PrintEdition extends PrintEditionConfig {
  albumId: string;
  ownerUid: string;
  title: string;
  author: string;
  isbn13?: string;              // digits only; optional (Lulu/KDP can assign their own)
  publisher?: string;
  backCoverText?: string;
  frontCoverUrl?: string;
  spineColor?: string;          // hex
  listedForSale: boolean;       // show "Buy print edition" on Plajah
  updatedAt: number;
}

export interface PodAddress {
  name: string; street1: string; street2?: string; city: string;
  stateCode?: string; postcode: string; countryCode: string; phone: string; email: string;
}

export type ShippingLevel = 'MAIL' | 'PRIORITY_MAIL' | 'GROUND' | 'EXPEDITED' | 'EXPRESS';

export interface PodQuoteRequest {
  edition: PrintEditionConfig; pageCount: number; quantity: number;
  address: Pick<PodAddress, 'city' | 'stateCode' | 'postcode' | 'countryCode' | 'street1' | 'phone'>;
  shippingLevel: ShippingLevel;
}
export interface PodQuote {
  currency: string;
  /** All in integer cents. */
  printCostCents: number;       // manufacturing for all copies, excl. shipping/tax
  fulfillmentCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;           // what the printer will charge us
  perCopyPrintCents: number;
  podPackageId?: string;
  provider: PrinterId;
  estimated: boolean;           // true when not from a live printer call
}

export interface PodPrintJobRequest {
  externalId: string;           // our order id (idempotency key)
  edition: PrintEditionConfig; pageCount: number; quantity: number; title: string;
  interiorUrl: string; coverUrl: string;
  address: PodAddress; shippingLevel: ShippingLevel;
}

export type PodStatus =
  | 'created' | 'awaiting_payment' | 'in_production' | 'shipped' | 'delivered'
  | 'rejected' | 'canceled' | 'error' | 'unknown';

export interface PodJobStatus {
  providerJobId: string; status: PodStatus; rawStatus: string; message?: string;
  trackingId?: string; trackingUrls?: string[]; carrier?: string;
}

export interface PodCapabilities {
  directOrder: boolean;         // we can place print jobs via API
  directPublish: boolean;       // we can list the book in the printer's retail channels via API
  quote: boolean;
  webhooks: boolean;
  hardcover: boolean;
  exportPack: boolean;
  requiresPartnership: boolean;
  summary: string;
}

export interface PodProvider {
  id: PrinterId;
  name: string;
  capabilities: PodCapabilities;
  configured(): boolean;
  quote?(req: PodQuoteRequest): Promise<PodQuote>;
  createPrintJob?(req: PodPrintJobRequest): Promise<PodJobStatus>;
  getStatus?(providerJobId: string): Promise<PodJobStatus>;
  cancel?(providerJobId: string): Promise<PodJobStatus>;
  /** Verify an inbound webhook from the RAW body bytes + headers. Never throws. */
  verifyWebhook?(rawBody: Buffer | string, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhook?(body: any): PodJobStatus | null;
}

export class PodError extends Error {
  constructor(message: string, public code: string, public httpStatus = 502, public detail?: unknown) { super(message); }
}
