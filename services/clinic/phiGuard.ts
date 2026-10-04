// Guardrails for the pre-HIPAA period. Until the encrypted clinic vault is live and the legal
// paperwork is signed, the Clinical Care workspace is a DEMO: fictional patients only, stored on this
// device, never sent to a server. Flip CLINICAL_CARE_LIVE only when the vault, Firestore rules, BAA
// and policies (docs/HIPAA_TECHNICAL_SAFEGUARDS.md) are all in place.

/** Real patient data is NOT allowed anywhere in the product while this is false. */
export const CLINICAL_CARE_LIVE = false;

const DEMO_KEY = 'plajah.clinicDemo.v1';

export interface ClinicalDemoConsent { at: number; by?: string }

export function getClinicalDemoConsent(): ClinicalDemoConsent | null {
  try { const raw = localStorage.getItem(DEMO_KEY); return raw ? JSON.parse(raw) as ClinicalDemoConsent : null; } catch { return null; }
}
export function isClinicalDemoEnabled(): boolean { return CLINICAL_CARE_LIVE || !!getClinicalDemoConsent(); }
export function enableClinicalDemo(by?: string) {
  try { localStorage.setItem(DEMO_KEY, JSON.stringify({ at: Date.now(), by } satisfies ClinicalDemoConsent)); } catch { /* private mode: demo simply won't persist */ }
}
export function disableClinicalDemo() { try { localStorage.removeItem(DEMO_KEY); } catch { /* ignore */ } }

/** Placeholder-style contact details are fine in a demo; anything that looks real gets a warning. */
export function realLookingContact(email: string, phone: string): string | null {
  const e = email.trim().toLowerCase();
  if (e && !/@(example\.(com|org|net)|test|invalid|localhost)$|\.test$|\.example$/.test(e)) return 'That email looks real. Demo patients should use something like jane.doe@example.com.';
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10 && !/555\d{4}$/.test(digits)) return 'That phone number looks real. Use a fictional number such as (415) 555-0199.';
  return null;
}

/** Plain-language rules shown wherever a health business could be tempted to enter patient details. */
export const NO_PHI_RULES = [
  'Do not enter patient names tied to a service, diagnosis or visit.',
  'Do not reply to patients, reviews or comments in a way that confirms someone is a patient.',
  'Use first names or a number — never full names or reasons for visit — on waiting-room signage.',
  'Do not put patient photos or testimonials in marketing without a signed authorization.',
  'Keep ad/analytics tracking off any page that could reveal a visit.',
];
