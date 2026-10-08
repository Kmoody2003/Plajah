import type { Milestone } from '../../services/dossier/timelineDoc';

/**
 * Short card text (middle-school register). Each milestone cites a ledger claim.
 * Only thirteen turning points are used. The first board is a timeline of decisions and documents;
 * it does not tabulate deaths, and the contested counts stay in the exhibit rooms where their
 * ranges and notes are shown.
 */
export const partitionMilestones: Milestone[] = [
  { year: 1857, label: 'Revolt of 1857; in 1858 the Crown takes over from the East India Company', claimId: 'c-1857', extraClaimIds: ['c-1858-crown'] },
  { year: 1905, label: 'Curzon partitions Bengal (annulled in 1911)', claimId: 'c-bengal-1905', extraClaimIds: ['c-bengal-motive'] },
  { year: 1906, label: 'Muslim League founded at Dhaka', claimId: 'c-ml-1906', extraClaimIds: ['c-electorates'] },
  { year: 1916, label: 'Lucknow Pact between Congress and the League', claimId: 'c-lucknow' },
  { year: 1940, label: 'Lahore Resolution speaks of "independent states"', claimId: 'c-lahore-text', extraClaimIds: ['c-lahore-meaning'] },
  { year: 1942, label: 'Cripps Mission fails; Congress passes Quit India', claimId: 'c-cripps', extraClaimIds: ['c-quit-india'] },
  { year: 1946, label: 'Cabinet Mission fails; Direct Action Day in Calcutta', claimId: 'c-plan-collapse', extraClaimIds: ['c-dad'] },
  { year: 1947, label: '3 June plan; Mountbatten names 15 August (date debated)', claimId: 'c-3june', extraClaimIds: ['c-date', 'c-date-reason'] },
  { year: 1947.6, label: 'Radcliffe awards published on 17 August', claimId: 'c-award-dates', extraClaimIds: ['c-radcliffe-quote'] },
  { year: 1948, label: 'Gandhi fasts for peace and is shot on 30 January', claimId: 'c-gandhi-killed', extraClaimIds: ['c-gandhi-fast', 'c-war-1948'] },
  { year: 1960, label: 'Indus Waters Treaty divides the rivers', claimId: 'c-indus' },
  { year: 1971, label: 'East Pakistan becomes Bangladesh', claimId: 'c-1971', extraClaimIds: ['c-1971-deaths'] },
  { year: 2019, label: 'Kartarpur Corridor opens', claimId: 'c-kartarpur', extraClaimIds: ['c-wagah'] },
];

/** Key documents and maps instead of faces: the timeline's second board shows objects and places. */
export const partitionPortraits = [
  { assetId: 'a-bengal-1905-map', caption: 'Bengal, 1905', w: 3000, h: 1989 },
  { assetId: 'a-independence-act-p1', caption: 'Indian Independence Act, 1947', w: 1986, h: 3402 },
  { assetId: 'a-radcliffe-award-report', caption: 'Radcliffe report, Gazette of India, 17 Aug 1947', w: 962, h: 1489 },
  { assetId: 'a-radcliffe-punjab-map', caption: 'The Punjab line, FO map 1948', w: 4503, h: 3340 },
  { assetId: 'a-junagadh-instrument', caption: 'Junagadh Instrument of Accession, 1947', w: 887, h: 1452 },
  { assetId: 'a-kartarpur-view', caption: 'Kartarpur Corridor, 2019', w: 4608, h: 3456 },
];
