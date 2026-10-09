// Who may export what. PURE: callers pass the facts (ownership, license, book delivery) and get a decision.
//
// DECISION (documented in docs/BOOK_TELA_UPGRADE.md): the gate is CLIENT-SIDE, built on the same facts the reader
// already uses (useOwnership + the buyer's ContentLicense + watermarkTagFor), plus the Firestore rule on
// albums/{id}/telaVersions that only lets the owner or a license holder read a paid book's Tela text. We did not add
// a server "export token": the entitled client already holds the full text, the product promise is DRM-free, and a
// token would add friction without protection. The watermark is a forensic stamp for leaked copies, not a lock.

import type { ExportFormat } from '../types';

export interface RightsFacts {
  isOwner: boolean;
  isAdmin?: boolean;
  signedIn: boolean;
  isPaid: boolean;
  /** The book's open licence choice from the submission flow (CC-BY ..., CC0, PD, ARR). */
  bookLicense?: string;
  /** Buyer's ContentLicense, if any. */
  license?: { grant: 'PURCHASE' | 'RENTAL' | 'PPV'; delivery: 'DOWNLOAD_OPEN' | 'PLAJAH_ONLY'; issuedAt: number; expiresAt?: number; watermarkTag?: string } | null;
  /** Album.bookDistribution.watermark */
  watermarkOn?: boolean;
  /** watermarkTagFor(uid, bookId) computed by the caller when watermarkOn and the license carries no tag. */
  computedWatermarkTag?: string;
  now?: number;
}

export interface RightsDecision {
  allowed: boolean;
  scope: 'author' | 'buyer' | 'open-license' | 'none';
  /** Which Tela version the export is taken from. */
  version: 'latest' | 'pinned-to-purchase' | 'latest-published';
  watermarkTag?: string;
  formats: ExportFormat[];
  reason?: string;
}

const ALL: ExportFormat[] = ['EPUB_REFLOW', 'EPUB_FIXED', 'PDF_SCREEN', 'PDF_PRINT', 'MARKDOWN', 'HTML'];
const OPEN_LICENSES = /^(CC-BY|CC-BY-SA|CC-BY-NC|CC-BY-NC-SA|CC-BY-ND|CC-BY-NC-ND|CC0|PD)$/;

export function decideExportRights(f: RightsFacts): RightsDecision {
  const now = f.now ?? Date.now();
  const deny = (reason: string): RightsDecision => ({ allowed: false, scope: 'none', version: 'latest-published', formats: [], reason });
  if (f.isOwner || f.isAdmin) return { allowed: true, scope: 'author', version: 'latest', formats: ALL };
  if (!f.signedIn) return deny('Sign in to export a book you own.');
  if (f.isPaid) {
    const l = f.license;
    if (!l) return deny('Only the author, or readers who bought this book, can export it.');
    if (l.expiresAt != null && l.expiresAt <= now) return deny('Your rental has ended. Rentals cannot be exported.');
    if (l.grant === 'RENTAL') return deny('Rentals cannot be exported. Buy the book to download it.');
    if (l.delivery !== 'DOWNLOAD_OPEN') return deny('The author chose to deliver this book inside Plajah only, so downloads are not available.');
    const tag = l.watermarkTag || (f.watermarkOn ? f.computedWatermarkTag : undefined);
    return { allowed: true, scope: 'buyer', version: 'pinned-to-purchase', ...(tag ? { watermarkTag: tag } : {}), formats: ALL.filter(x => x !== 'PDF_PRINT' || true) };
  }
  // free books: exportable by anyone only under an open licence
  if (f.bookLicense && OPEN_LICENSES.test(f.bookLicense)) return { allowed: true, scope: 'open-license', version: 'latest-published', formats: ALL };
  return deny('This book is free to read on Plajah, but its licence does not allow downloads. Ask the author, or look for an open-licensed edition.');
}
