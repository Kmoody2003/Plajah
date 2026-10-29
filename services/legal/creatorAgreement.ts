// The Plajah Creator Agreement — what a creator agrees to when they publish their own work.
// Versioned: an acceptance records the version it was made against (routes/legalAcceptance.ts),
// so changing the text means bumping CREATOR_AGREEMENT_VERSION, never editing a live version.
//
// The stance it encodes: Plajah is an independent home for creators' own work. Creators keep
// ownership and control; Plajah hosts, takes a fee on direct sales and shares Plajah+ revenue;
// agreements between collaborators are theirs; Plajah keeps the record (credits, splits,
// contribution ledger) without being a party to it.
//
// Plain-language drafting, not legal advice — have counsel review before relying on it.

export const CREATOR_AGREEMENT_VERSION = 'creator-2026-10-29';

export interface AgreementSection { heading: string; body: string[] }

/** The one-line attestation shown next to the checkbox. */
export const CREATOR_ATTESTATION =
  'I own this work or have every permission needed to publish it here, including from co-writers, co-owners, featured performers, producers, and for any samples, covers, artwork and likenesses. I agree to the Plajah Creator Agreement.';

export const CREATOR_AGREEMENT: AgreementSection[] = [
  {
    heading: '1. You publish only what you have the right to publish',
    body: [
      'You confirm that you own the work you upload, or that you have written permission from everyone who does: co-writers, co-owners, featured artists, session players, producers, and the owners of any sample, interpolation, beat, loop, artwork, photo, video or likeness in it.',
      'Covers of songs you did not write need the licence the law requires (in the US, a mechanical licence). Uploading a cover means you have it.',
      'If you upload for an artist, band or label, you confirm you are authorised to agree to this for them.',
      'If you belong to a performing-rights society, publisher or label, you confirm those agreements let you grant the licence below.',
    ],
  },
  {
    heading: '2. You keep your rights',
    body: [
      'Plajah does not take ownership of anything you upload. Your work stays yours, and you are free to release it anywhere else, register it with any society or office, or sign it to anyone. Nothing here is exclusive.',
    ],
  },
  {
    heading: '3. The licence you give Plajah, and when it ends',
    body: [
      'So Plajah can run the service, you give Plajah a non-exclusive, worldwide, royalty-free licence to store, copy, encode, stream, display and deliver your work. That covers previews and promotional excerpts on Plajah, and the sales, downloads and Plajah+ access you switch on. It applies only in the ways you set.',
      'The licence ends when you remove the work, with three exceptions: people who already bought or were given a copy keep what they acquired; backups age out on their normal schedule; and anything Plajah is legally required to keep is kept.',
    ],
  },
  {
    heading: '4. You stay in control',
    body: [
      'Your music is free to stream unless you choose to charge. You set prices, visibility, previews and availability, and you can change or remove them at any time.',
    ],
  },
  {
    heading: '5. What Plajah earns',
    body: [
      'Plajah takes the platform fee shown to you at the time of each direct sale, and shares Plajah+ revenue under the Plajah+ terms in effect when it is earned.',
      'Plajah does not run a per-stream royalty pool, and does not collect or pay performing-rights, mechanical or neighbouring-rights royalties on your behalf. If you want those collected for releases elsewhere, you arrange that yourself.',
      'Payouts go through Plajah’s payment provider and need the identity and tax details it asks for. You are responsible for your own taxes.',
    ],
  },
  {
    heading: '6. Agreements between collaborators are yours',
    body: [
      'Credits, splits and ownership shares are agreed directly between you and the people you work with. Plajah is not a party to those agreements, does not guarantee them, and does not decide disputes about them.',
      'Plajah keeps an accurate record: the credits and splits you enter, and the contribution ledger, which logs who did what in a shared project and when. If you set up split payouts, Plajah routes the money as the collaborators configured it. While a dispute is open, Plajah may pause payouts or visibility for the work in question.',
    ],
  },
  {
    heading: '7. The record Plajah keeps',
    body: [
      'For each contribution, the ledger records your account, the time, the kind of work, the track, and the device and audio input used. Plajah also keeps the network (IP) address privately. That address is only used to resolve disputes or when the law requires it, and other users never see it.',
      'Sealing a version records the exact audio fingerprints (sha-256) with a server timestamp. That is evidence of authorship and timing. It is not a government copyright registration, and you can still register your work with your national copyright office.',
    ],
  },
  {
    heading: '8. AI-generated material',
    body: [
      'Label any part of your work that a generative tool made. You are responsible for having the rights to what you put into those tools and to what they produce. Some countries do not grant copyright to material with no human author.',
    ],
  },
  {
    heading: '9. Takedowns and repeat infringement',
    body: [
      'Plajah removes material when it receives a valid copyright notice, and you can file a counter-notice if you believe a removal was a mistake (see the Copyright / DMCA policy). Accounts that repeatedly infringe are closed. Knowingly false notices or attestations can create legal liability for the person who makes them.',
    ],
  },
  {
    heading: '10. Responsibility for what you upload',
    body: [
      'If someone makes a claim against Plajah because something you uploaded infringed their rights, or because a promise you made here was untrue, you will cover Plajah’s reasonable costs of that claim.',
      'The Plajah Terms of Service and Privacy Policy also apply. Where they conflict with this agreement on creator content, this agreement governs.',
    ],
  },
];

export const agreementText = () => CREATOR_AGREEMENT.map((s) => `${s.heading}\n${s.body.join('\n')}`).join('\n\n');
