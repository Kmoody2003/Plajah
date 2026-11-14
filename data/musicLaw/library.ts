/**
 * Music law library — statutes, treaties and landmark cases every creator should know, in plain language.
 * Browsed in components/academia/MusicLawLibrary.tsx; studied in the law-music course
 * (data/practice/courses/law-music.ts). Live updates come from services/musicLaw/updates.ts.
 *
 * Rules for this file:
 *  - Only real authorities. Every case carries its reporter citation and a link to a free public copy.
 *  - `checked` says how the citation was confirmed: 'courtlistener' = read off the CourtListener record
 *    on 2026-10-29; 'reporter' = a Supreme Court reporter citation already used elsewhere in Plajah or
 *    standard in every casebook, linked to Justia's free copy. Nothing is marked checked that was not.
 *  - Summaries are ours, written for creators. They are education, not legal advice (LAW_NOTICE).
 */

export type SourceLabel = 'Cornell LII' | 'U.S. Copyright Office' | 'WIPO' | 'EUR-Lex' | 'CourtListener' | 'Justia' | 'Congress.gov';
export interface SourceLink { label: SourceLabel; url: string }

export type Jurisdiction = 'US' | 'INTL' | 'EU';
export type Topic = 'works-vs-recordings' | 'ownership' | 'licensing' | 'sampling' | 'infringement' | 'fair-use' | 'registration' | 'platforms' | 'term' | 'royalties';

export const TOPIC_LABEL: Record<Topic, string> = {
  'works-vs-recordings': 'Songs vs recordings', ownership: 'Who owns it', licensing: 'Licensing', sampling: 'Sampling',
  infringement: 'Infringement', 'fair-use': 'Fair use', registration: 'Registration', platforms: 'Platforms and takedowns',
  term: 'How long it lasts', royalties: 'Royalties',
};

export interface Authority {
  id: string;
  jurisdiction: Jurisdiction;
  /** "17 U.S.C. §106", "Berne Convention". */
  cite: string;
  title: string;
  /** One-line answer to "what does it do?" */
  gist: string;
  /** Plain-language explanation for creators. */
  plain: string;
  /** What it means on Chora specifically. */
  forCreators: string;
  topics: Topic[];
  sources: SourceLink[];
}

export interface Case {
  id: string;
  name: string;
  /** Reporter citation exactly as the court record gives it. */
  cite: string;
  court: string;
  year: number;
  checked: 'courtlistener' | 'reporter';
  /** The works at issue, briefly. */
  dispute: string;
  /** What the court held, in plain words. */
  held: string;
  /** Why a working musician should care. */
  why: string;
  /** Later cases or rules that limit or disagree with it, by id in this file. */
  related?: string[];
  topics: Topic[];
  sources: SourceLink[];
}

const lii = (n: string): SourceLink => ({ label: 'Cornell LII', url: `https://www.law.cornell.edu/uscode/text/17/${n}` });
const justiaUS = (vol: number, page: number): SourceLink => ({ label: 'Justia', url: `https://supreme.justia.com/cases/federal/us/${vol}/${page}/` });
const cl = (path: string): SourceLink => ({ label: 'CourtListener', url: `https://www.courtlistener.com/${path}` });

// ─────────────────────────────────────────────────────────────────────────────
// Statutes and treaties
// ─────────────────────────────────────────────────────────────────────────────

export const AUTHORITIES: Authority[] = [
  {
    id: 'usc-102', jurisdiction: 'US', cite: '17 U.S.C. §102', title: 'What copyright protects',
    gist: 'Original works of authorship fixed in a tangible medium, including musical works and sound recordings.',
    plain: 'Copyright starts automatically the moment an original work is fixed, written down or recorded. Section 102(a) lists the kinds of works: musical works (including any words) and sound recordings are separate categories. Section 102(b) says ideas, methods and systems are never protected, only their expression, so a genre, a groove or a chord progression on its own is not owned by anyone.',
    forCreators: 'Every song on Chora is usually two copyrights at once: the composition (melody and lyrics) and the recording of it. They can have different owners.',
    topics: ['works-vs-recordings'], sources: [lii('102')],
  },
  {
    id: 'usc-106', jurisdiction: 'US', cite: '17 U.S.C. §106', title: 'The exclusive rights',
    gist: 'Reproduce, adapt, distribute, perform and display the work, and for sound recordings, perform by digital audio transmission.',
    plain: 'The owner alone may copy the work, make derivative works (remixes, arrangements), distribute copies, perform it publicly and display it. Sound recordings get a narrower performance right: only performance by digital audio transmission (§106(6)), which is why U.S. AM/FM radio pays songwriters but not recording artists.',
    forCreators: 'Streaming a recording on Chora uses reproduction, distribution and digital performance rights in the recording and performance and mechanical rights in the song. The upload agreement is how you license those to Plajah.',
    topics: ['works-vs-recordings', 'licensing'], sources: [lii('106')],
  },
  {
    id: 'usc-107', jurisdiction: 'US', cite: '17 U.S.C. §107', title: 'Fair use',
    gist: 'Some uses without permission are lawful, judged by four factors.',
    plain: 'Courts weigh (1) the purpose and character of the use, including whether it is commercial and whether it has a different purpose from the original; (2) the nature of the work; (3) how much was taken and how important it was; and (4) the effect on the market for the original. No factor decides alone and there is no safe number of seconds.',
    forCreators: 'Parody, commentary, criticism and teaching can be fair use. A sample used because it sounds good, in a song that competes with the original, is a much harder case.',
    topics: ['fair-use'], sources: [lii('107')],
  },
  {
    id: 'usc-114', jurisdiction: 'US', cite: '17 U.S.C. §114', title: 'Scope of rights in sound recordings',
    gist: 'Limits the recording copyright to the actual sounds, and sets the statutory licence that SoundExchange administers.',
    plain: 'Section 114(b) says the reproduction and adaptation rights in a recording cover the actual sounds fixed in it. Recording new sounds that imitate it (a sound-alike) does not infringe the recording, though it may still infringe the song. Section 114(d) creates a statutory licence for non-interactive digital radio such as webcasting and satellite radio, with rates set by the Copyright Royalty Judges. Section 114(g)(2) splits that money: 50% to the recording owner, 45% to featured artists, 5% to non-featured musicians and vocalists. The Music Modernization Act added a path for producers and engineers to be paid from the artist share by letter of direction.',
    forCreators: 'If your recordings play on non-interactive internet or satellite radio outside Chora, register with SoundExchange to collect. Inside Chora, splits are recorded directly between collaborators.',
    topics: ['works-vs-recordings', 'royalties', 'sampling'], sources: [lii('114')],
  },
  {
    id: 'usc-115', jurisdiction: 'US', cite: '17 U.S.C. §115', title: 'Mechanical licence and the blanket licence',
    gist: 'Anyone may record a cover of a released song by paying the statutory rate; digital services get a blanket licence through The MLC.',
    plain: 'Once a non-dramatic musical work has been distributed to the public on phonorecords with the owner\'s permission, anyone may make and distribute their own recording of it under a compulsory licence, paying the rate the Copyright Royalty Judges set. The licence does not allow changing the basic melody or fundamental character of the song. The Music Modernization Act replaced song-by-song notices for digital services with a blanket licence administered by the mechanical licensing collective (The MLC), available from January 1, 2021.',
    forCreators: 'You can release a cover without the writer\'s permission if you follow §115 and pay. The writer still owns the song and gets the mechanical royalty. Samples are not covers: §115 does not license using someone else\'s recording.',
    topics: ['licensing', 'royalties'], sources: [lii('115'), { label: 'U.S. Copyright Office', url: 'https://www.copyright.gov/music-modernization/' }],
  },
  {
    id: 'usc-201', jurisdiction: 'US', cite: '17 U.S.C. §201', title: 'Who owns a copyright',
    gist: 'The author owns it first; co-authors of a joint work own it together; an employer owns works made for hire.',
    plain: 'Copyright vests initially in the author. Authors of a joint work (one they intended to merge into a single whole, defined in §101) are co-owners. Each co-owner can usually license it non-exclusively but must account to the others for their share of profits. A work made for hire belongs to the employer or commissioning party, but for commissioned work only in listed categories and only with a signed agreement. Ownership can be transferred in whole or in part, and each exclusive right can be owned separately (§201(d)); a transfer of ownership must be in a signed writing (§204).',
    forCreators: 'If you write a song in a session with others and nothing is signed, you may all be co-owners. Agree splits in writing. Chora\'s contribution ledger records who did what, which helps, but your agreement with each other is what decides shares.',
    topics: ['ownership'], sources: [lii('201'), lii('101'), lii('204')],
  },
  {
    id: 'usc-203', jurisdiction: 'US', cite: '17 U.S.C. §203', title: 'Termination of transfers',
    gist: 'Authors can take back rights they granted, during a five-year window starting 35 years after the grant.',
    plain: 'For grants an author made on or after January 1, 1978, the author (or certain heirs) may terminate the grant during a five-year window beginning 35 years after it was made, by serving written notice between two and ten years in advance and recording it with the Copyright Office. It cannot be waived by contract. It does not apply to works made for hire.',
    forCreators: 'A deal you sign today is not necessarily forever. This is one reason labels prefer work-for-hire language. Read it before you sign.',
    topics: ['ownership', 'term'], sources: [lii('203')],
  },
  {
    id: 'usc-302', jurisdiction: 'US', cite: '17 U.S.C. §302', title: 'How long copyright lasts',
    gist: 'Life of the author plus 70 years; 95 years from publication (or 120 from creation, if shorter) for works made for hire.',
    plain: 'For works created on or after January 1, 1978, copyright lasts for the author\'s life plus 70 years, and for joint works, 70 years after the last surviving author dies. Anonymous, pseudonymous and work-made-for-hire works last 95 years from first publication or 120 years from creation, whichever ends first. Older works follow transition rules in §§303–305, and pre-1972 sound recordings have their own schedule under §1401.',
    forCreators: 'Plajah\'s public-domain engine (services/publicDomainRights) applies these rules before anything is labelled free to use.',
    topics: ['term'], sources: [lii('302'), lii('1401')],
  },
  {
    id: 'usc-411', jurisdiction: 'US', cite: '17 U.S.C. §§411–412', title: 'Registration before suing',
    gist: 'You must register a U.S. work before suing over it, and register early to get statutory damages and fees.',
    plain: 'Copyright exists without registration, but §411(a) bars an infringement suit over a U.S. work until it has been registered (or refused). The Supreme Court held in Fourth Estate (2019) that this means the Copyright Office has acted on the application. Under §412, statutory damages and attorney\'s fees are generally available only if the work was registered before the infringement began, or within three months of first publication.',
    forCreators: 'A Chora seal or blockchain timestamp is strong evidence of when you had a file. It is not a registration. Register important releases with the Copyright Office; group options exist for albums and for unpublished works.',
    topics: ['registration'], sources: [lii('411'), lii('412'), { label: 'U.S. Copyright Office', url: 'https://www.copyright.gov/registration/' }],
  },
  {
    id: 'usc-512', jurisdiction: 'US', cite: '17 U.S.C. §512', title: 'Safe harbours and notice-and-takedown',
    gist: 'Platforms that host user uploads are shielded from damages if they remove infringing material when notified.',
    plain: 'Section 512(c) protects a service that stores material at a user\'s direction, if it does not know of the infringement, does not profit directly from infringement it can control, registers an agent with the Copyright Office, and removes material promptly on a proper notice. The uploader can send a counter-notice, and the material can return unless the claimant files suit. Services must also have a policy for terminating repeat infringers.',
    forCreators: 'If someone uploads your music to Chora without permission, a takedown notice is the fast route. If your upload is wrongly taken down, you can counter-notify.',
    topics: ['platforms'], sources: [lii('512'), { label: 'U.S. Copyright Office', url: 'https://www.copyright.gov/512/' }],
  },
  {
    id: 'mma-2018', jurisdiction: 'US', cite: 'Pub. L. No. 115-264 (2018)', title: 'Orrin G. Hatch–Bob Goodlatte Music Modernization Act',
    gist: 'Created The MLC and the digital blanket licence, federal protection for pre-1972 recordings, and producer royalties.',
    plain: 'Signed October 11, 2018, in three titles. Title I (Musical Works Modernization Act) created the blanket mechanical licence for digital services and the mechanical licensing collective that administers it, and changed how rates are set. Title II (the CLASSICS Act) gave pre-1972 sound recordings federal remedies for unauthorised digital performance, now 17 U.S.C. §1401. Title III (the AMP Act) set up a way for producers, mixers and engineers to receive part of the SoundExchange artist share.',
    forCreators: 'If your songs stream on other services, register them with The MLC so unmatched mechanical royalties reach you.',
    topics: ['licensing', 'royalties'], sources: [{ label: 'U.S. Copyright Office', url: 'https://www.copyright.gov/music-modernization/' }, { label: 'Congress.gov', url: 'https://www.congress.gov/bill/115th-congress/house-bill/1551' }],
  },
  {
    id: 'berne', jurisdiction: 'INTL', cite: 'Berne Convention (1886, Paris Act 1971)', title: 'Berne Convention for the Protection of Literary and Artistic Works',
    gist: 'Protection without formalities, national treatment, and a minimum term of life plus 50 years.',
    plain: 'Member countries must protect works from other members as they protect their own (national treatment), may not make protection depend on formalities such as registration or a copyright notice, and must protect for at least the author\'s life plus 50 years. Authors also get moral rights to be named and to object to distortion. The United States joined effective March 1, 1989, which is why the U.S. registration requirement in §411 applies only to U.S. works.',
    forCreators: 'Your song is protected in most countries from the moment you make it, with no paperwork. Terms differ by country.',
    topics: ['term', 'registration'], sources: [{ label: 'WIPO', url: 'https://www.wipo.int/treaties/en/ip/berne/' }],
  },
  {
    id: 'wppt', jurisdiction: 'INTL', cite: 'WIPO Performances and Phonograms Treaty (1996)', title: 'WIPO Performances and Phonograms Treaty',
    gist: 'International rights for performers and record producers, including online making-available.',
    plain: 'The WPPT gives performers rights over fixation and use of their performances and moral rights to be named, and gives producers of phonograms rights of reproduction, distribution and making available on demand. Minimum term is 50 years. It was the basis for many national internet-era rules on recordings and anti-circumvention.',
    forCreators: 'Outside the U.S., performers often have their own neighbouring rights in a recording, collected by performer societies.',
    topics: ['works-vs-recordings', 'royalties'], sources: [{ label: 'WIPO', url: 'https://www.wipo.int/treaties/en/ip/wppt/' }],
  },
  {
    id: 'eu-term', jurisdiction: 'EU', cite: 'Directive 2006/116/EC, as amended by 2011/77/EU', title: 'EU Term Directive',
    gist: 'Life plus 70 for works; 70 years for sound recordings and the performances on them.',
    plain: 'The 2006 directive harmonised the term for authors\' works at life plus 70 years across the EU. The 2011 amendment extended the term for performers and producers of sound recordings from 50 to 70 years, counted a co-written song\'s term from the death of the last surviving lyricist or composer, let performers recover rights a producer is not using, and required a fund for session musicians from the extra years.',
    forCreators: 'A recording that is public domain in one country may still be protected in the EU, and the other way round.',
    topics: ['term'], sources: [{ label: 'EUR-Lex', url: 'https://eur-lex.europa.eu/eli/dir/2006/116/oj' }, { label: 'EUR-Lex', url: 'https://eur-lex.europa.eu/eli/dir/2011/77/oj' }],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Landmark cases
// ─────────────────────────────────────────────────────────────────────────────

export const CASES: Case[] = [
  {
    id: 'grand-upright', name: 'Grand Upright Music, Ltd. v. Warner Bros. Records, Inc.', cite: '780 F. Supp. 182', court: 'S.D.N.Y.', year: 1991, checked: 'courtlistener',
    dispute: 'Biz Markie\'s "Alone Again" sampled Gilbert O\'Sullivan\'s "Alone Again (Naturally)" after permission had been sought and not given.',
    held: 'The court granted an injunction against the uncleared sample and referred the matter to the U.S. Attorney to consider criminal prosecution. It treated the case as plain theft and did not engage with fair use.',
    why: 'A single district-court ruling, not binding on other courts, but it changed industry practice overnight: from then on labels cleared samples before release.',
    related: ['bridgeport', 'vmg-salsoul'], topics: ['sampling', 'infringement'],
    sources: [cl('?q=caseName%3A(%22Grand+Upright%22)&type=o')],
  },
  {
    id: 'campbell', name: 'Campbell v. Acuff-Rose Music, Inc.', cite: '510 U.S. 569', court: 'U.S. Supreme Court', year: 1994, checked: 'reporter',
    dispute: '2 Live Crew recorded "Pretty Woman," a rap parody of Roy Orbison\'s "Oh, Pretty Woman," after being refused a licence.',
    held: 'A commercial parody can be fair use. The more transformative the new work, the less the commercial purpose counts against it. A parody may take enough to conjure up the original. The Court sent the case back to consider the effect on the market for rap derivatives.',
    why: 'The leading case on parody and transformative use in music. It also shows that asking for permission and being refused does not end a fair use argument.',
    related: ['warhol'], topics: ['fair-use'],
    sources: [justiaUS(510, 569)],
  },
  {
    id: 'newton', name: 'Newton v. Diamond', cite: '388 F.3d 1189', court: '9th Cir.', year: 2004, checked: 'courtlistener',
    dispute: 'The Beastie Boys looped a six-second, three-note flute passage from James Newton\'s recording "Choir" in "Pass the Mic." They had licensed the recording but not the composition.',
    held: 'The part of the composition taken (three notes over a held note) was so small and generic that its use was de minimis, so there was no infringement of the song. Newton\'s distinctive playing belonged to the recording, which had been licensed.',
    why: 'The clearest lesson that a sample touches two copyrights. What makes a sample sound special may be in the recording, not the song.',
    related: ['bridgeport', 'vmg-salsoul'], topics: ['sampling', 'works-vs-recordings'],
    sources: [cl('?q=caseName%3A(Newton+AND+Diamond)+AND+court_id%3Aca9&type=o')],
  },
  {
    id: 'bridgeport', name: 'Bridgeport Music, Inc. v. Dimension Films', cite: '410 F.3d 792', court: '6th Cir.', year: 2005, checked: 'courtlistener',
    dispute: 'N.W.A\'s "100 Miles and Runnin\'" used a two-second guitar chord from Funkadelic\'s "Get Off Your Ass and Jam," pitched down and looped.',
    held: 'For sound recordings there is no de minimis defence: copying any part of the actual sounds, however small, infringes. The court read §114(b) as giving the recording owner the exclusive right to sample. Its short version: get a licence or do not sample.',
    why: 'Still the rule in the Sixth Circuit. It is why even tiny samples are cleared. Fair use was left open.',
    related: ['vmg-salsoul', 'newton'], topics: ['sampling', 'works-vs-recordings'],
    sources: [cl('?q=caseName%3A(Bridgeport+AND+Dimension)&type=o'), lii('114')],
  },
  {
    id: 'vmg-salsoul', name: 'VMG Salsoul, LLC v. Ciccone', cite: '824 F.3d 871', court: '9th Cir.', year: 2016, checked: 'courtlistener',
    dispute: 'Madonna\'s "Vogue" allegedly used a horn hit of under a quarter of a second from "Love Break."',
    held: 'The de minimis rule does apply to sound recordings: a use so small that an average listener would not recognise the appropriation does not infringe. The Ninth Circuit expressly disagreed with Bridgeport.',
    why: 'Created a split between federal appeals courts that the Supreme Court has not resolved. Where you are sued can change the answer.',
    related: ['bridgeport'], topics: ['sampling'],
    sources: [cl('opinion/3208970/vmg-salsoul-llc-v-madonna-ciccone/')],
  },
  {
    id: 'williams-gaye', name: 'Williams v. Gaye', cite: '885 F.3d 1150 (amended July 2018)', court: '9th Cir.', year: 2018, checked: 'courtlistener',
    dispute: 'Marvin Gaye\'s heirs said "Blurred Lines" copied "Got to Give It Up."',
    held: 'The court affirmed most of a jury verdict against Robin Thicke and Pharrell Williams, largely on procedural grounds: it would not second-guess the jury\'s findings or the jury instructions on that record. Because "Got to Give It Up" was a 1909 Act work, the trial court had limited the protected composition to the deposit copy of the sheet music, not the recording. A dissent warned the result protected a musical style.',
    why: 'Shook songwriters because it seemed to let a "feel" be owned. Later cases, especially Skidmore, narrowed its reach.',
    related: ['skidmore', 'gray-hudson'], topics: ['infringement'],
    sources: [cl('opinion/4479555/pharrell-williams-v-frankie-gaye/'), cl('opinion/4515969/pharrell-williams-v-frankie-gaye/')],
  },
  {
    id: 'fourth-estate', name: 'Fourth Estate Public Benefit Corp. v. Wall-Street.com, LLC', cite: '586 U.S. 296', court: 'U.S. Supreme Court', year: 2019, checked: 'courtlistener',
    dispute: 'A news organisation sued over articles it had applied to register but the Copyright Office had not yet acted on.',
    held: 'Registration "has been made" under §411(a) when the Copyright Office registers the work, not when the application is filed. Until then (or a refusal), a U.S. owner cannot sue.',
    why: 'Register early. Processing takes months, and you cannot sue an infringer until it is done. A blockchain timestamp does not count as registration.',
    related: ['nealy'], topics: ['registration'],
    sources: [cl('opinion/4595875/fourth-estate-pub-benefit-corp-v-wall-streetcom-llc/'), lii('411')],
  },
  {
    id: 'skidmore', name: 'Skidmore v. Led Zeppelin', cite: '952 F.3d 1051', court: '9th Cir. (en banc)', year: 2020, checked: 'courtlistener',
    dispute: 'The trustee for Spirit\'s guitarist Randy Wolfe said the opening of "Stairway to Heaven" copied "Taurus."',
    held: 'The full Ninth Circuit upheld the jury verdict for Led Zeppelin. Under the 1909 Act the protected work is the deposit copy, so the jury could not hear the recording. It abolished the "inverse ratio" rule (that more access means less similarity is needed), and confirmed that common musical building blocks, such as a descending chromatic scale, are not protected on their own, though an original selection and arrangement of them can be.',
    why: 'The current Ninth Circuit framework for music copying cases, and a check on the reach of Williams v. Gaye.',
    related: ['williams-gaye', 'gray-hudson'], topics: ['infringement'],
    sources: [cl('opinion/4733619/michael-skidmore-v-led-zeppelin/')],
  },
  {
    id: 'gray-hudson', name: 'Gray v. Hudson', cite: '28 F.4th 87', court: '9th Cir.', year: 2022, checked: 'courtlistener',
    dispute: 'Katy Perry\'s "Dark Horse" was said to copy an eight-note ostinato from "Joyful Noise."',
    held: 'The court affirmed setting aside a jury verdict for the plaintiffs. The shared ostinato was built from commonplace musical elements, and their combination was not original enough to be protected.',
    why: 'Short, simple musical figures are hard to own. Juries can be overruled when the similarity is only in unprotectable building blocks.',
    related: ['skidmore', 'williams-gaye'], topics: ['infringement'],
    sources: [cl('opinion/6449849/marcus-gray-v-katheryn-hudson/')],
  },
  {
    id: 'warhol', name: 'Andy Warhol Foundation for the Visual Arts, Inc. v. Goldsmith', cite: '598 U.S. 508', court: 'U.S. Supreme Court', year: 2023, checked: 'reporter',
    dispute: 'A Warhol image based on Lynn Goldsmith\'s photograph of Prince was licensed to a magazine.',
    held: 'For the first fair use factor, what matters is the specific use being challenged. Licensing the image to a magazine served substantially the same purpose as the photograph, and was commercial, so the first factor favoured Goldsmith. Adding new meaning or a new look is not enough by itself.',
    why: 'Not a music case, but it governs every fair use argument for samples and remixes: if your use competes with licensing the original, "transformative" is a harder sell.',
    related: ['campbell'], topics: ['fair-use'],
    sources: [justiaUS(598, 508)],
  },
  {
    id: 'nealy', name: 'Warner Chappell Music, Inc. v. Nealy', cite: '601 U.S. 366', court: 'U.S. Supreme Court', year: 2024, checked: 'courtlistener',
    dispute: 'A songwriter sued over uses of his music going back more than three years before suit, claiming he had only recently discovered them.',
    held: 'Assuming the discovery rule applies, a copyright owner with a timely claim can recover damages for infringement no matter when it occurred; there is no separate three-year limit on damages. The Court did not decide whether the discovery rule itself is valid.',
    why: 'Old, unpaid uses of your music may still be recoverable if your claim is timely.',
    related: ['fourth-estate'], topics: ['infringement', 'royalties'],
    sources: [cl('opinion/9500701/warner-chappell-music-inc-v-nealy/')],
  },
  {
    id: 'feist', name: 'Feist Publications, Inc. v. Rural Telephone Service Co.', cite: '499 U.S. 340', court: 'U.S. Supreme Court', year: 1991, checked: 'reporter',
    dispute: 'A publisher copied names and numbers from a rival\'s telephone directory.',
    held: 'Copyright requires originality: independent creation plus a modicum of creativity. Facts are not protected, and effort alone ("sweat of the brow") does not create copyright.',
    why: 'Credits, play counts and metadata are facts. A database of them may be protected only in its original selection and arrangement, which is why Plajah\'s registry is about proof, not ownership of facts.',
    topics: ['works-vs-recordings'],
    sources: [justiaUS(499, 340)],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Live watch: the queries the "Latest" feed runs (services/musicLaw/updates.ts)
// ─────────────────────────────────────────────────────────────────────────────

export interface WatchQuery { id: string; label: string; source: 'courtlistener-recap' | 'courtlistener-opinions' | 'federal-register'; q?: string; agency?: string }

export const WATCH: WatchQuery[] = [
  { id: 'recap-music', label: 'New and active U.S. copyright suits about music', source: 'courtlistener-recap', q: 'suitNature:"Copyright" AND caseName:(music OR musical OR song OR songs OR records OR recordings OR "broadcast music" OR ascap OR soundexchange)' },
  { id: 'opinions-music', label: 'New court opinions on music copyright', source: 'courtlistener-opinions', q: '("sound recording" OR "musical work" OR "musical composition") AND copyright' },
  { id: 'fr-copyright-office', label: 'U.S. Copyright Office rules and notices', source: 'federal-register', agency: 'copyright-office-library-of-congress' },
  { id: 'fr-crb', label: 'Copyright Royalty Board rate proceedings', source: 'federal-register', agency: 'copyright-royalty-board' },
];
