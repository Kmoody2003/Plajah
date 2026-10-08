import type { Milestone } from '../../services/dossier/timelineDoc';

/** Short card text (middle-school register). Each milestone cites a ledger claim. */
export const douglassMilestones: Milestone[] = [
  { year: 1818, label: 'Born into slavery in Talbot County, Maryland', claimId: 'c-born' },
  { year: 1826, label: 'Sent to Baltimore; begins to learn his letters', claimId: 'c-baltimore' },
  { year: 1834, label: 'Fights back against the "slave breaker" Edward Covey', claimId: 'c-covey' },
  { year: 1838, label: 'Escapes north; marries Anna Murray; takes the name Douglass', claimId: 'c-escape' },
  { year: 1841, label: 'First great speech, on Nantucket; hired as a lecturer', claimId: 'c-nantucket' },
  { year: 1845, label: 'Publishes his Narrative; in Britain, friends buy his freedom (1846)', claimId: 'c-narrative', extraClaimIds: ['c-britain'] },
  { year: 1847, label: 'Founds The North Star in Rochester, New York', claimId: 'c-northstar' },
  { year: 1848, label: 'Speaks for women\'s right to vote at Seneca Falls', claimId: 'c-seneca' },
  { year: 1852, label: '"What to the Slave Is the Fourth of July?"', claimId: 'c-fourth' },
  { year: 1859, label: 'Declines to join John Brown\'s raid at Harpers Ferry', claimId: 'c-brown' },
  { year: 1863, label: 'Recruits Black soldiers; meets President Lincoln', claimId: 'c-lincoln' },
  { year: 1869, label: 'Backs the Fifteenth Amendment; splits with some suffragists', claimId: 'c-suffrage' },
  { year: 1877, label: 'Becomes U.S. Marshal for D.C.; buys Cedar Hill', claimId: 'c-offices' },
  { year: 1889, label: 'Named U.S. Minister to Haiti', claimId: 'c-offices' },
  { year: 1895, label: 'Dies at Cedar Hill on 20 February', claimId: 'c-death' },
];

export const douglassPortraits = [
  { assetId: 'ref-1847-miller', caption: 'About 1847–52', w: 4786, h: 6001 },
  { assetId: 'ref-1855-younger', caption: '1855', w: 1739, h: 1992 },
  { assetId: 'ref-1860s-merrill-crosby', caption: '1860s', w: 1166, h: 1907 },
  { assetId: 'ref-1879-warren', caption: 'About 1879', w: 2089, h: 3000 },
  { assetId: 'ref-1890s-grandson', caption: '1890s', w: 1587, h: 2436 },
];
