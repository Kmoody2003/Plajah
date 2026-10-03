import { mcq, type CoursePart } from '../../courseKit';

export const PART: CoursePart = {
  track: {
    id: 'med-g912.t5',
    title: 'Ethics, Emergencies and Careers',
    blurb: 'Medical ethics, first aid and CPR, the paths into clinical careers, and judging health claims.',
    level: 'ADVANCED',
    lessons: [
      {
        id: 'med-g912.l17',
        title: 'Medical Ethics: Principles and Consent',
        blurb: 'Autonomy, beneficence, nonmaleficence, justice and informed consent.',
        minutes: 9,
        asOf: '2026-10',
        anchors: [
          { kind: 'mesh', ref: 'Informed Consent', note: 'core ethical and legal doctrine' },
          { kind: 'mesh', ref: 'Confidentiality', note: 'duty of privacy' },
          { kind: 'concept', ref: 'four principles of biomedical ethics (Beauchamp and Childress)' },
          { kind: 'statute', ref: 'Health Insurance Portability and Accountability Act', note: 'US health privacy law' },
        ],
        body: `Medical ethics is the study of what clinicians should do when values compete. A widely taught framework, set out by Tom Beauchamp and James Childress, uses four principles. Autonomy is respect for a person right to make informed decisions about their own body. Beneficence is acting to benefit the patient. Nonmaleficence is avoiding harm, often summarized as first, do no harm. Justice is fairness in how benefits, burdens and scarce resources are distributed. The principles often pull against each other, and ethics is the work of weighing them in a specific case rather than applying any one automatically.

Informed consent puts autonomy into practice. For consent to be valid, the patient must have decision-making capacity, be given relevant information (the nature of the treatment, its risks and benefits, and reasonable alternatives including doing nothing), understand it, and decide voluntarily. A patient with capacity may refuse treatment even when clinicians believe refusal is unwise. Capacity is specific to a decision and is judged by whether the person can understand the information, appreciate how it applies to them, reason about options and express a choice. It is not the same as agreeing with the clinician. Minors generally need a parent or guardian to consent, with exceptions that vary by place and by type of care, so details differ by jurisdiction.

Exceptions to the need for consent include emergencies in which a patient is unable to decide and delay would risk serious harm; the law presumes that a reasonable person would consent. When a patient lacks capacity and has no prior wishes known, a surrogate decision-maker, usually a close family member, decides based on what the patient would have wanted, called substituted judgment, and otherwise on the patient best interests. Advance directives and living wills record choices ahead of time.

Confidentiality is the duty to protect patient information. In the United States, the HIPAA privacy rules limit how health information may be shared. Confidentiality has limits: reporting some infectious diseases, suspected child abuse, or a serious and specific threat to others may be required or permitted by law.

A worked example: an adult with capacity and a serious infection refuses antibiotics because of fear. The ethical response is not coercion but to explore the reason, correct misunderstandings, offer alternatives, document the discussion and respect the decision, while leaving the door open for the patient to change their mind.`,
      },
      {
        id: 'med-g912.l18',
        title: 'First Aid and Basic Life Support',
        blurb: 'What to do in the first minutes of bleeding, choking and cardiac arrest.',
        minutes: 9,
        asOf: '2026-10',
        anchors: [
          { kind: 'guideline', ref: 'American Heart Association, Cardiopulmonary Resuscitation and Emergency Cardiovascular Care, 2020', note: 'adult basic life support sequence' },
          { kind: 'mesh', ref: 'Cardiopulmonary Resuscitation', note: 'chest compressions and ventilation' },
          { kind: 'mesh', ref: 'Defibrillators', note: 'automated external defibrillator' },
          { kind: 'mesh', ref: 'First Aid', note: 'basic emergency care' },
        ],
        body: `First aid is the immediate care given before professional help arrives. Whatever the emergency, the first step is safety: check that the scene is safe for you before you approach, because a second casualty helps nobody. Then check responsiveness, call your local emergency number or have someone call, and send someone to fetch an automated external defibrillator (AED) if one is available. Training and certification from a recognized course are the best way to learn these skills, and this lesson is an overview, not a replacement.

Severe bleeding is controlled with firm, direct pressure on the wound using a clean cloth or dressing, without lifting it to check. If blood soaks through, add more material on top and keep pressing. For life-threatening limb bleeding that direct pressure cannot control, a tourniquet applied by a trained person can save life.

Choking occurs when the airway is blocked. If a person can cough forcefully, encourage coughing. If they cannot cough, speak or breathe, current first aid guidance for adults includes back blows and abdominal thrusts. Infants have different techniques, so formal training matters. If the person becomes unresponsive, call for help and begin CPR.

Cardiac arrest means the heart has stopped pumping effectively, so the brain and organs receive no oxygen. The person is unresponsive and not breathing normally (occasional gasping does not count). The key response is cardiopulmonary resuscitation (CPR). Chest compressions mimic the pump, and for adults they are delivered at the center of the chest, hard and fast, at a rate of about 100 to 120 per minute and a depth of about 5 to 6 cm (2 to 2.4 inches), allowing the chest to recoil fully, with minimal interruptions. Lay rescuers who are untrained may do compressions only; trained rescuers add rescue breaths in a ratio of 30 compressions to 2 breaths.

An AED analyzes the heart rhythm and delivers a shock only when it detects a shockable rhythm, such as ventricular fibrillation, in which the heart quivers chaotically. Pads are placed on the bare chest as shown on the device and voice prompts guide the rescuer. Early CPR and early defibrillation greatly improve survival, and for each minute of delay in defibrillation, the chance of survival drops substantially. Stay with the person until help arrives.

For other emergencies, remember the signs: face drooping, arm weakness and speech trouble suggest stroke, and every minute matters; call emergency services immediately.`,
      },
      {
        id: 'med-g912.l19',
        title: 'Becoming a Clinician',
        blurb: 'The training paths to physician, nurse, and other healthcare careers.',
        minutes: 8,
        asOf: '2026-10',
        anchors: [
          { kind: 'concept', ref: 'pathways to physician training in the United States' },
          { kind: 'concept', ref: 'nursing education pathways (LPN, RN, advanced practice)' },
          { kind: 'concept', ref: 'allied health professions' },
        ],
        body: `Healthcare is a team effort, and there are many ways into it. The details below describe the United States and vary elsewhere, and requirements change, so check current sources from schools and licensing boards.

To become a physician in the United States, a student typically completes an undergraduate degree with required science courses, takes the MCAT admissions exam, and applies to medical school, which is four years. The first years focus on basic science and the later years on clinical rotations through specialties. Graduates earn an MD (Doctor of Medicine) or a DO (Doctor of Osteopathic Medicine); both can be licensed to practice with full medical rights in all states, and DO training adds some emphasis on musculoskeletal manipulation. Next comes residency, a paid training position in a specialty that lasts about three years for primary care fields such as family medicine and longer for surgery and subspecialties. After residency, some pursue fellowship training. Throughout, licensing examinations and state licensure are required, and board certification demonstrates specialty competence. In total, this commonly spans a decade or more after high school.

Nursing has several routes. A licensed practical or vocational nurse completes a shorter program. A registered nurse earns an associate or bachelor degree in nursing and passes a national licensing exam. Advanced practice registered nurses, such as nurse practitioners, hold a graduate degree and can diagnose and treat patients with a scope of practice set by each state. Nurses spend more time at the bedside, carrying out care plans, monitoring patients, educating them and acting as their advocates.

Many other professions are essential. Physician assistants complete a master level program and practice with a team approach. Pharmacists hold a doctorate in pharmacy and are experts in drugs and interactions. Physical and occupational therapists restore function; respiratory therapists manage breathing support; medical laboratory scientists run diagnostic tests; paramedics and emergency medical technicians provide care in emergencies; dentists, psychologists and public health professionals also contribute. Biomedical scientists work in research on disease mechanisms and treatments, often with a PhD, and physician-scientists combine MD and PhD training.

For high school students, useful steps include strong science and math preparation, volunteering, shadowing clinicians, and learning basics such as CPR. Cost, workload and time are real factors, so exploring several careers helps match interests to a path.`,
      },
      {
        id: 'med-g912.l20',
        title: 'Judging Health Claims and Misinformation',
        blurb: 'How to evaluate sources, headlines and miracle cures.',
        minutes: 8,
        asOf: '2026-10',
        anchors: [
          { kind: 'mesh', ref: 'Health Literacy', note: 'ability to find and judge health information' },
          { kind: 'mesh', ref: 'Misinformation', note: 'false or misleading claims' },
          { kind: 'concept', ref: 'hierarchy of evidence' },
        ],
        body: `Health information is everywhere, and much of it is wrong, exaggerated or sold for profit. The skills of evidence-based medicine apply to everyday claims, and learning to question a claim is a form of care for yourself and others.

Start with the source. Who is making the claim, and what do they gain? Government health agencies, university medical centers and professional societies publish reviewed guidance and disclose their evidence. A person selling a supplement, a diet program or a device has a financial interest in persuading you. Check whether the author has relevant expertise, and whether independent experts agree. Be cautious of a lone voice contradicting a large body of research, though experts do sometimes revise their views as evidence changes.

Next, look at the type of evidence. A personal story, called an anecdote, is not a controlled test: people tend to try a remedy when symptoms are at their worst and to improve later by chance, which leads them to credit the remedy. Studies in cells or animals are early steps and often do not translate into benefits for people. Randomized trials and systematic reviews give stronger evidence. A headline that says a food causes or cures a disease often rests on an observational link that may be confounded.

Watch for warning signs. Claims of a cure for many unrelated diseases, a secret that doctors are hiding, reliance on testimonials, urgent pressure to buy, and no mention of side effects are marks of a scam. Real treatments have both benefits and risks, and honest sources discuss both. Be careful with numbers: a relative change, for example doubling a very small risk, can sound frightening or exciting while the absolute change is tiny.

Natural does not mean safe. Many drugs originate in plants, and some herbal products interact with prescribed medicines or harm the liver. Supplements in the United States are not required to prove effectiveness before sale. Also remember that a treatment that has not been tested is not proven useless, but it is not proven helpful either.

A worked example: an influencer claims a juice cleanse removes toxins. Ask what toxins, how they were measured, and whether a trial compared it with a control. The liver and kidneys already clear waste, and no good evidence shows that such cleanses add benefit. When in doubt, ask a pharmacist or clinician and check a trustworthy public health source.`,
      },
    ],
  },
  questions: [
    mcq('med-g912.l17', 1, 1, `Which ethical principle refers to respecting a patient right to make informed decisions about their own care?`,
      [`Autonomy`, `Justice`, `Beneficence`, `Nonmaleficence`], 0,
      `It concerns self-governance.`, `Autonomy is respect for the patient informed choice. Justice concerns fair distribution of resources, and beneficence concerns doing good.`),
    mcq('med-g912.l17', 2, 2, `Which element is required for valid informed consent?`,
      [`The patient has decision-making capacity and is told about the risks, benefits and alternatives`, `The clinician recommends the treatment and the patient does not object`, `A family member signs for any adult regardless of the adult ability to decide or wishes`, `The patient is told only the benefits of treatment, to avoid causing unnecessary anxiety`], 0,
      `Consider both who decides and what they are told.`, `Valid consent requires capacity, disclosure of relevant information including alternatives, understanding and voluntariness. Passive non-objection is not consent.`),
    mcq('med-g912.l17', 3, 2, `An unconscious adult arrives at an emergency department with a life-threatening bleed and no surrogate can be reached. How is treatment generally justified?`,
      [`By emergency exception, since delay would risk serious harm and a reasonable person would be presumed to consent`, `By the adult being presumed to refuse, since nobody has given permission, which forbids any treatment until a surrogate is found`, `By requiring a court order before any treatment may begin`, `By waiting until the patient regains consciousness before taking any action`], 0,
      `Think about what the law presumes when delay is dangerous.`, `The emergency exception allows treatment without explicit consent when a patient cannot decide and delay risks serious harm. A court order is not needed.`),
    mcq('med-g912.l17', 4, 3, `A 45-year-old with decision-making capacity declines a recommended operation after a thorough discussion of risks and benefits. Her surgeon believes the choice is mistaken. What is the ethically appropriate response?`,
      [`Respect the refusal, document the discussion, and continue to offer alternatives and support`, `Proceed with the operation because beneficence outweighs autonomy when the surgeon is certain`, `Call her family so they can authorize the operation over her objection`, `Declare that she lacks capacity because she disagreed with the surgeon`], 0,
      `Capacity is not the same as agreeing with the clinician.`, `A capable adult may refuse treatment, and disagreement alone does not show incapacity. Overriding the choice by involving family would violate autonomy.`),

    mcq('med-g912.l18', 1, 1, `What is the first thing a rescuer should do on finding a collapsed person?`,
      [`Check that the scene is safe, then check responsiveness and call for help`, `Begin rescue breaths at once, before checking the scene or the responsiveness of the person`, `Move the person to a car for transport to a hospital`, `Give food or drink to see if the person wakes up`], 0,
      `A rescuer must not become a second casualty.`, `Scene safety comes first, followed by responsiveness and calling for help. Beginning breaths immediately is not the first step.`),
    mcq('med-g912.l18', 2, 2, `For adult CPR, approximately what compression rate and depth are recommended?`,
      [`About 100 to 120 per minute, about 5 to 6 cm deep`, `About 60 to 80 per minute, about 1 to 2 cm deep`, `About 140 to 160 per minute, about 8 to 9 cm deep`, `About 30 per minute, about 3 cm deep`], 0,
      `Fast and hard, but not extreme.`, `Guidelines specify roughly 100 to 120 compressions per minute at about 5 to 6 cm. Shallow, slow compressions do not move enough blood.`),
    mcq('med-g912.l18', 3, 2, `What does an automated external defibrillator do when it analyzes a heart rhythm?`,
      [`It delivers a shock only if it detects a shockable rhythm such as ventricular fibrillation`, `It delivers a shock to every person regardless of rhythm to restart the heart at maximum energy`, `It records the rhythm but never delivers a shock`, `It replaces the need for chest compressions entirely`], 0,
      `The device decides whether a shock is appropriate.`, `AEDs shock only shockable rhythms; compressions are still needed because the device does not circulate blood.`),
    mcq('med-g912.l18', 4, 3, `A bystander finds an adult who is unresponsive, not breathing normally and only occasionally gasping. A defibrillator is nearby, and the bystander is untrained in rescue breaths. What is the best action?`,
      [`Call emergency services, start hard fast chest compressions, and have the AED brought and used`, `Wait to see whether the gasping improves before taking any action or the person starts to breathe normally again`, `Give only rescue breaths because compressions can harm the ribs`, `Raise the legs and give water to restore blood pressure`], 0,
      `Gasping is not normal breathing.`, `Occasional gasping can occur in cardiac arrest, so CPR should start. Compression-only CPR is acceptable for untrained rescuers, and waiting wastes critical minutes.`),

    mcq('med-g912.l19', 1, 1, `What is residency in the United States physician pathway?`,
      [`Paid, supervised specialty training taken after medical school`, `The first two years of undergraduate premedical study`, `The licensing exam taken before applying to medical school`, `A short volunteer program done in high school`], 0,
      `It comes after the MD or DO degree.`, `Residency is supervised, paid clinical training in a specialty after earning the degree. The admissions exam comes before medical school.`),
    mcq('med-g912.l19', 2, 2, `Which professional typically holds a doctorate focused on medication expertise and drug interactions?`,
      [`A pharmacist`, `A respiratory therapist`, `A registered nurse`, `A medical laboratory scientist`], 0,
      `Think about who dispenses and reviews medicines.`, `Pharmacists complete a doctorate in pharmacy and specialize in drugs. Respiratory therapists focus on breathing support instead.`),
    mcq('med-g912.l19', 3, 2, `Which statement about MD and DO physicians in the United States is most accurate?`,
      [`Both can be licensed to practice medicine in all states and train in residencies`, `Only MD physicians may prescribe medication, since DO graduates train as assistants`, `DO physicians are not allowed to perform surgery`, `DO training excludes any clinical rotations`], 0,
      `Look for the claim that treats both as full physicians.`, `MD and DO graduates can be licensed with full practice rights and attend residency. The claim that DOs cannot prescribe or operate is incorrect.`),
    mcq('med-g912.l19', 4, 3, `A student wants a clinical career with direct patient care, hands-on bedside work and a shorter route than medical school, but is open to later advancing to prescribing roles. Which path best fits?`,
      [`Becoming a registered nurse, with the option of graduate training to become a nurse practitioner`, `Becoming a pathologist directly after high school through a short certificate program`, `Becoming a medical researcher without any laboratory training or advanced degree`, `Becoming a hospital administrator who must hold a medical license`], 0,
      `Match each requirement of the student to a route.`, `Nursing offers bedside care and a stepwise route to advanced practice. Pathology requires a medical degree, and the other options do not meet the stated needs.`),

    mcq('med-g912.l20', 1, 1, `Why is a personal testimonial weak evidence that a remedy works?`,
      [`People often try remedies at their worst and improve by chance, crediting the remedy`, `Testimonials are always false and are written by the sellers of the remedy`, `A remedy cannot work if people share its results online`, `Testimonials cannot describe symptoms in any way`], 0,
      `Think about natural recovery.`, `Many illnesses improve on their own, so an anecdote cannot separate treatment effect from natural course or placebo. It is not necessarily false, only uncontrolled.`),
    mcq('med-g912.l20', 2, 2, `A website sells a supplement that it says cures cancer, diabetes and arthritis, and claims doctors hide the truth. Which feature is the strongest warning sign?`,
      [`A single product claimed to cure many unrelated serious diseases`, `The use of a clear photograph of the product`, `A statement of the manufacturer address`, `A listed ingredient with a Latin name`], 0,
      `Real treatments are specific.`, `A cure for many unrelated diseases is a classic mark of fraud. Photos, addresses and Latin names do not signal deception.`),
    mcq('med-g912.l20', 3, 2, `Which statement about natural remedies is most accurate?`,
      [`Natural does not mean safe, since some plant products harm the liver or interact with prescribed medicines`, `Natural products are always safer than any synthetic drug because they come from living organisms`, `Natural products cannot contain active chemicals because they are not manufactured`, `Natural products are tested like drugs before being sold in the United States`], 0,
      `Consider that many drugs originated in plants.`, `Plants contain active compounds that can cause harm or interactions. In the United States, supplements do not require proof of effectiveness before sale.`),
    mcq('med-g912.l20', 4, 3, `A headline says a new food doubles your risk of a rare disease. The underlying risk without the food is 1 in 10000. What is the most useful reading?`,
      [`The absolute risk rises to about 2 in 10000, a small absolute change despite sounding large`, `The risk rises to 1 in 2, which is a very high chance of developing the disease`, `The risk is unchanged because rare diseases cannot be affected by diet of any food`, `The headline proves that the food causes the disease`], 0,
      `Compare relative and absolute change.`, `Doubling 1 in 10000 gives 2 in 10000, so the absolute increase is tiny. Observational links can also be confounded, so causation is not shown.`),
  ],
};
