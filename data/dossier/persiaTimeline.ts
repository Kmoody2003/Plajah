import type { Milestone } from '../../services/dossier/timelineDoc';

/**
 * Short card text (middle-school register). Each milestone cites a ledger claim.
 * The span is about two thousand years, so only sixteen turning points are used, and the first
 * (Pentecost) is a tradition, not a documented event; its card says so.
 */
export const persiaMilestones: Milestone[] = [
  { year: 33, label: 'Pentecost: Acts 2:9 names Parthians and Medes (a later tradition links them to Persia)', claimId: 'c-acts-list', extraClaimIds: ['c-acts-seed'] },
  { year: 290, label: 'Kartir\'s inscriptions list Christians among the groups he struck down', claimId: 'c-kartir', extraClaimIds: ['c-kartir-doubt'] },
  { year: 340, label: 'Persecution under Shapur II; Simeon bar Sabbae executed', claimId: 'c-simeon' },
  { year: 410, label: 'Synod at Seleucia-Ctesiphon: a catholicos for the Persian church', claimId: 'c-synod-410' },
  { year: 424, label: 'Synod of Markabta ends appeals to Roman bishops', claimId: 'c-synod-424' },
  { year: 635, label: 'Olopun reaches Chang\'an, according to the Xi\'an Stele', claimId: 'c-alopen' },
  { year: 781, label: 'The Xi\'an Stele is erected', claimId: 'c-stele781' },
  { year: 845, label: 'Edict of Wuzong against foreign religions in China', claimId: 'c-wuzong' },
  { year: 1258, label: 'Mongols take Baghdad; Doquz Khatun is said to protect Christians', claimId: 'c-doquz' },
  { year: 1287, label: 'Rabban Bar Sauma travels from the Mongol court to Rome and Paris', claimId: 'c-barsauma', extraClaimIds: ['c-arghun-letter'] },
  { year: 1606, label: 'New Julfa founded at Isfahan (dating disputed)', claimId: 'c-abbas-resettle', extraClaimIds: ['c-vank'] },
  { year: 1812, label: 'Henry Martyn completes a Persian New Testament', claimId: 'c-martyn' },
  { year: 1841, label: 'Mission press at Urmia prints in the Syriac of the plain', claimId: 'c-press-urmia' },
  { year: 1918, label: 'War on the Urmia plain; Assyrians flee toward Hamadan', claimId: 'c-hamadan', extraClaimIds: ['c-shimun-1918'] },
  { year: 1979, label: 'After the revolution: seats reserved for Armenians, Assyrians and Chaldeans', claimId: 'c-constitution-1979', extraClaimIds: ['c-emigration'] },
  { year: 2016, label: 'Latest census count of Christians; estimates remain contested', claimId: 'c-census-series', extraClaimIds: ['c-pop-estimates'] },
];

/** Key artifacts instead of faces: the timeline's second board shows objects and places. */
export const persiaPortraits = [
  { assetId: 'a-stele-wdl', caption: 'Xi\'an Stele, 781', w: 1570, h: 1024 },
  { assetId: 'a-jesus-sutra', caption: 'Jesus Sutra, Tang China', w: 844, h: 1262 },
  { assetId: 'a-arghun-letter', caption: 'Arghun\'s letter, 1289', w: 3172, h: 2143 },
  { assetId: 'a-farman-1614', caption: 'Safavid farman, 1614', w: 2744, h: 2515 },
  { assetId: 'a-vank-dome', caption: 'Vank Cathedral, Isfahan', w: 8623, h: 5416 },
  { assetId: 'a-assyrian-gospel', caption: 'Assyrian Gospel, Urmia', w: 725, h: 539 },
];
