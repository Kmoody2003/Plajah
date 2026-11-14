import { mcq, tf, type CoursePart } from '../../courseKit';

export const PART: CoursePart = {
  track: {
    id: 'law-music.t3',
    title: 'Sampling, Infringement, Fair Use and the World',
    blurb: 'The sampling cases, the "blurred lines" of musical similarity, fair use from Campbell to Warhol, and international basics.',
    level: 'ADVANCED',
    lessons: [
      {
        id: 'law-music.l07',
        title: 'Sampling: Grand Upright to the De Minimis Split',
        blurb: 'Grand Upright, Newton v. Diamond, Bridgeport and VMG Salsoul.',
        minutes: 14,
        asOf: '2026-10',
        anchors: [{ kind: 'case', ref: 'Grand Upright Music, Ltd. v. Warner Bros. Records, Inc.|1991|SDNY' }, { kind: 'case', ref: 'Newton v. Diamond|2004|9th Cir.' }, { kind: 'case', ref: 'Bridgeport Music, Inc. v. Dimension Films|2005|6th Cir.' }, { kind: 'case', ref: 'VMG Salsoul, LLC v. Ciccone|2016|9th Cir.' }, { kind: 'concept', ref: 'de minimis sampling' }],
        resources: [
          { label: 'VMG Salsoul v. Ciccone, 824 F.3d 871 (CourtListener)', url: 'https://www.courtlistener.com/opinion/3208970/vmg-salsoul-llc-v-madonna-ciccone/' },
          { label: 'Bridgeport v. Dimension Films opinions (CourtListener search)', url: 'https://www.courtlistener.com/?q=caseName%3A(Bridgeport+AND+Dimension)&type=o' },
        ],
        body:
          'Sampling copies part of a recording, so it can infringe two copyrights: the recording and the song embodied in it.\n\nGrand Upright Music, Ltd. v. Warner Bros. Records, Inc., 780 F. Supp. 182 (S.D.N.Y. 1991). Biz Markie\'s "Alone Again" used Gilbert O\'Sullivan\'s "Alone Again (Naturally)" after permission had been sought and refused. The court enjoined the record and referred the matter to the U.S. Attorney to consider prosecution. It is a single trial-court ruling with little analysis, but it changed the business: after it, labels cleared samples before release.\n\nNewton v. Diamond, 388 F.3d 1189 (9th Cir. 2004). The Beastie Boys licensed James Newton\'s recording "Choir" but not his composition, then looped a six-second, three-note passage. The Ninth Circuit held that the part of the composition used was too small and generic to infringe: a de minimis use. What made the passage distinctive was Newton\'s performance technique, which lived in the recording they had licensed.\n\nBridgeport Music, Inc. v. Dimension Films, 410 F.3d 792 (6th Cir. 2005). N.W.A\'s "100 Miles and Runnin\'" used a two-second guitar chord from Funkadelic\'s "Get Off Your Ass and Jam," pitched down and looped. The Sixth Circuit held there is no de minimis defence for sound recordings: reading §114(b), it said the recording owner has the exclusive right to sample, however little. Its advice: get a licence or do not sample. It left fair use open.\n\nVMG Salsoul, LLC v. Ciccone, 824 F.3d 871 (9th Cir. 2016). Madonna\'s "Vogue" allegedly used a horn hit of under a quarter of a second. The Ninth Circuit held the de minimis rule applies to recordings as to any other work, and expressly disagreed with Bridgeport.\n\nThe result is a split between federal circuits that the Supreme Court has not resolved. The safe practice everywhere is to clear both the recording and the song, or to replay the part yourself (which avoids the recording but not the song).',
      },
      {
        id: 'law-music.l08',
        title: 'When Is a Song Too Similar?',
        blurb: 'Williams v. Gaye, Skidmore v. Led Zeppelin and Gray v. Hudson.',
        minutes: 15,
        asOf: '2026-10',
        anchors: [{ kind: 'case', ref: 'Williams v. Gaye|2018|9th Cir.' }, { kind: 'case', ref: 'Skidmore v. Led Zeppelin|2020|9th Cir.' }, { kind: 'case', ref: 'Gray v. Hudson|2022|9th Cir.' }, { kind: 'concept', ref: 'substantial similarity in music' }, { kind: 'concept', ref: 'inverse ratio rule' }],
        resources: [
          { label: 'Skidmore v. Led Zeppelin, 952 F.3d 1051 (CourtListener)', url: 'https://www.courtlistener.com/opinion/4733619/michael-skidmore-v-led-zeppelin/' },
          { label: 'Gray v. Hudson, 28 F.4th 87 (CourtListener)', url: 'https://www.courtlistener.com/opinion/6449849/marcus-gray-v-katheryn-hudson/' },
          { label: 'Williams v. Gaye, 885 F.3d 1150 (CourtListener)', url: 'https://www.courtlistener.com/opinion/4479555/pharrell-williams-v-frankie-gaye/' },
        ],
        body:
          'To prove infringement, a plaintiff must show copying of protected expression: that the defendant copied (often inferred from access plus similarity) and that the copying took enough protected material to make the works substantially similar. The hard part in music is separating protected expression from the common building blocks every composer uses.\n\nWilliams v. Gaye, 885 F.3d 1150 (9th Cir. 2018), amended later that year. Marvin Gaye\'s heirs sued over "Blurred Lines." A jury found it infringed "Got to Give It Up," and the Ninth Circuit affirmed most of the verdict, largely because of the standard of review: it would not second-guess the jury on that record. Because the song was a 1909 Act work, the trial court had limited the protected composition to the deposit copy of the sheet music. A dissent argued the result effectively protected a musical style, and the case alarmed many songwriters.\n\nSkidmore v. Led Zeppelin, 952 F.3d 1051 (9th Cir. 2020) (en banc). The trustee for Randy Wolfe of Spirit claimed "Stairway to Heaven" copied "Taurus." The full court affirmed the jury verdict for Led Zeppelin. It held the 1909 Act deposit copy defines the work, so the jury could not compare the recordings; abolished the Ninth Circuit\'s "inverse ratio" rule, under which strong proof of access lowered the similarity needed; and confirmed that commonplace elements such as a descending chromatic scale are not protected alone, though an original selection and arrangement of them can be.\n\nGray v. Hudson, 28 F.4th 87 (9th Cir. 2022). A jury found Katy Perry\'s "Dark Horse" copied an ostinato from "Joyful Noise," but the trial judge set the verdict aside and the Ninth Circuit affirmed: the shared figure was built from unprotectable, commonplace musical elements, and their combination was not original enough.\n\nThe lesson for writers: genres, feels and simple figures are free; distinctive melodies and lyrics are not. Keep your session files and drafts. On Chora, the contribution ledger and seals show how a song developed, which is useful evidence of independent creation.',
      },
      {
        id: 'law-music.l09',
        title: 'Fair Use: Campbell to Warhol, and Old Claims After Nealy',
        blurb: 'Parody, transformative purpose, market substitution, and how far back damages reach.',
        minutes: 13,
        asOf: '2026-10',
        anchors: [{ kind: 'statute', ref: '17 U.S.C. §107' }, { kind: 'case', ref: 'Campbell v. Acuff-Rose Music, Inc.|1994|US' }, { kind: 'case', ref: 'Andy Warhol Foundation for the Visual Arts, Inc. v. Goldsmith|2023|US' }, { kind: 'case', ref: 'Warner Chappell Music, Inc. v. Nealy|2024|US' }],
        resources: [
          { label: 'Campbell v. Acuff-Rose Music, 510 U.S. 569 (Justia)', url: 'https://supreme.justia.com/cases/federal/us/510/569/' },
          { label: 'Andy Warhol Foundation v. Goldsmith, 598 U.S. 508 (Justia)', url: 'https://supreme.justia.com/cases/federal/us/598/508/' },
          { label: 'Warner Chappell Music v. Nealy, 601 U.S. 366 (CourtListener)', url: 'https://www.courtlistener.com/opinion/9500701/warner-chappell-music-inc-v-nealy/' },
        ],
        body:
          'Section 107 makes some unlicensed uses lawful, weighing four factors: the purpose and character of the use, the nature of the copyrighted work, the amount and substantiality of the portion used, and the effect on the potential market for the work.\n\nCampbell v. Acuff-Rose Music, Inc., 510 U.S. 569 (1994). 2 Live Crew recorded a rap parody of Roy Orbison\'s "Oh, Pretty Woman" after being refused a licence. The Supreme Court held a commercial parody can be fair use. The central question is whether the new work merely supersedes the original or adds something new with a further purpose; the more transformative it is, the less commercialism weighs against it. A parody must be able to conjure up its target, so taking the recognisable heart of the song is not fatal. The Court remanded for a closer look at harm to the market for rap versions of the song.\n\nAndy Warhol Foundation for the Visual Arts, Inc. v. Goldsmith, 598 U.S. 508 (2023). Not a music case, but it governs the first factor everywhere. The Court looked at the specific use challenged, licensing a Warhol image of Prince to a magazine, and found it shared substantially the same purpose as Goldsmith\'s photograph and was commercial. New meaning or a new aesthetic alone does not make a use transformative when it serves as a substitute for the original in the same market. For sampling and remixing, that means "it sounds different" is not enough; the question is whether your use competes with licensing the original.\n\nWarner Chappell Music, Inc. v. Nealy, 601 U.S. 366 (2024). The Copyright Act\'s three-year limitations period runs from when a claim accrues. The Court held that, assuming a discovery rule applies, a plaintiff with a timely claim can recover damages for infringement however long ago it occurred; there is no separate three-year cap on damages. It did not decide whether the discovery rule is valid.',
      },
      {
        id: 'law-music.l10',
        title: 'Music Law Around the World',
        blurb: 'The Berne Convention, the WPPT and the EU Term Directive.',
        minutes: 11,
        asOf: '2026-10',
        anchors: [{ kind: 'treaty', ref: 'Berne Convention for the Protection of Literary and Artistic Works' }, { kind: 'treaty', ref: 'WIPO Performances and Phonograms Treaty' }, { kind: 'regulation', ref: 'Directive 2006/116/EC' }, { kind: 'regulation', ref: 'Directive 2011/77/EU' }],
        resources: [
          { label: 'Berne Convention (WIPO)', url: 'https://www.wipo.int/treaties/en/ip/berne/' },
          { label: 'WPPT (WIPO)', url: 'https://www.wipo.int/treaties/en/ip/wppt/' },
          { label: 'Directive 2006/116/EC (EUR-Lex)', url: 'https://eur-lex.europa.eu/eli/dir/2006/116/oj' },
          { label: 'Directive 2011/77/EU (EUR-Lex)', url: 'https://eur-lex.europa.eu/eli/dir/2011/77/oj' },
        ],
        body:
          'Music crosses borders instantly; copyright does not. Each country applies its own law, tied together by treaties.\n\nThe Berne Convention (1886, revised most recently at Paris in 1971) requires member countries to protect works from other members as they protect their own (national treatment), forbids making protection depend on formalities like registration or notice, sets a minimum term of the author\'s life plus 50 years, and recognises moral rights to be identified as author and to object to distortion. The United States joined effective March 1, 1989.\n\nThe WIPO Performances and Phonograms Treaty (1996) gives performers rights over the fixation and use of their performances and a right to be named, and gives record producers rights including making recordings available on demand. Its minimum term is 50 years. Outside the United States, performers often collect neighbouring-rights income through their own societies when recordings are broadcast or played in public.\n\nThe EU Term Directive (2006/116/EC) harmonised the term for works at life plus 70 years. Directive 2011/77/EU extended the term for performers and producers of sound recordings from 50 to 70 years, counts a co-written song\'s term from the death of the last surviving lyricist or composer, lets performers reclaim rights in recordings a producer is not exploiting, and requires producers to fund session musicians from the extra years.\n\nBecause terms differ, a recording can be public domain in one country and protected in another. Plajah\'s public-domain engine checks per territory before labelling anything free to use.',
      },
    ],
  },
  questions: [
    mcq('law-music.l07', 1, 1, 'What did the Sixth Circuit hold in Bridgeport v. Dimension Films (2005)?', ['There is no de minimis defence to sampling a sound recording', 'Any sample under two seconds is fair use', 'Samples need clearance only from the songwriter', 'Sampling is legal if the sample is pitch-shifted'], 0,
      '"Get a licence or do not sample."', 'The court read §114(b) to give recording owners the exclusive right to sample, however little.'),
    mcq('law-music.l07', 2, 2, 'How did VMG Salsoul v. Ciccone (9th Cir. 2016) relate to Bridgeport?', ['It held de minimis does apply to recordings, creating a circuit split', 'It followed Bridgeport exactly', 'It was reversed by the Supreme Court', 'It held all sampling is fair use'], 0,
      'Two circuits, two answers.', 'The Ninth Circuit expressly disagreed with the Sixth.'),
    mcq('law-music.l07', 3, 3, 'In Newton v. Diamond, the Beastie Boys won mainly because:', ['The part of the composition they used was too small and generic to infringe, and they had licensed the recording', 'They had licensed both the song and the recording', 'The sample was a parody and therefore fair use', 'Newton had not registered his recording'], 0,
      'Two copyrights; which one was licensed?', 'They licensed the recording, and the composition portion was held de minimis.'),
    mcq('law-music.l08', 1, 2, 'Which rule did the en banc Ninth Circuit abolish in Skidmore v. Led Zeppelin?', ['The inverse ratio rule linking strong access to a lower similarity threshold', 'The rule that ideas are not protected', 'The fair use defence for parody', 'The requirement to register before suing'], 0,
      'It concerned how access and similarity interact.', 'Skidmore ended the inverse ratio rule in the Ninth Circuit.'),
    mcq('law-music.l08', 2, 2, 'Why was the "Dark Horse" verdict set aside in Gray v. Hudson?', ['The shared ostinato was made of commonplace elements not original enough to protect', 'Katy Perry proved she had never heard the song', 'The plaintiffs had not registered the work', 'The jury was not allowed to hear the recordings'], 0,
      'Building blocks are free.', 'The court held the combination of unprotectable elements lacked the originality required.'),
    tf('law-music.l08', 3, 2, 'After Skidmore, a descending chromatic scale is, on its own, protected expression.', 1,
      'Common musical building blocks.', 'False. Commonplace elements are not protected alone, though an original selection and arrangement can be.'),
    mcq('law-music.l09', 1, 2, 'What did Campbell v. Acuff-Rose establish about commercial parody?', ['A commercial parody can be fair use; commerciality does not create a presumption against it', 'Any commercial use is presumptively unfair', 'Parodies never need to borrow from the original', 'Being refused a licence defeats fair use'], 0,
      'Think about transformative purpose.', 'The Court rejected a presumption against commercial uses and stressed transformativeness.'),
    mcq('law-music.l09', 2, 3, 'After Warhol v. Goldsmith, a remix that adds a new sound but is licensed for the same uses the original is licensed for is likely to:', ['Face a weaker first-factor argument, because it serves substantially the same purpose', 'Be automatically fair use because it is transformative', 'Be exempt because remixes are derivative works', 'Need only a mechanical licence'], 0,
      'The Court asked about the specific use and its purpose.', 'Warhol focused on whether the challenged use substitutes for the original in its market.'),
    mcq('law-music.l09', 3, 2, 'Warner Chappell v. Nealy (2024) held that, assuming the discovery rule applies:', ['A timely plaintiff can recover damages for infringement no matter when it occurred', 'Damages are capped at the last three years', 'The discovery rule is unconstitutional', 'Songwriters must sue within one year of release'], 0,
      'No separate damages bar.', 'The Court rejected a three-year look-back limit on damages for timely claims.'),
    mcq('law-music.l10', 1, 1, 'Which is a core rule of the Berne Convention?', ['Protection may not depend on formalities such as registration', 'Every work must be registered in its home country', 'Copyright lasts 28 years, renewable once', 'Only published works are protected'], 0,
      'No paperwork as a condition.', 'Berne Article 5(2) bars formalities as a condition of enjoyment and exercise of rights.'),
    mcq('law-music.l10', 2, 2, 'What did Directive 2011/77/EU change for sound recordings in the EU?', ['It extended the performer and producer term from 50 to 70 years', 'It abolished neighbouring rights', 'It made all recordings before 1972 public domain', 'It shortened the term for songs to life plus 50'], 0,
      'A term extension.', 'The 2011 amendment extended recording-related rights to 70 years, with protections for performers.'),
  ],
};
