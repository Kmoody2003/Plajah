import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// Write the correct choice FIRST; the helper rotates the choices (keeping their cyclic order) so the
// correct answer lands on a spread-out index.
const mc = (l: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], hint: string, explanation: string): Question => {
  const target = (parseInt(l.slice(l.lastIndexOf('.l') + 2), 10) * 3 + n * 5) % 4;
  const shift = target; // correct choice starts at index 0
  const rotated = choices.map((_, i) => choices[(i - shift + 4) % 4]);
  return { id: `${l}.q${n}`, lessonId: l, kind: 'mcq', prompt, choices: rotated, answer: target, hint, explanation, level };
};
const tf = (l: string, n: number, level: 1 | 2 | 3, prompt: string, answer: number, hint: string, explanation: string): Question =>
  ({ id: `${l}.q${n}`, lessonId: l, kind: 'tf', prompt, answer, hint, explanation, level });

const L01 = 'ip-protection.l01';
const L02 = 'ip-protection.l02';
const L03 = 'ip-protection.l03';
const L04 = 'ip-protection.l04';
const L05 = 'ip-protection.l05';
const L06 = 'ip-protection.l06';
const L07 = 'ip-protection.l07';
const L08 = 'ip-protection.l08';
const L09 = 'ip-protection.l09';
const L10 = 'ip-protection.l10';
const L11 = 'ip-protection.l11';
const L12 = 'ip-protection.l12';
const L13 = 'ip-protection.l13';
const L14 = 'ip-protection.l14';
const L15 = 'ip-protection.l15';
const L16 = 'ip-protection.l16';
const L17 = 'ip-protection.l17';
const L18 = 'ip-protection.l18';
const L19 = 'ip-protection.l19';
const L20 = 'ip-protection.l20';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'ip-protection',
    label: 'Protecting Your Ideas: Copyright, Trademarks, Patents and More',
    blurb: 'Learn what copyright, trademarks, patents and trade secrets protect, how to secure them, and how to defend them in proportion. Written for U.S. law, with notes on how other countries differ. General education, not legal advice.',
    accent: '#7a2bd6',
    framework: 'c3',
    tracks: [
      {
        id: 'ip-protection.t1',
        title: 'The Big Picture and Copyright Basics',
        blurb: 'What intellectual property is, and how copyright works from creation to registration, ownership and licensing.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'What Intellectual Property Is, and Why It Exists',
            blurb: 'IP law gives creators limited rights over creations of the mind so that making new things is worth the effort.',
            minutes: 8,
            body: `Imagine you spend a year designing a board game. You draw the art, write the rules, invent a name, and build a clever dice mechanism. Then a factory copies every part and sells it for less than you can. Without intellectual property law, that would be perfectly legal, and few people would invest a year in making anything.

Intellectual property (IP) is the set of legal rights over creations of the mind. The U.S. Constitution gives Congress the power to grant authors and inventors exclusive rights for limited times, "to promote the progress of science and useful arts." The deal is a trade: you get a temporary monopoly, and society gets new work and, eventually, the freedom to use it.

Four main tools do different jobs. Copyright protects original creative expression, such as the game's art and rulebook text. Trademarks protect names, logos and other signs that tell customers who made something, such as the game's title. Patents protect new, useful, non-obvious inventions, such as the dice mechanism. Trade secrets protect valuable confidential information, such as your supplier list, for as long as you keep it secret.

One product usually involves several of these at once, and each has its own rules, costs and deadlines. This course is about United States law; other countries have similar systems but differ in details, and we flag the big differences as we go. This is education, not legal advice for your situation.`,
          },
          {
            id: L02,
            title: 'What Copyright Protects, and What It Does Not',
            blurb: 'Copyright covers original expression fixed in a tangible form, never the underlying idea, and it starts automatically.',
            minutes: 10,
            body: `Maya writes a short story about a teenage inventor who builds a robot to find her missing dog. The moment Maya types the story, saves it, or records it, copyright exists. Nothing needs to be filed. U.S. copyright attaches automatically to original works of authorship once they are fixed in a tangible medium of expression: written, recorded, drawn, saved to a drive, and so on.

Two requirements are doing the work. Originality means the work came from the author and has at least a minimal spark of creativity. Fixation means it exists in a form that can be perceived for more than a moment. An improvised speech that nobody records is not fixed; the same speech recorded is.

Copyright protects expression, not ideas. Maya owns her specific words, characters and sequence of scenes. She does not own the idea of a girl who builds a robot to find a lost pet, so another writer can tell a different story with that premise. The same split applies to facts, systems, methods, short phrases, titles and names, which copyright does not cover. It also covers the specific code of a program but not the algorithm or idea behind it.

The notice, the (c) symbol or the word "Copyright" with a year and owner's name, is no longer required for works published on or after March 1, 1989, but it is still smart. It tells people who to ask and can defeat a defense that someone innocently copied.`,
          },
          {
            id: L03,
            title: 'Registering Your Copyright, and Why It Matters',
            blurb: 'Registration is optional to own a copyright but generally required before you can sue, and it unlocks stronger remedies.',
            minutes: 10,
            body: `Dev self-publishes a photo book and later finds a company selling his images on posters. He has owned the copyright since he took the photos, so why is his lawyer asking whether he registered?

In the U.S., registration with the U.S. Copyright Office is not required for copyright to exist, but it matters a great deal in practice. First, for U.S. works you generally must have a registration (or a refusal) before filing a copyright lawsuit in federal court. Second, timing affects money. If you registered before the infringement began, or within three months of first publication, you can ask a court for statutory damages and attorney's fees. Without that, you are generally limited to proving your actual losses and the infringer's profits, which can be small or hard to show. Statutory damages can range from hundreds of dollars up to $150,000 per work for willful infringement.

Third, a registration made within five years of publication is treated as prima facie evidence that the copyright is valid. And a registration creates a public record, which helps people find you to ask for a license.

Applications go through the Copyright Office's online system, with a deposit copy of the work and a fee that starts at tens of dollars. You can register many works in a group in some cases, such as an unpublished collection or a group of photographs. Dev's mistake was waiting; if he had registered when the book came out, his options would be far stronger.`,
          },
          {
            id: L04,
            title: 'Who Owns It: Authors, Joint Works and Work Made for Hire',
            blurb: 'The creator is usually the first owner, but joint authorship and work made for hire change who that is.',
            minutes: 11,
            body: `Three friends write and record a song together. A designer is hired to draw a logo for a company. An employee writes a software module on the job. Who owns each?

The default rule: copyright initially belongs to the author, the person who actually created the work. Two big exceptions matter.

A joint work is one created by two or more authors who intended their contributions to merge into a single whole. Each joint author co-owns the whole work. In the U.S., any co-owner can generally license the work non-exclusively without the others' permission but must share the profits with them. That is why bands and co-writers sign split agreements early.

Work made for hire means the employer or commissioning party is treated as the author from the start. There are two routes. First, a work created by an employee within the scope of employment. Second, a specially commissioned work from an independent contractor that falls into one of nine statutory categories (for example, a contribution to a collective work, part of an audiovisual work, or a translation) and is covered by a written agreement signed by both sides saying it is a work made for hire.

So the employee's software module belongs to the employer. The freelance logo designer, though, usually owns the logo unless the contract includes a work-for-hire clause that fits a category or, more commonly, an assignment of copyright. Always put ownership in writing.`,
          },
          {
            id: L05,
            title: 'Transfers, Licenses and How Long Copyright Lasts',
            blurb: 'Owners can sell or license rights in pieces, and each right lasts a limited, calculable time.',
            minutes: 10,
            body: `A copyright is a bundle: reproduce, distribute, adapt, perform and display. You can sell the whole bundle or hand out single sticks.

A transfer (assignment) moves ownership. For an exclusive transfer, the U.S. requires a signed written document. A license grants permission without moving ownership. Non-exclusive licenses can even be oral or implied, but exclusive licenses count as transfers and need writing. Licenses can vary by scope: media, territory, time, price. Cora, a photographer, might license a magazine to print one image for a year in North America, while keeping everything else. A well-drafted license says exactly what is allowed and what is not.

Authors who assign rights in a work they did not create as work made for hire may, under U.S. law, have a right to terminate the transfer after 35 years, with notice, a protection against lopsided early deals.

Duration, in outline for works created today by individuals: life of the author plus 70 years. For anonymous works, pseudonymous works and works made for hire, the term is 95 years from publication or 120 years from creation, whichever ends first. Older works follow different rules depending on when they were published and whether formalities were observed. Terms elsewhere often differ: many countries use life plus 50 or life plus 70.

Always write the grant down and check the dates. A short signed license beats a long argument.`,
          },
        ],
      },
      {
        id: 'ip-protection.t2',
        title: 'Using, Sharing and Defending Copyright',
        blurb: 'Fair use, takedowns, small claims, open licences, and the special rules for music, software and AI.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L06,
            title: 'Fair Use: A Four-Factor Test, Not a Free Pass',
            blurb: 'Fair use lets some uses of copyrighted work happen without permission, but courts decide case by case.',
            minutes: 12,
            body: `Sam makes a video essay criticizing a popular movie and includes ten-second clips. A teacher photocopies a chapter. A meme maker remixes a photo. Are these legal without permission? Possibly, under fair use, written into U.S. law at 17 U.S.C. section 107. There is no magic formula, and no amount of text or seconds of video is automatically safe.

Courts weigh four factors together:

1. Purpose and character of the use: is it commercial or educational, and is it transformative, adding new meaning or purpose rather than just substituting for the original? Criticism, commentary, news reporting, teaching and research are named examples. The Supreme Court has stressed that the new use needs a purpose that is meaningfully different, especially when it is commercial.
2. Nature of the original: creative works get stronger protection than factual ones, and unpublished works more than published.
3. Amount and substantiality: how much was taken, and was it the "heart" of the work? Even a small taking can be too much if it is the most memorable part.
4. Effect on the market: would the use hurt sales or licensing of the original, or could it substitute for it?

Outcomes are uncertain, and a lawsuit is expensive even if you win. Saying "I gave credit" or "it's for education" does not settle the matter. When the stakes are high, license the material, pick something in the public domain, or ask an attorney. The Copyright Office's Fair Use Index summarizes real cases.`,
          },
          {
            id: L07,
            title: 'Takedowns: The DMCA and the Copyright Claims Board',
            blurb: 'The DMCA gives a notice-and-takedown process online, and the CCB offers a cheaper forum for smaller disputes.',
            minutes: 11,
            body: `Priya posts her illustrations on a portfolio site. She later finds them on a merch store. What can she do without hiring a lawyer?

The Digital Millennium Copyright Act (DMCA), section 512, protects online service providers from liability for users' infringement if they follow a process. As the owner, Priya sends a takedown notice to the site's designated agent (listed in the Copyright Office's directory). It must identify her work and the infringing material, include contact details, state a good-faith belief the use is unauthorized, and include a statement under penalty of perjury that she is the owner or authorized to act, plus a signature. The provider removes or disables access quickly.

The poster can send a counter-notice, saying under penalty of perjury that the material was removed by mistake or misidentification. The provider then forwards it, and unless Priya files a federal lawsuit within about 10 to 14 business days, the material may be restored. Knowingly false notices can lead to liability, so do not file takedowns for uses that are plainly fair use or licensed.

For money disputes that do not justify federal court, the Copyright Claims Board (CCB), run through the Copyright Office, handles claims up to $30,000 with a streamlined, lower-cost process. Participation is voluntary: the respondent can opt out within 60 days, in which case the claimant must go to federal court if they want to continue.`,
          },
          {
            id: L08,
            title: 'The Public Domain, Creative Commons and Open Licenses',
            blurb: 'Some works are free to use, and open licenses let creators share on their own terms.',
            minutes: 10,
            body: `Lena wants to use an old photograph in her documentary. Is it free? Where can she find music she may use without a negotiation?

The public domain is the set of works not protected by copyright: because the term expired, the work never qualified, or the owner dedicated it. In the U.S., as of 2026, works first published in 1930 or earlier have entered the public domain, and each January 1 another year's worth follows (works from 1931 in 2027). Works created by U.S. federal government employees as part of their jobs are not copyrighted, though they can include third-party material. Ideas, facts and short phrases are also free. Be careful: a new edition, translation, restoration or recording of an old work may carry fresh copyright in the new material, and public domain status can differ by country.

Creative Commons (CC) licenses are standard, free, public licenses that let owners say "you may use this if you follow my terms." The building blocks are BY (credit the author), SA (share-alike), NC (non-commercial) and ND (no derivatives), plus CC0, a public-domain dedication. The creator keeps copyright; the license only grants permission. CC licenses are generally hard to revoke for people who already used the work, so choose carefully. A work marked CC BY-NC cannot be used in a commercial video, for example.

Open-source software licenses (MIT, Apache, GPL) do something similar for code. Always read the actual terms and keep a record of where you found the work.`,
          },
          {
            id: L09,
            title: 'Music, Software and AI-Assisted Work',
            blurb: 'A song is two copyrights, code is protected as writing, and AI-made work needs human authorship.',
            minutes: 12,
            body: `Jo records a cover of a hit song and uploads it. Another creator, Kit, builds an app using code snippets generated by an AI tool. Each is walking through special rules.

Music has two layers. The musical work (the composition: melody, harmony, lyrics) is owned by songwriters and publishers. The sound recording (the particular recorded performance, often called the master) is owned by the artist or label. Jo needs permission for the composition, often through a mechanical license for covers in audio form, which in the U.S. is available at a statutory rate for compositions already released, and the original recording is not used. Performing rights organizations (ASCAP, BMI, SESAC, GMR) license public performance of compositions; The MLC administers mechanical licenses for U.S. streaming and downloads; SoundExchange collects digital performance royalties for recordings. Sampling someone's recording needs permission for both layers. Video platforms use their own deals, so check their terms.

Software source code is protected as a literary work. Registration can use selected portions of the code as a deposit. Copyright covers the code, not the functionality or ideas, and open-source licenses add conditions to what you can do.

AI-assisted work: as of the Copyright Office's January 2025 report on copyrightability, copyright requires human authorship. Prompts alone generally do not make the user the author of the output, but human-written text, human selection and arrangement, and human edits to AI output can be protected, and applicants should disclose AI-generated material. Court cases are still developing, so check the Office's AI page for updates.`,
          },
        ],
      },
      {
        id: 'ip-protection.t3',
        title: 'Trademarks: Protecting Your Name and Brand',
        blurb: 'Choosing a strong, clear name, registering it, and keeping it.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L10,
            title: 'What a Trademark Is, and How Strong a Name Can Be',
            blurb: 'A mark identifies the source of goods or services, and some kinds of names are far easier to protect than others.',
            minutes: 10,
            body: `A trademark is any word, name, logo, slogan, sound, color or other sign that tells customers who makes a product or provides a service, and so keeps them from being confused by someone else's. Marks for services are sometimes called service marks. Unlike copyright, a trademark is not about creativity: it lasts as long as it is used to identify a source, and it protects consumers as well as the owner.

Not all names are equally protectable. Courts and the USPTO sort marks along a spectrum of distinctiveness:

- Generic: the common name of the thing, such as "Bike" for bicycles. Never protectable.
- Descriptive: describes a quality, such as "Fast Delivery." Protectable only after it acquires secondary meaning through long use and recognition.
- Suggestive: hints at a quality and needs imagination, such as "Netflix" for streaming. Protectable.
- Arbitrary: a real word unrelated to the goods, such as "Apple" for computers. Strong.
- Fanciful: an invented word, such as "Kodak." Strongest.

Rae wants to open a bakery named "Great Bread." That is descriptive and weak, and hard to stop others from using. "Orbit Loaf" would be stronger, arbitrary for bread. Also consider that strong marks are not protected in every context: what matters is likelihood of confusion with others in related markets. A famous mark like "Delta" can be used for faucets and airlines.`,
          },
          {
            id: L11,
            title: 'Searching, Classes of Goods and Services, and Domains',
            blurb: 'Clear a name before you fall in love with it, and know how classes, domains and handles fit in.',
            minutes: 10,
            body: `Theo is about to print 500 t-shirts for his streetwear label "Northgate." A quick search first could save him thousands.

A proper clearance search looks for marks that are identical or similar in sound, appearance or meaning, used on the same or related goods or services. Start with the USPTO Trademark Search database for registered and pending applications. Then check state registers and your state's business-entity records, and search the open web, app stores, marketplaces and social media for unregistered users, since those can still have rights. The WIPO Global Brand Database helps with international marks. A search is not a guarantee; for important brands, consider an attorney to review results.

Applications list goods and services in international classes, a numbered system (45 classes: goods in 1 to 34, services in 35 to 45). Clothing is Class 25; software and apps often fall in Classes 9 and 42; education is Class 41. You pay USPTO fees per class, so only list what you actually sell or sincerely plan to.

Domains and handles: a domain registration or social handle gives you a technical address, not trademark rights, and someone may still have a better claim to the name. Conversely, a trademark owner can challenge cybersquatters through ICANN's UDRP process. Check that the domain, handles and trademark are all available, and register what you can early.`,
          },
          {
            id: L12,
            title: 'Use in Commerce, Intent-to-Use and the USPTO Process',
            blurb: 'Federal registration follows a defined path: file, examination, publication, registration.',
            minutes: 11,
            body: `Federal trademark rights in the U.S. rest on use in commerce: actually selling goods or providing services under the mark across state lines or in a way Congress can regulate, which covers most online and interstate business. If you are not selling yet, you can file an intent-to-use (ITU) application, claiming a bona fide intent to use the mark, then file proof of use after the USPTO approves it. Both routes require the application to be filed by the true owner.

The process in outline:

1. File through the USPTO's Trademark Center, identifying the owner, the mark (words or design), the goods or services, and the class(es), with a specimen showing real use if you are already using it. The base fee has been about $350 per class; check the current fee page.
2. Examination: an examining attorney reviews your application for legal problems and likelihood of confusion with earlier marks. If there is an issue, you receive an office action and have a limited time to respond.
3. Publication: if approved, the mark is published and others have 30 days to oppose.
4. Registration (or, for ITU, a notice of allowance followed by a statement of use).

Expect many months, often a year or more. Mistakes in the ownership, goods list or specimen are common reasons for trouble, and fees are not refunded if an application fails. Applicants outside the U.S. need a U.S.-licensed attorney. Beware of unofficial solicitations that mimic USPTO notices.`,
          },
          {
            id: L13,
            title: 'TM and (R), Common-Law Rights, Maintenance and Going Global',
            blurb: 'Know what the symbols mean, how rights arise without registration, how to keep a registration alive, and how Madrid works.',
            minutes: 10,
            body: `Ana sells hand-poured candles as "Ember Lane." She has a logo with a small TM next to it, and wants to switch to the registered symbol. Can she?

The TM symbol (or SM for services) may be used by anyone claiming rights in a mark, registered or not. It is a warning to the public and costs nothing. The circled R may be used only once the USPTO has actually registered the mark, and only for the goods or services covered. Using it earlier can mislead the public and hurt you in a dispute. Ana must wait for her registration.

Common-law rights arise from use alone. Ana's use in her local area gives her some rights there, but they are limited to where she is known, and she cannot easily show nationwide priority. A federal registration gives nationwide priority from the filing date, a presumption of validity, access to federal court, and the ability to record with Customs.

Maintenance: a registration only lasts if you keep using the mark and file on time. A declaration of use is due between the fifth and sixth year, and then a combined filing with renewal falls between the ninth and tenth year, repeating every ten years. Missing a deadline can cancel the registration.

Going global: trademark rights are territorial. The Madrid System, run by WIPO, lets you use one application to seek protection in many member countries, but you need a home-country application or registration as a base, and if that base fails in the first five years the international registration can fall too.`,
          },
        ],
      },
      {
        id: 'ip-protection.t4',
        title: 'Patents: Protecting Inventions',
        blurb: 'What can be patented, how to avoid losing your rights, and the realistic path, cost and time.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L14,
            title: 'Utility, Design and Plant Patents, and What Cannot Be Patented',
            blurb: 'Patents cover new inventions, not ideas in the abstract or laws of nature.',
            minutes: 11,
            body: `A patent gives its owner the right to exclude others from making, using, selling, offering for sale or importing the invention for a limited term, in exchange for fully disclosing how it works. The U.S. issues three kinds.

Utility patents protect how something works or is made: processes, machines, manufactured items and compositions of matter, and improvements to them. They generally last 20 years from the filing date, with maintenance fees due after grant. Design patents protect the ornamental appearance of a functional item, like the shape of a bottle or a phone's look; they last 15 years from grant for current applications. Plant patents cover new, asexually reproduced plant varieties and last 20 years from filing.

Not everything qualifies. The courts have excluded laws of nature, natural phenomena and abstract ideas, which includes some purely mental or business methods and some software claims that merely implement an abstract idea on a computer. Eligible subject matter for software and diagnostics is a complicated area. A new discovery, like a mineral, is not enough; a specific, practical application might be.

Lee designs a clip that attaches a phone to a bike in a new way. The mechanism might qualify for a utility patent, while the clip's look could get a design patent. His idea of "holding phones on bikes" alone could not be patented, because the claim must be specific. Patent rights are also national: a U.S. patent does not protect you in Japan or Germany.`,
          },
          {
            id: L15,
            title: 'Novelty, Non-Obviousness, Grace Periods and Prior-Art Searching',
            blurb: 'To be patentable an invention must be new and not an obvious step, and your own disclosures can start clocks.',
            minutes: 12,
            body: `Two core tests decide most patent fights. Novelty: nothing identical to your claimed invention can already exist in the "prior art," which includes earlier patents, publications, public sales and public use. Non-obviousness: even if no single earlier item matches, the claimed invention must not have been an obvious combination or modification to a person with ordinary skill in the field. Obviousness is argued, not calculated, and is the usual battleground.

Disclosure traps. In the U.S., under the America Invents Act, an inventor's own public disclosure (selling, posting, demonstrating, publishing) is excused if you file within one year of it. That is the grace period, and it applies only to the inventor's own disclosures and some derived from the inventor, with limits. Most other countries use absolute novelty: any public disclosure before filing can destroy your rights there. So if you might want protection abroad, file before you go public. Do not rely on the one year as a plan.

Searching prior art: use the USPTO's Patent Public Search, plus Google Patents and WIPO's PATENTSCOPE, and search by keywords, classifications and the cited references on related patents. A self-search is useful for learning, but it is never complete; patent attorneys and agents can do professional searches.

Marcus posted a demo video of his device in March. He has until the following March to file in the U.S., but he may already have lost rights in Europe.`,
          },
          {
            id: L16,
            title: 'Provisional vs. Non-Provisional, Cost, Time, Professionals and the PCT',
            blurb: 'The realistic path to a patent is slow and expensive, and good choices early save money.',
            minutes: 12,
            body: `A provisional application is a simple filing that establishes an early filing date. It is never examined and expires after 12 months, during which you may say "patent pending." To keep the date, you must file a non-provisional application within 12 months, and the provisional must describe the invention in enough detail that the later claims are supported. A provisional is cheaper at filing, but it is no shortcut to a patent, and a thin one gives false comfort.

A non-provisional application contains claims (the legal definition of what is protected), a specification and drawings. It is examined, and it is normal to get rejections and respond several times. Grant often takes two to three years or more.

Cost reality: USPTO filing, search, examination and issue fees are a modest part, with discounts for small and micro entities; attorney drafting is the larger part and commonly runs from several thousand to tens of thousands of dollars per patent in the U.S., and foreign filings multiply it. Enforcing a patent in court can cost hundreds of thousands to millions. Prices change, so confirm before budgeting. Eligible low-income inventors can apply to the USPTO's Patent Pro Bono Program.

A registered patent attorney (a lawyer) or patent agent (not a lawyer, but passed the USPTO exam) can prosecute your application. Beware of invention-promotion firms that charge large upfront fees.

The Patent Cooperation Treaty (PCT) lets you file one international application, and decide within about 30 months of your priority date which countries to enter. Patent owners can sue infringers or license the patent for royalties; independent invention is not a defense.`,
          },
        ],
      },
      {
        id: 'ip-protection.t5',
        title: 'Secrets, Contracts, Enforcement and Your Plan',
        blurb: 'The protections that are not registered, the agreements that decide ownership, and how to act in proportion.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L17,
            title: 'Trade Secrets and NDAs',
            blurb: 'Confidential know-how is protected only while you actually keep it secret.',
            minutes: 10,
            body: `The recipe for a famous sauce, a customer list, source code that is never published, a manufacturing process: these can be trade secrets. Trade secrets need no registration. The information must have independent economic value because it is not generally known, and the owner must take reasonable measures to keep it secret. Federal law (the Defend Trade Secrets Act) and state laws provide remedies against misappropriation, meaning acquiring a secret by improper means or using or disclosing it in breach of a duty.

There is no protection against lawful discovery: reverse engineering a purchased product or independently inventing the same thing is generally fine. And once a secret is public, the protection is gone, forever.

Reasonable measures include limiting access to need-to-know, passwords and logs, marking documents confidential, exit interviews, and having people sign agreements. A non-disclosure agreement (NDA) is a contract in which a party promises to keep specified information confidential and use it only for a stated purpose. A good NDA defines confidential information, lists exclusions (already public, independently developed, lawfully received from others), states the term and permitted uses, and what happens at the end of the relationship. Some jurisdictions limit overly broad restrictions and non-competes, and U.S. federal law requires employers to give workers notice of whistleblower immunity in confidentiality agreements.

Choosing between a patent and a secret is strategic: a patent requires disclosure, while a secret can last forever but offers no protection if someone else invents or reverse engineers it.`,
          },
          {
            id: L18,
            title: 'Assignments, Licenses, Employees, Contractors and Forming a Company',
            blurb: 'Contracts decide who owns what; get them in writing, and make sure your company owns what it needs.',
            minutes: 12,
            body: `Sofia and Ben start a game studio. Sofia coded the prototype before they formed an LLC, and they hired a freelance artist and an intern. Who owns the game? Without paperwork, the answer is messy.

Assignment transfers ownership. A license grants permission while the owner keeps the rights, and can be exclusive or non-exclusive, limited by field, territory and time, with royalties or flat fees. Both should be in writing and signed, and they can be recorded with the Copyright Office or USPTO, which gives notice to third parties.

Employees: copyright in works created within the scope of the job belongs to the employer as work made for hire. Patent rights generally start with the inventor, so employers use invention assignment agreements. These often cover only job-related work; some states, such as California, limit assignments of inventions made on the employee's own time with their own resources.

Contractors and freelancers: they usually keep copyright unless the contract assigns it (or fits a work-made-for-hire category). Use a written agreement with a present-tense assignment ("hereby assigns"), a license to pre-existing tools, and a confidentiality clause.

Forming a company: founders should sign IP assignment agreements transferring everything related to the business, including pre-incorporation work, to the company. Investors, buyers and partners will ask for this during due diligence, and gaps can derail a deal. Keep a simple IP register of what exists, who made it, and what paper covers it.`,
          },
          {
            id: L19,
            title: 'Enforcement: Options and Costs in Proportion',
            blurb: 'Match the response to the harm: start cheap, escalate only when it is worth it.',
            minutes: 10,
            body: `You discover a competitor using a near-copy of your logo, or a site selling your designs. Your rights exist, but nothing enforces itself. The question is how much effort the problem deserves.

A ladder of options, roughly cheapest first:

1. Document everything: screenshots, dates, URLs, sales records, and your registrations.
2. Direct contact: a polite email or a cease-and-desist letter, ideally reviewed by an attorney, because an aggressive or inaccurate letter can backfire and sometimes prompts a declaratory-judgment suit.
3. Platform tools: DMCA takedowns for copyright, and trademark and counterfeit complaint forms on marketplaces and social networks, which are quick and often free.
4. Specialized forums: the Copyright Claims Board for claims up to $30,000; ICANN's UDRP for abusive domain names; the USPTO's Trademark Trial and Appeal Board for oppositions and cancellations; customs recordation of registered trademarks and copyrights.
5. Federal court: powerful (injunctions, damages, fees in some cases) but expensive, commonly tens or hundreds of thousands of dollars for copyright and trademark, and more for patents. Some attorneys take strong cases on contingency or sell insurance-backed options.

Also weigh the risk to yourself. A weak claim can lead to counterclaims or fee awards, and a takedown notice that ignores fair use can create liability. Delay can hurt, too, because the longer you tolerate use, the harder it is to object.

Rule of thumb: spend in proportion to the value at stake, and match the strength of the claim to the strength of the response.`,
          },
          {
            id: L20,
            title: 'Build Your IP Protection Plan',
            blurb: 'Bring it all together for a small business: inventory, priorities, a budget and a calendar.',
            minutes: 12,
            body: `Let's plan for "Pawprint Studio," a three-person business that makes illustrated pet-care guides, a companion app, and a branded line of dog toys with a new chew design.

Step 1, inventory. List everything valuable: the guides' text and art (copyright), the studio name and logo (trademark), the app code (copyright and trade secret), the chew design (possible design or utility patent), and customer data and supplier terms (trade secrets).

Step 2, ownership. Check that the company owns each item by written assignments from founders, employees and freelancers.

Step 3, prioritize by value and risk. The name is the brand, so search and file a trademark for the studio name in the right classes (books, apps, toys). Register the guides' copyright soon after publication to preserve statutory damages and fees. Decide on the chew design before any public launch: if a patent matters, file first, mindful of the one-year U.S. grace period and stricter rules abroad; if not, skip the cost.

Step 4, controls: NDAs for outside partners, access limits for source code and supplier lists, license terms in the app, and an open-source log.

Step 5, budget and calendar. Estimate filing fees and professional time, and set reminders for deadlines: the 12-month provisional date, trademark use declarations, renewals, and registration windows.

Step 6, review yearly, or when you raise money, launch in a new country, or hire. Use the Plajah toolkit for the official links, and book an attorney for the pivotal moments.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'ip-protection',
    questions: [
      // L01
      tf(L01, 1, 1, 'Under the U.S. approach, intellectual property rights are granted for limited times to encourage new creative and inventive work.', 0, 'Think about the trade between creators and society.', 'The Constitution lets Congress grant exclusive rights for limited times to promote progress, and the rights eventually end.'),
      mc(L01, 2, 2, 'A founder wants to protect the name of her new app so customers know it is hers. Which tool is designed for that job?', ['Trademark', 'Patent protection for the app name', 'Copyright in the app code', 'Trade secret protection for the name'], 'Which tool tells customers who made something?', 'Trademarks identify the source of goods or services; the other tools protect expression, inventions or confidential information.'),
      mc(L01, 3, 2, 'A bakery keeps a special dough recipe confidential and never publishes it. Which type of IP is the recipe most likely to be?', ['A trade secret', 'A utility patent', 'A registered trademark', 'A design patent'], 'Registration is not required for this one.', 'Valuable information kept secret with reasonable measures can be a trade secret; a patent would require public disclosure.'),
      mc(L01, 4, 3, 'A board-game maker has art, a game title, a clever dice mechanism and a supplier list. Which pairing of right to item is correct?', ['Title: trademark; mechanism: patent; supplier list: trade secret', 'Title: copyright; mechanism: trademark; supplier list: patent', 'Title: patent; mechanism: copyright; supplier list: trademark', 'Title: trade secret; mechanism: copyright; supplier list: trademark'], 'Match each item to what each right is designed to cover.', 'Names function as trademarks, inventions can be patented, and confidential business data can be trade secrets.'),
      mc(L01, 5, 3, 'Why does IP law make most rights temporary, with the exception of trademarks and trade secrets that can last as long as they are used or kept secret?', ['Copyright and patents trade a limited monopoly for public benefit, while trademarks and secrets depend on continuing conduct', 'Temporary rights are cheaper for the government to administer', 'Trademarks and secrets are not considered property at all', 'Patents and copyrights expire because registration must be renewed yearly'], 'Think about what ends each right.', 'Copyrights and patents are limited deals with society; trademark and secrecy rights last only while you keep using the mark or keep the secret.'),
      // L02
      tf(L02, 1, 1, 'In the U.S., copyright generally exists automatically once an original work is fixed in a tangible form.', 0, 'Does anything have to be filed first?', 'Registration is optional for the right to exist; fixation of an original work is enough.'),
      mc(L02, 2, 2, 'Which of the following is protected by copyright?', ['The specific wording of a short story', 'The idea of a robot that finds lost pets', 'A product name such as the title of the book', 'A mathematical formula described in the story'], 'Copyright protects how something is expressed.', 'Copyright covers original expression; ideas, titles, names and formulas fall outside it.'),
      mc(L02, 3, 2, 'A band plays an unplanned jam at a party and nobody records it. What is true about copyright in the jam?', ['It is not fixed, so U.S. copyright does not yet attach to it', 'It is protected automatically the moment it is played, whether or not it is ever recorded', 'It is protected only if the band uses the (c) symbol', 'It is protected only after registration'], 'Which requirement concerns a tangible medium?', 'Fixation is required; an unrecorded improvisation is not fixed.'),
      mc(L02, 4, 3, 'Another author writes a different novel about a girl who builds a robot to find her missing dog. Without copying Maya\'s words, characters or scenes, what is the likely result?', ['Probably no infringement, because only expression is protected, not the idea', 'Infringement, because the premise is protected', 'Infringement, because the premise of a story is part of its protected expression', 'No infringement only if the new author credits Maya'], 'Separate the premise from the way it is written.', 'Ideas are free; infringement requires copying protected expression.'),
      mc(L02, 5, 3, 'A software company owns copyright in its program. What does that copyright most likely stop a rival from doing?', ['Copying the program\'s actual source code', 'Writing different code that does the same job', 'Using the same general algorithm idea in new code', 'Offering a different program with similar features'], 'Copyright covers code as writing, not function.', 'Copyright protects the code itself, not the ideas, methods or functions behind it.'),
      // L03
      tf(L03, 1, 1, 'In the U.S., you generally must have registered (or been refused registration) before filing a copyright infringement lawsuit over a U.S. work.', 0, 'Think of the Fourth Estate decision.', 'The Supreme Court held that registration (or refusal) must occur before suit for U.S. works.'),
      mc(L03, 2, 2, 'To preserve the chance for statutory damages and attorney\'s fees, when should a published work generally be registered?', ['Before infringement begins, or within three months of first publication', 'Any time within five years after infringement', 'Only after a lawsuit is filed', 'Within 30 days after the owner first discovers that someone is copying the work'], 'There are two timing windows.', 'U.S. law generally allows statutory damages and fees only if registration preceded the infringement or came within three months of publication.'),
      mc(L03, 3, 2, 'Dev did not register his photo book until after discovering the poster seller. What is the most likely effect on his remedies?', ['He may be limited to actual damages and profits for infringement that began earlier', 'He can still collect up to $150,000 per photo as statutory damages plus his legal fees', 'He loses copyright ownership', 'He cannot sue at all, ever'], 'What happens to statutory damages when registration is late?', 'Late registration generally removes statutory damages and fee-shifting for earlier infringement, leaving actual damages and profits.'),
      mc(L03, 4, 3, 'Which statement about registration is accurate?', ['It is not required for copyright to exist, but it unlocks a lawsuit and stronger remedies', 'It is required before any copyright exists', 'It gives you copyright in ideas', 'It makes a work immune from fair use'], 'Separate existence of the right from the ability to enforce it.', 'Copyright exists automatically, but registration brings enforcement advantages.'),
      mc(L03, 5, 3, 'A photographer shoots hundreds of photos a month. What is a sensible registration approach?', ['Use the Copyright Office\'s group options where they fit and register on a regular schedule', 'Register nothing until someone infringes', 'Print the (c) symbol and never register', 'Register only the single best photo per year'], 'Consider cost per work and the timing windows.', 'Group registration options and a regular schedule balance cost with preserving remedies.'),
      // L04
      tf(L04, 1, 1, 'Copyright in a work initially belongs to the person who actually created it, unless an exception such as work made for hire applies.', 0, 'What is the default rule?', 'The author is the default owner; work made for hire is a key exception.'),
      mc(L04, 2, 2, 'An employee writes code during their normal job duties. Who is treated as the author?', ['The employer, as a work made for hire', 'The employee, as the individual who typed the code', 'Nobody until the code is registered with the Copyright Office', 'The employee, unless the code is longer than a page'], 'Think scope of employment.', 'Works created by employees within the scope of their job are works made for hire owned by the employer.'),
      mc(L04, 3, 2, 'A company hires a freelance designer for a logo with no written agreement. Who most likely owns the copyright?', ['The designer', 'The company, because it paid', 'The company and designer share it equally', 'The Copyright Office, as the registrar'], 'Payment alone does not transfer ownership.', 'A freelancer generally keeps copyright unless a signed assignment or qualifying work-for-hire agreement exists.'),
      mc(L04, 4, 3, 'Which requirement must be met for a commissioned work by an independent contractor to be a work made for hire?', ['It falls in one of nine statutory categories and both parties sign a written work-for-hire agreement', 'It is longer than ten pages', 'It is registered within a year', 'The contractor lives in the same state'], 'There are two requirements together.', 'Both a statutory category and a signed written agreement are required for a contractor\'s work.'),
      mc(L04, 5, 3, 'Three bandmates co-write a song intending it to be one work. Absent an agreement otherwise, how are rights usually treated?', ['Each is a joint author and co-owner who may license non-exclusively but must account to the others', 'Only the lead singer owns it', 'Each owns only their own lines separately and cannot license the song', 'It belongs to whoever registers first'], 'Think about co-owners sharing profits.', 'Joint authors co-own the whole work and share profits, which is why split agreements are wise.'),
      // L05
      tf(L05, 1, 1, 'A transfer of exclusive copyright ownership in the U.S. generally requires a signed writing.', 0, 'The law requires a formal record for ownership changes.', 'Exclusive transfers must be in writing and signed by the owner granting the rights.'),
      mc(L05, 2, 2, 'Cora allows a magazine to print one photo for a year in North America and keeps everything else. This is best described as?', ['A limited license', 'An assignment of the whole copyright', 'A work made for hire', 'Abandonment of her copyright in the photo'], 'She still owns the copyright afterward.', 'A license permits specific uses without transferring ownership.'),
      mc(L05, 3, 2, 'For a work made today by one individual author (not for hire), the copyright term is generally?', ['The author\'s life plus 70 years', 'Twenty years from the date of first publication', '28 years from publication with one renewal term', 'Life of the author plus 20 years'], 'It is tied to the author\'s lifetime.', 'The general term for individual authors is life plus 70 years.'),
      mc(L05, 4, 3, 'A musician signed away her copyright to a label in 1990 in a deal that was not work made for hire. Which statement best fits U.S. law?', ['She may have a statutory right to terminate the transfer after 35 years by following notice rules', 'The deal is permanent with no exceptions', 'The transfer is void because it lasted too long', 'She can terminate at any time with no notice'], 'There is a long-wait safety valve for authors.', 'Section 203 gives authors a conditional right to terminate certain grants after 35 years.'),
      mc(L05, 5, 3, 'A work made for hire by a corporation, published today, has what general term?', ['95 years from publication or 120 years from creation, whichever ends first', 'The life of the founding shareholders plus 70 years, measured from the last death', '70 years from the filing date', 'Forever while the company exists'], 'No human life measures the term.', 'For works made for hire and anonymous works, the term is 95 years from publication or 120 from creation, whichever is shorter.'),
      // L06
      tf(L06, 1, 1, 'Using fewer than a set number of seconds or words is always safe under fair use.', 1, 'Is there a fixed numeric safe harbor?', 'There is no automatic safe amount; courts weigh the four factors together.'),
      mc(L06, 2, 2, 'Which is one of the four statutory fair use factors?', ['The effect of the use on the market for the original', 'Whether the user gave credit', 'Whether the work was registered', 'Whether the user is a famous person or a well-known company'], 'Think about harm to the owner\'s sales or licensing.', 'Market effect is the fourth factor. Credit, registration and fame are not factors; commercial or nonprofit use is weighed inside factor one, purpose and character of the use.'),
      mc(L06, 3, 2, 'Sam\'s review uses short clips to criticize a movie. Which factor most favors him?', ['A transformative purpose such as criticism and commentary', 'Using the most memorable scene', 'Posting clips that replace the need for viewers to watch the film', 'Selling the clips alone'], 'Which factor asks what new purpose the use serves?', 'Criticism and commentary can be transformative, which supports the first factor.'),
      mc(L06, 4, 3, 'A creator copies a small but central, most memorable portion of a song for a commercial ad. Why might this still fail?', ['The "heart of the work" can make a small amount substantial, and a commercial substituting use weighs against fair use', 'Small amounts can never be infringing', 'Ads are always fair use', 'Fair use does not apply to music'], 'Quality of the taking matters, not only quantity.', 'Courts consider whether the portion is the heart of the work, and commercial substitution hurts the analysis.'),
      mc(L06, 5, 3, 'A teacher asks, "If I credit the artist and it is for education, I am safe, right?" The best answer is?', ['Not automatically; these points may help but courts weigh all four factors case by case', 'Yes, because crediting the artist and teaching students together make any classroom use legal', 'Yes, but only for images', 'No, education is never fair use'], 'Which claims are rules, and which are factors?', 'Credit is not a defense, and educational purpose is only part of one factor.'),
      // L07
      tf(L07, 1, 1, 'A takedown notice under the DMCA must include a statement, under penalty of perjury, that the sender is the owner or authorized to act for the owner.', 0, 'Think about what makes the notice reliable.', 'Section 512 requires that statement along with a good-faith belief of unauthorized use.'),
      mc(L07, 2, 2, 'After a poster files a valid counter-notice, what typically happens if the claimant does not file a federal lawsuit within the time allowed?', ['The provider may restore the material after about 10 to 14 business days', 'The poster is automatically fined', 'The work becomes public domain', 'The provider must permanently ban the claimant from sending any future takedown notices'], 'There is a short waiting period.', 'The DMCA allows restoration after 10 to 14 business days if no suit is filed.'),
      mc(L07, 3, 2, 'Where do you find a service provider\'s designated agent for DMCA notices?', ['The Copyright Office\'s DMCA Designated Agent Directory', 'The USPTO trademark database', 'The Library of Congress online catalog of registered works', 'A state business registry'], 'The directory is run by the Office that registers copyrights.', 'Providers register their agents in the Copyright Office\'s online directory.'),
      mc(L07, 4, 3, 'Why is it risky to send a DMCA notice for a use that is plainly licensed or clearly fair use?', ['Knowingly false claims can lead to liability, and you must consider fair use before sending', 'It is always free of consequences', 'Platforms ban all users who send notices', 'Notices can only be sent by attorneys'], 'Section 512(f) deals with misrepresentation.', 'Knowing material misrepresentations in a notice can create liability, and courts expect consideration of fair use.'),
      mc(L07, 5, 3, 'A designer\'s illustration was copied for sale and her damages are about $8,000. Which forum is built for modest claims like this?', ['The Copyright Claims Board', 'The U.S. Court of International Trade', 'The USPTO Patent Trial board', 'The WIPO Madrid trademark registry'], 'The cap is $30,000.', 'The CCB handles lower-value copyright claims up to $30,000, and participation is voluntary.'),
      // L08
      tf(L08, 1, 1, 'Works created by U.S. federal government employees as part of their jobs are generally not protected by U.S. copyright.', 0, 'Think about who the public pays.', 'Federal government works are not eligible for U.S. copyright, although they may include third-party material.'),
      mc(L08, 2, 2, 'As of 2026, which works first published in the U.S. have entered the public domain by age?', ['Works published in 1930 or earlier', 'Works published in 1960 or earlier in the United States', 'Works published in 2000 or earlier in the United States', 'Only works that were published before the year 1900'], 'It is a rolling 95-year rule for older works.', 'Published works reach 95 years; in 2026, 1930 and earlier have entered the public domain.'),
      mc(L08, 3, 2, 'A creator picks a CC BY-NC license for her photo. Which use is NOT allowed without extra permission?', ['Using it in a paid commercial advertisement', 'Using it in a free classroom lesson', 'Sharing it with credit on a blog without ads or revenue', 'Printing it in a free school zine with credit'], 'NC stands for non-commercial.', 'NC prohibits commercial uses unless the owner grants more permission.'),
      mc(L08, 4, 3, 'A 1920s novel is public domain, but a publisher\'s 2024 edition has new notes and illustrations. What can Lena freely copy?', ['The original 1920s text, but not the new notes or illustrations', 'Everything in the new edition', 'Nothing, because the new edition restarts the copyright term for the whole book', 'Only the cover'], 'New material gets its own protection.', 'Fresh additions are protected separately, while the underlying public domain text stays free.'),
      mc(L08, 5, 3, 'What is true about a Creative Commons license?', ['The creator keeps copyright and grants permission under stated conditions', 'It transfers ownership of the work to every member of the public who downloads it', 'It cancels all moral rights', 'It works only for photographs'], 'Permission, not ownership transfer.', 'CC licenses grant permission; the creator remains the copyright owner (except CC0, a dedication).'),
      // L09
      tf(L09, 1, 1, 'A song involves two separate copyrights: the musical composition and the sound recording.', 0, 'Think of the songwriter and the recording artist.', 'The composition and the sound recording are distinct works with different owners and licenses.'),
      mc(L09, 2, 2, 'Which organization administers blanket mechanical licenses for U.S. streaming and downloads of compositions?', ['The MLC', 'SoundExchange', 'ASCAP, a performing rights organization', 'The Copyright Claims Board'], 'It is a collective created for mechanical rights.', 'The Mechanical Licensing Collective administers mechanical licenses for U.S. digital music uses.'),
      mc(L09, 3, 2, 'A producer wants to sample two seconds from a commercial recording. What permission is generally needed?', ['Permission for the sound recording and for the underlying composition', 'None, because a sample of only two seconds is too short to count as copying', 'Only the artist\'s verbal approval', 'Only a trademark license'], 'Sampling touches both layers.', 'A sample uses the recording and the composition, so both owners generally must authorize it.'),
      mc(L09, 4, 3, 'As of the Copyright Office\'s January 2025 report, how is AI-generated output generally treated?', ['Copyright needs human authorship; human-authored parts, selection and arrangement can be protected, but prompts alone are generally not enough', 'All AI output is fully copyrighted by the prompter', 'AI output is copyrighted by the AI company', 'Any use of AI bars all copyright'], 'Think about what the Office says about human contribution.', 'The Office\'s position is that human authorship is required and prompts alone are generally insufficient; check its AI page for updates.'),
      mc(L09, 5, 3, 'Kit\'s app was built partly with AI-generated code. What should Kit do about registration?', ['Disclose AI-generated material and claim only the human-authored contributions', 'Claim all of the code as human-written, regardless of which tool actually produced it', 'Never register software', 'Register only the app\'s name'], 'Honesty on the application matters.', 'The Office asks applicants to disclose more than minimal AI-generated content and to claim only human authorship.'),
      // L10
      tf(L10, 1, 1, 'Unlike copyright, a trademark protects a sign that identifies the source of goods or services.', 0, 'What does a customer rely on a brand for?', 'Marks function as source identifiers and prevent consumer confusion.'),
      mc(L10, 2, 2, 'Which name is an example of a fanciful mark?', ['Kodak', 'Apple for computers', 'Fast Delivery', 'Bicycle'], 'Look for an invented word.', 'Fanciful marks are coined words and are the strongest category.'),
      mc(L10, 3, 2, 'Rae wants to call her bakery "Great Bread." Why is that weak?', ['It is descriptive of the goods, so it is hard to protect without proof of secondary meaning', 'It is too long', 'It is arbitrary', 'Bakeries cannot get trademarks'], 'Does the name just describe quality?', 'Descriptive marks need acquired distinctiveness before they are protectable.'),
      mc(L10, 4, 3, 'Which ordering runs from weakest to strongest protection?', ['Generic, descriptive, suggestive, arbitrary, fanciful', 'Fanciful, arbitrary, descriptive, suggestive, generic', 'Descriptive, generic, fanciful, arbitrary, suggestive', 'Arbitrary, fanciful, generic, descriptive, suggestive'], 'Generic names cannot be protected at all.', 'The standard spectrum starts with generic (unprotectable) and ends with fanciful (strongest).'),
      mc(L10, 5, 3, 'Why can two companies sometimes use the same word as a mark, such as for faucets and airlines?', ['Trademark law focuses on likelihood of confusion in related goods or services', 'Trademarks can only be owned by one person or company in each country across all industries', 'The USPTO ignores identical words', 'Different industries do not use trademarks'], 'Confusion is the key test.', 'Rights depend on whether consumers are likely to be confused, which usually requires related goods or services.'),
      // L11
      tf(L11, 1, 1, 'Registering a domain name automatically gives you trademark rights in that name.', 1, 'Is a web address the same as a brand right?', 'A domain registration is a technical address; trademark rights come from use and registration of a mark.'),
      mc(L11, 2, 2, 'What is a good first free step in clearing a trademark name in the U.S.?', ['Search the USPTO Trademark Search database', 'File an application first and see whether the USPTO raises any problems', 'Order business cards', 'Register copyright in the logo'], 'Search before you file or print.', 'Searching the USPTO database finds registered and pending conflicts early.'),
      mc(L11, 3, 2, 'Why do you list goods and services by class on a U.S. application?', ['USPTO fees are charged per class and it defines your coverage', 'Classes decide how long your copyright lasts and which court hears your case', 'Classes exist only for patents', 'It determines your tax rate'], 'Think of cost and coverage.', 'Each class adds a fee, and the goods list defines the scope of protection.'),
      mc(L11, 4, 3, 'Theo finds no registered "Northgate" for clothing but sees a local boutique using it. What does that mean?', ['The boutique may still have common-law rights in its area, so it is a risk to evaluate', 'Nothing, because only registered marks count', 'He is safe in all states', 'The boutique must stop immediately'], 'Registration is not the only source of rights.', 'Unregistered use can create common-law rights, so searches should go beyond the register.'),
      mc(L11, 5, 3, 'If someone registers your brand as a domain only to sell it to you, which route can address it?', ['The UDRP process or federal anticybersquatting law, if you have trademark rights', 'A DMCA takedown notice sent to the domain registrar demanding that the name be released', 'A patent infringement suit', 'The Copyright Claims Board'], 'It requires rights in a mark.', 'Mark owners can use UDRP or the Anticybersquatting Consumer Protection Act against bad-faith domain registrations.'),
      // L12
      tf(L12, 1, 1, 'An intent-to-use application lets you file before you begin selling, but you must later show actual use.', 0, 'The "ITU" route has a later proof step.', 'An ITU filing claims a bona fide intent to use, followed by a statement of use.'),
      mc(L12, 2, 2, 'What is the correct order of the main U.S. trademark application steps?', ['File, examination, publication for opposition, registration', 'Publication, file, registration, examination', 'Registration, file, publication, examination, and then the opposition period', 'Examination, registration, file, publication'], 'Opposition comes before registration.', 'The USPTO examines first, publishes for a 30-day opposition period, then registers.'),
      mc(L12, 3, 2, 'An examining attorney finds your mark confusingly similar to an earlier registration. What do you usually receive?', ['An office action with a deadline to respond', 'An immediate registration with no further review', 'A refund of all fees', 'A copyright notice'], 'It is a written request or refusal.', 'An office action explains the issue and gives you limited time to answer.'),
      mc(L12, 4, 3, 'Why is an application filed by the wrong owner a serious problem?', ['An application filed by someone who is not the owner of the mark can be void', 'It only delays the case by a week while the owner name is corrected on the form', 'It is fixed automatically', 'Owners do not matter for marks'], 'Ownership is a basic requirement.', 'A U.S. application must be filed by the true owner, or it may be void and not curable by amendment.'),
      mc(L12, 5, 3, 'You receive a letter that looks official offering to "register your trademark" for a high fee. What is the best step?', ['Check the sender against official USPTO communications; filings and notices come only through uspto.gov accounts and emails', 'Pay immediately to avoid cancellation', 'Ignore your own application forever', 'Send your login to the sender'], 'Check the source.', 'Many solicitations imitate official notices; verify through your own USPTO account.'),
      // L13
      tf(L13, 1, 1, 'Anyone claiming rights in a mark may use the TM symbol, but the circled R may be used only after federal registration.', 0, 'One symbol costs nothing; the other needs a registration.', 'TM is a claim; the circled R signals federal registration for the covered goods or services.'),
      mc(L13, 2, 2, 'Ana has only an application pending for "Ember Lane." Which symbol is appropriate?', ['TM', 'The circled R', 'Neither; no marks may appear until registration', 'The (c) symbol'], 'It is not registered yet.', 'Until registration issues, use TM; the circled R would be misleading.'),
      mc(L13, 3, 2, 'What happens if you stop using a registered mark and miss a maintenance deadline?', ['The registration can be cancelled', 'Nothing, a registration is permanent', 'It converts to a copyright', 'It transfers to the USPTO'], 'Registrations need upkeep.', 'U.S. registrations require continuing use and timely maintenance filings.'),
      mc(L13, 4, 3, 'Compared with relying only on common-law use, what does federal registration add?', ['Nationwide priority from the filing date, a presumption of validity and access to federal court', 'Worldwide protection automatically', 'Protection for any similar name in any field of business, anywhere in the world, for as long as the owner likes', 'Permanent rights with no maintenance'], 'Consider geography and presumption.', 'Registration provides nationwide constructive priority and evidentiary benefits, but only in the U.S.'),
      mc(L13, 5, 3, 'What is the "dependency" risk in the Madrid System?', ['If the home-country basic mark fails within five years, the international registration can fall too', 'The Madrid System requires use in every country at once', 'Madrid automatically replaces local laws', 'It lets you skip the USPTO entirely with no basic mark'], 'Think about the five-year link.', 'An international registration depends on the basic application or registration for five years.'),
      // L14
      tf(L14, 1, 1, 'A U.S. utility patent protects how an invention works, and a design patent protects its ornamental appearance.', 0, 'Function versus look.', 'Utility patents cover function; design patents cover ornamental design.'),
      mc(L14, 2, 2, 'Which is generally NOT patentable subject matter?', ['An abstract idea or a law of nature', 'A new machine with a novel mechanical design', 'A new manufacturing process with several steps', 'A new composition of matter such as an alloy'], 'Courts exclude certain categories.', 'Laws of nature, natural phenomena and abstract ideas are excluded from patent eligibility.'),
      mc(L14, 3, 2, 'Lee invents a new phone clip mechanism and also has a distinctive clip shape. Which pairing fits?', ['Mechanism: possible utility patent; shape: possible design patent', 'Mechanism: copyright; shape: trade secret', 'Mechanism: trademark protection for how it works; shape: utility patent for the way it looks', 'Both: only a copyright'], 'Function and ornament are covered separately.', 'Functional features may get utility protection, while ornamental appearance may get a design patent.'),
      mc(L14, 4, 3, 'Roughly how long does a utility patent last in the U.S.?', ['20 years from the filing date, subject to maintenance fees', '70 years from grant', 'Forever, if renewed every year', '5 years from the first sale of a product that uses the invention'], 'It runs from filing, not grant.', 'The standard term is 20 years from the earliest non-provisional filing date.'),
      mc(L14, 5, 3, 'A founder says, "I will patent the idea of holding phones on bikes." Why is this a problem?', ['Claims must define a specific invention, and a broad idea or result alone is not enough', 'Bikes cannot be patented', 'Only corporations can hold patents', 'Phone accessories are always design-only'], 'Specificity matters.', 'A patent must describe and claim a specific, enabled invention rather than an abstract goal.'),
      // L15
      tf(L15, 1, 1, 'To be patentable, an invention must be new (novel) and non-obvious.', 0, 'Two core tests.', 'Novelty and non-obviousness are central conditions, along with eligible subject matter and usefulness.'),
      mc(L15, 2, 2, 'In the U.S., an inventor\'s own public disclosure is generally excused if the patent application is filed within how long?', ['One year', 'Five years', 'Thirty days', 'It is never excused'], 'This is the grace period.', 'The U.S. grace period for the inventor\'s own disclosures is one year.'),
      mc(L15, 3, 2, 'Marcus posted a demo video in March and plans to file in Europe. What is the main risk?', ['Many countries require absolute novelty, so the video may already bar protection there', 'Europe has the same one-year grace period', 'Videos are never prior art', 'There is no risk if he files in the U.S. within a year'], 'Other countries differ.', 'Most jurisdictions outside the U.S. lack a general grace period, so public disclosure can defeat novelty.'),
      mc(L15, 4, 3, 'Which is the best use of a self-run patent search?', ['Learn the landscape and spot problems early, while accepting it will not be complete', 'Prove conclusively that no one else has a similar invention', 'Replace all professional advice', 'Obtain a patent'], 'Consider the limits of amateur searching.', 'Self-searching is educational but never definitive; professionals search more thoroughly.'),
      mc(L15, 5, 3, 'Two earlier patents each show half of an invention, and combining them is a routine step for someone skilled in the field. Which test might this fail?', ['Non-obviousness', 'Novelty, because neither patent shows the whole', 'Utility, meaning the invention works', 'Copyright originality'], 'No single reference matches, but a combination might be obvious.', 'Even without a single identical reference, an obvious combination can defeat patentability.'),
      // L16
      tf(L16, 1, 1, 'A provisional patent application is examined and turns into a patent on its own.', 1, 'What must you file within 12 months?', 'A provisional is never examined and expires; you must file a non-provisional to continue.'),
      mc(L16, 2, 2, 'How long do you have after filing a provisional to file a non-provisional that claims its date?', ['12 months', 'Three months from filing', 'Five years from filing', 'Thirty days from filing'], 'It is one year.', 'The provisional gives a 12-month window to file the non-provisional.'),
      mc(L16, 3, 2, 'Which professional may be a patent agent rather than a lawyer?', ['Someone who passed the USPTO registration exam and can prosecute patent applications', 'A trademark examiner who reviews and decides patent applications on behalf of the USPTO', 'A copyright clerk', 'A state notary'], 'The title differs from attorney.', 'Patent agents are registered with the USPTO and can prepare and prosecute applications, but are not lawyers.'),
      mc(L16, 4, 3, 'What does the PCT mainly provide?', ['One international application that delays country-by-country decisions for about 30 months', 'A single worldwide patent', 'Automatic approval in all countries', 'A free provisional'], 'It is a filing system, not a global patent.', 'The PCT is a unified filing process; patents are still granted nationally.'),
      mc(L16, 5, 3, 'A solo inventor with little money gets a pitch from an invention-promotion firm demanding large upfront fees. What is the best step?', ['Be cautious, check the USPTO\'s guidance, and consider pro bono or low-cost professional help', 'Pay immediately, because such firms guarantee patents', 'File a provisional with no description', 'Give the firm full ownership'], 'Look for official help first.', 'Promotion firms are a known risk; the USPTO offers inventor resources and a Patent Pro Bono Program for eligible inventors.'),
      // L17
      tf(L17, 1, 1, 'A trade secret needs no registration but only stays protected while it is kept secret.', 0, 'What destroys the protection?', 'Trade secret rights depend on secrecy and reasonable measures to preserve it.'),
      mc(L17, 2, 2, 'A rival buys your product and takes it apart to learn how it works. What does trade secret law generally say about reverse engineering?', ['It is generally lawful', 'It is treated as misappropriation', 'It is a copyright violation', 'It requires a license from the maker'], 'Think of proper means.', 'Reverse engineering a lawfully acquired product is generally a proper means of discovery.'),
      mc(L17, 3, 2, 'Which of these is a "reasonable measure" to protect a secret?', ['Limiting access to those who need it and requiring confidentiality agreements', 'Posting it on the company website', 'Telling every customer', 'Registering the details with the USPTO so that they appear in a public database'], 'Control who knows it.', 'Access controls and agreements are classic reasonable measures.'),
      mc(L17, 4, 3, 'Which clause is a typical exclusion in an NDA?', ['Information that was already public or independently developed by the recipient', 'Everything the recipient ever learns', 'Anything older than a week', 'Only information that the discloser has typed entirely in capital letters or bold'], 'Standard carve-outs.', 'Typical exclusions include public, already-known, independently developed and lawfully received information.'),
      mc(L17, 5, 3, 'When would a startup prefer trade-secret protection over a patent for a process?', ['When the process can be kept hidden and reverse engineering is unlikely', 'When everyone can see how it works from the product', 'When the details of the process must be published in a public marketing brochure', 'When it is already disclosed'], 'Patents require disclosure.', 'A secret can last indefinitely, but only if the process is truly hidden and hard to discover independently.'),
      // L18
      tf(L18, 1, 1, 'A freelancer usually keeps copyright in work they create unless the contract assigns it or a work-made-for-hire category applies.', 0, 'Who is the default owner?', 'Independent contractors are not employees, so ownership must be settled by contract.'),
      mc(L18, 2, 2, 'What is the main purpose of an invention assignment agreement with employees?', ['To make sure the company owns inventions made for the job', 'To register a trademark', 'To make employees waive all copyright in their own personal writing forever', 'To guarantee a patent'], 'Patent rights start with the inventor.', 'Patent rights begin with the inventor, so employers use assignment agreements to secure ownership.'),
      mc(L18, 3, 2, 'Sofia wrote the prototype before the LLC existed. What should happen at formation?', ['She should sign an assignment transferring the prototype IP to the company', 'Nothing, because the LLC automatically owns everything its founders made earlier', 'She should register an ASCAP account', 'She should keep it and never mention it'], 'Pre-formation work is not automatically transferred.', 'Founders should assign pre-incorporation IP to the company in writing.'),
      mc(L18, 4, 3, 'What is the difference between an exclusive and a non-exclusive license?', ['An exclusive license bars others (and sometimes the owner) from the licensed use; a non-exclusive one lets the owner license others too', 'Exclusive licenses are free and non-exclusive ones are paid', 'Non-exclusive licenses transfer ownership', 'There is no difference'], 'Think about who else can use it.', 'Exclusivity determines whether the licensee is the only authorized user in the licensed scope.'),
      mc(L18, 5, 3, 'An investor\'s due diligence finds that a freelance artist never signed anything. What is the likely consequence?', ['The company may not own the art and may need a signed assignment before the deal', 'The deal closes with no issue', 'The artist loses the copyright automatically because the company paid for the work', 'The art becomes public domain'], 'Gaps in the chain of title are red flags.', 'Without a signed assignment, the artist may still own the copyright, which can derail a financing or sale.'),
      // L19
      tf(L19, 1, 1, 'A DMCA takedown notice is a relatively quick and low-cost first step against online copyright infringement.', 0, 'It is a platform process, not a lawsuit.', 'Takedown notices are fast and usually free, which is why they often come before litigation.'),
      mc(L19, 2, 2, 'Which is generally the cheapest response when you find a small infringement?', ['Document it and contact the user or use a platform tool', 'File a federal lawsuit at once', 'Hire a team of lawyers to sue the user in several countries at once', 'Do nothing and register later'], 'Start at the bottom of the ladder.', 'Documentation, polite contact and platform tools are low-cost first steps.'),
      mc(L19, 3, 2, 'Which forum handles bad-faith domain registrations of your trademark?', ['ICANN\'s UDRP process', 'The Copyright Claims Board', 'The USPTO patent examiner', 'The Library of Congress'], 'Domains have their own dispute system.', 'UDRP is the standard administrative procedure for cybersquatting disputes.'),
      mc(L19, 4, 3, 'Why can a heavy-handed cease-and-desist letter backfire?', ['It can provoke a declaratory suit or counterclaims if the claim is weak or overstated', 'Letters are illegal', 'It cancels your registration', 'It ends your rights in the work automatically once the recipient replies with a denial'], 'Think about risk to you.', 'Overreaching letters can prompt the other side to sue or can create liability for you.'),
      mc(L19, 5, 3, 'A $400 infringement affects a product that sells $5,000 a year. Which approach is proportionate?', ['A low-cost step such as a platform complaint or letter rather than expensive federal litigation', 'A multimillion-dollar patent trial', 'Hiring five law firms', 'Suing in every state where the product might ever be sold, to send a strong message to all other copyists'], 'Spend in proportion to value.', 'Litigation costs commonly dwarf small losses, so match the response to the stakes.'),
      // L20
      tf(L20, 1, 1, 'A good IP plan starts with an inventory of what the business has created and who owns each piece.', 0, 'You cannot protect what you have not listed.', 'Inventory and ownership checks come first.'),
      mc(L20, 2, 2, 'Pawprint Studio launches a new chew design publicly next month and may want a patent. What should it do before the launch?', ['Decide on patent protection first, because public disclosure can start clocks and harm foreign rights', 'Launch first and decide later', 'Register the design as a trademark only', 'Publish all the details online'], 'Timing of disclosure matters.', 'Public disclosure can bar or limit patent rights, especially outside the U.S.'),
      mc(L20, 3, 2, 'Which item should the studio protect with a trademark?', ['Its studio name and logo', 'The text of its published guides', 'The chew\'s inner mechanism', 'Its private customer mailing list'], 'Which item identifies the source?', 'Names and logos are classic trademark subject matter; the others fit copyright, patents and trade secrets.'),
      mc(L20, 4, 3, 'Which action best preserves the strongest copyright remedies for a newly published guide?', ['Register it promptly, within three months of publication', 'Wait for an infringer', 'Add only a (c) symbol and rely on it to preserve every remedy', 'Register after five years'], 'Think about the timing windows.', 'Prompt registration preserves eligibility for statutory damages and attorney\'s fees.'),
      mc(L20, 5, 3, 'Which calendar item belongs in a small business IP plan?', ['The 12-month provisional deadline and trademark maintenance dates', 'Only the date of the next product sale', 'A reminder to delete all signed agreements once each project is finished', 'Nothing, because rights are permanent'], 'Rights depend on deadlines.', 'Missed provisional, maintenance and renewal deadlines can forfeit protection.'),
    ],
  },
};
