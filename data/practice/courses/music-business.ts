import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// mcq helper: pass the CORRECT choice first; choices are rotated (cyclic order kept) so the correct
// answer lands on a spread-out index.
const mc = (l: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], hint: string, explanation: string): Question => {
  const target = (parseInt(l.slice(l.lastIndexOf('.l') + 2), 10) * 3 + n * 5) % 4;
  const shift = target; // correct choice starts at index 0
  const rotated = choices.map((_, i) => choices[(i - shift + 4) % 4]);
  return { id: `${l}.q${n}`, lessonId: l, kind: 'mcq', prompt, choices: rotated, answer: target, hint, explanation, level };
};
const tf = (l: string, n: number, level: 1 | 2 | 3, prompt: string, answer: number, hint: string, explanation: string): Question =>
  ({ id: `${l}.q${n}`, lessonId: l, kind: 'tf', prompt, answer, hint, explanation, level });

const L01 = 'music-business.l01';
const L02 = 'music-business.l02';
const L03 = 'music-business.l03';
const L04 = 'music-business.l04';
const L05 = 'music-business.l05';
const L06 = 'music-business.l06';
const L07 = 'music-business.l07';
const L08 = 'music-business.l08';
const L09 = 'music-business.l09';
const L10 = 'music-business.l10';
const L11 = 'music-business.l11';
const L12 = 'music-business.l12';
const L13 = 'music-business.l13';
const L14 = 'music-business.l14';
const L15 = 'music-business.l15';
const L16 = 'music-business.l16';
const L17 = 'music-business.l17';
const L18 = 'music-business.l18';
const L19 = 'music-business.l19';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'music-business',
    label: 'The Music Business (Professional)',
    blurb: 'How music earns money in the United States: copyrights, royalties, licensing, deals, teams, touring, contracts and the business of being an artist or label.',
    accent: '#FFD24A',
    framework: 'ncas',
    tracks: [
      {
        id: 'music-business.t1',
        title: 'How Music Money Works',
        blurb: 'The money map, the two copyrights, songwriters and publishers, and the performing rights organizations.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'The Money Map',
            blurb: 'Every song earns on two separate sides, and each side has its own owners and collectors.',
            minutes: 9,
            body: `This course is education about how the United States music business generally works. It is not legal, tax or financial advice, and contracts and laws change, so use a qualified music attorney and accountant for real decisions.

The core idea is that recorded music earns on two sides. The recording side belongs to the owner of the sound recording, usually an artist or a label. The publishing side belongs to the owners of the musical composition, the songwriters and their publishers. Every time a song is sold, streamed, broadcast or licensed, money is owed to one or both sides, and each side has its own collection systems.

Live music adds a third pool: ticket, guarantee and merchandise income. It is paid for performing, not for the copyrights.

Here is an illustration with made-up numbers chosen only for easy arithmetic. Suppose a streaming service sets aside $1,000 for a month of one song's plays, and the rules divide it $600 to the recording side and $400 to the publishing side. If the artist wrote the song and owns the master, both sides reach the same person. If a label owns the master and a publisher co-owns the composition, the same $1,000 is divided among several parties before the artist sees anything.

Real splits vary by service, country and time, so the lesson is the mechanism: identify who owns each side, then identify who collects for it. Missing either collector leaves money unclaimed.`,
          },
          {
            id: L02,
            title: 'The Two Copyrights',
            blurb: 'The composition and the sound recording are separate property with separate owners.',
            minutes: 10,
            body: `A song contains two distinct copyrights under US law. The musical work, often called the composition or the song, is the melody, harmony and lyrics as written. The sound recording, often called the master, is one specific recorded performance of it, fixed in a file or on a disc.

Ownership usually differs. The composition starts with the songwriters, who may assign or share it with a publisher. The master is typically owned by whoever paid for and commissioned the recording: the artist, an independent label or a major label. A producer or engineer may also hold rights unless a written agreement says otherwise.

Why it matters: many uses require two permissions. A cover version of someone's song is a new master, so the cover artist owns their own recording, but they need a license for the underlying composition. Sampling a commercial record uses both the original master and the composition, so clearance is normally needed from the master owner and the publisher.

Example: a band records a song written by two members and releases it through a label. The two writers own the composition (perhaps through a publisher), the label owns the master, and royalties flow to different bank accounts. If the band later wants to sell its catalog, selling the master does not by itself transfer the composition. Contracts must name which copyright is being granted, and assignments of both are common wording to watch for.

Registering each copyright and its ownership shares correctly is the foundation for every collection system in the next lessons.`,
          },
          {
            id: L03,
            title: 'Songwriters, Publishers and Splits',
            blurb: 'Writers divide a song by agreed percentages, and publishers collect and exploit the composition.',
            minutes: 10,
            body: `A song's ownership is divided into splits that total 100 percent among its writers. Splits are negotiated between the people who wrote it, not set by law, and they should be written down on a split sheet at the time of writing. Verbal agreements are a common cause of later disputes.

A music publisher administers and promotes compositions: registering them, collecting royalties, pitching songs and issuing licenses. Songwriters can self-publish by forming their own publishing entity, or sign with a publisher. Common structures include an administration deal, where the publisher collects for a fee and the writer keeps ownership, and a traditional or co-publishing deal, where the publisher takes a share of the copyright in return for advances and services. Administration fees are commonly in the range of ten to twenty-five percent, but they vary, so read the actual terms.

Performance income is conventionally paid in two shares: a writer's share and a publisher's share. This is why registering both matters.

Worked example: three people write a song. Ana wrote the melody and lyrics, Ben the chords, Cy the bridge, and they sign a split sheet at 50, 30 and 20 percent. If the song's publishing income is $2,000, Ana is owed $1,000, Ben $600 and Cy $400. If Ana uses an administrator charging a 20 percent fee on her $1,000, the administrator keeps $200 and Ana receives $800.

Disagreements about splits are easiest to settle on the day the song is finished.`,
          },
          {
            id: L04,
            title: 'Performing Rights Organizations',
            blurb: 'ASCAP, BMI, SESAC and GMR collect public performance royalties for compositions.',
            minutes: 10,
            body: `A public performance of a composition, such as a radio play, a TV broadcast, a live concert, a bar, a store or the performance component of a stream, requires a license. Individually licensing every venue would be impossible, so performing rights organizations, or PROs, issue blanket licenses and collect fees on behalf of their members.

In the United States there are four: ASCAP, BMI, SESAC and GMR. ASCAP and BMI are open to songwriters and publishers generally and operate under federal antitrust consent decrees. SESAC and GMR are more selective, with membership by invitation. ASCAP is a nonprofit membership organization, while the others are for-profit companies. A songwriter generally affiliates with one PRO at a time, and a publisher entity registers separately so that both the writer's and publisher's shares are paid.

PROs collect for the composition only. They do not collect the sound recording's digital performance money, which is SoundExchange's job, and they are not the mechanical licensing collective for streams and downloads.

The PROs track usage from sources such as broadcast logs, cue sheets and service reports, then pay members after deductions and on a schedule that lags the performance by months.

Example: a venue plays a writer's song in a live set and pays the PRO's blanket fee. Of an $800 distribution for the song, $400 is paid to the writer and $400 to the publisher. A writer with no publisher entity registered may leave the publisher's $400 uncollected.

Join accurately, register every song with correct splits, and file setlists or cue sheets where the PRO invites it.`,
          },
        ],
      },
      {
        id: 'music-business.t2',
        title: 'Licensing and Royalties',
        blurb: 'Mechanical, sync and master licenses, streaming payouts and digital performance royalties.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L05,
            title: 'Mechanical Licensing and the MLC',
            blurb: 'The right to reproduce a composition, and the collective that administers the digital blanket license.',
            minutes: 10,
            body: `A mechanical license permits reproducing and distributing a composition in copies: CDs, vinyl, downloads and the reproduction part of interactive streams. Historically it was licensed song by song.

Section 115 of the US Copyright Act provides a compulsory license: once a composition has been distributed to the public in the US with the owner's authority, others may record and distribute their own version by following the rules and paying the statutory rate, which the Copyright Royalty Board sets for defined periods. The user does not need the writer's permission, but must pay.

The Music Modernization Act of 2018 changed digital licensing. It created a blanket license for eligible digital music services and the Copyright Office designated the Mechanical Licensing Collective, the MLC, to administer it. Since 2021 the MLC receives usage reports and payments from the services, matches them to works, and distributes the royalties to publishers, administrators and self-administered songwriters. A separate Digital Licensee Coordinator represents the licensees. The MLC does not handle physical products, which are licensed through other channels, and it does not collect performance royalties.

Songwriters and publishers must register works and ownership shares with the MLC. Money that cannot be matched may be held and, under the law, eventually distributed on a market-share basis.

Arithmetic example, using a hypothetical statutory rate of ten cents per copy for easy math: a cover band pressing 1,000 CDs owes $100 in mechanical royalties. The real rate is set by regulation and changes, so check the current rules.

Incomplete splits are a frequent cause of unmatched money: if registered shares total only 90 percent, the MLC cannot fully pay out.`,
          },
          {
            id: L06,
            title: 'Sync Licensing',
            blurb: 'Pairing music with picture requires a sync license and a master use license.',
            minutes: 10,
            body: `Synchronization, or sync, means placing music in timed relation with visual media: film, TV, advertising, trailers, games, online video. It is negotiated, not statutory, so the owners can set a price or decline.

A typical placement needs two licenses. The sync license covers the composition and is granted by the publisher or writer. The master use license covers the particular recording and is granted by the master owner. If one party controls both, one deal can cover both, which makes independent artists attractive to supervisors who need fast clearance.

Fees depend on use: media (TV, theatrical, streaming, web), territory, term, whether the use is background or featured, and whether the license is exclusive. A common clause is most favored nations, often called MFN, where the master and sync fees are equal so neither side is paid less than the other.

Example: a TV production negotiates a $6,000 sync fee. With MFN, the master fee is also $6,000, so the production pays $12,000 for both sides. Separately, when the show airs, the composition earns performance royalties through the PRO, which is why the production files a cue sheet listing each song and its writers.

Production and library music is often licensed on simpler terms. Read the scope carefully. A license for US broadcast TV for two years does not cover a worldwide streaming release, so additional rights must be negotiated. Perpetual, all media, worldwide, exclusive licenses should be priced and considered much more carefully than limited ones.`,
          },
          {
            id: L07,
            title: 'Master Licensing',
            blurb: 'Licensing a sound recording to others without selling it.',
            minutes: 9,
            body: `The master owner can do more than release the recording. A master license grants a third party permission to use the recording while the owner keeps title. Typical uses include compilations, games, advertisements, film placements (the master side of a sync deal), samples and distribution deals.

The key distinction is license versus assignment. A license is permission, limited by scope, term and territory, and it can be exclusive or non-exclusive. An assignment transfers ownership. A non-exclusive license lets the owner license the same recording to many users; an exclusive license prevents that, at least within its scope, so it should cost more.

Worked example one: a master owner licenses a track non-exclusively to four users, a game, a film, a podcast and a compilation, at $1,500 each. Total: $6,000, while the owner still owns the recording. Selling the master outright might bring one payment and no future licensing.

Worked example two: a producer samples a record. The master owner charges an up-front fee, and the owner of the composition asks for 20 percent of the new song's publishing. If the new song earns $5,000 of publishing income, that publisher takes $1,000 and the new writers share $4,000.

Terms to check include the exact use, the media covered, the term, territory, exclusivity, credit, whether the licensee can sublicense, and whether rights revert to you afterward. A distribution agreement is also a license of your masters, so the same questions apply to it.

If you do not control a recording or composition fully, you cannot promise a clean license, so know your chain of title.`,
          },
          {
            id: L08,
            title: 'Digital Distribution and Streaming Royalties',
            blurb: 'How a stream becomes money, and why the per-stream rate is an outcome, not a fixed price.',
            minutes: 12,
            body: `A digital distributor delivers your recordings and metadata to streaming and download services, collects the income and pays you minus a fee, either a percentage or a flat annual or per-release charge. Delivery needs correct metadata, an ISRC code identifying each recording and a UPC for each release.

Most streaming services use a pool model. They gather subscription and advertising revenue for a country and period, deduct the service's share and the publishing side's payments as the licenses require, and divide the recording-side pool among rights holders in proportion to each one's share of total streams. Alternatives such as user-centric models allocate each subscriber's payment to the artists that subscriber played, and services can change methods.

So a per-stream rate is not a contract price. It is revenue divided by streams, and it moves with the mix of free and paid listeners, the country, the period, and how many total streams there were. Treat any number quoted online as a snapshot, not a rule.

Worked example, with invented figures: in one country and month, the recording-side pool is $1,000,000 and total streams are 500,000,000. Your 250,000 streams are 0.05 percent of the total, so you earn $500, or $0.002 per stream. If total streams doubled to 1,000,000,000 and the pool stayed the same, you would earn $250 for the same plays. With a distributor taking 15 percent of the $500, you receive $425.

Keep your catalog metadata accurate, since errors cause missed payments.`,
          },
          {
            id: L09,
            title: 'SoundExchange and Digital Performance Royalties',
            blurb: 'The statutory licensing system that pays recording owners and performers for non-interactive digital plays.',
            minutes: 9,
            body: `In the United States there is a public performance right in sound recordings for certain digital transmissions. Services such as satellite radio, internet radio and other non-interactive webcasters can operate under statutory licenses (sections 112 and 114 of the Copyright Act) and pay royalties at rates set through the Copyright Royalty Board process.

SoundExchange is the organization authorized to collect and distribute these statutory royalties. This is different from a PRO: PROs handle the composition, SoundExchange handles the master. Terrestrial AM and FM radio generally pays composition performance royalties to PROs but does not owe a sound recording performance royalty under current US law, which is a notable difference from many other countries.

The law fixes the split of each distribution: 50 percent to the rights owner (label or self-releasing artist), 45 percent to the featured artist, and 5 percent to non-featured performers such as session musicians and backing vocalists, through a union-administered fund. Because the featured artist's 45 percent is paid directly by SoundExchange, an artist signed to a label should register themself rather than assume the label handles it.

Worked example: a distribution of $10,000 for a recording is divided $5,000 to the owner, $4,500 to the featured artist and $500 to the non-featured performers.

Registration steps matter. Register as the rights owner for masters you own, register as a featured artist, and keep ISRCs consistent. If SoundExchange cannot identify a recording or its payee, the money can sit unclaimed.

An independent artist who owns the master and performs it can collect both the owner's and the featured artist's shares.`,
          },
        ],
      },
      {
        id: 'music-business.t3',
        title: 'Deals and Your Team',
        blurb: 'Record deal structures, recoupment, managers, agents and the clauses that matter.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L10,
            title: 'Record Deal Types',
            blurb: 'Traditional, licensing, distribution, 360 and indie deals allocate cost, ownership and risk differently.',
            minutes: 10,
            body: `There is no single record deal. The common types differ in who funds, who owns, and who shares which income.

In a traditional deal, the label funds recording and marketing as recoupable advances, owns the masters for a long term, and pays the artist a royalty percentage. Royalty rates vary widely and are defined against specific bases, so the percentage alone says little.

In a licensing deal, the artist or a production company retains ownership and grants the label a license to exploit the masters for a limited term and territory, after which the rights return.

In a distribution deal, the artist keeps ownership and pays a fee or percentage for physical or digital distribution and sometimes services. Label services and indie deals sit on a spectrum; many indie labels use a profit split after costs, commonly described as a fifty-fifty arrangement, but terms vary.

A 360 deal lets the label share in income beyond records, such as touring, merchandise, endorsements or publishing, usually in return for greater investment.

Worked examples: a label takes 15 percent of an artist's $20,000 in merch sales under a 360 deal, which is $3,000. In a 50 percent profit split, a record earning $80,000 with $30,000 in costs leaves $50,000 of profit, so the artist's share is $25,000.

Compare deals on ownership, term, reversion, cost recoupment, and what the label actually does for each income stream it shares in. Your attorney should review the real documents.`,
          },
          {
            id: L11,
            title: 'Advances and Recoupment',
            blurb: 'An advance is a loan against future royalties, repaid from the artist share only.',
            minutes: 12,
            body: `An advance is money paid up front and recouped, meaning recovered by the label out of the artist's future royalties. It is generally not repaid out of pocket if the record fails, but it also means the artist is not paid royalties until the recoupable balance is covered. The label's own share of revenue is not used to recoup, which is why a record can be profitable for the label while the artist is unrecouped.

Recoupable items are defined in the contract and may include the advance, recording costs, some video costs, tour support and portions of marketing.

The formula is simple: royalties earned equal receipts times the artist's royalty rate, and recoupment occurs when royalties earned reach the recoupable balance.

Worked example, with invented numbers: a $100,000 recoupable advance and a 20 percent royalty. Break-even receipts equal $100,000 divided by 0.20, which is $500,000. At $700,000 of royalty-bearing receipts the artist has earned $140,000, so $40,000 is payable after recoupment. At $400,000 of receipts the artist has earned $80,000, and $20,000 remains unrecouped.

Add a $150,000 recording fund and a $50,000 personal advance, both recoupable: the balance is $200,000, so receipts of $1,000,000 are needed before royalties are paid.

Cross-collateralization lets unrecouped balances from one record be deducted from earnings of another. If album one is $30,000 unrecouped and album two earns $50,000 in royalties, the artist is paid $20,000 under cross-collateralization versus $50,000 without it.

Always model your own contract's definitions, because bases, deductions and rates differ.`,
          },
          {
            id: L12,
            title: 'Managers, Agents and Business Managers',
            blurb: 'Who does what on your team and what they commonly charge.',
            minutes: 9,
            body: `A personal manager guides career strategy, coordinates the team and negotiates deals. Managers are commonly paid a commission of roughly fifteen to twenty percent of gross income, but arrangements vary and should be negotiated and written down.

A booking agent finds and negotiates live performance dates. Agents are commonly paid around ten percent of performance fees, and some jurisdictions and unions regulate agent licensing and commissions.

A business manager handles accounting, budgeting, payments and tax coordination, commonly charging a percentage in the low single digits to the mid single digits of gross or an hourly or flat fee. An attorney negotiates and reviews contracts, usually billed hourly, flat or occasionally by percentage, and may be bound by conflict rules.

Worked example under assumed rates: a $50,000 performance income with a 15 percent manager, a 10 percent agent and a 5 percent business manager means $7,500 plus $5,000 plus $2,500, which is $15,000. The artist keeps $35,000 before any expenses.

Check what the commission applies to. If the manager takes 15 percent of gross, a $80,000 gross with $50,000 of expenses gives a $12,000 commission, while the same rate on the $30,000 net would be $4,500, a difference of $7,500.

Other terms include the term of the management contract, post-term commission on deals made during the term, often tapering in a sunset clause, key-person provisions and commissionable income definitions. Watch for conflicts of interest if one person acts as manager and also as your label or publisher. Hire trusted specialists, not simply the first person who offers.`,
          },
          {
            id: L13,
            title: 'Contracts to Read Carefully',
            blurb: 'Term, territory, rights granted, reversion and audit rights decide the real value of a deal.',
            minutes: 10,
            body: `Any music contract is a trade of rights for money and services. A few clauses decide the shape of the trade, and this lesson is general education, so have an independent attorney review the actual document before you sign.

Term is how long the deal runs. Look at whether it is a fixed period, a number of albums, or a first period plus options held by the other side. Example: a one-year initial term with four one-year options exercisable by the label can run up to five years, even though the artist feels committed to one.

Territory is where the grant applies: worldwide, or only the United States.

Rights granted lists exactly what you give: masters, compositions, name and likeness, merchandise, digital rights, and whether the grant is a license or an assignment, and exclusive or not. Watch for sweeping language such as all rights in all media in perpetuity.

Reversion is how and when rights return to you, for example after a term, if the label fails to release, or after unrecouped periods. Without reversion language, rights may never come back.

Audit rights allow you to inspect the other party's books to verify royalty statements. Check how long you have to object to statements, how often you can audit, and who pays if errors are found.

Also read assignment clauses, which can allow transfer of your contract to a third party, plus exclusivity, key-person, controlled composition clauses, deductions, and cross-collateralization.

Before signing, summarize each clause in your own words. If you cannot, ask.`,
          },
        ],
      },
      {
        id: 'music-business.t4',
        title: 'Live, Merch and Release',
        blurb: 'Tour and merch economics, building a team, release planning, marketing and fan data.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L14,
            title: 'Touring Economics',
            blurb: 'A worked tour profit and loss, from guarantees to what each member takes home.',
            minutes: 12,
            body: `Live income starts with the deal for each show. A guarantee is a fixed fee. A percentage or door deal pays a share of ticket sales. A versus deal pays the greater of a guarantee or a percentage of net, which is gross receipts after agreed show expenses.

Worked tour P&L under assumed numbers: ten shows at a $3,000 guarantee give $30,000 of gross. Expenses are $5,500 for van and fuel, $5,000 for lodging, $3,000 for per diems, $2,500 for a sound engineer, and $1,000 for insurance and miscellaneous, for $17,000 in total. Commissions of 10 percent for the agent and 15 percent for the manager on the gross cost $7,500. The remainder is $30,000 minus $17,000 minus $7,500, which is $5,500. Split among four members, each takes home $1,375, before taxes. If a 360 label also took 10 percent of the $30,000 gross, $3,000 more would leave $2,500.

Versus deal check: a $2,000 guarantee versus 80 percent of net, with $4,500 of ticket gross and $1,500 of expenses. Net is $3,000, and 80 percent is $2,400, which beats $2,000.

Merchandise sold on the road often becomes the profit centre, which the next lesson covers. Track every receipt and settle each show against the written deal.

Common leaks are underestimated lodging and fuel, unpaid support staff, unreimbursed deposits, and ignoring that percentage commissions come off the top. Build the budget first, then decide if the dates are worth doing.`,
          },
          {
            id: L15,
            title: 'Merch Economics',
            blurb: 'Margins, venue cuts, inventory risk and print-on-demand tradeoffs.',
            minutes: 9,
            body: `Merchandise is physical products that fans buy to support you: shirts, hoodies, vinyl, posters. Its economics come down to unit cost, selling price, who takes a cut, and how much inventory you risk.

Margin per item equals price minus unit cost minus per-item fees. Many venues take a percentage of merch gross, commonly somewhere in a range such as ten to twenty-five percent but it varies, and they take it on sales, not on your profit. Also account for sales tax rules, card processing fees and shipping.

Worked example: a shirt costs $8 to make and sells for $25. The venue takes 20 percent of the gross, which is $5. Profit per shirt is $25 minus $8 minus $5, which is $12. A hoodie costing $22 and selling for $55 has an $11 venue cut and profits $22. If you sell 100 shirts and 50 hoodies on a tour, profit is $1,200 plus $1,100, or $2,300.

A common mistake: assuming a 25 percent venue cut means you keep 75 percent of profit. If a $20 shirt costs $8 and the venue takes 25 percent of the $20 gross, which is $5, profit is $7, not $9.

Bulk printing lowers unit cost but requires cash up front and risks unsold stock. Print-on-demand avoids inventory but costs more per unit. Suppose a bulk run of 300 shirts at $8 costs $2,400, and print-on-demand costs $14. If you sell 200 shirts at $25 with a $5 venue cut, bulk nets $4,000 minus $2,400, which is $1,600, while print-on-demand nets 200 times $6, which is $1,200. Bulk wins at that volume, but at low sales volume, the risk reverses.`,
          },
          {
            id: L16,
            title: 'Building a Team and a Release Plan',
            blurb: 'Sequence the people, registrations and promotion that surround a release.',
            minutes: 9,
            body: `A release is a project with a timeline, a budget and a team. Early teams are often small: the artist, a producer or engineer, a designer, a distributor, and perhaps a part-time manager or publicist. Add specialists as the income justifies them, and put roles and payment terms in writing.

Release planning typically starts weeks before launch. Many distributors need lead time to deliver to services and to pitch for editorial playlist consideration, so a plan often runs eight to twelve weeks, depending on the service. Work backward from the release date.

A practical checklist: finalize masters and artwork, assign ISRCs and a UPC, complete metadata and credits, sign a split sheet for each song, register compositions with your PRO and the MLC, register recordings with SoundExchange when applicable, set up pre-save or announcement pages, prepare content, then pitch and promote.

Date arithmetic example: if your distributor asks for at least four weeks, which is 28 days, before release for editorial pitching (distributors vary, and Spotify itself asks for at least about a week) and you plan to release on June 26, the latest submission date is May 29.

Budget example for $3,000: 40 percent paid promotion is $1,200, 30 percent content is $900, 20 percent publicity is $600, and 10 percent reserve is $300. These add to 100 percent. Spending everything in release week leaves no money for the weeks after, when momentum may justify more.

Releasing music without registering songs and splits is a classic mistake: the plays happen, but collection systems cannot identify who to pay.`,
          },
          {
            id: L17,
            title: 'Marketing and Fan Data',
            blurb: 'Own your audience, measure what converts, and handle fan data lawfully.',
            minutes: 9,
            body: `Streaming and social platforms are rented audiences: the algorithm, terms and reach can change without notice. Fan data you collect with permission, such as an email list or text list, is an owned audience that you can reach directly. Keep both, but build the owned one deliberately.

Useful data comes from your own channels and from the platforms' artist dashboards: listener geography, saves, repeat listens, playlist sources, ticket buyers, merchandise customers and signup sources. Use it to decide where to tour, where to advertise, and what to release.

Think in a funnel. Example: 10,000 monthly listeners, of whom 2 percent join your email list, is 200 subscribers. If 10 percent of those buy a $25 item, that is 20 buyers and $500. If a $300 ad campaign produces 150 signups, each signup cost $2.00. Compare that cost with what a subscriber is likely to spend before deciding to scale.

Handle data responsibly. In the United States, commercial email is subject to the CAN-SPAM Act, which requires among other things honest headers, a physical postal address and a working unsubscribe mechanism. Children's online data is regulated by COPPA, which covers children under 13. Fans in other regions may have additional privacy rights. Collect only what you need, explain how you will use it, and honor opt-outs. Buying email lists is both ineffective and risky.

Consistent branding, regular content and direct communication convert listeners into supporters. Test small experiments and keep what works.`,
          },
        ],
      },
      {
        id: 'music-business.t5',
        title: 'Running the Business',
        blurb: 'Entities, taxes, records, and the Plajah tools that support an independent music business.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L18,
            title: 'Entities, Taxes and Record-Keeping',
            blurb: 'Choosing a structure and keeping the books that make royalties and deductions defensible.',
            minutes: 10,
            body: `An artist or label can operate as a sole proprietor by default or form a business entity. A limited liability company, or LLC, is common because it can separate personal and business liability and is by default taxed as a pass-through, meaning profit is reported on the owners' own returns. Corporations and tax elections such as S corporation status are other options with different costs and rules, and they vary by state. This is general education, not tax or legal advice, so consult a qualified accountant and attorney for your situation.

An entity helps only if you operate it properly. Open a separate business bank account, never mix personal and business money, sign contracts in the entity's name, and keep records. Commingling funds can weaken the protection the entity offers. An LLC also does not make income tax-free.

Typical records include income statements from distributors, PROs, the MLC and SoundExchange, invoices, show settlements, merch sales, contracts, and receipts for expenses. Reasonable business expenses, such as gear, studio time, advertising and travel, may be deductible under tax rules. Independent earners often owe estimated taxes during the year and receive forms such as 1099s.

Worked example: revenue of $18,000 with expenses of $4,500 for gear, $3,000 for travel and $1,500 for advertising gives $9,000 of expenses and $9,000 of net profit. If you set aside a hypothetical 25 percent for taxes, that is $2,250. Actual rates depend on your circumstances.

Keep copies of everything for as long as your accountant advises.`,
          },
          {
            id: L19,
            title: 'Plajah Tools for the Music Business',
            blurb: 'How Chora distribution, the licensing store, Melos and Artist Manager map to what you have learned.',
            minutes: 9,
            body: `This closing lesson connects the course to the tools on Plajah. As always, this is education, not legal or financial advice, and you should read Plajah's current terms and each tool's own screens for exact features, fees and payout rules, which can change.

Chora and the distribution hub are where you publish and sell your own music. Plajah's tools support routes such as direct sales to fans and fan membership with exclusive tracks, plus artist radio. Think about each through the lenses you learned: who owns the master and the composition, what splits you owe collaborators, and which collection systems still need your registration. Publishing on a platform does not by itself register your songs with a PRO, the MLC or SoundExchange.

The music licensing store is a sync-style marketplace where filmmakers can license tracks for a project, or request a license and receive a price from the owner. It illustrates the master and sync clearance covered earlier: you can only offer what you control, so be certain of your chain of title and your co-writers' agreement.

Melos is the place to create and produce music. Keep session files, stems, credits and split sheets organized as you go, because accurate credits feed registration.

Artist Manager is the business hub for contracts, invoices, payroll, tasks, vendors and venues. Use it to track commissions, show settlements and merch costs like the examples in this course.

Worked example: you finish a track in Melos, sign a 60/40 split sheet, set a direct-sale price, enter the collaborator payout in Artist Manager, and register the work and recording with the proper collectors. Each step answers a lesson from this course.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'music-business',
    questions: [
      // ---- L01 ----
      mc(L01, 1, 1, `Recorded music generally earns on which two separate sides?`,
        [`The recording side (sound recording) and the publishing side (composition)`, `The live side and the merchandise side`, `The label side and the radio side`, `The streaming side and the download side`],
        `Think about the two copyrights in every song.`, `Every song has a sound recording and a composition, each owned and collected separately, which is the core of the money map.`),
      mc(L01, 2, 2, `A service sets aside $1,000 for one song's plays. Illustrative rules send 60 percent to the recording side and the rest to publishing. How much goes to the publishing side?`,
        [`$400`, `$600`, `$40`, `$4,000`],
        `Subtract the recording share from 100 percent first.`, `The publishing side receives 100 minus 60 equals 40 percent, which is $400 of the $1,000.`),
      mc(L01, 3, 2, `Using the $600 recording and $400 publishing split of $1,000, an artist owns the publishing and keeps 20 percent of master income (ignore other deductions). What does the artist receive in total?`,
        [`$520`, `$120`, `$920`, `$600`],
        `Compute 20 percent of the recording side, then add publishing.`, `20 percent of $600 is $120, plus the $400 publishing side, equals $520.`),
      mc(L01, 4, 3, `An artist says streaming only pays one party, so registering with a distributor is all they need. What is the main flaw?`,
        [`It ignores the publishing side, which needs its own registrations and collectors`, `Distributors never pay artists, since they only upload files to stores and ignore money`, `Streaming services pay only publishers`, `Registration is only needed for live shows`],
        `Who collects for the composition?`, `The composition earns separately and is collected through channels such as PROs and the MLC, which a distributor does not automatically cover.`),
      mc(L01, 5, 3, `Which income is paid for performing rather than for owning a copyright?`,
        [`Show guarantees and ticket income`, `Mechanical royalties from reproductions`, `Master licensing fees for recordings`, `Sync fees for film and TV placements`],
        `Which of these does not depend on a recording or song being used?`, `Live fees are paid for the performance itself; the other options are paid because a copyrighted work is used.`),

      // ---- L02 ----
      tf(L02, 1, 1, `A sound recording and the song it contains are the same copyright.`, 1,
        `Consider a cover version.`, `They are separate copyrights: the composition and the sound recording, often with different owners.`),
      mc(L02, 2, 2, `A band records its own version of a song written by someone else. What must it clear for the composition?`,
        [`A mechanical license for the underlying composition`, `A master license from the original label that released the recording`, `Nothing, because a cover is a new song`, `Only a sync license`],
        `The cover is a new recording, so which right still belongs to someone else?`, `The cover owns its new master but needs a mechanical license for the underlying composition.`),
      mc(L02, 3, 2, `A producer samples five seconds of a commercial record in a new beat. Which clearances are normally needed?`,
        [`Both the master owner and the publisher of the composition`, `Only the master owner, since the recording is what was copied`, `Only the PRO, which licenses samples on behalf of every writer`, `None if the sample is under ten seconds long, because short uses are exempt`],
        `A sample uses the recording and the music inside it.`, `Sampling a recording typically uses both copyrights, so both owners usually need to clear it. Length alone does not create a safe harbor.`),
      mc(L02, 4, 3, `A contract says the artist assigns all copyrights in the songs recorded under the deal to the label, when the deal was meant to cover only the recordings. What is the issue?`,
        [`It would transfer the composition copyright as well as the master`, `It is invalid because labels cannot own masters`, `It assigns only performance rights`, `It has no effect on ownership`],
        `Compare what the clause says with what was intended.`, `Wording that covers all copyrights in the songs can sweep in the composition, not just the recording.`),
      mc(L02, 5, 3, `A label buys a band's master recordings outright. What does that purchase automatically include?`,
        [`Nothing in the compositions unless the contract also transfers them`, `All composition rights, including the publishing and the writers shares of income`, `The writers' PRO memberships`, `The band's name and likeness`],
        `Which copyright is the one being sold?`, `Selling the master transfers the sound recording copyright only; compositions, names and other rights need separate language.`),

      // ---- L03 ----
      mc(L03, 1, 1, `What does a split sheet record?`,
        [`Each writer's agreed percentage ownership of a song`, `The total number of streams a song has earned this quarter`, `The dates and venues for the next run of tour shows booked`, `The royalty rate the label agreed to pay on each record sold`],
        `It is signed by collaborators.`, `A split sheet documents who owns what percent of the composition, ideally at the time of writing.`),
      mc(L03, 2, 2, `A song earns $2,000 of publishing income and the writers hold 50, 30 and 20 percent. How much is owed to the 30 percent writer?`,
        [`$600`, `$300`, `$1,000`, `$400`],
        `Multiply total income by the percentage.`, `30 percent of $2,000 equals $600.`),
      mc(L03, 3, 2, `A writer's administrator charges 20 percent on $5,000 collected. What does the writer receive?`,
        [`$4,000`, `$1,000`, `$4,800`, `$3,000`],
        `Subtract the fee.`, `20 percent of $5,000 is $1,000, leaving $4,000.`),
      mc(L03, 4, 3, `Two writers verbally agree to share equally. After release, a producer claims 25 percent of the song. What was the key mistake?`,
        [`No written split sheet was signed when the song was written`, `Verbal agreements are always illegal, so the claim cannot be upheld`, `Producers can never claim shares of a song they helped to create`, `Songs cannot have more than two writers listed on a single registration`],
        `How could the dispute have been prevented?`, `Without a written agreement signed at the time, ownership disputes are hard to resolve.`),
      mc(L03, 5, 3, `Which arrangement most clearly lets the writer keep ownership of the copyright while a publisher collects for a fee?`,
        [`An administration deal`, `A copyright assignment deal`, `A work-for-hire buyout`, `A sale of the catalog`],
        `Look for the structure where the publisher only administers.`, `In an administration deal the writer keeps ownership and the publisher charges a fee for collecting and administering.`),

      // ---- L04 ----
      tf(L04, 1, 1, `In the US, SESAC and GMR are open to any songwriter who applies.`, 1,
        `Think about invitations.`, `SESAC and GMR are selective and invitation based, unlike ASCAP and BMI.`),
      mc(L04, 2, 2, `A song generates $800 of performance royalties paid half as writer's share and half as publisher's share. How much is the writer's share?`,
        [`$400`, `$800`, `$200`, `$100`],
        `Divide by two.`, `Half of $800 is $400 for the writer, with $400 for the publisher.`),
      mc(L04, 3, 2, `A songwriter wants to register the same songs with both ASCAP and BMI. What is the usual problem?`,
        [`Writers generally affiliate with one PRO at a time`, `Writers must join all four PROs`, `PROs do not accept writers`, `Nothing; double collection is standard and writers are paid twice`],
        `Consider how performances would be allocated.`, `A songwriter generally belongs to a single PRO at a time, so duplicate affiliation creates conflicts.`),
      mc(L04, 4, 3, `A songwriter says their PRO membership means their recordings are covered on internet radio. What is wrong?`,
        [`PROs cover the composition; SoundExchange covers digital performance of the master`, `PROs only collect from live venues`, `Internet radio never pays royalties`, `Membership applies only to publishers`],
        `Which copyright does the PRO represent?`, `PROs collect composition performance royalties, while recording performance royalties for non-interactive digital services go through SoundExchange.`),
      mc(L04, 5, 3, `A writer has registered with a PRO but never created a publisher entity. What is the likely result?`,
        [`The publisher's share of performance income may go uncollected`, `The writer's share is lost as well, and the entire registration is cancelled by the PRO`, `The PRO pays the publisher's share twice to the writer as a bonus for registering`, `Nothing changes, since there is no separate publisher share to collect from the PRO`],
        `Recall the two shares.`, `Performance income has a writer's share and a publisher's share, and without a registered publisher the latter may not be claimed.`),

      // ---- L05 ----
      mc(L05, 1, 1, `Which organization administers the blanket mechanical license for eligible digital music services under the Music Modernization Act?`,
        [`The Mechanical Licensing Collective (MLC)`, `SoundExchange`, `ASCAP`, `The Recording Industry Association of America trade group`],
        `Its name describes the right it licenses.`, `The MLC administers the blanket license, receiving reports and payments and distributing mechanical royalties.`),
      mc(L05, 2, 2, `Using a hypothetical statutory rate of $0.10 per copy, a band presses 1,000 CDs of a licensed cover. What mechanical royalty is owed?`,
        [`$100`, `$10`, `$1,000`, `$10,000`],
        `Multiply copies by rate.`, `1,000 copies times $0.10 equals $100. The real rate is set by regulation and changes.`),
      mc(L05, 3, 2, `A songwriter wants mechanical royalties from interactive streaming services. What should they or their publisher do?`,
        [`Register the works and ownership shares with the MLC`, `Only join a PRO`, `Register with SoundExchange only`, `Wait; services pay automatically`],
        `Which collective matches digital usage to works?`, `The MLC pays based on registered works and shares, so registration with accurate data is how songs get matched.`),
      mc(L05, 4, 3, `A work's registered shares at the MLC total only 90 percent. What is the likely effect?`,
        [`Part of the royalties cannot be fully matched and paid`, `The MLC pays 90 percent twice to make up for the missing share`, `The song is automatically deleted from the MLC database and all claims end`, `Nothing; the MLC fills the gap by assigning the missing share to the writers`],
        `What must splits add up to?`, `Incomplete splits cause unmatched or disputed money, so registered shares should total 100 percent.`),
      tf(L05, 5, 3, `Under the MMA blanket license the MLC collects performance royalties for radio plays.`, 1,
        `Which right does a mechanical license cover?`, `The MLC handles mechanical rights for digital services; performance royalties go through PROs.`),

      // ---- L06 ----
      mc(L06, 1, 1, `A typical TV placement of a commercial song needs which two licenses?`,
        [`A sync license and a master use license`, `Two sync licenses`, `A mechanical and a PRO license`, `A SoundExchange license and a sync license together`],
        `One covers the composition, one the recording.`, `The publisher grants sync for the composition and the master owner grants master use.`),
      mc(L06, 2, 2, `A production agrees a $6,000 sync fee with a most favored nations master fee. What is the total paid for both licenses?`,
        [`$12,000`, `$6,000`, `$18,000`, `$3,000`],
        `MFN means the two sides are equal.`, `The master fee also equals $6,000, so the total is $12,000.`),
      mc(L06, 3, 2, `A license covers US broadcast TV for two years. The show is sold to a global streamer in year one. What is needed?`,
        [`Additional or expanded rights for the new media and territory`, `Nothing, since the original license continues to cover every later release`, `Only a PRO license, because the broadcast terms already cover the sync`, `A new composition must be written and registered for the new global version`],
        `Compare the new use to the original scope.`, `A license is limited to its scope, so worldwide streaming would require expanded rights.`),
      mc(L06, 4, 3, `A request offers $500 for a perpetual, all-media, worldwide, exclusive license to a song. What is the main concern?`,
        [`The broad exclusive scope may block future licensing at a low price`, `The fee is illegal`, `Exclusive licenses are never allowed`, `Perpetual means the term is one year`],
        `Compare the breadth of the grant with the price.`, `A broad, exclusive, perpetual grant should be priced much higher because it limits other income.`),
      mc(L06, 5, 3, `Why does a production file a cue sheet?`,
        [`It lists each song and its writers so performance royalties can be paid`, `It replaces the sync license`, `It sets the sync fee`, `It registers the master with SoundExchange`],
        `Think about which collectors need usage information.`, `Cue sheets tell PROs what music was used and who wrote it, supporting performance royalty payments.`),

      // ---- L07 ----
      mc(L07, 1, 1, `What is the main difference between a master license and an assignment?`,
        [`A license grants limited permission; an assignment transfers ownership`, `They are identical`, `A license transfers ownership; an assignment does not`, `Assignments are only used for compositions and never apply to master recordings`],
        `Who owns the recording afterward?`, `Licenses are scope-limited permissions while assignments transfer title.`),
      mc(L07, 2, 2, `A master owner licenses a track non-exclusively to four users at $1,500 each. What is the total, and who still owns the master?`,
        [`$6,000, and the owner`, `$1,500, and the licensees`, `$6,000, and the licensees`, `$4,500, and the owner`],
        `Four payments, and no transfer of ownership.`, `4 times $1,500 equals $6,000, and licensing does not transfer ownership.`),
      mc(L07, 3, 2, `A new song samples a record. The sample's publisher takes 20 percent of the new song's publishing, which earns $5,000. How much does the sample's publisher receive?`,
        [`$1,000`, `$500`, `$4,000`, `$250`],
        `Take 20 percent of $5,000.`, `20 percent of $5,000 is $1,000, leaving $4,000 for the new writers.`),
      mc(L07, 4, 3, `Which term most limits the owner's ability to license the master elsewhere?`,
        [`Exclusivity`, `Non-exclusivity`, `A fixed term`, `Credit`],
        `Think about who else can use it.`, `An exclusive license prevents the owner from licensing the same use to others within its scope.`),
      mc(L07, 5, 3, `Why does a distribution agreement raise the same questions as a master license?`,
        [`It also grants rights in your masters, so scope, term and reversion matter`, `It transfers the composition copyright to the distributor automatically on signing`, `It replaces PRO registration, so the writers no longer need to register songs`, `It sets the sync fee that film and television producers must pay for the songs`],
        `What are you actually giving a distributor?`, `A distribution agreement licenses your recordings, so term, territory, exclusivity and reversion should be checked.`),

      // ---- L08 ----
      mc(L08, 1, 1, `What does an ISRC identify?`,
        [`A specific sound recording`, `A songwriter`, `A record label`, `A streaming service`],
        `It travels with the recording's metadata.`, `An ISRC is a unique code for a sound recording, used to track and pay it.`),
      mc(L08, 2, 2, `In a month the recording-side pool is $1,000,000 with 500,000,000 total streams. You have 250,000 streams. What do you earn before fees?`,
        [`$500`, `$50`, `$5,000`, `$250`],
        `Compute your share of total streams first.`, `250,000 divided by 500,000,000 is 0.05 percent, and 0.05 percent of $1,000,000 is $500.`),
      mc(L08, 3, 2, `The pool stays $1,000,000 but total streams double to 1,000,000,000. What do your same 250,000 streams earn?`,
        [`$250`, `$500`, `$1,000`, `$125`],
        `Your share of the total halves.`, `250,000 of 1,000,000,000 is 0.025 percent, so $250.`),
      mc(L08, 4, 3, `Someone says Platform B pays $0.004 per stream and Platform A pays $0.003, so B is always better. What is wrong?`,
        [`Per-stream amounts are outcomes of pools, mixes and countries, not fixed prices`, `Platforms must pay equal rates by law, so any difference must be a reporting error`, `Per-stream rates never change`, `Streams are never counted`],
        `Is a per-stream rate promised anywhere?`, `The effective rate comes from pool revenue divided by streams and varies by period, country and subscriber mix.`),
      mc(L08, 5, 3, `Distributor A takes 15 percent of revenue; distributor B charges a flat $30 per year. For $1,000 annual revenue, which costs less and by how much?`,
        [`B, by $120`, `A, by $120`, `B, by $30`, `They cost the same`],
        `Compute A's fee, then compare.`, `A's fee is $150 versus B's $30, so B costs $120 less. The break-even is $200 of revenue.`),

      // ---- L09 ----
      mc(L09, 1, 1, `What does SoundExchange collect and distribute?`,
        [`Digital performance royalties for sound recordings under statutory licenses`, `Composition performance royalties`, `Mechanical royalties for downloads`, `Merchandise income`],
        `It handles the master, not the composition.`, `SoundExchange administers the statutory digital performance license for sound recordings on non-interactive services.`),
      mc(L09, 2, 2, `A distribution is $10,000 for a recording. What does the featured artist receive under the statutory split?`,
        [`$4,500`, `$5,000`, `$500`, `$2,500`],
        `The artist share is 45 percent.`, `45 percent of $10,000 is $4,500, with $5,000 to the owner and $500 to non-featured performers.`),
      mc(L09, 3, 2, `A $2,000 distribution is made. How much goes to the non-featured performers fund?`,
        [`$100`, `$200`, `$900`, `$1,000`],
        `The non-featured share is 5 percent.`, `5 percent of $2,000 is $100.`),
      mc(L09, 4, 3, `A label-signed artist assumes the label will pass along the 45 percent featured-artist share. What is the risk?`,
        [`The artist is paid directly by SoundExchange only if registered; otherwise money may sit unclaimed`, `Labels always keep it`, `Featured artists get nothing`, `The share is paid by PROs`],
        `Who pays the featured artist share?`, `SoundExchange pays featured artists directly when they are registered, so unregistered artists may miss payment.`),
      mc(L09, 5, 3, `A song plays on a terrestrial AM/FM station. What does US law generally require paid?`,
        [`Composition performance royalties through PROs, but generally no sound recording performance royalty`, `Both composition and master performance royalties`, `Only SoundExchange royalties`, `Nothing`],
        `Terrestrial radio is the exception here.`, `US terrestrial radio pays composition royalties but generally no sound recording performance royalty, unlike digital transmissions.`),

      // ---- L10 ----
      mc(L10, 1, 1, `Which deal type typically lets the artist keep master ownership while paying a fee for distribution?`,
        [`A distribution deal`, `A traditional deal`, `A copyright assignment deal`, `A 360 deal`],
        `Think of the label as a service provider.`, `In a distribution deal the artist keeps ownership and pays a fee or percentage for distribution.`),
      mc(L10, 2, 2, `Under a 360 deal a label takes 15 percent of $20,000 in merch. How much?`,
        [`$3,000`, `$300`, `$2,000`, `$5,000`],
        `Multiply by 0.15.`, `15 percent of $20,000 is $3,000.`),
      mc(L10, 3, 2, `A record earns $80,000 with $30,000 in costs under a 50 percent profit split. What is the artist's share?`,
        [`$25,000`, `$40,000`, `$15,000`, `$50,000`],
        `Subtract costs before splitting.`, `Profit is $50,000 and half is $25,000.`),
      mc(L10, 4, 3, `Which is better for long-term ownership: a perpetual label-owned master or a ten-year license with reversion?`,
        [`The license with reversion, because rights return to you`, `The perpetual deal, because the label then holds the master with no end date`, `They are equal, because ownership is the same under both kinds of deal`, `Neither affects ownership, since the deal terms only change the royalty rate`],
        `Which deal returns rights?`, `Reversion returns rights to the owner after the term, while perpetual ownership by the label does not.`),
      mc(L10, 5, 3, `A 360 label takes a share of touring income but does no touring support. What is the main issue?`,
        [`The label shares income without adding matching value for that income stream`, `Labels cannot share touring income`, `Touring is not income`, `360 deals always include tour support`],
        `Compare what the label gives to what it takes.`, `You should compare what services the label provides for each stream it shares in.`),

      // ---- L11 ----
      mc(L11, 1, 1, `What does it mean for an advance to be recouped?`,
        [`The label recovers it from the artist's future royalties`, `The artist repays it immediately`, `It is gifted`, `The label forgives it automatically once the album has been released and promoted`],
        `Where does the recovery come from?`, `Recoupment means the label recovers the advance out of the artist's royalty share.`),
      mc(L11, 2, 2, `A $60,000 recoupable advance and a 15 percent royalty. At what royalty-bearing receipts does the artist recoup?`,
        [`$400,000`, `$90,000`, `$9,000`, `$600,000`],
        `Divide the advance by the rate.`, `$60,000 divided by 0.15 equals $400,000.`),
      mc(L11, 3, 2, `A $100,000 advance, 20 percent royalty, $700,000 in receipts. How much royalty is payable after recoupment?`,
        [`$40,000`, `$140,000`, `$100,000`, `$0`],
        `Earned royalties minus the advance.`, `20 percent of $700,000 is $140,000, minus $100,000 leaves $40,000.`),
      mc(L11, 4, 3, `A $150,000 recording fund and a $50,000 advance are both recoupable at a 20 percent rate. What receipts are needed before the artist is paid royalties?`,
        [`$1,000,000`, `$400,000`, `$200,000`, `$750,000`],
        `Add the balances before dividing.`, `The balance is $200,000, and $200,000 divided by 0.20 is $1,000,000.`),
      mc(L11, 5, 3, `Album one is $30,000 unrecouped and album two earns $50,000 in royalties. With cross-collateralization, what is paid on album two?`,
        [`$20,000`, `$50,000`, `$30,000`, `$80,000`],
        `Offset the old balance.`, `The $30,000 deficit is deducted from $50,000, leaving $20,000.`),

      // ---- L12 ----
      mc(L12, 1, 1, `What does a booking agent primarily do?`,
        [`Finds and negotiates live performance dates`, `Registers songs with PROs and the MLC on behalf of the writers`, `Mixes and masters recordings before they go to distribution`, `Files taxes and handles the yearly bookkeeping for the artist`],
        `Think live shows.`, `Agents book live performances and negotiate the performance terms.`),
      mc(L12, 2, 2, `On $20,000 of show income an agent takes 10 percent and a manager 15 percent. What does the artist keep before expenses?`,
        [`$15,000`, `$17,000`, `$5,000`, `$12,000`],
        `Add the commission percentages.`, `Commissions are 25 percent, or $5,000, leaving $15,000.`),
      mc(L12, 3, 2, `A manager takes 15 percent. Gross is $80,000, expenses $50,000. How much more is the commission on gross than on net?`,
        [`$7,500`, `$12,000`, `$4,500`, `$3,000`],
        `Compute both commissions.`, `15 percent of $80,000 is $12,000 and of $30,000 is $4,500, a $7,500 difference.`),
      mc(L12, 4, 3, `A manager also owns the label offering you a deal. What is the central concern?`,
        [`A conflict of interest in negotiating against their own interests`, `Managers cannot own labels by law, so any such offer is automatically void`, `It lowers the commission the manager takes on all of the other income`, `Nothing to consider, since a manager who owns a label always negotiates fairly`],
        `Whose interests is the manager representing?`, `A manager who benefits on the other side of the deal may not negotiate in the artist's best interest, so independent counsel matters.`),
      mc(L12, 5, 3, `What is the purpose of a sunset clause in a management deal?`,
        [`To reduce post-term commissions on deals over time`, `To end the artist's copyright`, `To set the booking fee`, `To waive all commissions`],
        `It concerns what happens after the contract ends.`, `Sunset clauses taper or limit commission after the term on deals made during it.`),

      // ---- L13 ----
      mc(L13, 1, 1, `What is reversion in a contract?`,
        [`Rights returning to the grantor under stated conditions`, `A royalty increase that applies after the album sells a set number of copies`, `A territory expansion that adds new countries to the license after release`, `An audit of the label books carried out by an outside accountant each year`],
        `It concerns getting rights back.`, `Reversion clauses specify when and how granted rights return.`),
      mc(L13, 2, 2, `A deal has a one-year initial term plus four one-year options held by the label. What is the maximum length?`,
        [`5 years`, `4 years`, `1 year`, `6 years`],
        `Count the initial term and all options.`, `1 plus 4 equals 5 years if all options are exercised.`),
      mc(L13, 3, 2, `You license your recording for the United States only. The licensee releases it in Japan. What does that most likely mean?`,
        [`It is outside the licensed territory`, `It is allowed because the web is global`, `The license was perpetual`, `The song is public domain`],
        `Read the territory.`, `A license limited to the US does not cover other territories without more rights.`),
      mc(L13, 4, 3, `A clause lets the other party assign your contract to any third party without consent. What is the issue?`,
        [`You may end up dealing with an unknown party with your rights`, `It is required by law`, `It cancels the term`, `It improves reversion`],
        `Who might hold your rights later?`, `Free assignment can move your contract to someone you never chose.`),
      mc(L13, 5, 3, `Audit rights allow objections only within six months after each statement, with the artist paying all costs. What is the concern?`,
        [`The window and cost burden make errors hard to catch and recover`, `Audit rights are illegal, so the label can ignore any objection the artist raises`, `Six months is always too long for the label to hold its statements open`, `The label pays all costs, which makes the audit unfair to the label itself`],
        `Consider how fast errors surface.`, `Short windows and cost burdens weaken the practical value of audit rights.`),

      // ---- L14 ----
      mc(L14, 1, 1, `What is a versus deal?`,
        [`The greater of a guarantee or a percentage of net`, `A flat fee only`, `Only a percentage of door sales`, `A deal that splits merchandise`],
        `Two numbers, you get the higher one.`, `Versus deals pay the greater of the guarantee or the percentage of net.`),
      mc(L14, 2, 2, `A $2,000 guarantee versus 80 percent of net. Ticket gross is $4,500 and show expenses $1,500. What does the artist receive?`,
        [`$2,400`, `$2,000`, `$3,600`, `$3,000`],
        `Compute net first.`, `Net is $3,000, 80 percent is $2,400, which beats $2,000.`),
      mc(L14, 3, 2, `A tour leaves $5,500 to split among four equal members. What does each take home before taxes?`,
        [`$1,375`, `$1,100`, `$1,500`, `$2,750`],
        `Divide by four.`, `$5,500 divided by 4 equals $1,375.`),
      mc(L14, 4, 3, `In the lesson's tour, a 360 label also takes 10 percent of the $30,000 gross, leaving $5,500 before it. What remains?`,
        [`$2,500`, `$3,000`, `$5,500`, `$500`],
        `Take 10 percent of the gross.`, `10 percent of $30,000 is $3,000, and $5,500 minus $3,000 is $2,500.`),
      mc(L14, 5, 3, `A $3,000 guarantee versus 85 percent of net after $2,800 expenses. Ticket gross is $9,000. What does the artist receive?`,
        [`$5,270`, `$3,000`, `$7,650`, `$6,200`],
        `Net is gross minus expenses.`, `Net is $6,200, 85 percent is $5,270, which beats $3,000.`),

      // ---- L15 ----
      mc(L15, 1, 1, `Margin per item equals price minus what?`,
        [`Unit cost and per-item fees`, `Only the price`, `Only taxes on profit`, `Streaming income`],
        `Think of costs per item.`, `Per-item margin subtracts the item cost and fees such as the venue cut.`),
      mc(L15, 2, 2, `A shirt costs $8 and sells for $25 with a 20 percent venue cut of gross. What is the profit per shirt?`,
        [`$12`, `$17`, `$9`, `$14`],
        `Venue cut is 20 percent of $25.`, `The cut is $5, so $25 minus $8 minus $5 equals $12.`),
      mc(L15, 3, 2, `100 shirts at $12 profit and 50 hoodies at $22 profit. Total profit?`,
        [`$2,300`, `$1,200`, `$3,300`, `$1,100`],
        `Add the two product lines.`, `$1,200 plus $1,100 equals $2,300.`),
      mc(L15, 4, 3, `A $20 shirt costs $8 and the venue takes 25 percent of gross. A band expects to keep 75 percent of the $12 margin. What is the error?`,
        [`The venue cut is on gross, so profit is $7 not $9`, `The cut is on profit`, `Shirts have no cost`, `The profit is $15`],
        `Which amount does the percentage apply to?`, `25 percent of $20 is $5, so profit is $20 minus $8 minus $5 equals $7.`),
      mc(L15, 5, 3, `Bulk: 300 shirts at $8 cost $2,400. Print-on-demand costs $14. You sell 200 shirts at $25 with a $5 venue cut. Which earns more and by how much?`,
        [`Bulk by $400`, `Print-on-demand by $400`, `Bulk by $1,200`, `They are equal`],
        `Bulk nets 200 times $20 minus the $2,400.`, `Bulk nets $4,000 minus $2,400 equals $1,600; print-on-demand nets 200 times $6 equals $1,200, a $400 difference.`),

      // ---- L16 ----
      mc(L16, 1, 1, `Which registration step is recommended before a release?`,
        [`Registering compositions and recordings with the proper collectors`, `Waiting until after the first payment arrives from the distributor each month`, `Skipping splits because the collectors will sort ownership out later on`, `Registering only the album art and cover design with a copyright lawyer`],
        `Think about how money finds you.`, `Without registrations, usage cannot be matched to the right payee.`),
      mc(L16, 2, 2, `A $3,000 budget is 40 percent ads, 30 percent content, 20 percent publicity and 10 percent reserve. How much is for ads?`,
        [`$1,200`, `$900`, `$600`, `$300`],
        `Take 40 percent of $3,000.`, `40 percent of $3,000 is $1,200.`),
      mc(L16, 3, 2, `A distributor needs 28 days before release for editorial pitching. For a June 26 release, what is the latest submission date?`,
        [`May 29`, `May 28`, `June 2`, `May 26`],
        `Count back 28 days from June 26.`, `June 26 minus 28 days is May 29.`),
      mc(L16, 4, 3, `A plan spends the entire budget in release week. What is the weakness?`,
        [`No funds remain to reinforce momentum afterward`, `Release week is irrelevant`, `Spending is illegal`, `Budgets must be zero`],
        `What happens after launch week?`, `Staging spend allows reinvestment when data shows what works.`),
      mc(L16, 5, 3, `A team releases tracks but never signs split sheets or registers songs. What is the most likely consequence?`,
        [`Plays occur but collection systems cannot identify who to pay`, `Streams stop because the platforms block unregistered tracks entirely`, `Royalties double because the missing paperwork is replaced by a default rate`, `The release is invalid and the distributor must cancel it before it goes live`],
        `What do collectors need to pay you?`, `Collection systems rely on accurate registrations and splits to pay correctly.`),

      // ---- L17 ----
      mc(L17, 1, 1, `Why is an email list considered an owned audience?`,
        [`You can reach fans directly without depending on a platform's algorithm`, `It generates streams automatically on every platform whenever you send a message`, `It is required by law`, `It never changes`],
        `Who controls the channel?`, `Direct contact lets you reach fans without a platform's reach rules.`),
      mc(L17, 2, 2, `10,000 monthly listeners, 2 percent join the list, 10 percent of those buy a $25 item. What revenue results?`,
        [`$500`, `$50`, `$5,000`, `$250`],
        `Compute subscribers, then buyers.`, `200 subscribers, 20 buyers, 20 times $25 equals $500.`),
      mc(L17, 3, 2, `A $300 campaign yields 150 signups. What is the cost per signup?`,
        [`$2.00`, `$0.50`, `$20.00`, `$1.50`],
        `Divide cost by signups.`, `$300 divided by 150 equals $2.00.`),
      mc(L17, 4, 3, `Your newsletter has no unsubscribe link. Which US law is most directly implicated?`,
        [`CAN-SPAM, which requires an unsubscribe mechanism`, `The MMA`, `COPPA`, `The Copyright Royalty Act`],
        `It governs commercial email.`, `CAN-SPAM requires commercial email to include a working opt-out.`),
      mc(L17, 5, 3, `A band relies only on one social platform's followers. What is the strategic risk?`,
        [`Reach and rules can change without notice`, `Followers are always paid by the platform for each post`, `Platforms cannot change their rules or reach once you build a following`, `There is no risk, since followers always see every post you make`],
        `Who controls the platform?`, `Rented audiences depend on platform decisions, so pairing them with owned channels reduces risk.`),

      // ---- L18 ----
      mc(L18, 1, 1, `What is a main purpose of forming an LLC?`,
        [`To separate personal and business liability when operated properly`, `To avoid all taxes`, `To own copyrights automatically, including every song the members write`, `To become a PRO`],
        `It is about liability.`, `An LLC can provide liability separation, but only when run properly, and it does not eliminate taxes.`),
      mc(L18, 2, 2, `Revenue is $40,000 and expenses are $15,000. What is net profit?`,
        [`$25,000`, `$55,000`, `$15,000`, `$40,000`],
        `Subtract expenses.`, `$40,000 minus $15,000 equals $25,000.`),
      mc(L18, 3, 2, `Revenue $18,000; expenses $4,500 gear, $3,000 travel, $1,500 ads. Net profit?`,
        [`$9,000`, `$18,000`, `$13,500`, `$4,500`],
        `Total the expenses first.`, `Expenses total $9,000, leaving $9,000.`),
      mc(L18, 4, 3, `An LLC owner pays personal bills from the LLC account. What is the risk?`,
        [`Commingling can weaken the liability protection and muddy records`, `It increases protection by showing the owner uses the company account`, `It is required, because every LLC must pay its owners personal expenses directly`, `Nothing changes, since the LLC and the owner are treated as one person`],
        `Consider how separate the entity is.`, `Mixing funds undermines separation and makes bookkeeping unreliable.`),
      mc(L18, 5, 3, `A musician believes forming an LLC means the income is tax-free. What is wrong?`,
        [`A default LLC is generally pass-through, so income is still reported by the owner`, `LLCs pay no one`, `Income is not taxable`, `LLCs are illegal`],
        `Who reports pass-through income?`, `An LLC does not make income tax-free; profit generally passes through to the owner's return.`),

      // ---- L19 ----
      mc(L19, 1, 1, `In the lesson, what does the Plajah music licensing store illustrate?`,
        [`Master and sync clearance for projects`, `Merch printing and fulfilment for band stores`, `PRO membership and performance royalty collection`, `Tour routing and booking of live dates for artists`],
        `It connects filmmakers and tracks.`, `It shows how tracks can be licensed or requested for a project.`),
      tf(L19, 2, 2, `Publishing a track on a platform automatically registers your songs with a PRO, the MLC and SoundExchange.`, 1,
        `Registration is a separate step.`, `Platform publishing does not by itself register works with collection organizations.`),
      mc(L19, 3, 2, `You sign a 60/40 split sheet on a song earning $1,000 in publishing. How much does the 40 percent writer receive?`,
        [`$400`, `$600`, `$40`, `$4,000`],
        `Multiply by 0.40.`, `40 percent of $1,000 is $400.`),
      mc(L19, 4, 3, `A creator offers a track in a licensing marketplace that includes a collaborator's contribution with no agreement. What is the issue?`,
        [`Chain of title is unclear, so a clean license cannot be promised`, `Collaborators do not matter`, `The marketplace owns it`, `No issue`],
        `Can you grant what you do not control?`, `You can only license what you control, so co-owners need agreements.`),
      mc(L19, 5, 3, `Which Plajah tool best fits tracking contracts, invoices and vendors for an artist business?`,
        [`Artist Manager`, `Melos`, `The licensing store`, `Artist radio`],
        `Think business operations.`, `Artist Manager is the business operations hub for contracts, invoices, payroll and tasks.`),
    ],
  },
};
