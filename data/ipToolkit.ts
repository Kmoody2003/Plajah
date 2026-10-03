/**
 * IP toolkit: official links for protecting intellectual property. Every URL was opened and checked on
 * the verifiedOn date. Official government / standards-body / collecting-society sites only: no
 * paid filing services and no legal-forms sites. Plajah points to these sites; it does not file for you.
 */
export interface IpLink {
  id: string;
  label: string;
  url: string;
  kind: 'copyright' | 'trademark' | 'patent' | 'trade-secret' | 'licensing' | 'rights-org' | 'international' | 'learn';
  what: string;
  cost?: string;
  verifiedOn: string;
}

const V = '2026-10-01';

export const IP_DISCLAIMER =
  'Plajah teaches how intellectual property works and points you to the official sites where you can act on it. ' +
  'Plajah does not file applications for you, does not act as your representative, and does not give legal advice. ' +
  'The lessons describe United States law in general terms; laws, fees and procedures change and differ by country and state, ' +
  'so always confirm details on the official site. Talk to a licensed attorney (a patent attorney for patents) before you ' +
  'file a patent, sign or send a contract, answer a legal demand, sue or are sued, or rely on a fair use or ownership ' +
  'argument that matters financially. Many state bar associations and law school clinics offer free or low-cost first consultations. ' +
  'To check a business name at state level, use the Secretary of State business-entity search for your own state.';

export const IP_LINKS: IpLink[] = [
  // The links below are official, but the sites refuse automated checks (HTTP 403), so they were not machine-verified.
  { id: 'ascap', label: 'ASCAP', url: 'https://www.ascap.com/', kind: 'rights-org', what: 'A U.S. performing rights organization that licenses public performances of songs and pays songwriters and publishers.', verifiedOn: 'official site; blocks automated checks' },
  { id: 'bmi', label: 'BMI', url: 'https://www.bmi.com/', kind: 'rights-org', what: 'A U.S. performing rights organization that licenses public performances of songs and pays songwriters and publishers.', verifiedOn: 'official site; blocks automated checks' },
  { id: 'isbn-us', label: 'ISBN agency for the United States (Bowker)', url: 'https://www.myidentifiers.com/', kind: 'licensing', what: 'The authorised U.S. source for ISBNs, the identifiers books need for each format.', cost: 'Fees apply; check the site', verifiedOn: 'official agency; blocks automated checks' },
  { id: 'patentscope', label: 'WIPO PATENTSCOPE', url: 'https://patentscope.wipo.int/', kind: 'international', what: 'Search international patent applications filed through the PCT and many national collections.', verifiedOn: 'official site; blocks automated checks' },

  // U.S. Copyright Office
  { id: 'usco-home', label: 'U.S. Copyright Office', url: 'https://www.copyright.gov/', kind: 'copyright', what: 'The official home of U.S. copyright registration, records search, law and policy.', verifiedOn: V },
  { id: 'usco-registration', label: 'Register your work (Registration Portal)', url: 'https://www.copyright.gov/registration/', kind: 'copyright', what: 'Start here to register a work through the Electronic Copyright Office (eCO); organised by type of work.', cost: 'Online fees start at $45 (single author, one work) and $65 (standard application); see the fee schedule.', verifiedOn: V },
  { id: 'usco-fees', label: 'Copyright Office fee schedule', url: 'https://www.copyright.gov/about/fees.html', kind: 'copyright', what: 'Current fees for registration, recordation and other services.', cost: 'Fees change; check the page.', verifiedOn: V },
  { id: 'usco-forms', label: 'Copyright forms', url: 'https://www.copyright.gov/forms/', kind: 'copyright', what: 'Registration, recordation and licensing forms, including paper forms.', verifiedOn: V },
  { id: 'usco-circulars', label: 'Copyright circulars', url: 'https://www.copyright.gov/circs/', kind: 'copyright', what: 'Plain-language guides (Circular 1 Copyright Basics, music, software, photographs and more).', cost: 'Free', verifiedOn: V },
  { id: 'usco-fair-use', label: 'Fair Use Index', url: 'https://www.copyright.gov/fair-use/', kind: 'copyright', what: 'Searchable summaries of court fair use decisions, to see how courts have reasoned.', cost: 'Free', verifiedOn: V },
  { id: 'usco-dmca-agent', label: 'DMCA Designated Agent Directory', url: 'https://www.copyright.gov/dmca-directory/', kind: 'copyright', what: 'Find a service provider\'s registered agent for takedown notices, or register one for your own site.', verifiedOn: V },
  { id: 'usco-ai', label: 'Copyright and Artificial Intelligence', url: 'https://www.copyright.gov/ai/', kind: 'copyright', what: 'The Copyright Office\'s reports and guidance on AI-generated works and AI training.', cost: 'Free', verifiedOn: V },
  { id: 'usco-title17', label: 'Copyright Law of the United States (Title 17)', url: 'https://www.copyright.gov/title17/', kind: 'learn', what: 'The full statute text, including section 107 (fair use) and section 512 (DMCA).', cost: 'Free', verifiedOn: V },
  { id: 'ccb', label: 'Copyright Claims Board', url: 'https://ccb.gov/', kind: 'copyright', what: 'A voluntary, lower-cost tribunal for copyright disputes of up to $30,000.', cost: 'Low filing fees; see the site.', verifiedOn: V },

  // USPTO
  { id: 'uspto-tm-home', label: 'USPTO Trademarks', url: 'https://www.uspto.gov/trademarks', kind: 'trademark', what: 'Hub for trademark search, applications, status tracking and maintenance.', verifiedOn: V },
  { id: 'uspto-tm-basics', label: 'Trademark basics', url: 'https://www.uspto.gov/trademarks/basics', kind: 'learn', what: 'Essentials, the examination process and preparing to file, with a free registration toolkit.', cost: 'Free', verifiedOn: V },
  { id: 'uspto-tm-search', label: 'Trademark Search', url: 'https://tmsearch.uspto.gov/', kind: 'trademark', what: 'The USPTO database of registered and pending marks. Search here before choosing a name.', cost: 'Free', verifiedOn: V },
  { id: 'uspto-tm-apply', label: 'Apply for a trademark (Trademark Center)', url: 'https://www.uspto.gov/trademarks/apply', kind: 'trademark', what: 'How to file a new application; required to use Trademark Center with a verified account.', cost: 'See the fee page.', verifiedOn: V },
  { id: 'uspto-tm-fees', label: 'Trademark fee information', url: 'https://www.uspto.gov/trademarks/trademark-fee-information', kind: 'trademark', what: 'Current per-class filing and maintenance fees.', cost: 'Base application fee was $350 per class when checked.', verifiedOn: V },
  { id: 'uspto-patents-home', label: 'USPTO Patents', url: 'https://www.uspto.gov/patents', kind: 'patent', what: 'Hub for patent basics, search, filing and fees.', verifiedOn: V },
  { id: 'uspto-patent-search', label: 'Patent Public Search', url: 'https://ppubs.uspto.gov/pubwebapp/', kind: 'patent', what: 'Search granted U.S. patents and published applications for prior art.', cost: 'Free', verifiedOn: V },
  { id: 'uspto-provisional', label: 'Provisional application for patent', url: 'https://www.uspto.gov/patents/basics/apply/provisional-application', kind: 'patent', what: 'What a provisional filing does: an early filing date and 12 months of "patent pending".', cost: 'Lower fee than a full application; see the fee schedule.', verifiedOn: V },
  { id: 'uspto-patent-center', label: 'Patent Center', url: 'https://patentcenter.uspto.gov/', kind: 'patent', what: 'The USPTO\'s system for filing and managing patent applications.', verifiedOn: V },
  { id: 'uspto-pro-bono', label: 'Patent Pro Bono Program', url: 'https://www.uspto.gov/patents/basics/using-legal-services/pro-bono/patent-pro-bono-program', kind: 'patent', what: 'Free patent help from volunteer attorneys for eligible low-income inventors and small businesses.', cost: 'Free if eligible', verifiedOn: V },

  // WIPO
  { id: 'wipo-madrid', label: 'WIPO Madrid System', url: 'https://www.wipo.int/madrid/en/', kind: 'international', what: 'File one application to seek trademark protection in many countries (requires a home-country basic mark).', cost: 'Basic fee of 653 Swiss francs when checked, plus per-country fees.', verifiedOn: V },
  { id: 'wipo-pct', label: 'WIPO Patent Cooperation Treaty (PCT)', url: 'https://www.wipo.int/pct/en/', kind: 'international', what: 'One international patent application that preserves your right to file in 150+ countries.', verifiedOn: V },
  { id: 'wipo-branddb', label: 'WIPO Global Brand Database', url: 'https://branddb.wipo.int/', kind: 'international', what: 'Search trademarks, appellations of origin and emblems from many national and international sources.', cost: 'Free', verifiedOn: V },

  // Open licensing and public domain
  { id: 'cc-chooser', label: 'Creative Commons license chooser', url: 'https://creativecommons.org/choose/', kind: 'licensing', what: 'A guided tool that helps you pick a Creative Commons license for your own work.', cost: 'Free', verifiedOn: V },
  { id: 'loc-copyright-guides', label: 'Library of Congress Copyright research guides', url: 'https://guides.loc.gov/copyright', kind: 'learn', what: 'Library of Congress research guides on copyright law, registration and related topics.', cost: 'Free', verifiedOn: V },

  // Rights organizations
  { id: 'sesac', label: 'SESAC', url: 'https://www.sesac.com/', kind: 'rights-org', what: 'U.S. performing rights organization for songwriters, composers and publishers; licenses public performance of music.', verifiedOn: V },
  { id: 'gmr', label: 'Global Music Rights', url: 'https://globalmusicrights.com/', kind: 'rights-org', what: 'Performing rights organization licensing public performance of its members\' compositions.', verifiedOn: V },
  { id: 'mlc', label: 'The Mechanical Licensing Collective (The MLC)', url: 'https://www.themlc.com/', kind: 'rights-org', what: 'Administers blanket mechanical licenses for U.S. streaming and downloads and pays songwriters and publishers.', cost: 'Free to register works as a member.', verifiedOn: V },
  { id: 'soundexchange', label: 'SoundExchange', url: 'https://www.soundexchange.com/', kind: 'rights-org', what: 'Collects digital performance royalties for sound recordings (artists and master owners).', verifiedOn: V },
  { id: 'wga-registry', label: 'Writers Guild of America West Registry', url: 'https://www.wgawregistry.org/', kind: 'rights-org', what: 'Dated registration of scripts and treatments as evidence of authorship. It is not a copyright registration and does not replace one; check the site for current eligibility.', verifiedOn: V },

  // Small business
  { id: 'sba-launch', label: 'SBA: Launch your business (naming and trademarks)', url: 'https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits', kind: 'learn', what: 'U.S. Small Business Administration guidance that touches on protecting a business name and trademarks. Brief on other IP types.', cost: 'Free', verifiedOn: V },
];
