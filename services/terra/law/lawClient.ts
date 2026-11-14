// Browser-side wrappers for /api/terra/law/* (routes/terraLaw.ts). Types only from the server module.
import type { MclHit, MclSection, CfrHit } from './lawLibrary';

export type { MclHit, MclSection, CfrHit };

async function call<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as any)?.error || `Request failed (${res.status})`);
  return body as T;
}

export const searchMichiganLaw = (q: string) =>
  call<{ total: number; hits: MclHit[]; searchedAs?: string; notice: string }>(`/api/terra/law/mcl/search?q=${encodeURIComponent(q)}`);

export const fetchMichiganSection = (id: string) =>
  call<{ section: MclSection; notice: string }>(`/api/terra/law/mcl/section/${encodeURIComponent(id)}`);

export const searchFederalRules = (q: string) =>
  call<{ total: number; hits: CfrHit[]; notice: string }>(`/api/terra/law/cfr/search?q=${encodeURIComponent(q)}`);

/**
 * Municode has no API, and (checked 2026-11-04) a search term in the URL is
 * ignored — the page opens on the table of contents. So we open the code and
 * the UI copies the user's words for Municode's own search box.
 */
export const DETROIT_CODE_URL = 'https://library.municode.com/mi/detroit/codes/code_of_ordinances';

export const DETROIT_NEW_ORDINANCES_URL =
  'https://detroitmi.gov/departments/law-department/municipal-city-ordinances-enacted-and-codified-city-code';

/**
 * Starter topics. Every section here was checked against legislature.mi.gov on
 * 2026-11-04 (number + catchline). Add only sections you've opened yourself.
 */
export const LAW_TOPICS: { group: string; items: { label: string; mcl: string }[] }[] = [
  {
    group: 'Starting a business',
    items: [
      { label: 'Forming an LLC', mcl: '450.4202' },
      { label: 'LLC articles of organization', mcl: '450.4203' },
      { label: 'Business name / DBA (assumed name)', mcl: '445.1' },
      { label: 'Corporation assumed name', mcl: '450.1217' },
      { label: 'Sales tax licence', mcl: '205.53' },
      { label: 'Food establishment licence', mcl: '289.4101' },
      { label: 'Liquor licences', mcl: '436.1501' },
      { label: 'Consumer protection — unfair practices', mcl: '445.903' },
    ],
  },
  {
    group: 'Renting',
    items: [
      { label: 'Security deposit limit', mcl: '554.602' },
      { label: 'Damages list & deposit return', mcl: '554.609' },
      { label: 'Banned lease clauses (Truth in Renting)', mcl: '554.633' },
      { label: 'Eviction (summary proceedings)', mcl: '600.5714' },
    ],
  },
  {
    group: 'Building & zoning',
    items: [
      { label: 'What zoning can regulate', mcl: '125.3201' },
      { label: 'Zoning must follow a plan', mcl: '125.3203' },
      { label: 'Zoning board of appeals', mcl: '125.3601' },
      { label: 'Appeals & variances — procedure', mcl: '125.3604' },
      { label: 'Applying for a building permit', mcl: '125.1510' },
      { label: 'Permit approval & revocation', mcl: '125.1511' },
    ],
  },
  {
    group: 'Civic rights',
    items: [
      { label: 'Requesting public records (FOIA)', mcl: '15.233' },
      { label: 'Open meetings', mcl: '15.263' },
      { label: 'Property assessment ("true cash value")', mcl: '211.27' },
    ],
  },
];
