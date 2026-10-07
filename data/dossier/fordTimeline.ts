import type { Milestone } from '../../services/dossier/timelineDoc';

/** Short card text (middle-school register). Each milestone cites a ledger claim. */
export const fordMilestones: Milestone[] = [
  { year: 1863, label: 'Born on a farm near Dearborn, Michigan', claimId: 'c-born' },
  { year: 1879, label: 'Leaves the farm to work as a machinist in Detroit', claimId: 'c-left-1879' },
  { year: 1896, label: 'Test-drives his first car, the Quadricycle', claimId: 'c-quadricycle' },
  { year: 1903, label: 'Founds Ford Motor Company', claimId: 'c-fmc' },
  { year: 1908, label: 'The Model T goes on sale', claimId: 'c-modelt' },
  { year: 1913, label: 'Moving assembly line cuts chassis time to 93 minutes', claimId: 'c-line-stages', extraClaimIds: ['c-93min'] },
  { year: 1914, label: 'The Five Dollar Day, with a Sociological Department', claimId: 'c-5day', extraClaimIds: ['c-socio'] },
  { year: 1915, label: 'Sails on the failed Peace Ship', claimId: 'c-peace-sail' },
  { year: 1920, label: 'The Dearborn Independent begins its antisemitic series', claimId: 'c-series' },
  { year: 1927, label: 'Retracts the campaign after the Sapiro libel suit; Model T ends', claimId: 'c-retraction', extraClaimIds: ['c-15m'] },
  { year: 1932, label: 'Hunger March at the Rouge: four killed that day', claimId: 'c-hunger' },
  { year: 1937, label: 'Battle of the Overpass', claimId: 'c-overpass' },
  { year: 1938, label: 'Accepts the Nazi Grand Cross of the German Eagle', claimId: 'c-eagle' },
  { year: 1941, label: 'Signs a union contract with the UAW', claimId: 'c-1941' },
  { year: 1943, label: 'Willow Run builds bombers; son Edsel dies', claimId: 'c-willow', extraClaimIds: ['c-edsel'] },
  { year: 1947, label: 'Dies at Fair Lane on 7 April', claimId: 'c-death' },
];

export const fordPortraits = [
  { assetId: 'ref-1902-999', caption: '1902', w: 2568, h: 1459 },
  { assetId: 'ref-1915-peaceship', caption: '1915', w: 5435, h: 4332 },
  { assetId: 'ref-1919-hartsook', caption: '1919', w: 2874, h: 3686 },
  { assetId: 'ref-1927-whitehouse', caption: '1927', w: 3242, h: 4096 },
  { assetId: 'ref-1929-edison', caption: '1929', w: 3024, h: 2412 },
  { assetId: 'ref-1938-car', caption: '1938', w: 1024, h: 826 },
];
