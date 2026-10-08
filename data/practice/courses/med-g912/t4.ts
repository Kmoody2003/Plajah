import { mcq, type CoursePart } from '../../courseKit';

export const PART: CoursePart = {
  track: {
    id: 'med-g912.t4',
    title: 'Diagnosis, Populations and Evidence',
    blurb: 'Vitals, labs and imaging; epidemiology; and how medicine decides what works.',
    level: 'ADVANCED',
    lessons: [
      {
        id: 'med-g912.l13',
        title: 'Vital Signs and Laboratory Tests',
        blurb: 'The measurements clinicians start with, and how to read a test result.',
        minutes: 9,
        asOf: '2026-10',
        anchors: [
          { kind: 'mesh', ref: 'Vital Signs', note: 'temperature, pulse, respiration, blood pressure' },
          { kind: 'mesh', ref: 'Reference Values', note: 'normal ranges vary by lab' },
          { kind: 'mesh', ref: 'Sensitivity and Specificity', note: 'test performance' },
        ],
        body: `Diagnosis begins with a history (what the patient reports), a physical examination, and vital signs. The classic vital signs are temperature, heart rate (pulse), respiratory rate, blood pressure and oxygen saturation, often measured with a finger sensor called a pulse oximeter. Typical resting adult values are approximate and vary with age and fitness: heart rate about 60 to 100 beats per minute, respiratory rate about 12 to 20 breaths per minute, oral temperature about 36.5 to 37.5 C, and oxygen saturation 95 percent or higher in most healthy people. Trends matter more than single numbers, and a normal-looking value can be abnormal for a particular person.

Laboratory tests measure chemicals and cells in blood, urine and other samples. The complete blood count counts red cells, white cells and platelets, and gives hemoglobin. Low hemoglobin means anemia, a raised white cell count often suggests infection or inflammation, and low platelets raise bleeding risk. A basic metabolic panel reports sodium, potassium, glucose, creatinine and others; creatinine is a muscle waste product cleared by the kidneys, so a rise suggests reduced kidney filtration. Liver enzymes such as ALT rise when liver cells are injured. Troponin, a protein inside heart muscle cells, rises in blood when those cells die, which makes it central to diagnosing heart attack. Reference ranges are statistical and differ between laboratories, so results are always read against the range printed for that lab.

No test is perfect, so two properties describe how good it is. Sensitivity is the fraction of people with the disease who test positive; a highly sensitive test rarely misses disease and is useful for ruling it out when negative. Specificity is the fraction of people without the disease who test negative; a highly specific test rarely gives false alarms and is useful for ruling disease in when positive.

The meaning of a result also depends on how common the disease is. Suppose a test is 95 percent sensitive and 95 percent specific, and the disease affects 1 in 1000 people. Testing 100000 people finds 100 with disease, of whom 95 test positive, but 99900 are healthy and 5 percent, about 4995, test falsely positive. Only about 2 percent of positives are true. This is why screening a low-risk population produces many false positives, and why tests are interpreted alongside the patient story.`,
      },
      {
        id: 'med-g912.l14',
        title: 'Medical Imaging',
        blurb: 'X-ray, CT, MRI, ultrasound and nuclear imaging: what each shows and its risks.',
        minutes: 8,
        asOf: '2026-10',
        anchors: [
          { kind: 'mesh', ref: 'Diagnostic Imaging', note: 'modalities and uses' },
          { kind: 'concept', ref: 'ionizing radiation exposure from imaging' },
        ],
        body: `Imaging lets clinicians see inside the body without surgery. Each method uses a different physical signal, and so each is good at different questions and carries different risks.

Plain X-rays use ionizing radiation passing through the body. Dense tissues such as bone absorb more and appear white, while air in the lungs appears black. A chest X-ray is quick and cheap and shows pneumonia, some heart size changes, and fractures are shown on limb films. Its weakness is that it flattens a three-dimensional body into one image and shows soft tissue poorly.

Computed tomography (CT) takes many X-ray measurements from different angles and reconstructs cross-sectional slices. It is fast, which makes it valuable in trauma and for suspected stroke bleeding, and excellent for bone, lung and bleeding. It uses a larger radiation dose than a plain film. Contrast dye can improve blood vessel and organ detail, but it can cause allergic reactions or harm kidneys in vulnerable patients.

Magnetic resonance imaging (MRI) uses strong magnetic fields and radio waves to detect the behavior of hydrogen atoms, mostly in water and fat. It involves no ionizing radiation and gives superb soft-tissue detail of brain, spinal cord, joints and ligaments. It is slower, noisy, expensive, and unsafe near certain metal implants or devices because of the magnet, so patients are screened first.

Ultrasound uses high-frequency sound waves that reflect from tissue boundaries. It is radiation-free, portable and shows motion in real time, so it is the standard first tool for the fetus in pregnancy, gallbladder, heart (echocardiography) and blood flow. It struggles with air and bone, which block sound.

Nuclear imaging such as PET uses a small amount of a radioactive tracer that accumulates where metabolism is high, so it can reveal active tumors or brain activity patterns. Choosing a test is a risk-benefit decision. For example, a pregnant patient with abdominal pain might get ultrasound first to avoid radiation. Radiation from medical imaging adds a small lifetime cancer risk, so tests should be ordered when their expected benefit justifies it.`,
      },
      {
        id: 'med-g912.l15',
        title: 'Public Health and Epidemiology',
        blurb: 'Measuring disease in populations and preventing it at scale.',
        minutes: 9,
        asOf: '2026-10',
        anchors: [
          { kind: 'mesh', ref: 'Epidemiology', note: 'study of disease distribution' },
          { kind: 'mesh', ref: 'Herd Immunity', note: 'population-level protection' },
          { kind: 'concept', ref: 'incidence versus prevalence' },
          { kind: 'concept', ref: 'basic reproduction number R0' },
        ],
        body: `Public health aims to protect and improve health across whole populations. Its core science is epidemiology, the study of how often diseases occur, who gets them, and why. Two basic measures are easily confused. Incidence is the number of new cases in a population over a period of time. Prevalence is the number of existing cases at a point in time. A long-lasting, treatable disease like type 2 diabetes can have high prevalence even when incidence is modest, because people live with it for many years. A disease that is rapidly fatal or rapidly cured has prevalence close to incidence.

Epidemiologists compare groups to find causes. A cohort study follows people with and without an exposure forward in time and compares who develops disease. A case-control study starts with people who have a disease and similar people who do not, and looks back at exposures; it is efficient for rare diseases. Relative risk compares the chance of disease in exposed versus unexposed groups, and an odds ratio is used in case-control designs.

A major challenge is confounding. Coffee drinkers may have higher lung cancer rates, but the reason is that many coffee drinkers also smoke. Smoking is a confounder: linked to both the exposure and the outcome. Correlation does not prove causation. Evidence for causation grows when the association is strong, consistent across studies, has the exposure before the outcome, shows a dose-response pattern, and has a plausible mechanism.

For infectious disease, the basic reproduction number, R0, is the average number of people one case infects in a fully susceptible population. If R0 is above 1, the outbreak grows. Immunity in a population lowers the effective reproduction number. Herd immunity means enough people are immune that spread is limited and some unprotected people are indirectly shielded. The rough threshold is 1 minus 1 over R0, so a pathogen with R0 of 12, as often cited for measles, needs coverage near 92 percent, whereas one with R0 of 2 needs about 50 percent.

Prevention operates at several levels: primary prevention stops disease before it starts (vaccination, clean water, tobacco control), secondary prevention detects disease early (screening), and tertiary prevention reduces harm from established disease (rehabilitation). Tools include surveillance, contact tracing, sanitation, vaccination programs and health education.`,
      },
      {
        id: 'med-g912.l16',
        title: 'Evidence-Based Medicine and Trial Design',
        blurb: 'How to tell whether a treatment works, and how studies mislead.',
        minutes: 10,
        asOf: '2026-10',
        anchors: [
          { kind: 'mesh', ref: 'Randomized Controlled Trials as Topic', note: 'trial design' },
          { kind: 'mesh', ref: 'Evidence-Based Medicine', note: 'core concept' },
          { kind: 'mesh', ref: 'Placebo Effect', note: 'controls and blinding' },
          { kind: 'mesh', ref: 'Publication Bias', note: 'distortion of the literature' },
        ],
        body: `Evidence-based medicine combines the best available research with clinician expertise and the values and circumstances of the patient. It exists because plausible ideas often fail: treatments that seem sensible by mechanism or experience can be useless or harmful, and many illnesses improve on their own, so recovery after a treatment does not show the treatment caused it.

The strongest design for testing a treatment is the randomized controlled trial. Participants are randomly assigned to treatment or a comparison group, so known and unknown differences such as age, severity or lifestyle are spread out by chance rather than by choice. This is what lets a difference in outcome be attributed to the treatment. Comparison is made with placebo, an inactive look-alike, or with the current standard treatment. Blinding keeps participants, and in double-blind trials also the researchers assessing outcomes, from knowing who got which, to prevent expectations from shaping results. The placebo effect, real improvement in symptoms from the expectation of benefit, is why uncontrolled reports of improvement are unreliable.

Observational studies cannot randomize, so confounding is a risk. They are essential when randomization is unethical or impractical, such as testing whether smoking causes cancer. A systematic review gathers all studies on a question using a stated method, and a meta-analysis statistically pools their results, usually sitting at the top of the evidence hierarchy if the underlying studies are sound.

Trials can mislead. A small sample gives imprecise results, and chance can produce differences. A p-value tells how surprising the data would be if the treatment truly had no effect; by convention, below 0.05 is called statistically significant, but significance is not the same as importance, and a tiny effect can be significant in a huge trial. Confidence intervals show the plausible range of the effect. Other problems include dropouts, short follow-up, surrogate outcomes (improving a lab number instead of how people feel or live), and publication bias, where positive trials are published more than negative ones.

Reading effects needs care. If a drug cuts the risk of an event from 2 percent to 1 percent, the relative risk reduction is 50 percent, which sounds impressive, but the absolute risk reduction is 1 point, and about 100 people must be treated for one to benefit. The number needed to treat is 1 divided by the absolute risk reduction.`,
      },
    ],
  },
  questions: [
    mcq('med-g912.l13', 1, 1, `Which blood protein is a key marker of heart muscle cell death in suspected heart attack?`,
      [`Troponin`, `Creatinine`, `Alanine aminotransferase`, `Hemoglobin`], 0,
      `It is released from damaged cardiac muscle.`, `Troponin leaks from injured cardiac muscle cells. Creatinine reflects kidney filtration, and ALT reflects liver cell injury.`),
    mcq('med-g912.l13', 2, 1, `A test that rarely misses people who have the disease is described as having high what?`,
      [`Sensitivity`, `Specificity`, `Prevalence`, `Incidence`], 0,
      `It is about the true positives among those who have the disease.`, `Sensitivity is the fraction of diseased people who test positive. Specificity concerns healthy people testing negative.`),
    mcq('med-g912.l13', 3, 2, `A rising serum creatinine on repeat blood tests most directly suggests which problem?`,
      [`Reduced kidney filtration`, `Reduced platelet production`, `Increased insulin secretion`, `Decreased red cell production`], 0,
      `Creatinine is cleared by the kidneys.`, `Creatinine is a muscle waste product filtered by the kidneys, so a rise suggests reduced filtration. Platelets and red cells are measured on a blood count instead.`),
    mcq('med-g912.l13', 4, 3, `A screening test has 95 percent sensitivity and 95 percent specificity and is applied to a population where the disease affects 1 in 1000. Why will most positive results be false?`,
      [`Because healthy people vastly outnumber diseased people, so the small false positive rate yields many more false alarms than true cases`, `Because 95 percent sensitivity means that 95 percent of positives are false`, `Because specificity falls automatically when disease prevalence is low`, `Because screening tests always give positive results in healthy people`], 0,
      `Estimate how many healthy people there are and how many fall into the 5 percent.`, `With 99900 healthy people, 5 percent false positives is about 5000, much larger than about 95 true positives. Specificity is a property of the test and does not itself change with prevalence.`),

    mcq('med-g912.l14', 1, 1, `Which imaging method uses no ionizing radiation and is commonly used first to examine a fetus?`,
      [`Ultrasound`, `Computed tomography`, `Plain X-ray`, `PET scanning`], 0,
      `It uses sound waves.`, `Ultrasound relies on reflected sound and is the standard first-line fetal imaging tool. CT, X-ray and PET all involve ionizing radiation.`),
    mcq('med-g912.l14', 2, 2, `Why must patients be screened for certain metal implants before MRI?`,
      [`The MRI scanner uses a very strong magnetic field that can move or heat some metal devices`, `The scanner emits high doses of ionizing radiation that metal reflects back onto the patient skin`, `The metal absorbs sound waves and distorts the ultrasound image`, `Metal causes allergic reactions to the contrast dye used in every MRI and clots the dye in blood vessels`], 0,
      `Recall what makes MRI work.`, `MRI uses a powerful magnet and radio waves, so some implants are unsafe. It does not use ionizing radiation, and contrast dye is not used in every scan.`),
    mcq('med-g912.l14', 3, 2, `A patient arrives after a head injury and the clinician needs the fastest test to look for bleeding inside the skull. Which is most appropriate?`,
      [`A CT scan of the head`, `A PET scan with a tracer`, `An ultrasound of the skull surface`, `A plain X-ray of the neck only`], 0,
      `Choose speed and sensitivity for blood and bone.`, `CT is quick and detects acute bleeding and fractures well, which is why it is used in head trauma. Ultrasound waves are blocked by bone.`),
    mcq('med-g912.l14', 4, 3, `A healthy pregnant woman has right-sided abdominal pain. Which approach best weighs risk and benefit for the first imaging step?`,
      [`Ultrasound first, because it avoids radiation and can answer many abdominal questions`, `CT first, because it always gives the clearest image regardless of radiation exposure`, `PET first, because it shows metabolic activity of the appendix and avoids any need for sound waves`, `No imaging ever, because every imaging method is harmful during pregnancy`], 0,
      `Which tool is radiation-free and widely available?`, `Ultrasound is the usual first choice. Absolutely refusing all imaging is wrong because other methods such as MRI can be used if needed.`),

    mcq('med-g912.l15', 1, 1, `What does prevalence measure?`,
      [`The number of existing cases at a point in time`, `The number of new cases over a period`, `The average number of people infected by one case`, `The fraction of deaths among all cases`], 0,
      `Think of a snapshot.`, `Prevalence counts existing cases at a point in time. New cases over a period define incidence.`),
    mcq('med-g912.l15', 2, 2, `Which study design starts with people who already have a disease and compares them with similar people without it?`,
      [`Case-control study`, `Randomized controlled trial`, `Cohort study`, `Systematic review`], 0,
      `It works backward from the outcome.`, `Case-control studies identify cases and controls, then look back at exposures. A cohort study follows exposed and unexposed people forward.`),
    mcq('med-g912.l15', 3, 2, `A pathogen has a basic reproduction number R0 of 4. Using the simple threshold formula, roughly what fraction of the population must be immune to stop sustained spread?`,
      [`About 75 percent`, `About 25 percent`, `About 40 percent`, `About 90 percent`], 0,
      `The threshold is 1 minus 1 over R0.`, `1 - 1/4 = 0.75. The 25 percent value is just 1/R0, which is the susceptible fraction, not the immune fraction.`),
    mcq('med-g912.l15', 4, 3, `A study finds that people who carry lighters have higher rates of lung cancer. What is the best interpretation?`,
      [`Smoking is a confounder linked to both lighter carrying and lung cancer, so lighters are unlikely to be causal`, `Lighters emit chemicals that directly cause lung cancer at the same rate as tobacco smoke in people who never smoke`, `Lung cancer causes people to carry lighters, which proves reverse causation and explains the whole association`, `The association proves that carrying objects in the pocket raises cancer risk`], 0,
      `Ask what third factor leads to both.`, `Smoking explains both lighter carrying and lung cancer, so the association is confounded. Reverse causation is implausible because lighters are typically carried before disease appears.`),

    mcq('med-g912.l16', 1, 1, `What is the main purpose of random assignment in a clinical trial?`,
      [`To balance known and unknown differences between groups by chance`, `To guarantee that every participant improves on the study drug during follow-up`, `To make sure participants know which treatment they get`, `To increase the number of participants who drop out`], 0,
      `It addresses confounding.`, `Randomization spreads participant characteristics by chance so outcome differences can be attributed to the treatment. It cannot guarantee improvement.`),
    mcq('med-g912.l16', 2, 2, `Which statement about a p-value below 0.05 is most accurate?`,
      [`The observed data would be fairly surprising if the treatment truly had no effect`, `The treatment is proven to work in every patient who was enrolled in the trial`, `There is a 95 percent chance the treatment effect is clinically important`, `The trial must have been free of bias, confounding and measurement error`], 0,
      `A p-value is about the data under the no-effect assumption.`, `The p-value gives how surprising the data are under no effect; it says nothing about importance or bias. A statistically significant result can still be clinically trivial.`),
    mcq('med-g912.l16', 3, 2, `A drug reduces the risk of an event from 4 percent to 3 percent. What is the number needed to treat?`,
      [`100`, `4`, `25`, `1`], 0,
      `Divide 1 by the absolute risk reduction.`, `Absolute risk reduction is 1 percentage point, or 0.01, so NNT is 100. A 25 percent relative reduction could tempt the answer 25 or 4.`),
    mcq('med-g912.l16', 4, 3, `A trial of a new cholesterol drug reports that the drug lowers a blood lab value more than placebo but does not report whether heart attacks or deaths changed. What is the key limitation?`,
      [`It used a surrogate outcome, so benefit on patient-centered outcomes is not shown`, `It lacked a placebo group, so improvement cannot be attributed to the drug alone`, `It used randomization, which prevents any claim about the lab value`, `It measured too many participants, which makes the p-value invalid`], 0,
      `Compare a lab number with what patients actually care about.`, `Improving a lab value does not guarantee fewer heart attacks, so surrogate endpoints need caution. The trial did have a placebo group, so the second option contradicts the stem.`),
  ],
};
