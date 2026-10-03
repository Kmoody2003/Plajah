import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// Write the correct choice FIRST; the helper rotates the choices (keeping their cyclic order) so the
// correct answer lands on a spread-out index.
const mc = (l: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], hint: string, explanation: string): Question => {
  const target = (parseInt(l.slice(l.lastIndexOf('.l') + 2), 10) * 3 + n * 5) % 4;
  const shift = target;
  const rotated = choices.map((_, i) => choices[(i - shift + 4) % 4]);
  return { id: `${l}.q${n}`, lessonId: l, kind: 'mcq', prompt, choices: rotated, answer: target, hint, explanation, level };
};
const tf = (l: string, n: number, level: 1 | 2 | 3, prompt: string, answer: number, hint: string, explanation: string): Question =>
  ({ id: `${l}.q${n}`, lessonId: l, kind: 'tf', prompt, answer, hint, explanation, level });

const L01 = 'film-producing.l01';
const L02 = 'film-producing.l02';
const L03 = 'film-producing.l03';
const L04 = 'film-producing.l04';
const L05 = 'film-producing.l05';
const L06 = 'film-producing.l06';
const L07 = 'film-producing.l07';
const L08 = 'film-producing.l08';
const L09 = 'film-producing.l09';
const L10 = 'film-producing.l10';
const L11 = 'film-producing.l11';
const L12 = 'film-producing.l12';
const L13 = 'film-producing.l13';
const L14 = 'film-producing.l14';
const L15 = 'film-producing.l15';
const L16 = 'film-producing.l16';
const L17 = 'film-producing.l17';
const L18 = 'film-producing.l18';
const L19 = 'film-producing.l19';
const L20 = 'film-producing.l20';
const L21 = 'film-producing.l21';
const L22 = 'film-producing.l22';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'film-producing',
    label: 'Film Producing',
    blurb: 'What producers do from first idea to final delivery: developing material, packaging and pitching, budgets and schedules, hiring, insurance, post-production, festivals and distribution, and the ethics and risk management that run through all of it. Dollar figures are illustrative; real terms vary and change.',
    accent: '#C9871F',
    framework: 'ncas',
    tracks: [
      {
        id: 'film-producing.t1',
        title: 'The Producer and Development',
        blurb: 'What producers are for, the different producer titles, and how a project goes from an idea to a pitch.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'What a Producer Does',
            blurb: 'A producer is the person responsible for getting a film made, from the first idea through to people seeing it.',
            minutes: 6,
            body: `Imagine a friend wants to make a short film. She has a story and a camera. Who finds the money, gets permission to film in the park, hires the sound recorder, makes sure everyone is fed, and arranges for the finished film to be shown? That bundle of jobs is producing.

A producer is the person who takes responsibility for a film as a whole project. A director is mainly responsible for the creative vision on screen; a producer is responsible for making it possible and for keeping it on track. In very rough terms, the producer answers three questions: What are we making? Can we afford and finish it? Who will see it?

The work usually falls into stages. In development, the producer finds or shapes the idea and the script. In pre-production, the film is planned, budgeted and cast and crewed. In production, the film is shot. In post-production, it is edited, scored and finished. Then comes release, when it is marketed and sold or shown. A producer may be involved in every stage, even though the heaviest work changes from one stage to the next.

Good producers combine two habits that can seem opposite. They are creative enough to recognise a story worth telling, and practical enough to say what a film will cost and who will pay for it. They are also people managers: they keep investors, crew, artists and distributors working toward the same finished film.

Worked example: on a small student film, the producer might also act as the budget keeper, scheduler, location finder and caterer. On a large studio picture those jobs are divided among many people, but someone is still ultimately responsible for the whole.`,
          },
          {
            id: L02,
            title: 'Types of Producers and Their Titles',
            blurb: 'Producer credits mean different things on different films, so it helps to know the common roles and their usual duties.',
            minutes: 7,
            body: `Film credits list many kinds of producer, and the same title can mean different things on different productions. Industry practice varies, so treat the descriptions below as typical rather than fixed.

A producer, sometimes called the lead or "above the title" producer on a project, is usually the person with the main responsibility for the project from beginning to end. An executive producer often has a role connected to the money or the deal: for example, someone who brought in financing, secured the rights, or oversees the producer on behalf of a studio. On television, the term can also describe a senior creative leader who runs a series. A co-producer typically shares some producing duties, often in a defined area such as financing or a particular country's contribution. An associate producer usually assists the producer and may handle specific tasks. A line producer manages the budget and day-to-day logistics of a shoot, turning the plan into a schedule and keeping spending under control. A creative producer focuses on the story, the script and the artists. A unit production manager, often abbreviated UPM, manages the logistics and budget of a shoot as well, and in some productions the line producer and UPM roles overlap or are combined.

Because titles carry prestige and, in some cases, contractual weight, they are often negotiated. Some film awards limit how many producers may be recognised for a single film, which makes credits a matter of real interest.

Worked example: a small independent film credits Maria as producer, Ben as executive producer because he arranged the key investment, and Dana as line producer because she built the schedule and ran the daily budget. Their credits describe different jobs, even though all three are producing.`,
          },
          {
            id: L03,
            title: 'Development: Finding and Shaping Material',
            blurb: 'Development is the stage where an idea becomes a script and a plan strong enough to attract money and talent.',
            minutes: 7,
            body: `Development is the period before a film is approved to be made, when a producer turns an idea into something that others can judge and fund. It is often the longest and least visible stage, and many projects never leave it.

Material comes from many places. A producer may commission an original script, adapt a novel, play, article, comic or game, base a film on a real person's life, remake an earlier film, or follow a pitch from a writer. Each source has different costs and different permissions. An original script by a writer may be bought outright. A book by a living author must be licensed. A story about a real person may involve life-rights agreements and extra legal care.

During development, the producer usually works with the writer through drafts, offering notes aimed at making the story clearer and stronger. The producer also tests the project against practical questions. Who is the audience? What would it cost to make? What similar films exist, and how did they do? Could the story be told for less money without losing what makes it special?

Development costs real money: payments for options and writers, script analysis, research, and legal fees. Because most developed projects never get made, producers often spread this risk across many projects and look for outside development funding or a studio or company that will pay part of the costs.

Worked example: a producer reads a short magazine article about a town that rebuilt its only cinema. She contacts the writer to ask about film rights, hires a screenwriter to draft a treatment, and spends a few months testing it with a small group of trusted readers before spending more.`,
          },
          {
            id: L04,
            title: 'Options, Rights and the Chain of Title',
            blurb: 'Before spending serious money on a project, a producer needs to know who owns the underlying material and how those rights pass to the film.',
            minutes: 7,
            body: `Films are built on rights. If a producer wants to adapt a novel, the film cannot lawfully be made unless the author, or whoever holds the rights, has agreed. This lesson gives an overview; the existing Film Business course covers the legal chain in more depth.

An option is a common tool in development. Under an option agreement, a producer pays the rights holder a fee for the exclusive right, for a set period, to buy the rights at an agreed price. It lets the producer reserve the material while trying to raise money, without paying the full purchase price up front. Option periods are often described in months or a year or two, with possible extensions for further payment, though the terms are negotiated and vary a great deal. If the producer does not exercise the option before it expires, the rights usually return to the owner.

The chain of title is the documented trail showing that each person who owned or contributed rights to the project passed them on properly, from the original creator to the production company. Distributors, financiers and insurers commonly want to see a clean chain of title before they commit. Gaps, such as a missing signed agreement from a writer, can delay a release or stop a deal entirely.

For a story about a real person, the producer may seek a life-rights agreement, though the law about when it is needed varies by place and subject.

Worked example: a producer options a 2018 novel for a modest fee for 18 months. She raises development money, hires a screenwriter, and before the deadline pays the purchase price, since a studio has now agreed to fund the film. The assignment from the author is added to the chain of title.`,
          },
          {
            id: L05,
            title: 'Packaging and Pitching',
            blurb: 'Packaging attaches key people to a project, and pitching is how a producer persuades others to back it.',
            minutes: 7,
            body: `A script alone is often not enough to raise money. Financiers and distributors want to know who will be in the film and who will direct it, so producers assemble a package: the script plus key creative elements such as a director, lead actors, or other notable collaborators who make the project more attractive. The idea is that a strong package lowers the perceived risk for the people being asked to commit.

Packaging is a negotiation. Actors and directors usually join a project through a letter of interest, a pay-or-play offer, or a signed agreement, each with different levels of commitment. A letter of interest is not binding in the way a contract is, though it can still help in a pitch. Producers must be honest about commitments, because overstating who is attached damages trust and can create legal problems.

A pitch is a short presentation, spoken or written, to persuade someone to read, fund or buy a project. A good pitch is usually clear and brief. It states the core idea in a sentence or two, explains why this story and why now, identifies the audience, mentions comparable films, and says what the producer needs. Producers often bring supporting material: a pitch deck with images and key facts, a budget summary, and a short sample or sizzle reel.

Comparable films, or comps, help buyers judge what a project might earn, but they should be chosen honestly and recently rather than cherry-picked.

Worked example: a producer pitches a low-budget thriller to a company by saying in one sentence what happens, naming two similar films released in recent years, showing a $2 million budget range (an illustrative figure), and explaining that a director with festival experience has expressed interest.`,
          },
        ],
      },
      {
        id: 'film-producing.t2',
        title: 'Budgets and Schedules',
        blurb: 'How producers plan time and money: budget structure, the contingency, the script breakdown and the stripboard.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L06,
            title: 'Reading a Budget: Top Sheet and the Lines',
            blurb: 'A film budget is a structured list of costs; its top sheet summarises the whole, and the detailed pages explain each part.',
            minutes: 7,
            body: `A film budget is a plan that translates a script into money. It is built from the details up, then summarised on a one- or two-page top sheet showing the major categories and the total.

Budgets are traditionally split into above-the-line and below-the-line costs. Above-the-line costs usually cover the key creative elements negotiated before shooting: the story and rights, the producer, the director and the principal cast. Below-the-line costs cover the physical making of the film: the crew, equipment, locations, sets, costumes, travel, and the like. Post-production, which includes editing, sound, music and visual effects, and other items such as insurance and legal costs, are often listed in their own sections after the shoot, though conventions differ between companies.

Each category is broken into account numbers and line items, with a rate, a quantity and a total. For example, a camera department line might multiply a daily equipment rental by the number of shooting days. Fringes are another important item: these are payroll taxes, union benefits and similar charges added on top of salaries, and they can be a significant percentage of labour costs.

A good budget is realistic and tied to the script. If a scene needs a night exterior with a crowd, the budget must show that cost. Budgets are updated as plans change, and a producer compares them against actual spending through cost reports.

Worked example: suppose an illustrative top sheet shows $50,000 above the line, $400,000 below the line, $80,000 in post and $40,000 in other costs. These numbers are made up, but they show how a producer can see at a glance where the money is going.`,
          },
          {
            id: L07,
            title: 'Contingency, Cost Control and Cash Flow',
            blurb: 'Money is set aside for surprises, and spending is tracked against the plan throughout the shoot.',
            minutes: 6,
            body: `Film productions rarely go exactly as planned. Weather changes, equipment fails, an actor falls ill, and a location becomes unavailable. To handle this, budgets typically include a contingency: an extra amount, often described as a percentage of the other costs, set aside for unexpected expenses. Ten percent is a figure often mentioned, but the amount varies, and some financiers or completion guarantors have their own requirements. It is meant for genuine surprises, not for covering a budget that was too low from the start.

Cost control means watching spending while the film is being made. Productions typically produce regular cost reports that compare three numbers: what was budgeted, what has been spent or committed so far, and what the final cost is now forecast to be. The difference between the forecast and the budget shows whether the production is running over or under. A line producer or production accountant usually prepares these, and the producer uses them to make decisions early, when changes are still cheap.

Cash flow is a related idea. A production does not spend its money evenly, and investors often release funds in instalments. The producer needs enough money available at each point to pay crew, vendors and deposits on time. A schedule showing when money comes in and goes out is called a cash flow schedule.

Worked example: a film has an illustrative budget of $1,000,000 including a $90,000 contingency. In week two a storm forces a reshoot day costing $25,000. The producer uses part of the contingency, records the change, and checks whether the remaining schedule still fits the money left.`,
          },
          {
            id: L08,
            title: 'Script Breakdown',
            blurb: 'Breaking down a script means listing every element each scene needs, which feeds both the schedule and the budget.',
            minutes: 6,
            body: `Before a film can be scheduled or accurately budgeted, someone has to read the script closely and list what every scene requires. This process is called the script breakdown.

The first step is to divide the script into scenes and measure each one. Scenes are usually measured in eighths of a page, so a scene that fills a page and a quarter is described as one and two-eighths pages. Each scene is also noted by whether it is an interior or an exterior and whether it takes place in the day or at night, since these affect lighting, crew and scheduling.

The breakdown then lists elements for each scene. Typical categories include cast members, extras, stunts, special effects, props, wardrobe, vehicles, animals, special equipment, music and sound needs, and locations. Breakdown sheets, now generally created in scheduling software but still based on the older paper form, record these details. Many productions use colour conventions to mark categories.

The breakdown has two main uses. It lets the production schedule scenes efficiently, for example by grouping all scenes at one location. It also exposes costs that a quick read might miss, such as a scene that quietly needs a child actor, a horse, or a rain effect.

Worked example: a scene reads, "Night. A bus stops in the rain and Lena runs to catch it." The breakdown for this scene would note an exterior night, rain effects, a vehicle with a driver, the lead actor, any extras at the stop, and a possible permit for the street. A one-line scene has now become several budget items.`,
          },
          {
            id: L09,
            title: 'The Stripboard and the Shooting Schedule',
            blurb: 'The stripboard arranges scenes into shooting days, and the schedule balances story order against cost and availability.',
            minutes: 7,
            body: `Films are almost never shot in story order. Instead, scenes are grouped to shoot as efficiently as possible, and the tool for doing this is the stripboard. Historically it was a physical board with coloured strips of cardboard, one strip for each scene, carrying the scene number, page count, location and cast. Today it is usually a function of scheduling software, though the idea is the same: strips can be moved around to test different shooting orders.

Strips are commonly colour-coded by type, such as day or night and interior or exterior, so the scheduler can see the pattern. Day breaks separate one shooting day from the next, and the total page count per day helps judge whether it is realistic.

When building a schedule, a producer or assistant director balances several constraints. Locations are normally grouped to avoid moving the crew back and forth. Actors are only available for certain days, and their contracts may limit working hours. Child actors have legal restrictions on how long they may work. Night shoots and exteriors depend on daylight and weather, so some productions schedule weather cover, which is an interior scene that can be shot if the weather ruins an exterior plan. Complicated or risky scenes are often placed when there is room to recover.

A schedule changes the budget. More shooting days increase crew and equipment costs, and moving a company between locations takes time.

Worked example: a script has eight scenes in a kitchen spread across the story. By shooting them all in two consecutive days at the same location, the production avoids repeated set-up, even though the scenes appear at different points in the finished film.`,
          },
          {
            id: L10,
            title: 'Hiring Crew and Working with Unions',
            blurb: 'Producers assemble a crew, sometimes under union agreements, which set minimum terms for pay, hours and conditions.',
            minutes: 7,
            body: `A film crew is a temporary organisation built for each project. The producer, often together with the line producer and the director, decides the key department heads first, such as the director of photography, production designer, editor and costume designer, and those heads then help choose their teams. Crew may be hired directly as employees or engaged through a payroll company.

Some crew and cast belong to unions or guilds, which negotiate collective agreements with producers. In the United States, well-known examples include SAG-AFTRA for performers, the Directors Guild of America, the Writers Guild of America, IATSE for many craft and technical workers, and the Teamsters for drivers and related roles. These agreements typically set minimum pay, working hours, rest periods, safety rules and benefit contributions, and they apply only when a production signs on to them. Many independent and low-budget films work non-union or use special lower-cost agreements; others become signatories to the relevant unions. Rules and rates differ by country and change over time, so a producer must check the current terms.

Whether a production is union affects the budget, since benefits contributions and overtime rules add cost, and it can affect who is able or willing to work on it. It also affects schedule, since agreements may require meal breaks and minimum turnaround time between workdays.

Good hiring also involves written agreements. Deal memos set out pay, credit, dates and ownership of work, and are signed before work begins.

Worked example: a producer of a modest film decides to use a union agreement for the lead actors so that the cast can be of a certain calibre, while hiring most of the crew under standard non-union deal memos. The mix is allowed only if the agreements being used permit it.`,
          },
        ],
      },
      {
        id: 'film-producing.t3',
        title: 'Production, Risk and Ethics',
        blurb: 'How a shoot is run safely: insurance, the production workflow, the producer-director relationship and ethical responsibilities.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L11,
            title: 'Insurance and Risk Management',
            blurb: 'Insurance moves some financial risk from the production to an insurer, and risk management tries to prevent losses in the first place.',
            minutes: 7,
            body: `Making a film involves expensive equipment, many people, and plans that depend on things outside anyone's control. Producers manage this in two ways: they try to reduce risks, and they transfer some of the financial consequences to insurers.

Common types of production insurance include general liability, which responds to claims of injury or property damage to others; equipment coverage for cameras, lighting and similar gear, whether owned or rented; workers' compensation, which is typically legally required where there are employees and covers work-related injury; and coverage for vehicles and property. Some policies cover loss from damaged or lost film materials or from cast or key crew becoming unable to work. Errors and omissions insurance, often called E&O, protects against claims such as copyright infringement or defamation in the finished film, and distributors commonly require it. Exact coverages, limits and exclusions vary, and a broker who specialises in entertainment can explain them.

Insurance does not replace planning. Risk management also covers things such as scouting locations for hazards, having safety plans, rehearsing stunts, checking permits, keeping backups of footage, and keeping clear written agreements. The cheapest accident is the one that does not happen.

A related tool is a completion bond, in which a third party guarantees the film will be finished; it is covered in more detail in the Film Business course.

Worked example: before shooting at a rented warehouse, a producer asks the owner for proof of insurance and gives them a certificate naming them as an additional insured, a common request. The producer also makes sure that the crew has a clear plan for exits and a first-aid kit.`,
          },
          {
            id: L12,
            title: 'The Production Workflow: Prep, Shoot, Wrap',
            blurb: 'Production follows a rhythm of paperwork, daily reports and checks designed to keep a large temporary company working in step.',
            minutes: 7,
            body: `Production runs on routine. A typical film moves through pre-production, principal photography and wrap, and each stage has its own tasks.

During pre-production, the team scouts and secures locations, finalises the budget and schedule, hires crew, casts roles, arranges permits and insurance, and holds meetings for each department. A production office is set up to handle paperwork and communications. Contracts and deal memos for cast and crew are signed, and start paperwork is completed before anyone works.

During the shoot, the day is organised around a call sheet, a document sent the evening before showing who is needed, where, and at what time, together with the scenes planned, the weather forecast and safety notes. The assistant director runs the set to keep to the schedule. At the end of each day a production report records what was shot, the hours worked, and any delays or incidents. Camera and sound departments log and back up all media, and a script supervisor tracks continuity details. Producers see the day's footage, often called dailies, to check quality.

After shooting ends, the wrap involves returning rental equipment, restoring locations, paying final bills, collecting paperwork such as releases, and closing accounts. Delays in wrap can cause disputes, so it is treated as part of the job rather than an afterthought.

Worked example: the night before a location day, the production coordinator sends a call sheet. At the end of that day, the report shows the crew shot six of the planned seven scenes, and the producer meets the director to decide where to catch up.`,
          },
          {
            id: L13,
            title: 'The Producer and Director Relationship',
            blurb: 'The pairing of producer and director is a working partnership with built-in tension that is healthiest when it is open and clearly defined.',
            minutes: 6,
            body: `The producer and the director usually stand at the centre of a film's creative and practical decisions. They share a goal, a good finished film, but they often view problems from different positions. The director tends to protect the vision of the story on screen, while the producer tends to protect the budget, the schedule and the interests of those who funded the film.

This difference creates natural tension. A director may want an extra day to get a scene right; the producer knows that day costs money and might be taken from elsewhere. Neither is wrong, and the relationship works best when each understands the other's constraints.

Practical habits help. The pair should agree early on the film's creative aims and its limits, covering budget, schedule, running time and rating, so that later decisions have a reference point. They should know who has the final say on each kind of decision. This is set by contracts and by the power of whoever is financing, and it varies: some directors have final cut, meaning the right to determine the finished version, but many do not, and on studio films the studio often holds it. Honest, regular communication, including bad news, is much better than surprises.

Producers also act as a buffer, taking financiers' demands and shielding the creative team from distractions, while still passing on real constraints.

Worked example: halfway through a shoot, the director asks to add a costly crane shot. The producer looks at the cost report, offers a cheaper alternative that achieves a similar effect, and they agree on it before the day begins.`,
          },
          {
            id: L14,
            title: 'Ethics and Safety on Set',
            blurb: 'A producer has a duty to protect people on the production and to treat collaborators, subjects and audiences fairly.',
            minutes: 7,
            body: `Making a film is a business, but it is also work done by people, often in demanding conditions. A producer is in a position of authority and carries responsibility for safety and fair treatment, which are both ethical and legal matters.

Physical safety comes first. Stunts, vehicles, heights, water, fire and weapons need specialist planning and trained professionals. The use of firearms and replica weapons on set is especially serious: in October 2021, cinematographer Halyna Hutchins died after a prop gun was fired during the filming of Rust, and the event led to intense scrutiny of on-set weapons safety practices. Many productions now rely on strict protocols and qualified armourers, and where possible on non-firing alternatives and digital effects.

Other duties are equally real. Long hours and fatigue are safety problems, which is partly why union agreements set rest periods. Harassment and discrimination must be prevented, and productions typically have clear complaint procedures. For intimate scenes, many productions now engage an intimacy coordinator and secure informed, specific consent beforehand. Those who work with children must follow rules that differ by place on work hours, schooling and supervision.

Ethics also extends beyond the set. Producers should pay people as agreed, credit work accurately, respect the dignity of real people depicted, and avoid misleading investors about the odds of success.

Worked example: before a scene on a rooftop, the producer confirms that a stunt coordinator has planned the safety rigging, the actor has agreed to the plan, and a medic is present. If a condition is not met, the scene waits.`,
          },
        ],
      },
      {
        id: 'film-producing.t4',
        title: 'Post-Production, Delivery and Release',
        blurb: 'From the edit to the finished master, and how a film finds its audience through festivals, sales and distribution.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L15,
            title: 'Supervising Post-Production',
            blurb: 'Post-production turns raw footage into a finished film, and the producer or post supervisor keeps its many parts coordinated.',
            minutes: 7,
            body: `After the shoot, a film still has a long way to go. Post-production is the stage where picture, sound, music and effects are combined into a finished film, and it often takes longer than the shoot itself.

The process usually starts with the editor assembling the footage into a first cut, followed by a series of revisions with the director and producers. When the cut stabilises, it is described as locked, which means no further changes to picture length are expected. That matters because the later departments depend on it. Sound editors and mixers then clean dialogue, add effects and balance everything. A composer writes a score, or the production licenses existing music. Visual effects artists complete their shots, and a colourist adjusts the look of the image in the grading process.

A post-production supervisor, or the producer on smaller films, plans the workflow and schedule, chooses facilities, tracks costs and deadlines, and makes sure that files and formats are handled correctly. Good habits include agreeing early on the formats and resolution to be used, keeping organised backups of all material, and managing the review process so that notes reach the editor in a clear order rather than from many directions.

Delays in post are expensive because staff and facilities keep charging. Producers therefore watch for changes late in the process, since a request for a new visual effect after the lock may affect many departments.

Worked example: a producer sets a schedule that has picture lock in week twelve, sound mix in week sixteen, and delivery of the master in week eighteen. When a note arrives in week fourteen asking for a trimmed scene, she checks the impact on sound before replying.`,
          },
          {
            id: L16,
            title: 'Delivery: What Buyers Need',
            blurb: 'Delivery is the handover of the finished film and its supporting materials, and it is often a contractual requirement for payment.',
            minutes: 7,
            body: `Finishing the edit is not the same as being done. Distributors, broadcasters, streaming services and sales agents usually require a package of materials, known as deliverables, listed in their contracts. Payments are often tied to delivery, so mistakes here can delay money.

Deliverables typically include the finished film in specified technical formats, such as a high-quality digital master and, for cinema release, a digital cinema package. They also normally include separate sound elements, including a music and effects track, which has the sound apart from the dialogue so that the film can be dubbed into other languages. Subtitles and closed captions are often required. Other items are legal and administrative: a chain of title, copies of key contracts and releases, music licences and cue sheets listing all music used, a credit list, certificates of insurance such as E&O, and a copy of the script. Marketing materials such as the trailer, key art, stills and a press kit are often included too.

Each buyer has its own technical specifications, which can differ by service and change over time, so a producer should read the delivery schedule in each contract carefully and budget for it from the start. Some of the cost, such as captioning and quality control checks, is easy to overlook.

Worked example: a distributor's contract lists a delivery schedule of 40 items. The producer builds a checklist, assigns each item to a person, and sets dates so that missing music licences are discovered before, not after, the film is due.`,
          },
          {
            id: L17,
            title: 'Marketing and Festival Strategy',
            blurb: 'Festivals can raise a film\'s profile and attract buyers, but a strategy is needed to choose the right ones and to use them well.',
            minutes: 7,
            body: `A film that nobody hears about cannot find an audience, so marketing is part of a producer's job even if a distributor handles most of it later. For many independent films, festivals are an important first step.

Festivals serve several purposes. They offer a public screening, press attention and a chance to meet buyers, sales agents and programmers. Some festivals are known as launch points for new work, such as Sundance, Cannes, Venice, Toronto and Berlin, while many smaller festivals serve specific regions, genres or communities and may suit a film better. Festivals usually ask for a submission fee, and they differ in how much they value premiere status, which means being the first public screening in a particular country or region. Because that status can matter to the top festivals, producers often plan the order of submissions carefully, as an early screening elsewhere may rule a film out of a later one.

A strategy begins with honest questions. Who is this film for? What would success look like: a sale, a distributor, critical notice, or simply an audience? Producers then choose festivals to match, prepare materials such as a trailer, stills and a synopsis, and consider hiring a publicist or sales agent. Costs for travel, publicity and screening formats should be in the budget.

A festival is not a guarantee of a sale, and many well-received films still struggle to find a buyer.

Worked example: a documentary about a regional craft submits first to a major festival and, if it is not selected, then to smaller festivals near communities that know the craft well, since a local audience can generate word of mouth.`,
          },
          {
            id: L18,
            title: 'Sales and Distribution at a Glance',
            blurb: 'Sales agents and distributors connect a finished film with audiences, taking fees in return for their work and risk.',
            minutes: 7,
            body: `Distribution is the business of getting a film in front of audiences, whether in cinemas, on television, on streaming services or physically. This lesson offers an overview; the Film Business course covers revenue flow and release models in more detail.

A distributor acquires rights to a film for certain territories and formats, for a specified period, and takes responsibility for releasing and marketing it. In exchange, the distributor typically keeps a share of revenue and recoups its expenses before paying the producer. A sales agent usually works on behalf of the producer, taking the film to buyers in various countries, often selling territory by territory and earning a commission. Some producers sell all rights to a single buyer, and others split them into separate deals.

Deals vary widely. A minimum guarantee is an advance a distributor pays against future earnings. A flat fee, or buyout, pays a single amount and the buyer keeps what the film earns. Other deals share revenue after costs. Producers should carefully read what expenses a distributor may deduct, how long the licence lasts and what rights are included, since these details determine how much money ever returns.

Self-distribution is another route, where the producer directly releases the film through online platforms or screenings. This keeps control, but the producer takes on the marketing work and cost.

Worked example: a producer is offered an advance of $100,000 (illustrative) by a distributor for a certain territory. Before accepting, she checks which fees come off the top, for how many years the rights last, and whether the distributor can sell the film on to others.`,
          },
        ],
      },
      {
        id: 'film-producing.t5',
        title: 'Different Paths and Producer Judgement',
        blurb: 'How producing differs between independent, studio, documentary and streaming work, and how risk judgement ties it all together.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L19,
            title: 'Independent and Studio Producing Compared',
            blurb: 'Independent producers assemble money film by film; studio producers work inside a company that finances and distributes.',
            minutes: 7,
            body: `Producers work in very different settings, and the setting changes nearly everything about the job. Two broad models are independent producing and studio producing, though real careers often cross between them.

An independent producer typically assembles each film separately. The producer finds a project, raises financing from many possible sources, assembles the cast and crew, and then looks for distribution, which may happen before shooting, during it or after the film is finished. The producer often owns or controls a larger share of the rights and of the creative direction, but also carries more personal financial and legal risk, and may spend years on a project that never closes its funding. Smaller budgets mean fewer resources and often multiple roles for the same person.

A studio producer works within, or under a deal with, a large company that develops, finances, produces and distributes films. The studio supplies money, infrastructure and a distribution network, and in return normally holds strong control over creative and business decisions, such as the budget, casting approvals and final cut. A producer may have an overhead or first-look deal with a studio, which commonly gives the studio first chance at the producer's projects in exchange for funding the producer's office. Studio films are generally made at larger budgets and aimed at wide release.

Neither path is simply better. Independents give more freedom with more uncertainty; studios give resources with more oversight. Many films today mix both: an independent producer may bring a project to a studio or a streaming service as a partner.

Worked example: an independent producer spends two years financing a drama, while a studio producer is handed a franchise sequel with a budget already approved and a release date already set.`,
          },
          {
            id: L20,
            title: 'Producing Documentaries',
            blurb: 'Documentary producing shares the basics of filmmaking but adds duties around access, consent, archival rights and fairness to real people.',
            minutes: 7,
            body: `Documentaries follow many of the same stages as other films, but the material comes from real life, so the producer's work has particular features.

Budgets and schedules are less predictable. A fiction film follows a script, but a documentary may discover its story while filming, so schedules are flexible and shooting may stretch over months or years. Producers often raise money in stages, using a short sample to attract further funding from grants, broadcasters, streaming services, foundations or individual supporters. Grants and similar sources may come with conditions about reporting and editorial independence, which should be understood before accepting.

Access and consent are central. Subjects need to understand how they will appear, and producers typically secure signed releases from participants and from owners of locations. Honest dealings matter ethically as well as legally: people who are not experienced with film may not realise how their words could be used. Many documentary-makers also consider how to treat vulnerable subjects with care and how to handle requests to see or change the film.

Archive material, such as old photographs, news footage and music, often needs to be licensed, which can be a large cost. In the United States, fair use may allow some use of copyrighted material without permission in certain circumstances, but it is a judgement based on the facts, not a guarantee, and many distributors and insurers ask for legal review. Producers should budget for licences and for clearance work.

Worked example: a documentary uses old home movies from a family archive. The producer gets a signed licence from the family and checks that any music in the background is also cleared.`,
          },
          {
            id: L21,
            title: 'Producing for Streaming at a Glance',
            blurb: 'Streaming services have changed how projects are commissioned, paid for and owned, and producers need to read those deals closely.',
            minutes: 6,
            body: `Streaming services, which deliver films and series over the internet, have become major buyers and commissioners of content. They have altered some of the usual patterns of producing, though practices differ between services and change quickly, so the points below describe tendencies rather than rules.

One difference is how a project is paid for. Under a traditional model a producer might raise financing, retain ownership of the film and license it to distributors for set periods. Streaming services may instead commission a project outright, paying the production costs plus a fee, and in return often taking broad rights, sometimes for many years or in perpetuity. This can provide certainty and let a producer finish a film with less financing risk, but the producer may share less in any later success, since earnings are fixed in the deal rather than tied to audience numbers. Services may also license finished films from festivals or sales agents, much like a conventional distributor.

Other points differ too. Services often hold detailed technical and delivery requirements. Data on how many people watched a title is often kept by the service rather than shared in detail, which affects how producers and creators judge success and negotiate. Release plans may favour a single launch date over a staged rollout.

Because the terms vary, producers should look at which rights are granted, for how long, what bonuses or back-end share exist, and who owns sequels and related products.

Worked example: a producer weighing two offers compares a commission with a guaranteed fee and no ownership against a licence that pays less but lets her keep the rights and sell elsewhere later.`,
          },
          {
            id: L22,
            title: 'Judgement and Risk: Putting It Together',
            blurb: 'A producer\'s real skill is making sound decisions with incomplete information, balancing story, money, people and law.',
            minutes: 7,
            body: `Every lesson in this course points to the same underlying skill: judgement under uncertainty. A producer rarely has all the facts, and the plan will change. The work is making reasonable decisions, early, and being honest when they need to change.

One useful habit is to treat risk in four steps: identify what could go wrong, estimate how likely and how costly it is, decide whether to avoid it, reduce it, insure it or accept it, and then monitor it. Risks come from many directions. Creative risks include a weak script or a poor fit between director and material. Financial risks include a budget that is too low, delayed funding or cost overruns. Legal risks include missing rights or unsigned agreements. Human risks include accidents, burnout and conflict. Market risks include a release that arrives when buyers have lost interest.

Another habit is to keep promises traceable: written agreements, honest budgets, clear credits and plain communication with investors. Trust is a producer's most important asset, because films are made by groups of people who are relying on one another and on the person in charge.

Finally, producers must know when to stop. Abandoning a project or restructuring a plan can be better than spending further on something that will not work.

Worked example: three weeks before a shoot, a lead actor drops out. The producer lists the options: delay, recast, rewrite, or cancel. She checks the contract, the insurance and the financiers' conditions, speaks openly with the director, and picks the option that best protects the people and money involved.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'film-producing',
    questions: [
      // L01
      tf(L01, 1, 1, 'A producer is mainly responsible for making a film possible and keeping it on track, while the director is mainly responsible for the creative vision on screen.', 0, 'Compare the two jobs.', 'This is a rough but widely used division: producers handle the project as a whole, directors the creative vision.'),
      mc(L01, 2, 1, 'Which stage comes first in the usual order of a film project?', ['Development', 'Post-production', 'Release', 'Production'], 'Think of what must exist before anything is shot.', 'Development turns an idea into a script and plan before planning, shooting, editing and release follow.'),
      mc(L01, 3, 2, 'On a tiny student film, the producer is also doing the scheduling, budget and location finding. What does this show?', ['Small productions often combine jobs that are split among many people on larger films', 'Producers are unnecessary on large films because departments divide the work', 'Producers rarely handle money, since the camera crew manages small budgets', 'Directors always take over these jobs on films with small crews'], 'Think about team size.', 'On small projects one person often covers several roles, while larger films divide them.'),
      mc(L01, 4, 2, 'Which question is closest to the producer\'s three basic concerns?', ['Can we afford and finish it?', 'Which lens will best suit the opening scene?', 'How should the lead actor deliver this line?', 'What colour should the costume be?'], 'Which is about practicality?', 'Producers focus on what is being made, whether it can be afforded and finished, and who will see it.'),
      mc(L01, 5, 3, 'Why do good producers need both creative and practical skills?', ['They must recognise a story worth telling and also say what it costs and who pays', 'Creative instincts matter only in development, after which spreadsheets take over', 'Practical skills matter only after release, once sales figures arrive', 'The two skills are unrelated, so producers hire separate people for each'], 'Consider both halves of the job.', 'The role joins story judgement with money, schedule and people management.'),
      // L02
      tf(L02, 1, 1, 'A producer credit means exactly the same set of duties on every film.', 1, 'Think about how titles vary.', 'Titles are used differently from one production to another, so duties and credits vary.'),
      mc(L02, 2, 1, 'Which role typically manages the budget and day-to-day logistics of a shoot?', ['Line producer', 'Festival programmer', 'Colourist', 'Publicist'], 'The title mentions a line.', 'The line producer turns the plan into a schedule and controls daily spending.'),
      mc(L02, 3, 2, 'Ben arranged the main investment for a small film. Which credit might he reasonably receive?', ['Executive producer', 'Director of photography', 'Script supervisor', 'Costume designer'], 'The title is often tied to money or the deal.', 'Executive producer often reflects a role connected to financing, rights or oversight.'),
      mc(L02, 4, 2, 'Which description best fits a creative producer?', ['Focuses on the story, script and artists', 'Handles only payroll taxes and union fringes', 'Drives the equipment trucks between locations', 'Mixes the final sound for cinema release'], 'Consider the word creative.', 'A creative producer concentrates on the material and the people shaping it.'),
      tf(L02, 5, 3, 'Because credits can be negotiated and carry prestige, producer titles are sometimes a matter of real contractual discussion.', 0, 'Credits matter to careers.', 'Titles can carry weight and are often negotiated, which is why they are discussed in deals.'),
      // L03
      mc(L03, 1, 1, 'What is development?', ['The stage where an idea becomes a script and plan strong enough to attract funding and talent', 'The stage when the finished film is shown at festivals and offered to buyers and distributors', 'The final sound mix, when dialogue, music and effects are balanced into a finished track', 'A collective agreement that sets minimum pay and hours for crew'], 'It happens early.', 'Development is the period before a film is approved to be made.'),
      tf(L03, 2, 1, 'Many projects that enter development never get made.', 0, 'Consider how often projects fail to find funding.', 'Most developed projects do not reach production, which is why development costs are a real risk.'),
      mc(L03, 3, 2, 'A producer wants to adapt a novel by a living author. What does she generally need?', ['A licence or other permission from the rights holder', 'Nothing, because published books are free for anyone to adapt into a film', 'Only an invitation from a major festival', 'A completion bond guaranteeing the finished adaptation will be delivered'], 'Think about who owns the book.', 'Adapting protected material requires permission from whoever holds the rights.'),
      mc(L03, 4, 3, 'Why might a producer test a story against questions about audience and cost during development?', ['To judge whether it can find an audience and be made at a workable price', 'To confirm that a studio will fund the film before any writer has been hired or paid', 'To satisfy a union rule that requires audience research before any script is approved', 'To decide on the poster artwork before any budget talks'], 'These questions are practical.', 'Early checks on audience, comparable films and cost help decide whether to commit more money.'),
      mc(L03, 5, 3, 'Why do producers often spread development risk across several projects?', ['Because most developed projects will not be made', 'Because every developed project must eventually be shot and released', 'Because development work is free and carries no financial risk at all', 'Because unions require producers to hold several projects at once'], 'Think about the odds.', 'Since many projects stall, producers diversify and seek outside development funding.'),
      // L04
      mc(L04, 1, 1, 'What does an option agreement give a producer?', ['The exclusive right, for a set period, to buy the rights at an agreed price', 'Permanent ownership of the material with no payment owed to the author', 'A guarantee of a cinema release by a named distributor', 'Permission to rewrite the material freely without asking the author'], 'It reserves something for a period.', 'An option lets a producer reserve the material while trying to raise money.'),
      tf(L04, 2, 1, 'If a producer does not exercise an option before it expires, the rights usually return to the owner.', 0, 'Options are temporary.', 'Unless the option is extended or exercised, the rights generally revert.'),
      mc(L04, 3, 2, 'What is the chain of title?', ['The documented trail showing rights passed properly from the creator to the production company', 'The order in which producers, directors and principal cast are listed in the credits', 'A list of every crew member hired, with their department, rate and start dates', 'The sequence of shooting days that moves the company from one location to the next'], 'It is about ownership paperwork.', 'It shows each transfer of rights, and financiers and insurers want it clean.'),
      mc(L04, 4, 2, 'A writer never signed an agreement for a script the production is using. What is the likely problem?', ['A gap in the chain of title that could delay a deal', 'No problem, because scripts written for a production are always free to use', 'The film becomes a union production by default', 'The budget top sheet must be redone using a different set of colours'], 'Think about proof of ownership.', 'Missing signed agreements create gaps that distributors and insurers may not accept.'),
      mc(L04, 5, 3, 'Why can an option be more attractive to a producer than buying the rights outright at the start?', ['It reserves the material without paying the full price before financing is found', 'It makes the eventual film cheaper to shoot because the crew accepts lower rates', 'It removes the need for a script because the novel is the shooting draft', 'It guarantees that well-known stars will join once it is signed'], 'Consider cash.', 'A smaller option fee lets the producer hold the project while raising money.'),
      // L05
      mc(L05, 1, 1, 'What is a package?', ['A script combined with key creative elements such as a director or lead actors', 'A shipping box of cameras, lights and grip equipment sent to a distant location', 'A union contract covering minimum pay, hours and benefits for the whole crew', 'A festival fee paid with a submission, plus the cost of promotional materials'], 'It bundles elements.', 'Packaging attaches key people to a script to make it more attractive to backers.'),
      tf(L05, 2, 1, 'A letter of interest from an actor is as binding as a signed contract.', 1, 'Compare interest with commitment.', 'A letter of interest is not a binding contract, though it can still help in a pitch.'),
      mc(L05, 3, 2, 'What do comparable films (comps) help a buyer judge?', ['What a project might earn', 'The weather likely on set during the shoot', 'Which crew members belong to a union', 'The number of shooting days needed'], 'Buyers think about money.', 'Comps give a sense of potential audience and revenue, if chosen honestly.'),
      mc(L05, 4, 2, 'Which is the best way to describe a pitch?', ['A short, clear presentation to persuade someone to read, fund or buy a project', 'A legal filing that registers ownership of the script with a copyright office', 'A final edit of the film prepared for review by a distributor or sales agent', 'A set of camera and lighting tests shot to show how the film will look'], 'It aims to persuade.', 'A pitch states the idea, audience, comparables and what the producer needs.'),
      mc(L05, 5, 3, 'Why is overstating who is attached to a project harmful?', ['It damages trust and can create legal problems', 'It makes the budget smaller and speeds up the schedule', 'It is a standard festival requirement for every submission', 'It automatically cancels any option held on the material'], 'Think about honesty.', 'Misleading backers can destroy relationships and may cause legal trouble.'),
      // L06
      mc(L06, 1, 1, 'What does a top sheet show?', ['A short summary of the major budget categories and the total', 'A list of every prop, costume and set piece used in the film', 'The order in which scenes will be shot across the schedule', 'The credit list showing producers, cast and department heads'], 'It is at the front.', 'The top sheet summarises the whole budget on one or two pages.'),
      mc(L06, 2, 1, 'Which costs are typically listed above the line?', ['Story and rights, producer, director and principal cast', 'Camera rentals, lighting kits and set construction costs', 'Crew wages for electricians, drivers and camera assistants', 'Catering, cleaning and equipment trucking for the shoot'], 'Think of the elements negotiated first.', 'Above-the-line costs cover key creative elements, while below-the-line covers physical production.'),
      tf(L06, 3, 2, 'Fringes are payroll taxes, benefits and similar charges added on top of salaries.', 0, 'They sit on top of pay.', 'Fringes can be a significant percentage of labour costs.'),
      mc(L06, 4, 2, 'A camera department line multiplies a daily rental rate by the number of shooting days. What does this show?', ['Line items are built from a rate and a quantity', 'Camera costs are a flat sum unaffected by the number of shooting days', 'The rental rate is fixed in advance', 'Equipment cost depends only on the camera chosen, never on time'], 'Think rate times quantity.', 'Each line item typically has a rate, a quantity and a total.'),
      mc(L06, 5, 3, 'Why must a budget be tied closely to the script?', ['A scene such as a night exterior with a crowd has real costs that must be shown', 'Financiers approve budgets faster when expensive scenes are left out until later', 'The budget replaces the script once financiers have approved the total cost', 'Only the director reads the budget, so it must match the shooting notes'], 'Scenes cost money.', 'Every demanding scene should appear in the budget or the plan will be unrealistic.'),
      // L07
      mc(L07, 1, 1, 'What is a contingency?', ['An amount set aside for unexpected costs', 'A union fee paid to guilds for each crew member', 'A festival entry cost charged when submitting the film', 'A schedule listing the shooting days in order'], 'Surprises happen.', 'A contingency is a reserve for genuine surprises.'),
      tf(L07, 2, 1, 'A contingency is meant to cover a budget that was too low from the start.', 1, 'What is it for?', 'It is for unexpected events, not for correcting a poor budget.'),
      mc(L07, 3, 2, 'A cost report typically compares which three things?', ['Budgeted, spent or committed so far, and the forecast final cost', 'Cast, crew and extras needed on each shooting day', 'Dawn, noon and dusk lighting at each exterior location', 'Script, treatment and pitch deck versions from development'], 'Think of money over time.', 'The comparison shows whether a production is over or under budget.'),
      mc(L07, 4, 2, 'What does a cash flow schedule show?', ['When money comes in and goes out', 'Who plays each role and when they are available', 'Which scenes are interior and which are exterior', 'Where the crew eats and who caters each day'], 'It is about timing of money.', 'Productions need money available at each point to pay people and deposits.'),
      mc(L07, 5, 3, 'A storm forces a reshoot costing $25,000 (illustrative). What should the producer do?', ['Use contingency if appropriate, record the change and check the remaining plan', 'Leave the cost off the report until the film is finished and the books are closed', 'Cancel the film at once, since an unplanned expense means the budget has failed', 'Delete the line from the cost report so the budget appears to remain on target'], 'Think about tracking.', 'Recording changes early keeps the forecast accurate and decisions timely.'),
      // L08
      mc(L08, 1, 1, 'What is a script breakdown?', ['A list of the elements each scene needs', 'A review of the finished film prepared for festival programmers', 'A union agreement covering script and writing credits', 'A marketing plan for the release of the film'], 'It splits the script into needs.', 'The breakdown identifies cast, props, locations and other elements for every scene.'),
      tf(L08, 2, 1, 'Scenes are commonly measured in eighths of a page.', 0, 'A page is split into parts.', 'Eighths of a page are a standard way to measure scene length.'),
      mc(L08, 3, 2, 'Why do breakdowns note interior or exterior and day or night?', ['They affect lighting, crew and scheduling', 'They set the age rating the film will receive', 'They decide the order in which credits appear', 'They determine the ticket price charged at cinemas'], 'Consider lighting and time.', 'These details influence how and when a scene can be shot.'),
      mc(L08, 4, 2, 'A scene reads, "A bus stops in the rain and Lena runs to catch it." Which element would the breakdown note?', ['Rain effects and a vehicle', 'Only the title and the page number of the scene', 'The composer and the music cues for the scene', 'The end credits and the distributor logos'], 'Look for physical elements.', 'Rain, a vehicle and likely extras and permits turn a short line into costs.'),
      mc(L08, 5, 3, 'What is the second main use of a breakdown besides scheduling?', ['Exposing costs a quick read might miss', 'Choosing which festivals will premiere the film', 'Writing the poster copy and the tagline', 'Setting the royalty rate for the screenwriter'], 'It helps budget accuracy.', 'A careful breakdown reveals hidden items such as animals, children or special effects.'),
      // L09
      mc(L09, 1, 1, 'What is a stripboard?', ['A tool arranging scenes into shooting days', 'A sound mixing desk used in the final mix', 'A tax form filed for crew payroll', 'A camera support used for tracking shots'], 'Each strip is a scene.', 'Strips representing scenes are moved to test shooting orders.'),
      tf(L09, 2, 1, 'Films are almost always shot in story order.', 1, 'Efficiency matters.', 'Scenes are grouped by location, cast and other factors instead.'),
      mc(L09, 3, 2, 'Why are scenes in one location usually grouped together?', ['To avoid moving the crew back and forth', 'Because the story takes place in only one setting', 'To reduce the overall length of the script pages', 'Because actors generally prefer to repeat the same scenes'], 'Think about moving trucks and gear.', 'Grouping saves set-up and travel time.'),
      mc(L09, 4, 2, 'What is weather cover?', ['An interior scene ready to shoot if bad weather ruins an exterior plan', 'A budget line reserved for umbrellas and tarpaulins', 'A rain machine hired to create stormy conditions on set', 'A cast clause that excuses actors from working in bad weather'], 'It is a backup scene.', 'Having an alternative scene prevents a lost day.'),
      mc(L09, 5, 3, 'What is a likely effect of adding more shooting days?', ['Crew and equipment costs rise', 'The script becomes shorter by several pages', 'The budget falls because costs are shared out', 'Insurance is cancelled automatically'], 'Time costs money.', 'Each additional day adds crew, gear and location costs.'),
      // L10
      mc(L10, 1, 1, 'What do union agreements typically set?', ['Minimum pay, hours, rest periods, safety rules and benefit contributions', 'The film story, including its ending, character names and the order of scenes', 'The poster design, trailer cut and release date chosen by the distributor', 'The festival schedule, premiere order and which awards a film may enter'], 'They protect workers.', 'Collective agreements set minimum terms that apply when a production signs on.'),
      tf(L10, 2, 1, 'Every film must use union crew.', 1, 'Consider low-budget films.', 'Many independent productions work non-union or use special agreements.'),
      mc(L10, 3, 2, 'Which union represents many directors in the United States?', ['Directors Guild of America', 'SAG-AFTRA, which covers performers', 'Writers Guild of America', 'Teamsters'], 'Look at the name.', 'The DGA represents directors and certain other roles, while the other groups represent different workers.'),
      mc(L10, 4, 2, 'What does a deal memo set out?', ['Pay, credit, dates and ownership of work', 'The ending of the film and the arc of each character', 'The festival lineup and the screening dates', 'The final sound mix and the music levels'], 'It is a hiring document.', 'Deal memos are signed before work begins.'),
      mc(L10, 5, 3, 'How might using a union agreement affect the schedule?', ['It may require meal breaks and minimum turnaround time between workdays', 'It removes the need for a schedule since the union assigns the days', 'It cuts script length because union writers limit the scenes', 'It bans night shoots, since union members may not work after dark'], 'Think about working hours.', 'Agreements typically include rest and meal rules that shape the day.'),
      // L11
      mc(L11, 1, 1, 'What does general liability insurance typically respond to?', ['Claims of injury or property damage to others', 'A weak script that fails to impress', 'A poor review from a critic that hurts box office takings', 'A late festival submission that misses the deadline'], 'It protects against claims.', 'It covers third-party injury or damage claims.'),
      tf(L11, 2, 1, 'Distributors commonly require errors and omissions insurance for a finished film.', 0, 'Think about legal claims in the film itself.', 'E&O protects against claims such as infringement or defamation and is commonly requested.'),
      mc(L11, 3, 2, 'Why does a producer ask a location owner for a certificate of insurance?', ['To confirm coverage and name parties as additional insured where needed', 'To choose the soundtrack and agree which songs may be played', 'To set the shooting days around when the owner prefers to host', 'To pay the crew through the owner so payroll taxes are handled'], 'It is proof.', 'Certificates document coverage and are a standard request.'),
      mc(L11, 4, 2, 'Which is an example of reducing a risk rather than insuring it?', ['Planning and rehearsing a stunt with specialists', 'Buying a policy and relying on it to cover any loss', 'Ignoring the hazard to save money', 'Adding extra budget for repairs so any accident can be paid for later'], 'Prevention versus transfer.', 'Risk management aims to prevent losses as well as transfer the cost.'),
      mc(L11, 5, 3, 'Why should entertainment insurance be discussed with a specialist broker?', ['Coverage, limits and exclusions vary', 'All entertainment policies are identical across insurers', 'Brokers set the shooting schedule for productions', 'Insurance for film is illegal without a union'], 'Details differ.', 'Exact terms vary, so expert advice helps avoid gaps.'),
      // L12
      mc(L12, 1, 1, 'What is a call sheet?', ['A document showing who is needed, where and when for the next shooting day', 'A list of the festivals the film has entered, with their deadlines', 'A treatment of the story, written to pitch to investors', 'A sound report logging each take and any noise problems'], 'It is sent the evening before.', 'It also lists scenes, weather and safety notes.'),
      tf(L12, 2, 1, 'Wrap includes returning rentals, closing accounts and collecting paperwork.', 0, 'It happens after the shoot.', 'Wrap tasks are part of the job and delays can cause disputes.'),
      mc(L12, 3, 2, 'What does the production report at the end of a day record?', ['What was shot, hours worked and any delays or incidents', 'The reviews the film earned from critics and audiences', 'The results of the festivals the film was entered into', 'The poster art and tagline chosen for the marketing plan'], 'It summarises the day.', 'It helps track progress and problems.'),
      mc(L12, 4, 2, 'Who typically runs the set to keep to the schedule?', ['The assistant director', 'The composer who writes the score', 'The colourist who grades the image', 'The publicist who handles press'], 'It is a directing-team role.', 'The assistant director manages the day.'),
      mc(L12, 5, 3, 'The crew shot six of seven planned scenes. What should the producer do?', ['Meet the director to decide how to catch up', 'Ignore the shortfall and hope the next days run faster', 'Cancel the film because a day was missed', 'Remove the missed scene from the script without asking anyone'], 'Respond early.', 'Dealing with a shortfall early keeps changes cheap.'),
      // L13
      mc(L13, 1, 1, 'Which concern is typical of a producer rather than a director?', ['Protecting the budget and schedule', 'Choosing how the lead actor delivers a key line', 'Framing a shot to suit the story', 'Selecting the lens type for a scene'], 'Think of practical limits.', 'Producers tend to guard budget, schedule and financiers\' interests.'),
      tf(L13, 2, 1, 'Tension between producer and director is natural and not necessarily a sign of failure.', 0, 'Their positions differ.', 'Different priorities create tension, and open communication keeps it healthy.'),
      mc(L13, 3, 2, 'What does final cut mean?', ['The right to determine the finished version of the film', 'The final day of principal photography on the main location', 'The final festival at which the film is screened', 'The last payment due to the crew after the wrap'], 'It concerns the edit.', 'Many directors do not hold it, and on studio films the studio often does.'),
      mc(L13, 4, 2, 'A director wants a costly crane shot mid-shoot. What is a constructive response?', ['Check costs and offer a cheaper alternative that achieves a similar effect', 'Refuse at once without discussion, since the budget cannot change', 'Approve it at once without checking, as the director has authority', 'Cancel the shoot day until the director withdraws the request'], 'Aim to solve the problem.', 'Collaboration on options respects both creative and budget limits.'),
      mc(L13, 5, 3, 'Why should the producer and director agree creative aims and limits early?', ['Later decisions then have a shared reference point', 'It removes any need for written contracts with the financiers', 'It prevents any change to the plan once agreed', 'It sets the release date for the finished film'], 'Think of shared rules.', 'Early agreement on budget, schedule and tone gives a basis for later choices.'),
      // L14
      tf(L14, 1, 1, 'Safety and fair treatment are part of a producer\'s responsibility.', 0, 'Authority brings duties.', 'Producers carry ethical and legal responsibility for those on the production.'),
      mc(L14, 2, 1, 'Which person is typically hired to help plan and supervise dangerous action?', ['A stunt coordinator', 'A location manager responsible for permits', 'A publicist handling press', 'A composer'], 'The name suggests action.', 'Stunt coordinators plan and supervise stunts.'),
      mc(L14, 3, 2, 'What event in October 2021 drew attention to weapons safety on set?', ['The death of cinematographer Halyna Hutchins during filming of Rust', 'A fire at a studio backlot that destroyed several sets', 'The cancellation of a major festival over a venue safety dispute', 'A budget overrun that forced a studio picture to stop early'], 'It involved a prop gun.', 'The incident prompted scrutiny of on-set weapons practices.'),
      mc(L14, 4, 2, 'Why do union agreements set rest periods?', ['Fatigue is a safety risk', 'To stretch the shoot over more weeks and raise crew costs', 'To reduce the length of the script', 'To avoid contracts with the crew'], 'Think about tired workers.', 'Long hours cause accidents, so rest rules are a safety measure.'),
      mc(L14, 5, 3, 'What is a sound ethical approach to depicting a real person?', ['Respect their dignity and avoid misleading portrayals', 'Invent any events that make for stronger drama without a second thought', 'Keep the project secret from them until release', 'Skip legal advice, since a real person cannot object to a film about them'], 'Treat real people fairly.', 'Producers should respect real people and take legal advice where appropriate.'),
      // L15
      mc(L15, 1, 1, 'What does "picture lock" mean?', ['No further changes to picture length are expected', 'The camera is locked off on a tripod for a shot', 'The film has been sold to a distributor or streamer', 'The script has been finalised and approved by financiers'], 'Later departments rely on it.', 'Sound, music and effects depend on a stable picture.'),
      tf(L15, 2, 1, 'Post-production often takes longer than the shoot itself.', 0, 'Many steps remain.', 'Editing, sound, music and effects usually take considerable time.'),
      mc(L15, 3, 2, 'Who adjusts the look of the image in grading?', ['A colourist', 'A gaffer', 'A script supervisor', 'A line producer'], 'The name gives a clue.', 'Colourists adjust colour and tone.'),
      mc(L15, 4, 2, 'Why are late changes after lock expensive?', ['They can affect many departments and facilities that keep charging', 'They reduce the size of the cast and the extras needed', 'They remove the music score that was already licensed', 'They cancel the insurance policy covering the production'], 'Think about knock-on effects.', 'Late changes ripple through sound, effects and delivery.'),
      mc(L15, 5, 3, 'A producer receives a note to trim a scene after sound work began. What should she check first?', ['The impact on sound and other departments', 'The dates of the festivals where the film might screen', 'The colours chosen for the poster and key art', 'The catering list for the next day of work'], 'Think about dependencies.', 'Checking knock-on effects avoids costly surprises.'),
      // L16
      mc(L16, 1, 1, 'What are deliverables?', ['The finished film and the supporting materials a buyer requires', 'Props and costumes used on set and returned to rental houses', 'Daily call sheets and production reports issued to the crew', 'Camera lenses and lighting gear rented from outside vendors'], 'They are handed over.', 'Delivery schedules list required materials, often tied to payment.'),
      tf(L16, 2, 1, 'A music and effects track lets a film be dubbed into other languages.', 0, 'It has no dialogue.', 'Having sound apart from dialogue makes dubbing possible.'),
      mc(L16, 3, 2, 'Which is a legal or administrative deliverable?', ['Chain of title and music cue sheets', 'The lens list and the camera test results', 'The weather report from each shooting day', 'The catering invoice and the crew meal records'], 'Look for paperwork.', 'Legal documents prove rights and list music use.'),
      mc(L16, 4, 2, 'Why should a producer read the delivery schedule early?', ['To budget and plan for every required item', 'To avoid shooting scenes that are hard to deliver', 'To choose which actors will play the leads', 'To cancel the festival run before it starts'], 'Plan ahead.', 'Delivery costs and deadlines are easy to overlook.'),
      mc(L16, 5, 3, 'A contract lists 40 deliverables. What is a sensible method?', ['Build a checklist with owners and dates', 'Wait for the buyer to ask', 'Deliver only the finished film and leave out the legal papers', 'Leave the music licences until long after the release date'], 'Organise the work.', 'Assigning each item prevents last-minute gaps such as missing music licences.'),
      // L17
      mc(L17, 1, 1, 'What is premiere status?', ['Being the first public screening in a given country or region', 'A union rank awarded to performers who work on major films', 'A budget category covering publicity and festival travel costs', 'A sound format used for cinema presentations of the finished film'], 'It concerns the first showing.', 'Some festivals value it highly.'),
      tf(L17, 2, 1, 'A festival screening guarantees a film will be sold.', 1, 'Many films struggle afterward.', 'Festivals can help but guarantee nothing.'),
      mc(L17, 3, 2, 'What should a festival strategy begin with?', ['Honest questions about audience and what success looks like', 'Printing posters and postcards for the first public screening', 'Choosing a camera format for the next project in production', 'Booking festival travel for the whole cast and crew at once'], 'Start with goals.', 'Strategy follows from audience and goals.'),
      mc(L17, 4, 2, 'Why might a smaller regional festival suit a film better than a major one?', ['It may match a specific community, genre or region', 'It always pays filmmakers a larger fee than major festivals do', 'It never charges a submission fee to any entrant', 'It ensures a distributor will buy the film'], 'Fit matters.', 'Smaller festivals can suit particular audiences.'),
      mc(L17, 5, 3, 'Why plan the order of festival submissions?', ['An early screening elsewhere may rule a film out of a festival that wants premieres', 'Festivals require submissions to be made in strict alphabetical order by name', 'The order of submissions sets the budget for the festival publicist and travel', 'The order of festivals approached determines the length of the final script'], 'Think about premiere rules.', 'Premiere requirements can make sequencing important.'),
      // L18
      mc(L18, 1, 1, 'What does a sales agent typically do?', ['Takes a film to buyers on behalf of the producer for a commission', 'Edits the film and prepares the final picture for buyers', 'Hires the crew and manages the daily budget on the shoot', 'Writes the script and revises it from financier notes'], 'The name suggests selling.', 'Sales agents sell territory by territory and earn a commission.'),
      tf(L18, 2, 1, 'A distributor typically recoups its expenses before paying the producer.', 0, 'Check the order of money.', 'Deals vary, but recoupment of costs is common.'),
      mc(L18, 3, 2, 'What is a minimum guarantee?', ['An advance a distributor pays against future earnings', 'A minimum crew size that union agreements require on set', 'The shortest running time a cinema will agree to screen', 'A union pay rate for performers on low budget films'], 'It is money up front.', 'It is an advance against earnings.'),
      mc(L18, 4, 2, 'What is a flat fee or buyout?', ['A single payment after which the buyer keeps what the film earns', 'A weekly salary paid to the producer during the shoot and post-production', 'A festival award given to the film with a cash prize attached', 'A tax credit that refunds part of the production spending'], 'One payment, no sharing.', 'The producer does not share in later earnings.'),
      mc(L18, 5, 3, 'What should a producer check before accepting an advance?', ['Deductible fees, length of the licence and rights included', 'The colour of the poster and the font used for the title', 'The caterer used on the shoot and the menus supplied', 'The camera model and lenses used to photograph the film'], 'Read the terms.', 'These details determine how much money ever returns.'),
      // L19
      mc(L19, 1, 1, 'Which is typical of an independent producer?', ['Assembles financing film by film', 'Always works inside a studio on salary', 'Never needs to raise any money', 'Only handles post-production work'], 'Think of building each project.', 'Independents often raise money separately for each film.'),
      tf(L19, 2, 1, 'Studios typically hold strong control over creative and business decisions on films they finance.', 0, 'Money brings control.', 'Budget, casting approvals and final cut are often studio decisions.'),
      mc(L19, 3, 2, 'What is a first-look deal?', ['A deal giving a studio first chance at a producer\'s projects', 'A rule about which film opens first in cinemas on a release weekend', 'A camera test done on the first morning of principal photography', 'A festival slot reserved for a film before it has been selected'], 'It concerns who sees projects first.', 'It commonly comes with funding for the producer\'s office.'),
      mc(L19, 4, 2, 'What is a trade-off of independent producing?', ['More freedom but more uncertainty and personal risk', 'No creative control because financiers choose every shot', 'Guaranteed funding from a studio before work begins', 'No contracts, because deals are made informally'], 'Compare freedom and risk.', 'Independents gain freedom but carry more risk.'),
      mc(L19, 5, 3, 'Why do many films mix both models?', ['An independent producer may bring a project to a studio or streamer as partner', 'Studios forbid any collaboration with independent producers by contract', 'Independent producers never need money once a studio is attached', 'Mixing the two models is required by law for films above a set budget'], 'Careers cross over.', 'Partnerships blend the models.'),
      // L20
      mc(L20, 1, 1, 'How do documentary schedules typically differ from fiction?', ['They are more flexible because the story may be found while filming', 'They are always shorter because there is no script to follow', 'They have no budget because the subjects appear for free', 'They need no crew because participants film themselves'], 'Real life is unpredictable.', 'Shooting may stretch over months or years.'),
      tf(L20, 2, 1, 'Producers typically secure signed releases from documentary participants.', 0, 'Consent matters.', 'Releases document permission, though ethics go beyond paperwork.'),
      mc(L20, 3, 2, 'Why must archive material often be budgeted for?', ['Licences for photographs, footage and music can be a large cost', 'Archive material is free to use because it is old and widely seen', 'It is illegal to use archive material in any documentary at all', 'Archive never needs clearing if the source is credited on screen'], 'Rights cost money.', 'Archival licensing is a major documentary cost.'),
      mc(L20, 4, 2, 'What is true of fair use in the United States?', ['It is a fact-based judgement, not a guarantee', 'It always allows any use of copyrighted material if credited', 'It never applies to documentaries made by independents', 'It replaces the need for insurance and legal review'], 'Case by case.', 'Distributors and insurers often ask for legal review.'),
      mc(L20, 5, 3, 'What should a producer understand before accepting grant money?', ['Conditions about reporting and editorial independence', 'The poster design and the title treatment for the film', 'The camera models the grant requires for shooting', 'The seating plan for the funder at the premiere'], 'Money may carry strings.', 'Conditions can affect creative freedom.'),
      // L21
      mc(L21, 1, 1, 'How may a streaming commission differ from a traditional licence?', ['The service may pay costs plus a fee and take broad rights', 'The producer always keeps every right and licenses it to the service', 'There is no budget since the service supplies gear', 'No contract is needed because the service owns the platform'], 'Think about ownership.', 'Commissions often trade ownership for certainty.'),
      tf(L21, 2, 1, 'Streaming practices are identical across all services and never change.', 1, 'Things vary and evolve.', 'Terms differ by service and change quickly.'),
      mc(L21, 3, 2, 'A fixed fee deal usually means which for the producer?', ['Less financing risk but fewer later earnings', 'More upside always, since earnings grow with viewing figures', 'No obligations to the service once the fee is paid', 'No delivery of materials, because the service already has the film'], 'Weigh certainty against upside.', 'Earnings may be fixed rather than tied to viewing.'),
      mc(L21, 4, 2, 'What should a producer compare when weighing two offers?', ['Rights granted, duration, bonuses and ownership of sequels', 'Only the poster design and artwork each service would produce', 'Only the crew size each offer would support on set', 'Only the premiere date proposed for each release'], 'Read the terms.', 'These details define the real value of a deal.'),
      mc(L21, 5, 3, 'Why might viewing data held by a service matter to producers?', ['It affects how success is judged and negotiated', 'It sets the weather conditions for the shoot', 'It replaces scripts as the basis of the budget', 'It reduces the insurance cost for the production'], 'Information is power in negotiation.', 'Limited data can make it harder to prove audience.'),
      // L22
      mc(L22, 1, 1, 'What is the core skill the course ends on?', ['Judgement under uncertainty', 'Memorising the credits of past films', 'Repairing cameras and lighting equipment', 'Typing speed and spreadsheet shortcuts'], 'Plans change.', 'Producers decide with incomplete information.'),
      tf(L22, 2, 1, 'A producer\'s most important asset includes trust built through honest dealings.', 0, 'Many people rely on one another.', 'Clear agreements and honest communication sustain collaboration.'),
      mc(L22, 3, 2, 'Which is the correct sequence for handling a risk?', ['Identify, estimate, decide how to treat, then monitor', 'Ignore, hope, forget and then repeat the cycle again', 'Insure first and then never review the policy or the risk again', 'Cancel the film and begin a new project instead'], 'Think of steps.', 'A simple cycle of identifying, estimating, treating and monitoring works.'),
      mc(L22, 4, 2, 'A lead actor drops out three weeks before the shoot. What is a sensible first step?', ['List options such as delay, recast, rewrite or cancel and check contracts and insurance', 'Keep the news from the financiers until the shoot is safely under way and then explain', 'Begin shooting on the planned date without the actor and fix it in post-production', 'Fire the director immediately, since the casting problem must be their fault'], 'Gather facts.', 'Weighing options against obligations protects people and money.'),
      mc(L22, 5, 3, 'Why might stopping a project sometimes be right?', ['Further spending on something that cannot work wastes money and effort', 'Stopping is always wrong, since every project must be finished', 'Projects must be completed, as abandoning one breaks all contracts', 'Stopping a project automatically ends every contract tied to it'], 'Consider sunk cost.', 'Good judgement includes knowing when to restructure or stop.'),
    ],
  },
};
