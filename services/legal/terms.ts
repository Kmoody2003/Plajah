// The live Terms of Service version (public/policies/terms.html shows the same string).
// Bump it whenever the Terms change materially: signed-in users are asked to agree again
// (components/legal/TermsUpdateBar.tsx) and routes/legalAcceptance.ts records each acceptance.
export const TERMS_VERSION = 'terms-2026-10-29';
export const TERMS_URL = '/policies/terms.html';

/**
 * Off until the launch checklist is done (DMCA agent registered with the Copyright Office, agent
 * mailing address, fee numbers, erasure vs ledgers). While false: no "agree to the Terms" bar, no
 * notice form in the Help Center, and the new policy pages wait in docs/legal/ (not served).
 * The /api/copyright and /api/legal routes stay mounted; nothing in the app calls them yet.
 */
export const LEGAL_LAUNCHED = false;
