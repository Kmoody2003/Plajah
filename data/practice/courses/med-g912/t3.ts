import { mcq, type CoursePart } from '../../courseKit';

export const PART: CoursePart = {
  track: {
    id: 'med-g912.t3',
    title: 'Common Diseases and How Drugs Work',
    blurb: 'Diabetes, hypertension, heart disease and asthma, then the principles of pharmacology.',
    level: 'INTERMEDIATE',
    lessons: [
      {
        id: 'med-g912.l09',
        title: 'Diabetes Mellitus',
        blurb: 'A failure of insulin signalling and why high glucose damages the body.',
        minutes: 9,
        asOf: '2026-10',
        anchors: [
          { kind: 'mesh', ref: 'Diabetes Mellitus, Type 1', note: 'autoimmune insulin deficiency' },
          { kind: 'mesh', ref: 'Diabetes Mellitus, Type 2', note: 'insulin resistance' },
          { kind: 'drug', ref: 'insulin', note: 'replacement therapy' },
          { kind: 'drug', ref: 'metformin', note: 'common first-line oral drug in type 2 diabetes' },
          { kind: 'guideline', ref: 'American Diabetes Association, Standards of Care in Diabetes, 2026', note: 'diagnostic thresholds and goals' },
        ],
        body: `Diabetes mellitus is a group of conditions in which blood glucose stays too high because of too little insulin or because tissues respond poorly to it. Insulin is the hormone that lets muscle and fat cells take up glucose and tells the liver to store it, so without its action glucose builds up in blood while cells are starved.

In type 1 diabetes, the immune system destroys the beta cells of the pancreas, so the body makes little or no insulin. It often starts in childhood or young adulthood, and people need insulin therapy for life. Without insulin, the body breaks down fat for fuel and produces acidic ketones. This can lead to diabetic ketoacidosis, a medical emergency with nausea, rapid deep breathing, abdominal pain and confusion.

In type 2 diabetes, the main problem begins as insulin resistance: tissues respond less to insulin, so the pancreas compensates by making more. Over years the beta cells can tire and insulin output falls. Risk factors include excess body fat (especially around the abdomen), physical inactivity, family history and age. It is much more common than type 1. Lifestyle change is the foundation of management, and drugs such as metformin, which reduces liver glucose output and improves insulin sensitivity, are widely used, with insulin added when needed. Other drug classes also exist and the choice depends on the person, which is a decision for clinicians.

Diagnosis uses blood tests. Widely used thresholds, which are approximate and require confirmation in the absence of clear symptoms, are a fasting plasma glucose of 126 mg/dL or higher, or hemoglobin A1c of 6.5 percent or higher. A1c reflects average glucose over roughly the past two to three months, because glucose attaches to hemoglobin in red cells that live about 120 days.

Chronic high glucose damages small and large vessels. This causes diabetic retinopathy (eye), nephropathy (kidney), neuropathy (nerve), and raises the risk of heart attack and stroke. Good glucose control, blood pressure control and regular screening reduce complications. Too much insulin relative to food causes the opposite emergency, hypoglycemia, with sweating, shakiness and confusion.`,
      },
      {
        id: 'med-g912.l10',
        title: 'Hypertension and Heart Disease',
        blurb: 'Why high pressure silently harms vessels and how atherosclerosis causes heart attacks.',
        minutes: 9,
        asOf: '2026-10',
        anchors: [
          { kind: 'mesh', ref: 'Hypertension', note: 'definition and consequences' },
          { kind: 'mesh', ref: 'Atherosclerosis', note: 'plaque formation' },
          { kind: 'mesh', ref: 'Myocardial Infarction', note: 'acute coronary event' },
          { kind: 'guideline', ref: '2025 AHA/ACC, High Blood Pressure in Adults', note: 'current US blood pressure categories; replaced the 2017 guideline' },
          { kind: 'drug', ref: 'atorvastatin', note: 'statin example for LDL lowering' },
        ],
        body: `Hypertension means persistently high arterial blood pressure. It is usually silent for years, which is why it is called a silent killer. Blood pressure is written as systolic over diastolic: systolic is the peak pressure when the ventricle contracts and diastolic is the pressure between beats. In the United States, the 2025 AHA/ACC guideline defines hypertension as 130/80 mm Hg or higher, keeping the categories introduced in 2017 (normal below 120/80, elevated 120 to 129 with diastolic below 80, stage 1 130 to 139 or 80 to 89, stage 2 140/90 or higher); other guidelines use 140/90, so the exact cutoff depends on the guideline body. Diagnosis needs repeated measurements, because single readings vary with stress and technique.

Most hypertension is primary, with no single cause, and involves genetics, excess sodium intake, excess weight, inactivity, alcohol and age. Secondary hypertension has an identifiable cause, such as kidney disease or hormone-producing tumors. The harm is mechanical: pressure injures artery walls, thickens the left ventricle, and over time contributes to stroke, heart failure, kidney failure and eye damage. Treatment combines lifestyle measures, such as lower sodium, weight loss, exercise and limited alcohol, with drugs from several classes, including diuretics, ACE inhibitors, angiotensin receptor blockers, calcium channel blockers and beta blockers.

Coronary artery disease is the build-up of plaque in the arteries feeding the heart, a form of atherosclerosis. Plaque begins when LDL cholesterol enters a damaged artery wall, is taken up by macrophages, and causes chronic inflammation. A plaque can narrow the artery, and when it narrows enough, exertion causes chest pain called angina because demand outstrips supply. If a plaque ruptures, a clot forms rapidly and can block the artery, cutting off oxygen to the heart muscle supplied by it. This is a myocardial infarction, or heart attack, and heart muscle dies in a time-dependent way, so speed of treatment matters.

Risk factors include high LDL, hypertension, smoking, diabetes, family history, obesity and inactivity. Statins such as atorvastatin lower LDL by blocking a liver enzyme (HMG-CoA reductase) in cholesterol synthesis, and their benefit in lowering heart attack risk is well established. Prevention focuses on not smoking, healthy eating, activity, and treating pressure, glucose and cholesterol.`,
      },
      {
        id: 'med-g912.l11',
        title: 'Asthma and Airway Disease',
        blurb: 'Reversible airway narrowing from inflammation and muscle spasm.',
        minutes: 8,
        asOf: '2026-10',
        anchors: [
          { kind: 'mesh', ref: 'Asthma', note: 'chronic inflammatory airway disease' },
          { kind: 'drug', ref: 'albuterol', note: 'short-acting beta-2 agonist reliever' },
          { kind: 'concept', ref: 'inhaled corticosteroid controller therapy' },
          { kind: 'guideline', ref: 'GINA, Global Strategy for Asthma Management and Prevention, 2025', note: 'international asthma management framework' },
        ],
        body: `Asthma is a chronic inflammatory disease of the airways in which the bronchi become narrowed, swollen and overly reactive. The result is episodes of wheeze, cough, chest tightness and shortness of breath, often worse at night or with triggers. Triggers include allergens such as pollen, dust mites and pet dander, respiratory viruses, cold air, exercise, smoke and air pollution. It often starts in childhood and often runs alongside allergic conditions such as eczema and hay fever.

Three things narrow the airway.
- First, the smooth muscle around the bronchi tightens (bronchoconstriction).
- Second, the airway lining becomes inflamed and swollen.
- Third, glands produce excess thick mucus.

Because air flows through a tube whose resistance rises steeply as the radius shrinks, even modest narrowing greatly reduces airflow, and breathing out becomes especially hard, producing the high-pitched wheeze.

The key feature is that the narrowing is variable and largely reversible, which separates asthma from chronic obstructive pulmonary disease (COPD). COPD is mainly caused by smoking and involves progressive, only partly reversible airflow limitation. Lung function tests with spirometry measure how much air can be forcefully exhaled in the first second compared with total exhaled volume; in asthma, this improves after an inhaled bronchodilator.

Treatment mirrors the two main mechanisms. Reliever medicines, such as the short-acting beta-2 agonist albuterol, relax bronchial smooth muscle within minutes by stimulating beta-2 receptors in the airway. They treat the spasm but not the inflammation. Controller medicines, most importantly inhaled corticosteroids, reduce airway inflammation over days to weeks and lower the frequency of attacks. Current international guidance (GINA 2025) says asthma should not be treated with a short-acting beta-2 agonist alone at any severity, because the inflammation is untreated; for adolescents and adults the preferred reliever is as-needed low-dose inhaled corticosteroid with formoterol, which treats both spasm and inflammation. Avoiding triggers matters too.

An asthma attack that does not respond to the reliever, with trouble speaking in full sentences, blue lips, or exhaustion, is an emergency requiring urgent care.`,
      },
      {
        id: 'med-g912.l12',
        title: 'Pharmacology Basics',
        blurb: 'How drugs reach targets, what they do, and why they can harm.',
        minutes: 9,
        asOf: '2026-10',
        anchors: [
          { kind: 'mesh', ref: 'Pharmacokinetics', note: 'absorption, distribution, metabolism, excretion' },
          { kind: 'mesh', ref: 'Drug-Related Side Effects and Adverse Reactions', note: 'adverse effects' },
          { kind: 'drug', ref: 'warfarin', note: 'example of narrow therapeutic index and interactions' },
        ],
        body: `Pharmacology is the study of how drugs act on the body and how the body handles drugs. These two halves have names. Pharmacodynamics asks what the drug does to the body: which target it binds and what that causes. Pharmacokinetics asks what the body does to the drug, and is summarized by four steps: absorption, distribution, metabolism and excretion.

Most drugs act on a receptor, enzyme, ion channel or transporter. An agonist binds a receptor and activates it, as albuterol activates beta-2 receptors. An antagonist binds and blocks the receptor without activating it, as a beta blocker does. Enzyme inhibitors reduce an enzyme activity, as statins inhibit HMG-CoA reductase and NSAIDs inhibit cyclooxygenase. Many drugs are selective, but selectivity is rarely complete, so an effect on other targets creates side effects.

For pharmacokinetics, route matters. A swallowed drug must be absorbed from the gut and then travels via the portal vein to the liver, which may metabolize much of it before it reaches the rest of the body, called first-pass metabolism. Intravenous drugs avoid this. The liver metabolizes many drugs using the cytochrome P450 enzyme family, and the kidneys excrete many drugs or their metabolites. Liver or kidney disease can therefore raise drug levels and toxicity.

The therapeutic index describes the gap between a helpful dose and a harmful one. Drugs with a narrow therapeutic index, such as warfarin, a blood thinner, require careful monitoring because small changes in level matter. Drug interactions often arise when one drug changes the metabolism of another: a drug that inhibits a liver enzyme can raise levels of a second drug that enzyme clears, and a drug that induces the enzyme can lower them. Food, supplements and alcohol can interact too.

Adverse effects are part of every drug. Some are predictable extensions of the main action (a blood thinner causes bleeding), some are idiosyncratic or allergic (a rash or anaphylaxis with penicillin). Allergy is not the same as a side effect, and a person with a true allergy must avoid that drug. All dosing decisions belong to the prescriber, who weighs benefit, risk, age, organ function and other medicines.`,
      },
    ],
  },
  questions: [
    mcq('med-g912.l09', 1, 1, `What is the basic defect in type 1 diabetes?`,
      [`Autoimmune destruction of pancreatic beta cells, so little insulin is made`, `Resistance of muscle and fat cells to insulin despite high insulin output by the pancreas`, `Overproduction of glucagon by the liver in response to a high-fat diet`, `Failure of the kidney tubule to reabsorb glucose from the filtrate`], 0,
      `Think about which cell makes insulin and what happens to it.`, `Type 1 is immune-mediated loss of beta cells. Insulin resistance is the central problem in type 2 diabetes.`),
    mcq('med-g912.l09', 2, 1, `Hemoglobin A1c is useful because it reflects what?`,
      [`Average blood glucose over roughly the previous two to three months`, `Blood glucose at the instant of the blood draw`, `The amount of insulin made by the pancreas in the past week or so of fasting`, `The ketone level in the blood over the past day`], 0,
      `Red blood cells live for months.`, `Glucose attaches to hemoglobin in red cells that live about 120 days, so A1c averages glucose over that period. A single glucose reading captures only one moment.`),
    mcq('med-g912.l09', 3, 2, `A man with long-standing type 2 diabetes develops numbness in his feet and reduced vision. What is the most likely general explanation?`,
      [`Prolonged high glucose damages small blood vessels and nerves, causing neuropathy and retinopathy`, `Excess insulin has directly destroyed peripheral nerve endings and the cells of the retina over time`, `Ketone accumulation causes permanent loss of retinal cells within days and of the peripheral nerves`, `The pancreas is producing autoantibodies against the optic nerve`], 0,
      `Think about chronic rather than acute effects of high glucose.`, `Chronic hyperglycemia injures small vessels and nerves. Ketoacidosis is an acute event and is not the usual cause of these long-term complications.`),
    mcq('med-g912.l09', 4, 3, `A 15-year-old with known type 1 diabetes has two days of vomiting and abdominal pain, deep rapid breathing, a fruity breath odor and a glucose of 450 mg/dL. What process best explains the rapid deep breathing?`,
      [`Respiratory compensation for metabolic acidosis from ketone accumulation`, `Respiratory compensation for metabolic alkalosis from vomiting`, `Primary lung disease that is causing abnormally high blood oxygen and low CO2`, `Insulin excess causing a drop in brain glucose that stimulates the brainstem`], 0,
      `Without insulin, fat is broken down into acids; how does the body respond to acid?`, `Ketoacids lower blood pH and the lungs blow off CO2 to compensate (Kussmaul breathing). Vomiting alone would tend toward alkalosis, but the findings of high glucose and ketones indicate acidosis.`),

    mcq('med-g912.l10', 1, 1, `Which of the following best describes systolic blood pressure?`,
      [`The peak pressure in the arteries when the ventricle contracts`, `The lowest pressure in the arteries between heartbeats, when the ventricle relaxes`, `The pressure within the veins returning to the right atrium`, `The pressure inside the lungs during inspiration`], 0,
      `It is the top number.`, `Systolic is the pressure during contraction. Diastolic is the lowest pressure between beats.`),
    mcq('med-g912.l10', 2, 2, `Why do statin drugs lower LDL cholesterol?`,
      [`They inhibit HMG-CoA reductase, an enzyme in cholesterol synthesis in the liver`, `They block cholesterol absorption by binding to dietary fat in the intestine only`, `They dissolve plaques by activating clot-breaking enzymes`, `They widen coronary arteries by relaxing smooth muscle`], 0,
      `The name of the enzyme appears in the drug mechanism.`, `Statins reduce hepatic cholesterol synthesis, increasing LDL clearance from blood. Blocking dietary absorption is the mechanism of a different drug class.`),
    mcq('med-g912.l10', 3, 2, `What event most directly causes a sudden heart attack in a person with coronary atherosclerosis?`,
      [`Rupture of a plaque followed by clot formation that blocks the artery`, `Gradual narrowing of the artery to exactly half its original width over several decades`, `A sudden rise in HDL cholesterol that destabilizes the vessel wall`, `Direct bacterial invasion of the heart muscle`], 0,
      `The word sudden hints at a clot rather than slow narrowing.`, `Plaque rupture triggers thrombosis and abrupt occlusion. Slow narrowing causes stable angina, not infarction by itself.`),
    mcq('med-g912.l10', 4, 3, `A 58-year-old smoker with untreated hypertension and diabetes reports chest pressure on exertion that resolves with rest. Which mechanism best explains the symptom?`,
      [`Fixed narrowing of coronary arteries limits blood supply when oxygen demand rises with exertion`, `Sudden complete clot formation that destroys heart muscle even at rest`, `Inflammation of the pericardium causing pain that worsens with breathing and lying flat`, `Spasm of the esophagus due to reflux of stomach acid, triggered by exertion and relieved by antacids`], 0,
      `Note the link to exertion and relief with rest.`, `Exertional chest pressure relieved by rest is typical of stable angina from fixed coronary narrowing. A complete clot would cause pain at rest and tissue death, as in infarction.`),

    mcq('med-g912.l11', 1, 1, `Which feature best distinguishes asthma from COPD?`,
      [`Airflow narrowing in asthma is variable and largely reversible`, `Asthma is always caused by smoking while COPD is not`, `Asthma only affects the alveoli, while COPD only affects the bronchi`, `Asthma never involves inflammation of the airway lining`], 0,
      `Consider whether the obstruction comes and goes.`, `Asthma is characterized by variable, reversible narrowing. COPD is mainly smoking-related and progressive.`),
    mcq('med-g912.l11', 2, 2, `How does albuterol relieve acute wheezing?`,
      [`It stimulates beta-2 receptors, relaxing bronchial smooth muscle`, `It blocks beta-2 receptors, which prevents the airway from relaxing`, `It reduces airway inflammation over several weeks`, `It dries mucus by stopping the glands from producing fluid`], 0,
      `Albuterol is a beta-2 agonist.`, `Agonist action at beta-2 receptors relaxes airway smooth muscle within minutes. Controller therapy such as inhaled corticosteroids reduces inflammation over days to weeks.`),
    mcq('med-g912.l11', 3, 2, `Why does a small decrease in airway radius cause a large increase in resistance?`,
      [`Resistance to flow rises steeply as the radius of a tube shrinks`, `Narrow airways produce more oxygen, which stalls airflow`, `Resistance is unaffected by radius but depends only on airway length`, `Narrowing increases the lung surface area for gas exchange`], 0,
      `Think of drinking through a thinner straw.`, `Flow resistance is very sensitive to radius in a tube, so modest narrowing from muscle tightening and swelling markedly impairs airflow. Length is not the driver here.`),
    mcq('med-g912.l11', 4, 3, `A child with asthma uses a short-acting albuterol reliever several times a week and wakes at night with cough, but is not on any controller medicine. Which reasoning best explains why more frequent symptoms are expected?`,
      [`The airway inflammation is untreated, since relievers relax muscle but do not reduce inflammation`, `The reliever is destroying beta-2 receptors, which prevents normal breathing and thickens the mucus`, `The bronchial smooth muscle has been replaced by scar tissue from the inhaler over several weeks of use`, `The cough is due to excess drug accumulating in the alveoli`], 0,
      `Compare what a reliever treats with what a controller treats.`, `Relievers act on muscle spasm only; ongoing inflammation continues to drive symptoms, which is why asthma should not be managed with a short-acting reliever alone (GINA 2025) and needs anti-inflammatory treatment. Inhaler use does not scar the airway.`),

    mcq('med-g912.l12', 1, 1, `Which pair correctly lists pharmacokinetic processes?`,
      [`Absorption and metabolism`, `Agonism and antagonism`, `Binding and activation of receptors`, `Selectivity and potency`], 0,
      `Pharmacokinetics is what the body does to the drug.`, `Absorption, distribution, metabolism and excretion are the four pharmacokinetic processes. The other pairs describe pharmacodynamics.`),
    mcq('med-g912.l12', 2, 2, `A drug that binds a receptor and blocks it without activating it is called what?`,
      [`An antagonist`, `An agonist`, `A prodrug`, `A substrate`], 0,
      `It prevents the usual messenger from acting.`, `Antagonists occupy the receptor without activating it. Agonists activate it.`),
    mcq('med-g912.l12', 3, 2, `Why can liver disease increase the risk of toxicity from some oral drugs?`,
      [`Reduced liver metabolism, including less first-pass clearance, leaves more active drug in circulation`, `The liver stops absorbing the drug from the intestine, so it accumulates in the gut and causes toxicity there`, `Liver disease makes the kidneys produce more cytochrome P450 enzymes, which breaks the drug down faster`, `The drug can no longer bind to its receptor because the liver changes the receptor shape`], 0,
      `Where do many drugs get broken down?`, `The liver metabolizes many drugs, so impaired function raises levels. The liver does not control absorption from the gut in the way the second option suggests.`),
    mcq('med-g912.l12', 4, 3, `A patient on a narrow-therapeutic-index blood thinner starts a new medicine that inhibits the liver enzyme that clears the blood thinner. What is the expected consequence?`,
      [`Higher blood thinner levels with increased risk of bleeding`, `Lower blood thinner levels with increased risk of clotting`, `No change, since the kidneys fully compensate for liver enzyme inhibition`, `Faster conversion of the blood thinner to an inactive form`], 0,
      `Slower clearance has what effect on drug level?`, `Inhibiting the clearing enzyme slows metabolism so the drug accumulates, increasing bleeding risk. Lower levels would result from enzyme induction, the opposite situation.`),
  ],
};
