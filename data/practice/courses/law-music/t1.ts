import { mcq, tf, type CoursePart } from '../../courseKit';

export const PART: CoursePart = {
  track: {
    id: 'law-music.t1',
    title: 'Songs, Recordings and Who Owns Them',
    blurb: 'The two copyrights in every track, co-writing and splits, work for hire, getting rights back, and registration.',
    level: 'FOUNDATION',
    lessons: [
      {
        id: 'law-music.l01',
        title: 'Two Copyrights in Every Track',
        blurb: 'Musical works and sound recordings under 17 U.S.C. §§102 and 106, and why the difference decides who gets paid.',
        minutes: 12,
        asOf: '2026-10',
        anchors: [{ kind: 'statute', ref: '17 U.S.C. §102' }, { kind: 'statute', ref: '17 U.S.C. §106' }, { kind: 'statute', ref: '17 U.S.C. §114' }, { kind: 'concept', ref: 'musical work and sound recording distinction' }],
        resources: [{ label: '17 U.S.C. §102 (Cornell LII)', url: 'https://www.law.cornell.edu/uscode/text/17/102' }, { label: '17 U.S.C. §106 (Cornell LII)', url: 'https://www.law.cornell.edu/uscode/text/17/106' }],
        body:
          'A finished track is usually two copyrighted works stacked together. The musical work is the song: melody, harmony as written, and lyrics. The sound recording is the particular recorded performance of it. Section 102(a) of the Copyright Act lists them as separate categories, and they can have different owners. A songwriter and her publisher may own the song while a label or the performing artist owns the master.\n\nCopyright arises automatically when an original work is fixed, written down or recorded, without registration or notice. Section 102(b) sets the limit: ideas, procedures, systems and methods are never protected, only their expression. A genre, a tempo or a common chord progression belongs to everyone.\n\nSection 106 lists the owner\'s exclusive rights: to reproduce the work, prepare derivative works, distribute copies, perform it publicly and display it. Sound recordings get a narrower performance right, limited to performance by digital audio transmission (§106(6)). That gap is why terrestrial AM and FM radio in the United States pays songwriters through performing rights organisations but pays nothing to the recording owner or the artist.\n\nSection 114(b) adds a second limit on recordings: the recording copyright covers the actual sounds fixed. A new recording that imitates the sound of an old one does not infringe the old recording, though it may infringe the song.\n\nWorked example. A band records a cover of a 1970s hit. They need no permission from the original label, because they are not using its recording. They do need a licence for the song, which §115 makes available on statutory terms. If instead they sampled two bars of the original record, they would need permission from both the song\'s owner and the recording\'s owner.',
      },
      {
        id: 'law-music.l02',
        title: 'Co-Writing, Splits, Work for Hire and Getting Rights Back',
        blurb: 'Joint works under §§101 and 201, transfers in writing under §204, and termination under §203.',
        minutes: 14,
        asOf: '2026-10',
        anchors: [{ kind: 'statute', ref: '17 U.S.C. §201' }, { kind: 'statute', ref: '17 U.S.C. §203' }, { kind: 'statute', ref: '17 U.S.C. §204' }, { kind: 'concept', ref: 'joint work' }, { kind: 'concept', ref: 'work made for hire' }],
        resources: [{ label: '17 U.S.C. §201 (Cornell LII)', url: 'https://www.law.cornell.edu/uscode/text/17/201' }, { label: '17 U.S.C. §203 (Cornell LII)', url: 'https://www.law.cornell.edu/uscode/text/17/203' }],
        body:
          'Section 201(a) says copyright vests first in the author. When two or more people write together intending their contributions to merge into a single whole, the result is a joint work (defined in §101) and they are co-owners. Without an agreement, co-owners generally hold equal undivided shares; each may license the work non-exclusively, but must account to the others for their share of the profits. Courts look at intent and at whether each person contributed independently copyrightable expression, so being in the room is not always enough.\n\nThat default is rarely what collaborators actually want. A producer who built the beat and a topliner who wrote the hook may agree on very different percentages. Write the split down and have everyone sign. Section 204(a) requires a signed writing for any transfer of copyright ownership, and §201(d) lets each exclusive right be owned and transferred separately.\n\nA work made for hire belongs to the employer from the start. That covers works by employees within the scope of their job and, for commissioned work, only certain listed categories and only with a signed agreement saying so. Whether a sound recording can be commissioned as a work for hire is disputed, which is one reason recording contracts also include a backup assignment.\n\nSection 203 lets authors terminate transfers they made on or after January 1, 1978, during a five-year window beginning 35 years after the grant, by serving notice two to ten years ahead and recording it with the Copyright Office. The right cannot be signed away, but it does not apply to works made for hire.\n\nOn Chora, the contribution ledger records who recorded, wrote, programmed, mixed and mastered, and suggests credits. Those records are evidence. The agreement between collaborators is what sets the shares.',
      },
      {
        id: 'law-music.l03',
        title: 'Registration, Proof and Fourth Estate',
        blurb: 'Why §411 registration still matters, what §412 adds, and what a timestamp can and cannot prove.',
        minutes: 11,
        asOf: '2026-10',
        anchors: [{ kind: 'statute', ref: '17 U.S.C. §411' }, { kind: 'statute', ref: '17 U.S.C. §412' }, { kind: 'case', ref: 'Fourth Estate Public Benefit Corp. v. Wall-Street.com, LLC|2019|US' }],
        resources: [{ label: 'Fourth Estate v. Wall-Street.com, 586 U.S. 296 (CourtListener)', url: 'https://www.courtlistener.com/opinion/4595875/fourth-estate-pub-benefit-corp-v-wall-streetcom-llc/' }, { label: 'U.S. Copyright Office: Registration', url: 'https://www.copyright.gov/registration/' }],
        body:
          'You own copyright without registering. But for a United States work, §411(a) bars an infringement lawsuit until registration "has been made" or refused. In Fourth Estate Public Benefit Corp. v. Wall-Street.com, LLC, 586 U.S. 296 (2019), a unanimous Supreme Court held that registration is made when the Copyright Office registers the work, not when the owner files the application. Processing can take months, so filing only after you find an infringer means waiting to sue.\n\nSection 412 raises the stakes. Statutory damages, which do not require proving actual losses, and attorney\'s fees are generally available only if the work was registered before the infringement began, or within three months of first publication. For many independent musicians, whose actual damages are small, that is the difference between a case worth bringing and one that is not.\n\nThe Copyright Office offers group registration options for musical works and recordings on an album and for unpublished works, which reduce cost.\n\nWhat about a blockchain timestamp, or a Chora seal that fixes the exact audio hash and the contribution history at a moment in time? That is strong evidence that a file existed in that form at that time and who had it. It can help in a dispute about who wrote what first. It is not a registration, and it does not satisfy §411 or §412.\n\nBecause of the Berne Convention, which forbids formalities as a condition of protection, works from other member countries do not need U.S. registration before suit. The requirement applies to U.S. works.',
      },
    ],
  },
  questions: [
    mcq('law-music.l01', 1, 1, 'A typical recorded song involves which two separate copyrights?', ['The musical work and the sound recording', 'The melody and the album artwork', 'The lyrics and the music video', 'The performance licence and the mechanical licence'], 0,
      'One is the song, one is the recorded performance.', 'Section 102(a) lists musical works and sound recordings separately. Licences are permissions to use them, not copyrights themselves.'),
    mcq('law-music.l01', 2, 2, 'Why does U.S. AM/FM radio pay songwriters but not recording artists for airplay?', ['Sound recordings have a public performance right only for digital audio transmissions', 'Recording artists must register with the FCC to be paid', 'Radio stations own the recordings they broadcast', 'The Berne Convention forbids paying performers'], 0,
      'Look at §106(6).', 'Section 106(6) limits the recording\'s performance right to digital audio transmission, so analog broadcast radio owes nothing for the recording.'),
    tf('law-music.l01', 3, 2, 'Under §114(b), a new recording that carefully imitates the sound of an old record infringes the old sound recording.', 1,
      'What does the recording copyright actually cover?', 'False. The recording copyright covers the actual sounds fixed. An independent imitation does not infringe the recording, though it may infringe the song.'),
    mcq('law-music.l02', 1, 1, 'Two writers create a song together intending to merge their parts, and sign nothing. By default they are:', ['Co-owners of a joint work', 'Owners of two separate songs', 'Employees of whoever booked the studio', 'Unable to own the song until it is registered'], 0,
      'Think of §101 and §201(a).', 'Contributions intended to merge into a unitary whole form a joint work, and the authors are co-owners.'),
    mcq('law-music.l02', 2, 2, 'A producer and an artist agree out loud that the producer gets all rights in the master. Under §204(a), the transfer is:', ['Not effective as a transfer of ownership without a signed writing', 'Effective because oral agreements bind under copyright law', 'Effective only after the song is released', 'Automatically a work made for hire'], 0,
      'Transfers of ownership have a formality.', 'Section 204(a) requires a writing signed by the owner of the rights conveyed.'),
    mcq('law-music.l02', 3, 3, 'An artist assigned her song to a publisher in 2001. Which statement about §203 termination is correct?', ['She may terminate during a five-year window starting 35 years after the grant, with advance notice', 'She may never terminate because she signed the assignment', 'She may terminate at any time on 30 days\' notice', 'Termination applies only if the song was a work made for hire'], 0,
      'Count 35 years from the grant.', 'Section 203 gives a non-waivable termination window beginning 35 years after the grant, with notice 2 to 10 years ahead. Works made for hire are excluded.'),
    mcq('law-music.l03', 1, 1, 'Under Fourth Estate (2019), when has registration "been made" for purposes of suing?', ['When the Copyright Office registers the work', 'When the owner mails or uploads the application', 'When the work is first published', 'When the work is timestamped on a blockchain'], 0,
      'The Court chose the later of two moments.', 'The Court held registration occurs when the Office acts on the application.'),
    mcq('law-music.l03', 2, 2, 'Why does §412 matter so much to independent musicians?', ['Statutory damages and attorney\'s fees generally require timely registration', 'It sets the length of the copyright term', 'It requires a copyright notice on every release', 'It lets the Copyright Office collect royalties for them'], 0,
      'Think about what makes a small case worth bringing.', 'Without timely registration, a plaintiff is usually limited to actual damages and pays her own lawyer.'),
    tf('law-music.l03', 3, 2, 'A blockchain timestamp of an audio file satisfies the §411(a) registration requirement.', 1,
      'Is it the Copyright Office acting?', 'False. A timestamp is evidence of existence and date, not a registration.'),
  ],
};
