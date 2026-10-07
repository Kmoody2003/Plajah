import type { Milestone } from '../../services/dossier/timelineDoc';
import rawAssets from './foundingAssets.json';

/**
 * The Founding Era timeline: the exhibit's interactive centrepiece (components/dossier/experiences/FoundingTimeline.tsx)
 * and, as in the other exhibits, a Tela board in the making.
 *
 * Every pin cites ledger claims, so the confidence chips on a pin come from the evidence list, and each pin names the
 * room that explains it. The spine is the four presidencies; the stretch before 1789 has its own band.
 * Dates are decimal years (4 July 1776 is 1776.5); the milestone's `year` places the pin, and the claims carry
 * the full dates. Pins are selected, not exhaustive.
 */
export interface FoundingPin extends Milestone {
  /** The room that tells the story of this pin. */
  roomId: string;
  /** A short label for the pin's card (under about 60 characters); `label` is the fuller line. */
  short: string;
}

/** Axis range of the timeline, in decimal years. */
export const FOUNDING_RANGE = { from: 1754, to: 1818 } as const;

export interface Presidency {
  id: 'before' | 'washington' | 'adams' | 'jefferson' | 'madison';
  name: string;
  /** Plain description of the band. */
  span: string;
  from: number;
  to: number;
  /** Band colour (dark-ground friendly; the band's name is always written, so colour is never the only signal). */
  color: string;
}

/** Inauguration dates: 30 Apr 1789, 4 Mar 1797, 4 Mar 1801, 4 Mar 1809, 4 Mar 1817 (claim c-four-presidents). */
export const PRESIDENCIES: Presidency[] = [
  { id: 'before', name: 'Before the Republic', span: 'colonies, Revolution, Confederation', from: 1754, to: 1789.33, color: '#7f8f8b' },
  { id: 'washington', name: 'Washington', span: '1789 to 1797', from: 1789.33, to: 1797.17, color: '#4fb3a0' },
  { id: 'adams', name: 'Adams', span: '1797 to 1801', from: 1797.17, to: 1801.17, color: '#d9a441' },
  { id: 'jefferson', name: 'Jefferson', span: '1801 to 1809', from: 1801.17, to: 1809.17, color: '#7aa2e3' },
  { id: 'madison', name: 'Madison', span: '1809 to 1817', from: 1809.17, to: 1817.17, color: '#d98aa8' },
];

/** Census Bureau counts (Population Division Working Paper 56, table 1; claims c-census-1790 and c-census-1810). */
export const CENSUS_POINTS = [
  { year: 1790, total: 3929214, enslaved: 697681, claimId: 'c-census-1790' },
  { year: 1810, total: 7239881, enslaved: 1191362, claimId: 'c-census-1810' },
] as const;

/** The persistent plain note under the line. */
export const SLAVERY_NOTE =
  'Enslaved people lived and worked in every year and in every presidency on this line, in the North and the South. ' +
  'The census counted 697,681 enslaved people in 1790 and 1,191,362 in 1810. Native nations also held much of the continent throughout, and the census did not count them.';

/** All pins for the interactive timeline. */
export const foundingMilestones: FoundingPin[] = [
  { year: 1754.4, short: 'Join, or Die; the Seven Years\' War', label: 'Franklin\'s "Join, or Die" and the Albany Plan; the Seven Years\' War begins', claimId: 'c-albany-1754', extraClaimIds: ['c-seven-years'], roomId: 'r1' },
  { year: 1763.8, short: 'Royal Proclamation of 1763', label: 'The Royal Proclamation reserves western land to Native nations', claimId: 'c-proclamation-text', extraClaimIds: ['c-proclamation-effect', 'c-pontiac'], roomId: 'r1' },
  { year: 1765.85, short: 'The Stamp Act', label: 'The Stamp Act takes effect and the colonies protest', claimId: 'c-stamp-act', extraClaimIds: ['c-no-taxation'], roomId: 'r2' },
  { year: 1770.2, short: 'Boston, 5 March 1770', label: 'British soldiers fire into a Boston crowd; five colonists die', claimId: 'c-massacre', extraClaimIds: ['c-massacre-print', 'c-attucks'], roomId: 'r2' },
  { year: 1773.95, short: 'Boston Tea Party', label: 'Tea thrown into Boston harbour; the Coercive Acts follow', claimId: 'c-tea-party', extraClaimIds: ['c-coercive'], roomId: 'r2' },
  { year: 1775.3, short: 'Lexington and Concord', label: 'The war begins at Lexington and Concord (19 April 1775)', claimId: 'c-lexington', extraClaimIds: ['c-who-fired'], roomId: 'r3' },
  { year: 1775.85, short: 'Dunmore\'s offer of freedom', label: 'Lord Dunmore offers freedom to enslaved people of rebels who join the British', claimId: 'c-dunmore', extraClaimIds: ['c-dunmore-effect'], roomId: 'r6' },
  { year: 1776.5, short: 'The Declaration adopted', label: 'The Declaration is adopted; Congress strikes the slave-trade grievance', claimId: 'c-edits', extraClaimIds: ['c-struck-clause', 'c-struck-why', 'c-all-men-meaning'], roomId: 'r4' },
  { year: 1777.8, short: 'Saratoga and the French alliance', label: 'Saratoga (1777) and the alliance with France (1778)', claimId: 'c-saratoga', extraClaimIds: ['c-french-alliance'], roomId: 'r5' },
  { year: 1779.6, short: 'Sullivan expedition', label: 'American army destroys more than forty Haudenosaunee towns', claimId: 'c-sullivan', extraClaimIds: ['c-haudenosaunee-split'], roomId: 'r6' },
  { year: 1781.8, short: 'Yorktown', label: 'Cornwallis surrenders at Yorktown (19 October 1781)', claimId: 'c-yorktown', extraClaimIds: ['c-war-dead'], roomId: 'r5' },
  { year: 1783.7, short: 'Treaty of Paris', label: 'Britain recognises independence; no Native nation is a party; Black Loyalists leave', claimId: 'c-peace-1783', extraClaimIds: ['c-paris-art7', 'c-natives-1783', 'c-black-loyalists'], roomId: 'r5' },
  { year: 1787.05, short: 'Shays\' Rebellion', label: 'Shays\' Rebellion ends in Massachusetts (1786 to 1787)', claimId: 'c-shays', extraClaimIds: ['c-shays-meaning'], roomId: 'r7' },
  { year: 1787.4, short: 'The Convention; three-fifths', label: 'The Constitutional Convention and the three-fifths clause', claimId: 'c-three-fifths-text', extraClaimIds: ['c-three-fifths-meaning', 'c-trade-clause', 'c-convention'], roomId: 'r8' },
  { year: 1787.53, short: 'Northwest Ordinance', label: 'The Northwest Ordinance bans slavery north of the Ohio and promises good faith to Native nations', claimId: 'c-nw-art6', extraClaimIds: ['c-nw-art3'], roomId: 'r7' },
  { year: 1788.47, short: 'Constitution ratified', label: 'New Hampshire is the ninth state to ratify the Constitution', claimId: 'c-ratification', extraClaimIds: ['c-antifed', 'c-federalist-papers'], roomId: 'r9' },
  { year: 1789.33, short: 'Washington inaugurated', label: 'George Washington takes the oath of office in New York', claimId: 'c-inaug', extraClaimIds: ['c-precedents'], roomId: 'r10' },
  { year: 1791.95, short: 'Bill of Rights', label: 'Ten amendments, the Bill of Rights, are ratified', claimId: 'c-bill-rights', extraClaimIds: ['c-bor-limits'], roomId: 'r9' },
  { year: 1794.55, short: 'Whiskey Rebellion; Jay Treaty', label: 'The Whiskey Rebellion (1794) and the Jay Treaty (1794 to 1795)', claimId: 'c-whiskey', extraClaimIds: ['c-whiskey-meaning', 'c-neutrality'], roomId: 'r10' },
  { year: 1794.7, short: 'Fallen Timbers; Greenville', label: 'Native nations lose at Fallen Timbers; Greenville cedes most of Ohio (1795)', claimId: 'c-nw-war', extraClaimIds: ['c-greenville', 'c-canandaigua'], roomId: 'r10' },
  { year: 1796.4, short: 'Ona Judge escapes', label: 'Ona Judge escapes from Washington\'s household in Philadelphia', claimId: 'c-judge', extraClaimIds: ['c-rotation'], roomId: 'r11' },
  { year: 1796.72, short: 'Farewell Address', label: 'Washington\'s Farewell Address (19 September 1796)', claimId: 'c-farewell', extraClaimIds: ['c-farewell-authorship'], roomId: 'r10' },
  { year: 1798.53, short: 'Alien and Sedition Acts', label: 'The Alien and Sedition Acts (1798) and the Quasi-War with France', claimId: 'c-sedition', extraClaimIds: ['c-aliens', 'c-sedition-count', 'c-quasi-war'], roomId: 'r12' },
  { year: 1799.95, short: 'Washington\'s will', label: 'Washington dies; his will frees the people he held in his own right', claimId: 'c-wash-will', extraClaimIds: ['c-martha-free', 'c-mv-census'], roomId: 'r11' },
  { year: 1800.66, short: 'Gabriel\'s conspiracy', label: 'Gabriel\'s planned march on Richmond is betrayed', claimId: 'c-gabriel', roomId: 'r12' },
  { year: 1801.13, short: 'Election of 1800', label: 'The House picks Jefferson on the 36th ballot; power changes hands peacefully', claimId: 'c-election-1800', extraClaimIds: ['c-inaug-1801', 'c-adams-left'], roomId: 'r13' },
  { year: 1802.7, short: 'Callender and Hemings', label: 'The Sally Hemings story is published (1802); DNA evidence follows in 1998', claimId: 'c-callender', extraClaimIds: ['c-hemings-paternity', 'c-dna'], roomId: 'r14' },
  { year: 1803.33, short: 'Louisiana Purchase', label: 'The Louisiana Purchase: France sells its claim for $15 million', claimId: 'c-louisiana', extraClaimIds: ['c-louisiana-natives', 'c-jeff-doubts'], roomId: 'r13' },
  { year: 1804.37, short: 'Lewis and Clark set out', label: 'Lewis and Clark leave St. Louis; Sacagawea and York join the Corps', claimId: 'c-lewis-clark', extraClaimIds: ['c-sacagawea-role', 'c-york', 'c-sacagawea-legend'], roomId: 'r13' },
  { year: 1807.17, short: 'Slave-trade ban signed', label: 'Jefferson signs the ban on importing enslaved people (effective 1808)', claimId: 'c-ban-1807', extraClaimIds: ['c-ban-limits', 'c-domestic-trade'], roomId: 'r14' },
  { year: 1807.97, short: 'The Embargo', label: 'The Embargo Act closes American ports to foreign trade', claimId: 'c-embargo', extraClaimIds: ['c-embargo-effect'], roomId: 'r13' },
  { year: 1812.46, short: 'War of 1812 declared', label: 'Congress declares war on Britain (18 June 1812)', claimId: 'c-war-declared', extraClaimIds: ['c-war-causes', 'c-tecumseh'], roomId: 'r15' },
  { year: 1814.65, short: 'Washington burned', label: 'The British burn the Capitol and the President\'s House', claimId: 'c-washington-burned', extraClaimIds: ['c-portrait'], roomId: 'r15' },
  { year: 1815.0, short: 'Hartford; Ghent; New Orleans', label: 'Hartford Convention, Treaty of Ghent and the battle of New Orleans', claimId: 'c-hartford', extraClaimIds: ['c-hartford-secession', 'c-ghent', 'c-new-orleans', 'c-black-1812'], roomId: 'r15' },
  { year: 1817.1, short: 'Monroe; "Good Feelings"', label: 'Monroe takes office; the "Era of Good Feelings" and the Colonization Society', claimId: 'c-good-feelings', extraClaimIds: ['c-acs'], roomId: 'r15' },
];

/**
 * A short list for the Tela board (the board's cards need room, so it carries only sixteen turning points); the
 * interactive timeline above carries them all. Not registered with the registry until the .tela.json is generated.
 */
export const foundingBoardMilestones: Milestone[] = [
  { year: 1754, label: 'Join, or Die; the Seven Years\' War begins', claimId: 'c-albany-1754', extraClaimIds: ['c-seven-years'] },
  { year: 1763, label: 'Royal Proclamation reserves western land to Native nations', claimId: 'c-proclamation-text', extraClaimIds: ['c-proclamation-effect'] },
  { year: 1773.95, label: 'Boston Tea Party; the Coercive Acts', claimId: 'c-tea-party', extraClaimIds: ['c-coercive'] },
  { year: 1776.5, label: 'Declaration adopted; slave-trade grievance struck', claimId: 'c-edits', extraClaimIds: ['c-struck-clause', 'c-struck-why'] },
  { year: 1781.8, label: 'Yorktown', claimId: 'c-yorktown' },
  { year: 1787.4, label: 'Convention and three-fifths clause', claimId: 'c-three-fifths-text', extraClaimIds: ['c-three-fifths-meaning'] },
  { year: 1789.33, label: 'Washington inaugurated', claimId: 'c-inaug' },
  { year: 1791.95, label: 'Bill of Rights ratified', claimId: 'c-bill-rights' },
  { year: 1796.72, label: 'Farewell Address', claimId: 'c-farewell' },
  { year: 1798.53, label: 'Alien and Sedition Acts', claimId: 'c-sedition', extraClaimIds: ['c-sedition-count'] },
  { year: 1801.13, label: 'Election of 1800 and the peaceful transfer', claimId: 'c-election-1800', extraClaimIds: ['c-inaug-1801'] },
  { year: 1803.33, label: 'Louisiana Purchase', claimId: 'c-louisiana', extraClaimIds: ['c-louisiana-natives'] },
  { year: 1807.17, label: 'Slave-trade ban signed', claimId: 'c-ban-1807', extraClaimIds: ['c-ban-limits'] },
  { year: 1812.46, label: 'War of 1812 declared', claimId: 'c-war-declared', extraClaimIds: ['c-war-causes'] },
  { year: 1814.65, label: 'Washington burned', claimId: 'c-washington-burned' },
  { year: 1815.0, label: 'Treaty of Ghent; Hartford Convention', claimId: 'c-ghent', extraClaimIds: ['c-hartford'] },
];

const dims = new Map((rawAssets as Array<{ id: string; width: number; height: number }>).map(a => [a.id, { w: a.width, h: a.height }]));
const portrait = (assetId: string, caption: string) => {
  const d = dims.get(assetId);
  if (!d) throw new Error(`foundingTimeline: asset ${assetId} is not in foundingAssets.json`);
  return { assetId, caption, w: d.w, h: d.h };
};

/** Key documents and maps instead of faces: the timeline's second board shows objects and places. */
export const foundingPortraits = [
  portrait('a-join-or-die', '"Join, or Die", 1754'),
  portrait('a-proclamation-1763', 'Map keyed to the Royal Proclamation, 1763'),
  portrait('a-jefferson-rough-draft', 'Jefferson\'s rough draft of the Declaration, 1776'),
  portrait('a-constitution-p1', 'The Constitution, 1787'),
  portrait('a-louisiana-treaty', 'Louisiana Purchase treaty, 1803'),
  portrait('a-lewis-clark-map', 'Clark\'s map of the Lewis and Clark route, 1814'),
];
