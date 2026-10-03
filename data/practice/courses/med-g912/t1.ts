import { mcq, type CoursePart } from '../../courseKit';

export const PART: CoursePart = {
  track: {
    id: 'med-g912.t1',
    title: 'The Body and How It Stays Balanced',
    blurb: 'Homeostasis and the major organ systems, seen as feedback-controlled machines.',
    level: 'FOUNDATION',
    lessons: [
      {
        id: 'med-g912.l01',
        title: 'Homeostasis and Feedback',
        blurb: 'How the body holds its internal conditions steady.',
        minutes: 8,
        asOf: '2026-10',
        anchors: [{ kind: 'mesh', ref: 'Homeostasis', note: 'core organizing concept of physiology' }],
        body: `Cells only work well inside a narrow range of conditions. Body temperature, blood glucose, blood acidity, water balance and blood pressure all have a normal range, and staying inside it is called homeostasis. Illness can often be understood as a failure of this balancing, either because a control system is broken or because the stress on it is too large.

Every homeostatic loop has the same parts. A sensor detects a variable, a control center compares it to a set point, and an effector acts to change it. Most loops use negative feedback, meaning the response opposes the change. When you get hot, temperature sensors in the skin and brain signal the hypothalamus, which triggers sweating and wider skin blood vessels so heat leaves the body. When you get cold, it triggers shivering and narrowed skin vessels. The output shuts the stimulus off, which is why the system is stable.

Positive feedback is rarer and amplifies a change until an event finishes. Labor contractions are a classic case: stretching of the cervix triggers oxytocin release, which strengthens contractions, which stretch the cervix more, until birth ends the loop. Blood clotting also uses positive feedback locally.

A worked example is blood glucose. After a meal, rising glucose is sensed by pancreatic beta cells, which release insulin. Insulin moves glucose into muscle and fat cells and tells the liver to store it, so glucose falls. Between meals, falling glucose lets alpha cells release glucagon, which tells the liver to release stored glucose. Two opposing hormones give tight control. When this loop fails, as in diabetes, the consequences are described in a later lesson.

Set points can also shift on purpose. During a fever, immune signals raise the hypothalamic set point, so a person feels cold and shivers until the body reaches the new, higher temperature.`,
      },
      {
        id: 'med-g912.l02',
        title: 'The Heart and Circulation',
        blurb: 'A double pump that moves blood through two circuits.',
        minutes: 8,
        asOf: '2026-10',
        anchors: [{ kind: 'mesh', ref: 'Cardiovascular System', note: 'anatomy and physiology of circulation' }],
        body: `The circulatory system delivers oxygen and nutrients, removes carbon dioxide and wastes, and carries hormones and immune cells. The heart is a double pump with four chambers. The right side receives oxygen-poor blood from the body and sends it through the pulmonary circuit to the lungs. The left side receives oxygen-rich blood from the lungs and sends it through the systemic circuit to the rest of the body. Because the left ventricle must push blood through the whole body, its wall is much thicker than the right.

One-way valves keep blood moving forward: the tricuspid and mitral valves sit between atria and ventricles, and the pulmonary and aortic valves sit at the exits. The familiar heart sounds come mostly from valves closing. A heartbeat is coordinated by electrical signals starting in the sinoatrial node, the natural pacemaker, then passing through the atrioventricular node to the ventricles. An electrocardiogram (ECG) records this activity.

Blood leaves the heart in arteries, which have thick, elastic, muscular walls to handle high pressure. It exchanges materials with tissues across the thin walls of capillaries, then returns in veins, which are lower pressure and rely on valves and skeletal muscle squeezing to push blood back toward the heart. Cardiac output is heart rate multiplied by stroke volume, the amount ejected per beat. At rest it is roughly 5 liters per minute in an adult, and it rises greatly in exercise.

Blood pressure depends on cardiac output and on resistance, which is set mainly by the width of small arteries. This is why drugs that widen vessels or reduce the heart's workload can lower blood pressure. The heart muscle itself is fed by the coronary arteries, so a blockage there starves the muscle, which is the basis of a heart attack.`,
      },
      {
        id: 'med-g912.l03',
        title: 'Lungs and Kidneys: Gas, Fluid and Acid-Base Balance',
        blurb: 'Two organs that keep blood chemistry in range.',
        minutes: 8,
        asOf: '2026-10',
        anchors: [
          { kind: 'mesh', ref: 'Respiratory Physiological Phenomena', note: 'ventilation and gas exchange' },
          { kind: 'mesh', ref: 'Kidney', note: 'filtration and regulation' },
        ],
        body: `The lungs bring oxygen into the blood and remove carbon dioxide. Air travels down the trachea and branching bronchi to millions of tiny air sacs called alveoli. Alveolar walls are one cell thick and wrapped in capillaries, so oxygen diffuses into blood and carbon dioxide diffuses out, driven by differences in partial pressure. Breathing in happens when the diaphragm contracts and flattens, enlarging the chest so pressure inside falls below atmospheric pressure and air flows in.

Carbon dioxide matters for more than waste removal. It combines with water to form carbonic acid, so breathing rate directly alters blood pH. Breathe faster and blood CO2 falls, making blood less acidic. Breathe slower, or fail to clear CO2 in lung disease, and blood becomes more acidic. The brainstem drives breathing mainly in response to CO2 and pH, not oxygen.

The kidneys filter blood in about a million functional units called nephrons. Filtration at the glomerulus produces a protein-free fluid, and the tubule then reabsorbs most of the water, sodium, glucose and bicarbonate while secreting wastes and extra potassium or hydrogen ions. Hormones tune this: antidiuretic hormone makes the collecting duct reabsorb more water, and aldosterone makes it retain sodium. The kidneys also release erythropoietin to stimulate red blood cell production and activate vitamin D.

Together the lungs and kidneys share acid-base control. The lungs adjust CO2 within minutes, while the kidneys adjust bicarbonate and acid excretion over hours to days. Blood pH is held near 7.4, and even small shifts can disturb enzymes and heart rhythm. A worked case: someone with severe vomiting loses stomach acid, blood turns alkaline, and the lungs compensate by breathing more slowly to retain CO2.`,
      },
      {
        id: 'med-g912.l04',
        title: 'Nervous and Endocrine Control',
        blurb: 'Fast electrical signals and slow chemical messengers.',
        minutes: 8,
        asOf: '2026-10',
        anchors: [
          { kind: 'mesh', ref: 'Nervous System Physiological Phenomena', note: 'neural signalling' },
          { kind: 'mesh', ref: 'Endocrine System', note: 'hormonal regulation' },
        ],
        body: `The body coordinates itself with two communication networks. The nervous system is fast and specific. Neurons carry electrical impulses called action potentials along their axons and pass the message to the next cell across a synapse using chemical neurotransmitters. The central nervous system is the brain and spinal cord; the peripheral nervous system carries sensory information in and motor commands out. The autonomic part runs involuntary functions, with the sympathetic branch preparing for action (faster heart rate, wider airways) and the parasympathetic branch favoring rest and digestion.

The endocrine system is slower but longer lasting. Glands release hormones into the blood, and only cells with the matching receptor respond. The hypothalamus and pituitary sit at the top of many loops. The hypothalamus releases releasing hormones, the pituitary releases stimulating hormones, and these drive target glands such as the thyroid, adrenals and gonads. Those glands then release their own hormones, which feed back to shut the upper levels down. This is negative feedback again.

Thyroid regulation is a clear example. Low thyroid hormone raises pituitary thyroid-stimulating hormone (TSH), which pushes the thyroid to make more. When thyroid hormone rises, TSH falls. This is why in a typical underactive thyroid caused by gland failure, TSH is high while thyroid hormone is low, because the pituitary keeps pushing a gland that cannot respond.

The two systems overlap. In stress, the sympathetic nervous system rapidly releases adrenaline from the adrenal medulla, while the slower hormone cortisol from the adrenal cortex mobilizes energy over hours. Understanding which system is involved, and where in a loop a fault lies, is a central skill in diagnosis.`,
      },
    ],
  },
  questions: [
    mcq('med-g912.l01', 1, 1, `In a homeostatic loop, which component compares the measured value with the set point?`,
      [`The control center, such as the hypothalamus`, `The sensor, such as a skin thermoreceptor`, `The effector, such as a sweat gland`, `The stimulus, such as rising heat`], 0,
      `Think about which part makes the decision.`, `The control center integrates sensor input and compares it with the set point. Sensors only detect the variable; effectors carry out the response.`),
    mcq('med-g912.l01', 2, 1, `Which statement best describes negative feedback?`,
      [`The response opposes the original change and so returns the variable toward its set point`, `The response strengthens the original change until a process is completed`, `The response causes a permanent shift of the set point away from its normal value`, `The response only occurs when the nervous system rather than hormones is involved in the control step`], 0,
      `Negative here means the response works against the change.`, `Negative feedback reverses the stimulus, which stabilizes variables like temperature. The second option describes positive feedback.`),
    mcq('med-g912.l01', 3, 2, `After a large meal, blood glucose rises. Which sequence correctly describes the usual response?`,
      [`Beta cells release insulin, tissues take up glucose and the liver stores it, so glucose falls`, `Alpha cells release glucagon, the liver releases glucose, so glucose falls further below the set point`, `Beta cells release insulin, the liver releases stored glucose, so glucose rises further`, `Alpha cells release glucagon, tissues take up glucose and the liver stores it`], 0,
      `Which hormone lowers glucose?`, `Insulin from beta cells promotes uptake and storage. Glucagon does the opposite and acts between meals, so options pairing glucagon with a glucose fall are wrong.`),
    mcq('med-g912.l01', 4, 3, `A patient with a fever reports feeling cold and begins shivering even though body temperature is already above 37 C. What best explains this?`,
      [`Immune signals have raised the hypothalamic set point, so the body is working to reach a higher temperature`, `The hypothalamic sensors have failed, so the body cannot detect that it is already warm and keeps generating heat`, `Positive feedback in skin blood vessels is cooling the body below its set point`, `Sweat glands are overactive, which has lowered the set point temporarily`], 0,
      `Compare the actual temperature with the new target.`, `In fever the set point rises, so the actual temperature is below the new target and cold-defense responses fire. The set point has changed; the sensors are not broken.`),

    mcq('med-g912.l02', 1, 1, `Why is the wall of the left ventricle thicker than the right?`,
      [`It must generate enough pressure to push blood through the whole systemic circuit`, `It must hold more total blood volume than any other chamber of the heart`, `It contains the sinoatrial node, which sets the heart rate and so needs extra muscle`, `It pumps blood through the lungs, which have the highest resistance`], 0,
      `Compare how far each ventricle sends blood.`, `Systemic resistance is much higher than pulmonary resistance, so the left ventricle needs more muscle. The pulmonary circuit is the lower-pressure one.`),
    mcq('med-g912.l02', 2, 1, `Which structure is the heart's natural pacemaker?`,
      [`The sinoatrial node`, `The atrioventricular node`, `The aortic valve`, `The coronary sinus`], 0,
      `It starts each normal beat in the right atrium.`, `The sinoatrial node fires fastest and sets the rhythm. The atrioventricular node delays and relays the signal to the ventricles.`),
    mcq('med-g912.l02', 3, 2, `A resting adult has a heart rate of 70 beats per minute and a stroke volume of 70 mL. Approximately what is the cardiac output?`,
      [`About 4.9 liters per minute`, `About 0.5 liters per minute`, `About 49 liters per minute`, `About 1.0 liters per minute`], 0,
      `Cardiac output is rate times stroke volume; convert mL to liters.`, `70 x 70 mL = 4900 mL, or about 4.9 L/min. The other options come from slipping a decimal place.`),
    mcq('med-g912.l02', 4, 3, `A drug causes widening of small arteries without changing heart rate or stroke volume. What is the most likely effect on blood pressure, and why?`,
      [`It falls, because lower vascular resistance reduces pressure at the same cardiac output`, `It rises, because wider vessels raise the volume of blood in the heart`, `It stays the same, because pressure depends only on cardiac output`, `It falls, because wider vessels lower cardiac output by reducing venous return only and so weaken contraction`], 0,
      `Pressure depends on flow and resistance together.`, `Pressure is roughly cardiac output times resistance, so lowering resistance lowers pressure when output is unchanged. The third option ignores resistance entirely.`),

    mcq('med-g912.l03', 1, 1, `Where does gas exchange between air and blood occur?`,
      [`Across the thin walls of alveoli and surrounding capillaries`, `Across the thick cartilage-supported walls of the bronchi as air flows through them`, `Inside the trachea, where air is warmed and moistened`, `Within the pleural space between the lung and chest wall`], 0,
      `Look for the thinnest barrier with blood vessels beside it.`, `Alveoli provide a huge, thin surface next to capillaries. Bronchi and the trachea only conduct air.`),
    mcq('med-g912.l03', 2, 2, `A person breathes rapidly and deeply during a panic attack. What happens to blood CO2 and pH?`,
      [`CO2 falls and blood becomes less acidic (higher pH)`, `CO2 rises and blood becomes more acidic (lower pH)`, `CO2 falls and blood becomes more acidic (lower pH)`, `CO2 is unchanged and pH is unchanged because the kidneys correct it instantly`], 0,
      `Faster breathing blows off more of the gas that forms acid.`, `Hyperventilation removes CO2, lowering carbonic acid and raising pH. The kidneys act over hours, not instantly.`),
    mcq('med-g912.l03', 3, 2, `Which hormone causes the kidney collecting duct to reabsorb more water?`,
      [`Antidiuretic hormone`, `Aldosterone`, `Erythropoietin`, `Glucagon`], 0,
      `Its name says it opposes urine production.`, `Antidiuretic hormone inserts water channels in the collecting duct. Aldosterone mainly drives sodium retention, with water following secondarily.`),
    mcq('med-g912.l03', 4, 3, `A man has had several days of severe vomiting and his blood has become alkaline. Which compensation is expected?`,
      [`Slower breathing that retains CO2 and so raises carbonic acid`, `Faster breathing that blows off CO2 and so lowers carbonic acid`, `Increased kidney secretion of bicarbonate has no role because the lungs act alone`, `Increased kidney production of erythropoietin to buffer the pH`], 0,
      `Retaining the acid-forming gas would push pH back down.`, `The lungs compensate for alkalosis by hypoventilating to retain CO2. Faster breathing would make the alkalosis worse.`),

    mcq('med-g912.l04', 1, 1, `Which statement correctly contrasts the nervous and endocrine systems?`,
      [`Nervous signals are fast and targeted, while hormonal signals are slower and last longer`, `Nervous signals travel through blood, while hormonal signals travel along axons`, `Nervous signals are slow and widespread, while hormonal signals are fast and local to one organ`, `Only the endocrine system can influence heart rate and blood pressure`], 0,
      `Compare speed and route.`, `Neurons conduct quickly along specific pathways, while hormones travel in blood and act over minutes to hours. Both systems influence heart rate.`),
    mcq('med-g912.l04', 2, 1, `Which autonomic branch increases heart rate and widens the airways during stress?`,
      [`The sympathetic branch`, `The parasympathetic branch`, `The somatic branch`, `The enteric branch`], 0,
      `Think of the fight-or-flight response.`, `Sympathetic activity prepares for action. The parasympathetic branch slows the heart and favors digestion.`),
    mcq('med-g912.l04', 3, 2, `In a patient whose thyroid gland itself has failed, what pattern of TSH and thyroid hormone is expected?`,
      [`High TSH with low thyroid hormone`, `Low TSH with low thyroid hormone`, `High TSH with high thyroid hormone`, `Low TSH with high thyroid hormone`], 0,
      `Low output removes the negative feedback on the pituitary.`, `Low thyroid hormone removes feedback, so the pituitary raises TSH. Low TSH with low hormone would point to a pituitary problem instead.`),
    mcq('med-g912.l04', 4, 3, `A patient has low thyroid hormone and a low TSH, and imaging shows a pituitary tumor. Why does this differ from primary thyroid failure?`,
      [`The pituitary is not producing enough TSH, so the thyroid is under-stimulated rather than failing on its own`, `The thyroid is overproducing hormone, which suppresses the pituitary through positive feedback, lowering TSH and the output of the gland itself`, `The hypothalamus is releasing too much releasing hormone, which raises TSH`, `The thyroid gland is healthy and low hormone is caused by high TSH`], 0,
      `Locate the fault in the loop: which level is not sending the signal?`, `In secondary hypothyroidism the pituitary fails to make enough TSH, so both TSH and thyroid hormone are low. The healthy-thyroid, high-TSH pattern would not match the lab findings.`),
  ],
};
