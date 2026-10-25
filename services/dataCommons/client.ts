// Browser-side wrappers for /api/data/* (routes/dataCommons.ts). Types are imported from the server
// modules as types only, so nothing server-side is bundled.
import type { CatalogPage } from './catalog';
import type { FederalPlaceProfile, GeocodedAddress } from './place';
import type { GrantMatchResult, MatchInput, OpportunityDetail, PeerAwards, ApplicantKind } from './grants';

export type { CatalogPage, FederalPlaceProfile, GeocodedAddress, GrantMatchResult, MatchInput, OpportunityDetail, PeerAwards, ApplicantKind };
export type { Layer, Provenance } from './core';

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as any)?.error || `Request failed (${res.status})`);
  return body as T;
}

export const searchDataGov = (q: string, after?: string) =>
  call<CatalogPage>(`/api/data/catalog?q=${encodeURIComponent(q)}${after ? `&after=${encodeURIComponent(after)}` : ''}`);

export const fetchPlaceProfile = (lat: number, lng: number) =>
  call<FederalPlaceProfile>(`/api/data/place?lat=${lat}&lng=${lng}`);

export const geocode = (address: string) =>
  call<GeocodedAddress>(`/api/data/geocode?address=${encodeURIComponent(address)}`);

export const fetchGrantOptions = () =>
  call<{ kinds: { key: ApplicantKind; note?: string }[]; topics: { key: string; label: string }[] }>('/api/data/grants/options');

export const matchGrants = (input: Pick<MatchInput, 'kind' | 'topics' | 'keywords' | 'preferredAgencies'>) =>
  call<GrantMatchResult>('/api/data/grants/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

export const fetchPeerAwards = (stateAbbr: string, countyFips: string, keywords: string[]) =>
  call<PeerAwards>(`/api/data/grants/peers?state=${encodeURIComponent(stateAbbr)}&county=${encodeURIComponent(countyFips)}&keywords=${encodeURIComponent(keywords.join(','))}`);
