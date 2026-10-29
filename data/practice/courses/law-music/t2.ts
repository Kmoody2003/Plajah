import { mcq, tf, type CoursePart } from '../../courseKit';

export const PART: CoursePart = {
  track: {
    id: 'law-music.t2',
    title: 'Licensing, Royalties and Platforms',
    blurb: 'Covers and mechanicals under §115 and the Music Modernization Act, digital radio and SoundExchange under §114, and takedowns under §512.',
    level: 'INTERMEDIATE',
    lessons: [
      {
        id: 'law-music.l04',
        title: 'Covers, Mechanicals and the Music Modernization Act',
        blurb: 'The §115 compulsory licence, the blanket licence and The MLC.',
        minutes: 13,
        asOf: '2026-10',
        anchors: [{ kind: 'statute', ref: '17 U.S.C. §115' }, { kind: 'statute', ref: 'Orrin G. Hatch–Bob Goodlatte Music Modernization Act, Pub. L. No. 115-264' }, { kind: 'concept', ref: 'mechanical licensing collective' }],
        resources: [{ label: '17 U.S.C. §115 (Cornell LII)', url: 'https://www.law.cornell.edu/uscode/text/17/115' }, { label: 'U.S. Copyright Office: Music Modernization', url: 'https://www.copyright.gov/music-modernization/' }],
        body:
          'Section 115 is a compulsory licence. Once a non-dramatic musical work has been distributed to the public in phonorecords with the owner\'s permission, anyone may make and distribute their own recording of it, without asking, by following the statute and paying the rate set by the Copyright Royalty Judges. This is why cover songs are everywhere. The licence lets the new recording arrange the song to suit the performer\'s style, but not change its basic melody or fundamental character.\n\nThe licence covers the song only. It does not license using anyone else\'s recording, so it never covers a sample.\n\nFor decades digital services had to send notices song by song, and millions of streams went unmatched to any songwriter. The Orrin G. Hatch–Bob Goodlatte Music Modernization Act (Pub. L. No. 115-264, signed October 11, 2018) replaced that, for digital music providers, with a blanket licence covering all eligible songs, administered by a single mechanical licensing collective designated by the Copyright Office. That collective, The MLC, began issuing blanket licences on January 1, 2021. It collects from services and pays songwriters and publishers whose works it can match, so writers whose music streams on other services should register their songs with it.\n\nThe Act had two more titles. Title II (the CLASSICS Act) gave pre-1972 sound recordings federal remedies for unauthorised digital performance, codified at 17 U.S.C. §1401. Title III (the AMP Act) created a process for producers, mixers and engineers to be paid part of the SoundExchange artist share.\n\nOn Chora, artists license their own songs and recordings to Plajah directly in the upload agreement. A cover of someone else\'s song is different: the original writer still has to be paid the mechanical royalty.',
      },
      {
        id: 'law-music.l05',
        title: 'Digital Radio, SoundExchange and Performance Royalties',
        blurb: 'The §114 statutory licence, the 50/45/5 split, and how performing rights organisations fit.',
        minutes: 12,
        asOf: '2026-10',
        anchors: [{ kind: 'statute', ref: '17 U.S.C. §114' }, { kind: 'concept', ref: 'statutory licence for non-interactive digital transmissions' }, { kind: 'concept', ref: 'performing rights organisation' }],
        resources: [{ label: '17 U.S.C. §114 (Cornell LII)', url: 'https://www.law.cornell.edu/uscode/text/17/114' }],
        body:
          'Section 114(d) creates a statutory licence for non-interactive digital audio transmissions of sound recordings: internet radio where the listener cannot pick the next song, satellite radio, and similar services. Rates are set by the Copyright Royalty Judges. Royalties go to a collective designated under the regulations, which today is SoundExchange.\n\nSection 114(g)(2) fixes how that money is divided: 50% to the copyright owner of the recording, 45% to the featured recording artists, and 5% to non-featured musicians and vocalists, paid through an independent administrator. Producers and engineers can receive part of the artist share by letter of direction, a process the AMP Act wrote into the statute.\n\nInteractive, on-demand streaming is outside this licence. A service like Chora, where listeners choose what to play, needs direct licences from the recording owners. On Chora that licence comes from the artist in the upload agreement.\n\nThe song side is separate again. Public performance of musical works is licensed in the United States mostly by performing rights organisations such as ASCAP and BMI, which issue blanket licences to venues, broadcasters and services and pay writers and publishers. ASCAP and BMI take non-exclusive rights from their members under their long-standing antitrust consent decrees, which is why a writer can also license directly.\n\nPractical point: a recording artist whose music plays on internet or satellite radio outside Chora is owed §114 royalties only if registered with SoundExchange, and a songwriter collects performance royalties only through a performing rights organisation or a direct licence.',
      },
      {
        id: 'law-music.l06',
        title: 'Platforms, Takedowns and Counter-Notices',
        blurb: 'The §512 safe harbours, notice-and-takedown, and what to do if your upload is removed.',
        minutes: 10,
        asOf: '2026-10',
        anchors: [{ kind: 'statute', ref: '17 U.S.C. §512' }, { kind: 'concept', ref: 'notice and takedown' }, { kind: 'concept', ref: 'repeat infringer policy' }],
        resources: [{ label: '17 U.S.C. §512 (Cornell LII)', url: 'https://www.law.cornell.edu/uscode/text/17/512' }, { label: 'U.S. Copyright Office: Section 512', url: 'https://www.copyright.gov/512/' }],
        body:
          'Section 512 gives online services safe harbours from damages for their users\' infringement if they meet conditions. The one that matters for uploads is §512(c), for material stored at a user\'s direction. The service must not know of the infringement (or of facts making it apparent), must not receive a financial benefit directly attributable to infringement it has the right and ability to control, must designate an agent with the Copyright Office, and must remove material expeditiously after a proper notice. Every protected service must also adopt and reasonably implement a policy for terminating repeat infringers.\n\nA proper notice identifies the work, identifies the infringing material and where it is, gives contact details, and includes statements of good-faith belief and, under penalty of perjury, authority to act for the owner. The uploader can send a counter-notice stating a good-faith belief the removal was a mistake. The service may then restore the material after 10 to 14 business days unless the claimant tells it that a lawsuit has been filed.\n\nKnowingly false notices and counter-notices can create liability under §512(f).\n\nFor creators on Chora: if someone uploads your music without permission, a takedown notice is the fast route. If your own upload is removed by mistake, the counter-notice is your remedy. A dispute between collaborators about who owns a song they made together is usually not a §512 matter; it is a contract and co-ownership question.',
      },
    ],
  },
  questions: [
    mcq('law-music.l04', 1, 1, 'Under §115, a band that wants to release a cover of a previously released song:', ['May do so without permission by following the statute and paying the statutory rate', 'Must get written permission from the original label', 'Must wait until the song enters the public domain', 'May do so for free if it changes the lyrics'], 0,
      'It is called a compulsory licence for a reason.', 'Section 115 lets anyone record a released non-dramatic musical work on statutory terms.'),
    mcq('law-music.l04', 2, 2, 'What did Title I of the Music Modernization Act create?', ['A blanket mechanical licence for digital services, administered by a mechanical licensing collective', 'A public performance right for AM/FM radio', 'A federal registry that replaces the Copyright Office', 'A ban on sampling without a licence'], 0,
      'Think of The MLC.', 'Title I created the blanket licence and the collective, which began issuing licences on January 1, 2021.'),
    tf('law-music.l04', 3, 2, 'The §115 compulsory licence lets a producer sample the original recording of a song.', 1,
      'Which copyright does §115 deal with?', 'False. Section 115 licenses the musical work only. Sampling uses the recording, which needs the recording owner\'s permission.'),
    mcq('law-music.l05', 1, 1, 'Under §114(g)(2), statutory digital radio royalties for a recording are split:', ['50% owner, 45% featured artists, 5% non-featured performers', '50% songwriter, 50% publisher', '100% to the label', '33% each to the owner, the artist and the producer'], 0,
      'Three groups, one of them small.', 'The statute fixes the 50/45/5 division.'),
    mcq('law-music.l05', 2, 2, 'Which service is covered by the §114 statutory licence?', ['A non-interactive internet radio station', 'An on-demand streaming app where users pick each track', 'A download store', 'A film that syncs the recording to picture'], 0,
      'Who chooses the next song?', 'The statutory licence covers non-interactive transmissions; on-demand streams, downloads and sync need direct licences.'),
    mcq('law-music.l06', 1, 2, 'Which is a condition of the §512(c) safe harbour?', ['Removing material expeditiously after a proper notice', 'Pre-screening every upload with a human reviewer', 'Paying the claimant\'s legal fees', 'Registering every user\'s copyright'], 0,
      'Notice-and-takedown.', 'The service must act expeditiously on proper notice, designate an agent and have a repeat-infringer policy.'),
    mcq('law-music.l06', 2, 3, 'Your original song is removed from a platform after a false notice. What is the statutory remedy built into §512?', ['Send a counter-notice; the platform may restore it unless the claimant reports a lawsuit', 'Nothing; removals under §512 are final', 'File a new copyright registration to override the notice', 'Ask the Copyright Office to reverse the takedown'], 0,
      'There is a process for the uploader too.', 'Section 512(g) provides the counter-notice and restoration procedure, and §512(f) covers knowing misrepresentation.'),
  ],
};
