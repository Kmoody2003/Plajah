// ============================================================
//  anatomy.js — Plajah Human Body Explorer
//  Comprehensive anatomy data: all major organs, systems,
//  cellular info, nutrition, blood flow, conditions
// ============================================================

window.BODY_SYSTEMS = {
  nervous:       { label: "Nervous",       color: "#f39c12", icon: "🧠" },
  circulatory:   { label: "Circulatory",   color: "#e74c3c", icon: "♥" },
  respiratory:   { label: "Respiratory",   color: "#3498db", icon: "🫁" },
  digestive:     { label: "Digestive",     color: "#27ae60", icon: "🫙" },
  skeletal:      { label: "Skeletal",      color: "#ecf0f1", icon: "🦴" },
  muscular:      { label: "Muscular",      color: "#e67e22", icon: "💪" },
  lymphatic:     { label: "Lymphatic",     color: "#9b59b6", icon: "🔵" },
  endocrine:     { label: "Endocrine",     color: "#1abc9c", icon: "⚗️" },
  urinary:       { label: "Urinary",       color: "#f1c40f", icon: "🫘" },
  reproductive:  { label: "Reproductive",  color: "#e91e63", icon: "✦" },
  integumentary: { label: "Integumentary", color: "#a0522d", icon: "🫶" },
  sensory:       { label: "Sensory",       color: "#00bcd4", icon: "👁" },
};

window.ANATOMY = [

  // ── BRAIN ──────────────────────────────────────────────────────
  {
    id: "brain",
    name: "Brain",
    medicalName: "Encephalon",
    system: "nervous",
    sex: "both",
    svgZone: "head",
    icon: "🧠",
    description: "The brain is your body's command center — a 3-pound organ that processes every thought, memory, sensation, movement, and emotion. It constantly receives signals from your senses, integrates them, and sends responses throughout your body without you ever having to think about it.",
    medicalDescription: "The encephalon is the rostral portion of the central nervous system enclosed within the cranium. It comprises the cerebrum (telencephalon and diencephalon), cerebellum (metencephalon), and brainstem (pons, medulla oblongata, and mesencephalon). Neuronal communication occurs via electrochemical signaling across synaptic junctions.",
    function: "Controls all conscious and unconscious body functions including thought, memory, language, motor control, sensory processing, emotions, autonomic regulation of breathing, heartbeat, digestion, and hormonal signals.",
    vitamins: [
      { name: "Vitamin B12 (Cobalamin)", role: "Maintains myelin sheath insulating nerve fibers; deficiency causes cognitive decline" },
      { name: "Vitamin B6 (Pyridoxine)", role: "Essential for synthesizing serotonin, dopamine, and GABA neurotransmitters" },
      { name: "Vitamin B9 (Folate)", role: "Critical for DNA synthesis in neural cells and reducing homocysteine" },
      { name: "Vitamin D", role: "Modulates neurotransmitter synthesis and neuroprotection against inflammation" },
      { name: "Vitamin E", role: "Powerful antioxidant protecting neurons from oxidative stress and free radicals" },
      { name: "Vitamin C", role: "Antioxidant that recycles vitamin E; needed for dopamine and norepinephrine synthesis" },
      { name: "Choline (B-complex)", role: "Precursor to acetylcholine, the neurotransmitter for memory and learning" }
    ],
    minerals: [
      { name: "Iron", role: "Required for oxygen delivery to brain cells and dopamine receptor synthesis" },
      { name: "Zinc", role: "Regulates synaptic signaling; essential for BDNF (brain growth factor) activity" },
      { name: "Magnesium", role: "Blocks NMDA receptors, preventing excitotoxicity; supports synaptic plasticity" },
      { name: "Iodine", role: "Required for thyroid hormones that regulate brain development" },
      { name: "Selenium", role: "Part of antioxidant enzymes protecting neurons from oxidative damage" },
      { name: "Copper", role: "Cofactor in dopamine beta-hydroxylase; needed for neurotransmitter production" }
    ],
    cellTypes: [
      { name: "Neurons", description: "The primary signaling cells. Over 86 billion neurons communicate via electrical impulses (action potentials) and chemical messengers (neurotransmitters) across synapses." },
      { name: "Astrocytes", description: "Star-shaped glial cells that support neurons, regulate synapses, maintain the blood-brain barrier, and recycle neurotransmitters." },
      { name: "Microglia", description: "The brain's immune cells. They constantly survey for damage and infection, clearing debris by phagocytosis (engulfing waste)." },
      { name: "Oligodendrocytes", description: "Produce myelin, the fatty insulating sheath around axons that dramatically speeds up electrical signal transmission." },
      { name: "Ependymal cells", description: "Line the brain ventricles and produce cerebrospinal fluid (CSF), which cushions and nourishes the brain." }
    ],
    bloodFlow: "The brain receives blood via the internal carotid arteries (frontal/parietal lobes) and vertebral arteries (brainstem/occipital lobes), which unite to form the Circle of Willis — a circular safety network ensuring continuous supply. The brain uses ~20% of total cardiac output despite being only 2% of body weight. The blood-brain barrier (BBB), formed by tight junctions in endothelial cells, strictly controls what enters brain tissue.",
    fluidRole: "Cerebrospinal fluid (CSF) — produced at ~500ml/day by choroid plexus — cushions the brain against impact, removes metabolic waste, delivers nutrients, and maintains intracranial pressure. The glymphatic system (active during sleep) flushes protein waste including amyloid-beta implicated in Alzheimer's disease.",
    cellularProcess: "Neurons fire action potentials when membrane potential reaches ~−55mV threshold, opening voltage-gated Na⁺ channels (depolarization), followed by K⁺ efflux (repolarization). Synaptic vesicles release neurotransmitters (glutamate, GABA, dopamine, serotonin) into the synaptic cleft. Postsynaptic receptors convert chemical signals back to electrical ones. Long-term potentiation (LTP) — repeated activation of synapses — strengthens connections forming memory.",
    conditions: [
      { name: "Stroke (CVA)", description: "Interrupted blood flow causing rapid neuron death; ischemic (clot) or hemorrhagic (bleed)" },
      { name: "Alzheimer's Disease", description: "Progressive accumulation of amyloid plaques and tau tangles destroying memory circuits" },
      { name: "Parkinson's Disease", description: "Dopamine-producing neurons in the substantia nigra degenerate, causing tremors and rigidity" },
      { name: "Epilepsy", description: "Recurrent seizures from abnormal synchronous electrical discharges in neural networks" },
      { name: "Depression/Anxiety", description: "Dysregulation of serotonin, dopamine, and norepinephrine pathways in limbic system" }
    ],
    fact: "Your brain generates about 12–25 watts of electricity — enough to power a low-energy LED bulb — and contains enough neural connections to store an estimated 2.5 petabytes of information."
  },

  // ── HEART ──────────────────────────────────────────────────────
  {
    id: "heart",
    name: "Heart",
    medicalName: "Cor",
    system: "circulatory",
    sex: "both",
    svgZone: "chest-upper",
    icon: "♥",
    description: "Your heart is a tireless muscular pump — roughly the size of your fist — that beats 60–100 times per minute, every minute of your life. It circulates your entire blood volume (~5 liters) around the body in about 60 seconds, delivering oxygen and nutrients to every one of your 37 trillion cells.",
    medicalDescription: "The cor is a hollow, four-chambered muscular organ located in the mediastinum, slightly left of center. Its chambers — right and left atria and ventricles — are separated by interatrial and interventricular septa. Diastole (filling) and systole (contraction) are governed by the cardiac conduction system originating at the sinoatrial node.",
    function: "Drives the pulmonary circuit (right side pumps blood to lungs for oxygenation) and systemic circuit (left side pumps oxygenated blood to the body). Maintains blood pressure and regulates blood flow via heart rate and stroke volume changes.",
    vitamins: [
      { name: "Vitamin B1 (Thiamine)", role: "Critical for cardiac energy metabolism; deficiency causes beriberi heart disease" },
      { name: "Vitamin D", role: "Regulates blood pressure and calcium handling in cardiomyocytes" },
      { name: "Vitamin K2 (MK-7)", role: "Activates matrix GLA protein preventing arterial calcification" },
      { name: "Vitamin E", role: "Antioxidant reducing LDL oxidation and endothelial damage" },
      { name: "Vitamin C", role: "Supports collagen synthesis in vessel walls; reduces oxidative stress" },
      { name: "CoQ10 (Ubiquinone)", role: "Essential for mitochondrial ATP production in high-demand cardiac cells" }
    ],
    minerals: [
      { name: "Magnesium", role: "Regulates heart rhythm, relaxes blood vessels, and supports ATP production" },
      { name: "Potassium", role: "Maintains resting membrane potential; imbalance causes life-threatening arrhythmias" },
      { name: "Calcium", role: "Triggers cardiomyocyte contraction via excitation-contraction coupling" },
      { name: "Sodium", role: "Generates action potentials driving cardiac electrical conduction" },
      { name: "Iron", role: "Part of hemoglobin that delivers oxygen to cardiac tissue itself" },
      { name: "Selenium", role: "Antioxidant protecting cardiomyocytes; deficiency linked to Keshan cardiomyopathy" }
    ],
    cellTypes: [
      { name: "Cardiomyocytes", description: "Specialized striated muscle cells making up ~85% of heart volume. They contract rhythmically and are highly resistant to fatigue due to extreme mitochondrial density." },
      { name: "Pacemaker cells (SA/AV nodes)", description: "Autorhythmic cells in the sinoatrial node that spontaneously depolarize at 60–100/min, generating the heartbeat independently of the nervous system." },
      { name: "Cardiac fibroblasts", description: "Maintain the collagen-based extracellular matrix (ECM) providing structural scaffolding. After injury they become myofibroblasts that form scar tissue." },
      { name: "Endothelial cells", description: "Line all four chambers and blood vessels, secreting nitric oxide (NO) for vasodilation and anticoagulant factors." },
      { name: "Purkinje fibers", description: "Specialized conducting cells that rapidly distribute electrical impulses to ventricular muscle, ensuring coordinated contraction from apex to base." }
    ],
    bloodFlow: "Deoxygenated blood enters the right atrium via superior and inferior vena cava → right ventricle pumps it through pulmonary valve to pulmonary arteries → lungs oxygenate blood → pulmonary veins return it to left atrium → left ventricle pumps oxygenated blood through aortic valve into the aorta. Coronary arteries (branching from aortic root) supply blood to the heart muscle itself.",
    fluidRole: "The pericardial sac contains 15–50ml of lubricating pericardial fluid preventing friction during contraction. Lymphatic vessels in the myocardium drain interstitial fluid preventing edema.",
    cellularProcess: "Action potentials enter cardiomyocytes → voltage-gated L-type Ca²⁺ channels open → calcium triggers calcium release from sarcoplasmic reticulum (CICR) → calcium binds troponin C → tropomyosin shifts exposing actin binding sites → myosin heads hydrolyze ATP and 'walk' along actin (cross-bridge cycling) → sarcomere shortens → cell contracts. The cycle repeats 60–100x per minute for a lifetime.",
    conditions: [
      { name: "Myocardial Infarction (Heart Attack)", description: "Coronary artery blockage starves cardiac muscle of oxygen, causing irreversible cell death" },
      { name: "Heart Failure", description: "Reduced cardiac output fails to meet metabolic demands; fluid accumulates in lungs or periphery" },
      { name: "Atrial Fibrillation", description: "Chaotic electrical signals in atria cause irregular, often fast ventricular response" },
      { name: "Hypertension", description: "Chronically elevated blood pressure forces the left ventricle to work harder, causing hypertrophy" },
      { name: "Valve Disease", description: "Stenosis (narrowing) or regurgitation (leakage) of mitral or aortic valves disrupts blood flow" }
    ],
    fact: "In a lifetime (~80 years), your heart beats approximately 3.5 billion times and pumps roughly 200 million liters of blood — enough to fill over 80 Olympic swimming pools."
  },

  // ── LUNGS ──────────────────────────────────────────────────────
  {
    id: "lungs",
    name: "Lungs",
    medicalName: "Pulmones",
    system: "respiratory",
    sex: "both",
    svgZone: "chest",
    icon: "🫁",
    description: "Your lungs are the body's oxygen exchange hubs — two spongy, air-filled organs that breathe in oxygen and exhale carbon dioxide about 20,000 times a day. The right lung has 3 lobes; the left has 2 (making room for the heart). Spread flat, your lung surface area would cover a tennis court.",
    medicalDescription: "The pulmones are paired cone-shaped organs occupying the pleural cavities. Gas exchange occurs at ~300–500 million alveoli — thin-walled sacs surrounded by pulmonary capillaries. Ventilation is driven by diaphragmatic and intercostal muscle contraction creating negative intrathoracic pressure per Boyle's Law.",
    function: "Oxygenate venous blood (O₂ diffuses from alveoli into capillaries) and expel CO₂ waste (diffuses from blood into alveoli for exhalation). Also regulate blood pH via CO₂ levels, filter blood clots, produce surfactant, and serve as a reservoir for blood volume.",
    vitamins: [
      { name: "Vitamin A", role: "Essential for maintaining respiratory epithelium integrity and mucus production" },
      { name: "Vitamin D", role: "Reduces airway inflammation; deficiency increases asthma and respiratory infection risk" },
      { name: "Vitamin C", role: "Antioxidant protecting lung tissue from inhaled pollutants and oxidative stress" },
      { name: "Vitamin E", role: "Protects alveolar cells from oxidative damage from pollution and cigarette smoke" },
      { name: "Beta-carotene", role: "Precursor to vitamin A; protects airways from oxidative damage" }
    ],
    minerals: [
      { name: "Magnesium", role: "Relaxes bronchial smooth muscle; used intravenously for acute asthma attacks" },
      { name: "Selenium", role: "Antioxidant enzyme cofactor; low levels increase COPD and lung cancer risk" },
      { name: "Zinc", role: "Supports immune defense in respiratory epithelium; essential for healing" },
      { name: "Iron", role: "Critical for hemoglobin oxygen binding in red blood cells passing through lungs" }
    ],
    cellTypes: [
      { name: "Type I Pneumocytes", description: "Thin, flat cells covering ~95% of alveolar surface. Their extreme thinness (0.1–0.5μm) enables rapid oxygen and CO₂ diffusion across the blood-air barrier." },
      { name: "Type II Pneumocytes", description: "Cuboidal cells producing pulmonary surfactant (DPPC) that reduces surface tension, preventing alveolar collapse at the end of each exhale." },
      { name: "Alveolar macrophages", description: "Immune cells that patrol alveolar surfaces, engulfing inhaled bacteria, dust particles, and cellular debris — called 'dust cells'." },
      { name: "Goblet cells", description: "Produce mucus that traps inhaled particles and pathogens in the airways, which cilia then sweep upward to be swallowed or expelled." },
      { name: "Ciliated epithelial cells", description: "Line the bronchi with hair-like cilia beating ~1000x per minute, driving the mucociliary escalator that clears debris from airways." }
    ],
    bloodFlow: "The entire cardiac output (5L/min) passes through the pulmonary circulation. Pulmonary arteries carry deoxygenated blood from the right ventricle → spreads through pulmonary capillary network wrapping each alveolus → O₂ diffuses in, CO₂ diffuses out → pulmonary veins return oxygenated blood to left atrium. Transit time through alveolar capillary: ~0.75 seconds.",
    fluidRole: "Pleural fluid (~20ml) lubricates the pleural membranes preventing friction during breathing. Surfactant (a lipid-protein mixture) in alveoli reduces surface tension 5–15x compared to water, making inhalation energetically feasible.",
    cellularProcess: "O₂ crosses the 0.5μm blood-air barrier (surfactant → Type I pneumocyte → basement membrane → capillary endothelium) by simple diffusion driven by partial pressure gradients (alveolar pO₂ ~105mmHg vs. venous pO₂ ~40mmHg). O₂ binds hemoglobin (cooperative binding via R/T state transition). CO₂ (as bicarbonate HCO₃⁻) releases from blood, converts back to CO₂ via carbonic anhydrase, and diffuses out.",
    conditions: [
      { name: "Asthma", description: "Reversible bronchoconstriction and airway inflammation triggered by allergens, exercise, or irritants" },
      { name: "COPD (Emphysema + Bronchitis)", description: "Irreversible airway damage from smoking; alveolar walls destroyed, airflow chronically obstructed" },
      { name: "Pneumonia", description: "Infection fills alveoli with fluid and pus, impairing gas exchange" },
      { name: "Lung Cancer", description: "Malignant transformation of respiratory epithelial cells, often smoking-related" },
      { name: "Pulmonary Embolism", description: "Blood clot in pulmonary arteries blocking blood flow through the lungs" }
    ],
    fact: "If you could unroll and flatten all the alveoli in both lungs, the surface area would be approximately 70 square meters — the size of a singles tennis court."
  },

  // ── LIVER ──────────────────────────────────────────────────────
  {
    id: "liver",
    name: "Liver",
    medicalName: "Hepar",
    system: "digestive",
    sex: "both",
    svgZone: "abdomen-upper-right",
    icon: "🫀",
    description: "The liver is your body's largest internal organ and its master chemical factory, performing over 500 distinct functions. It filters all blood from your digestive tract, detoxifies drugs and alcohol, produces bile for fat digestion, stores glycogen as energy, manufactures blood proteins, and recycles old red blood cells.",
    medicalDescription: "The hepar is the largest parenchymal organ weighing 1.4–1.8kg, occupying the right hypochondrium and epigastrium. It is organized into functional units called hepatic lobules with sinusoidal blood flow from portal triads to central veins. Dual blood supply via the hepatic portal vein (75%) and hepatic artery (25%) is unique among organs.",
    function: "Metabolizes carbohydrates (glycogen storage/glycogenolysis/gluconeogenesis), fats (beta-oxidation, ketogenesis, lipoprotein synthesis), and proteins (deamination, urea cycle). Detoxifies drugs, alcohol, and hormones. Produces bile salts, albumin, clotting factors (I–VII, IX, X, XI, XII), and complement proteins.",
    vitamins: [
      { name: "Vitamin A", role: "Stored in hepatic stellate cells; liver is the primary storage site (90% body stores)" },
      { name: "Vitamin D", role: "Converted from D3 to 25-hydroxyvitamin D (calcidiol) by liver hydroxylase enzymes" },
      { name: "Vitamin B12", role: "Stored in liver for up to 5 years; released as needed for neural and blood cell function" },
      { name: "Vitamin K", role: "Essential cofactor for hepatic synthesis of clotting factors II, VII, IX, X" },
      { name: "Vitamin E", role: "Antioxidant protecting hepatocytes from lipid peroxidation, especially in fatty liver disease" },
      { name: "Choline", role: "Required for VLDL assembly and fat export; deficiency causes hepatic steatosis (fatty liver)" }
    ],
    minerals: [
      { name: "Iron", role: "Stored in hepatocytes as ferritin; liver regulates whole-body iron homeostasis" },
      { name: "Zinc", role: "Cofactor for ~300 liver enzymes including alcohol dehydrogenase and carbonic anhydrase" },
      { name: "Copper", role: "Stored and excreted in bile; accumulation causes Wilson's disease" },
      { name: "Selenium", role: "Part of glutathione peroxidase protecting liver cells from oxidative damage" },
      { name: "Manganese", role: "Cofactor for mitochondrial superoxide dismutase; prevents oxidative liver damage" }
    ],
    cellTypes: [
      { name: "Hepatocytes", description: "Main parenchymal cells (~70% of liver mass). Each hepatocyte performs all major metabolic functions and can regenerate within weeks — the liver can regrow from just 25% of its original mass." },
      { name: "Kupffer cells", description: "Resident liver macrophages lining hepatic sinusoids. They destroy pathogens, old red blood cells, and endotoxins arriving from the gut via portal blood." },
      { name: "Hepatic Stellate cells (HSCs)", description: "Store vitamin A in fat droplets in healthy liver. When activated by injury, they produce collagen causing fibrosis (cirrhosis)." },
      { name: "Liver Sinusoidal Endothelial cells (LSECs)", description: "Fenestrated endothelial cells lining sinusoids. Their pores allow direct contact between hepatocytes and plasma without a basement membrane." },
      { name: "Cholangiocytes", description: "Line bile ducts, modifying bile composition. They secrete bicarbonate and water, adjusting bile pH and dilution." }
    ],
    bloodFlow: "Portal vein (nutrient-rich blood from gut, spleen, pancreas) and hepatic artery converge at portal triads. Blood flows through sinusoids between hepatocyte plates → Kupffer cells filter it → exits via central veins → hepatic veins → inferior vena cava. This arrangement exposes hepatocytes first to nutrient-rich, sometimes toxin-laden portal blood.",
    fluidRole: "Produces 600–1000ml of bile daily, stored and concentrated in the gallbladder. Bile contains bile salts (for fat emulsification), bilirubin (from hemoglobin breakdown), cholesterol, and phospholipids. Also synthesizes ~10g/day of albumin, maintaining plasma oncotic pressure.",
    cellularProcess: "Hepatocytes run parallel metabolic programs: fed state → glycogen synthesis (glycogen synthase), fatty acid synthesis (ACC, FAS), protein synthesis; fasted state → glycogenolysis (glycogen phosphorylase), gluconeogenesis (from amino acids/lactate), ketogenesis, beta-oxidation. Cytochrome P450 enzymes (CYP3A4, CYP2D6) oxidize drugs for detoxification via Phase I (oxidation) and Phase II (conjugation) reactions.",
    conditions: [
      { name: "Cirrhosis", description: "End-stage fibrosis replacing hepatocytes with scar tissue from chronic alcohol, viral hepatitis, or fatty liver disease" },
      { name: "Non-alcoholic Fatty Liver Disease (NAFLD)", description: "Fat accumulation in hepatocytes from insulin resistance; increasingly common with obesity" },
      { name: "Hepatitis B/C", description: "Viral infection causing hepatocyte inflammation and eventual cirrhosis/liver cancer" },
      { name: "Liver Cancer (HCC)", description: "Hepatocellular carcinoma arising from chronically damaged hepatocytes" }
    ],
    fact: "The liver is the only internal organ capable of complete regeneration. You can surgically remove up to 75% of a healthy liver and it will grow back to full size within 8–12 weeks."
  },

  // ── STOMACH ──────────────────────────────────────────────────────
  {
    id: "stomach",
    name: "Stomach",
    medicalName: "Gaster / Ventriculus",
    system: "digestive",
    sex: "both",
    svgZone: "abdomen-upper-center",
    icon: "🫙",
    description: "The stomach is a J-shaped muscular bag that acts as a food processor and temporary holding tank. When food arrives, it stretches from a 50ml resting volume to over 1.5 liters. Its muscular walls churn food into a semi-liquid paste (chyme) while hydrochloric acid and digestive enzymes begin breaking down proteins.",
    medicalDescription: "The gaster is a J-shaped muscular viscus extending from the gastroesophageal junction (cardia) through the fundus, body, and antrum to the pylorus. The rugae-lined mucosa secretes gastric juice containing HCl (pH 1–2), pepsinogen, intrinsic factor, mucus, and bicarbonate via specialized cells in gastric glands.",
    function: "Stores ingested food, mechanically churns it via three muscular layers, chemically denatures proteins with HCl, activates pepsin for protein digestion, produces intrinsic factor (required for B12 absorption), and controls chyme release into the duodenum via the pyloric sphincter.",
    vitamins: [
      { name: "Vitamin B12 (Cobalamin)", role: "Requires intrinsic factor (produced by parietal cells) for absorption in the ileum" },
      { name: "Vitamin C", role: "Reduces nitrite to nitric oxide, potentially protecting against gastric cancer" },
      { name: "Vitamin A", role: "Maintains the integrity of gastric mucosal lining cells" },
      { name: "Vitamin E", role: "Antioxidant protection for gastric mucosa against H. pylori oxidative damage" }
    ],
    minerals: [
      { name: "Zinc", role: "Required for gastric mucosa repair and healing of ulcers; accelerates mucosal regeneration" },
      { name: "Iron", role: "Stomach acid converts dietary Fe³⁺ to Fe²⁺ for absorption; PPI drugs reduce this" },
      { name: "Sodium", role: "Drives HCl secretion via H⁺/K⁺-ATPase proton pump in parietal cells" },
      { name: "Chloride", role: "Combined with H⁺ forms HCl; essential for activating pepsin from pepsinogen" }
    ],
    cellTypes: [
      { name: "Parietal cells (Oxyntic cells)", description: "Secrete hydrochloric acid (HCl) using the H⁺/K⁺-ATPase proton pump and intrinsic factor for B12 absorption. They're the target of proton pump inhibitors (omeprazole)." },
      { name: "Chief cells (Zymogenic cells)", description: "Secrete pepsinogen, which is converted by acid to pepsin — the main gastric protease that cleaves proteins at phenylalanine and leucine bonds." },
      { name: "Mucous neck cells", description: "Secrete alkaline mucus creating a pH 7 protective layer directly above the pH 1–2 gastric lumen, shielding the stomach from self-digestion." },
      { name: "G cells", description: "Enteroendocrine cells in the antrum secreting gastrin hormone, which stimulates parietal cell acid production and gastric motility." },
      { name: "D cells", description: "Secrete somatostatin, which inhibits gastrin and acid secretion — the stomach's own 'off switch'." }
    ],
    bloodFlow: "Supplied by the celiac trunk branches: left gastric artery (lesser curvature), right gastric artery, gastroepiploic arteries (greater curvature), and short gastric arteries (fundus). Venous drainage goes via the portal vein to the liver.",
    fluidRole: "Produces 1.5–2 liters of gastric juice daily. HCl sterilizes food, denatures proteins, and activates pepsin. Mucus (0.2mm thick) protects mucosal cells. Secretion is regulated in three phases: cephalic (sight/smell of food), gastric (stomach distension), and intestinal.",
    cellularProcess: "Parietal cells: acetylcholine, gastrin, and histamine bind receptors → adenylyl cyclase/IP3 cascade → H⁺/K⁺-ATPase pumped to canalicular membrane → actively pumps 3 million H⁺ ions/second into the lumen → gastric pH drops to 1–2. G cells sense amino acids → secrete gastrin → enterochromaffin-like (ECL) cells release histamine → amplifies acid secretion via H2 receptors.",
    conditions: [
      { name: "Peptic Ulcer Disease", description: "H. pylori infection or NSAIDs disrupt mucosal barrier, allowing acid to erode the stomach wall" },
      { name: "Gastroesophageal Reflux (GERD)", description: "Lower esophageal sphincter weakness allows acid to reflux into esophagus causing heartburn" },
      { name: "Gastric Cancer", description: "Most often from chronic H. pylori-driven inflammation progressing to adenocarcinoma" },
      { name: "Gastroparesis", description: "Delayed gastric emptying from vagal nerve damage (often from diabetes)" }
    ],
    fact: "The stomach produces a new layer of mucus every two weeks to protect itself. Without this constantly renewed protective barrier, stomach acid would digest its own wall within 3 days."
  },

  // ── KIDNEYS ──────────────────────────────────────────────────────
  {
    id: "kidneys",
    name: "Kidneys",
    medicalName: "Renes",
    system: "urinary",
    sex: "both",
    svgZone: "abdomen-back",
    icon: "🫘",
    description: "Your two bean-shaped kidneys are your body's sophisticated filtration and recycling system, cleaning all 5 liters of your blood about 40 times per day — filtering roughly 200 liters and producing 1–2 liters of urine. They precisely control your blood pressure, salt balance, acid-base chemistry, and even stimulate red blood cell production.",
    medicalDescription: "The renes are retroperitoneal organs each containing ~1 million nephrons — the functional filtration units. The nephron comprises the glomerulus (filtration), proximal tubule (bulk reabsorption), Loop of Henle (concentration), distal tubule (fine-tuning), and collecting duct. Juxtaglomerular apparatus regulates renin secretion and GFR.",
    function: "Filter blood removing urea, creatinine, excess salts, and drugs. Reabsorb glucose, amino acids, water, and electrolytes. Regulate blood pressure via renin-angiotensin-aldosterone system (RAAS). Maintain pH via H⁺ secretion and HCO₃⁻ reabsorption. Produce erythropoietin (stimulates RBC production) and activate vitamin D.",
    vitamins: [
      { name: "Vitamin D", role: "Kidneys activate 25-hydroxyvitamin D to calcitriol (active vitamin D) — essential for calcium absorption" },
      { name: "Vitamin B6", role: "Deficiency increases oxalate production, raising kidney stone risk" },
      { name: "Vitamin C", role: "Antioxidant protecting tubular cells; high doses may increase oxalate stones" },
      { name: "Vitamin E", role: "Protects kidney cells from oxidative stress, especially during diabetic nephropathy" }
    ],
    minerals: [
      { name: "Potassium", role: "Kidneys regulate potassium balance precisely; excess is excreted via collecting ducts under aldosterone" },
      { name: "Sodium", role: "Primary osmolyte regulating water reabsorption via ADH and aldosterone" },
      { name: "Calcium", role: "Kidneys reclaim 98% of filtered calcium; calcitriol and PTH control this" },
      { name: "Phosphorus", role: "Excess phosphorus from diet is excreted by kidneys; kidney disease causes dangerous phosphate retention" },
      { name: "Magnesium", role: "~50% dietary magnesium is absorbed, excess excreted renally" }
    ],
    cellTypes: [
      { name: "Podocytes", description: "Specialized glomerular cells with intricate 'foot processes' (pedicels) that form the filtration slits — allowing small molecules through while blocking proteins and cells." },
      { name: "Proximal tubule cells", description: "Packed with mitochondria and brush-border microvilli (1000x surface area increase). Reabsorb 65% of filtered Na⁺, water, glucose, and amino acids via active transport." },
      { name: "Loop of Henle cells (thin/thick limb)", description: "Create the osmotic concentration gradient (300–1200 mOsm) in the medulla via countercurrent multiplication, enabling urine concentration." },
      { name: "Juxtaglomerular (JG) cells", description: "Modified smooth muscle cells in the afferent arteriole that sense blood pressure and release renin, activating the RAAS blood pressure response." },
      { name: "Macula densa cells", description: "Specialized cells in the distal tubule that sense luminal [NaCl] and signal JG cells to adjust renin release and afferent arteriole tone." }
    ],
    bloodFlow: "Kidneys receive ~20–25% of cardiac output (1.1L/min combined) via renal arteries. Blood enters glomeruli under high pressure → 180L/day is filtered → 99% is reabsorbed → peritubular capillaries and vasa recta (medullary capillaries) collect reabsorbed substances → renal veins return blood to vena cava.",
    fluidRole: "Produce 1–2L urine daily (extremely variable with ADH). Urine contains urea (major nitrogen waste), creatinine (muscle turnover), uric acid, electrolytes, and water. Secretes erythropoietin (EPO) stimulating bone marrow red cell production in response to hypoxia.",
    cellularProcess: "Glomerular filtration: hydrostatic pressure (55mmHg) overcomes oncotic pressure (30mmHg) + tubular pressure → net filtration of 125ml/min (GFR). Tubular reabsorption: Na⁺/K⁺-ATPase on basolateral membrane creates gradient driving Na⁺ entry via luminal cotransporters (Na-glucose SGLT2, Na-amino acid). Water follows osmotically via aquaporins (AQP1 in PCT, AQP2 in collecting duct regulated by ADH/vasopressin).",
    conditions: [
      { name: "Chronic Kidney Disease (CKD)", description: "Progressive loss of nephrons from diabetes, hypertension, or immune disease; leads to end-stage renal failure" },
      { name: "Kidney Stones (Nephrolithiasis)", description: "Crystallization of calcium oxalate, uric acid, or struvite from supersaturated urine" },
      { name: "Acute Kidney Injury (AKI)", description: "Sudden loss of kidney function from dehydration, drugs, sepsis, or obstruction" },
      { name: "Polycystic Kidney Disease (PKD)", description: "Genetic disorder causing progressive cyst formation and kidney enlargement" }
    ],
    fact: "Each kidney contains about 1 million nephrons. You can lose up to 75% of your kidney function before experiencing symptoms — that's why kidney disease is called a 'silent killer'."
  },

  // ── SMALL INTESTINE ──────────────────────────────────────────────
  {
    id: "small_intestine",
    name: "Small Intestine",
    medicalName: "Intestinum Tenue",
    system: "digestive",
    sex: "both",
    svgZone: "abdomen-center",
    icon: "〰️",
    description: "Despite its name, the small intestine is a 6–7 meter long coiled tube — the longest part of your digestive system and the primary site where nutrients enter your bloodstream. Its inner lining is covered in millions of tiny finger-like projections called villi, and each villus is covered in even tinier microvilli, creating an enormous surface area for absorption.",
    medicalDescription: "The intestinum tenue consists of three segments: duodenum (25cm; receives bile and pancreatic juice), jejunum (2.5m; primary absorption), and ileum (3.5m; B12/bile salt reabsorption). The mucosa features circular folds (plicae circulares), villi, and microvilli (brush border) providing ~200m² of absorptive surface.",
    function: "Completes chemical digestion via pancreatic enzymes and brush-border enzymes (maltase, lactase, sucrase). Absorbs all monosaccharides, amino acids, fatty acids, fat-soluble vitamins, minerals, and water. Produces digestive hormones (secretin, CCK, GIP). Secretes IgA for mucosal immunity.",
    vitamins: [
      { name: "All fat-soluble vitamins (A,D,E,K)", role: "Absorbed with dietary fat via micelles and chylomicrons in the duodenum and jejunum" },
      { name: "Vitamin B12 (Cobalamin)", role: "Absorbed exclusively in the terminal ileum via receptor-mediated endocytosis with intrinsic factor" },
      { name: "Vitamin C", role: "Absorbed in the ileum by sodium-dependent transporters SVCT1" },
      { name: "Folate (B9)", role: "Absorbed in the jejunum after conversion to monoglutamate by brush-border enzymes" }
    ],
    minerals: [
      { name: "Iron", role: "Absorbed as heme iron (from meat) and non-heme Fe²⁺ in the duodenum; regulated by hepcidin" },
      { name: "Calcium", role: "Active absorption in duodenum via TRPV6 channels, driven by calcitriol (vitamin D)" },
      { name: "Zinc", role: "Absorbed through ZIP4 transporters in duodenum and jejunum" },
      { name: "Magnesium", role: "Absorbed mainly in ileum and colon via TRPM6/7 channels" }
    ],
    cellTypes: [
      { name: "Enterocytes (Absorptive cells)", description: "Tall columnar cells with microvillous brush borders covering ~95% of villus surface. They absorb nutrients and have tight junctions preventing paracellular leakage." },
      { name: "Goblet cells", description: "Scattered among enterocytes; secrete mucin forming a protective mucus layer 150–300μm thick covering all intestinal surfaces." },
      { name: "Paneth cells", description: "Located at the base of crypts of Lieberkühn; secrete antimicrobial peptides (defensins, lysozyme) shaping the gut microbiome." },
      { name: "Enteroendocrine cells (L, I, S, K cells)", description: "Secrete hormones: CCK (triggers bile/pancreatic juice), secretin (stimulates bicarbonate), GLP-1 (insulin sensitizer), GIP (incretin)." },
      { name: "Intestinal Stem cells (ISCs)", description: "Located at crypt bases; divide every 24 hours replacing the entire intestinal epithelium every 3–5 days — the fastest renewing tissue in the body." }
    ],
    bloodFlow: "Supplied by the superior mesenteric artery (branches to all jejunum and ileum via arcades). Nutrient-rich venous blood from intestinal capillaries drains into portal vein to liver. Absorbed fats enter lacteals (lymphatic capillaries in villi) → thoracic duct → systemic circulation, bypassing the liver.",
    fluidRole: "Secretes 1–2L intestinal juice daily (alkaline, with enzymes). Receives 1.5L bile + 1.5L pancreatic juice daily. Absorbs ~7L of fluid (from diet plus secretions). Chyme is propelled by peristalsis and segmentation contractions controlled by the enteric nervous system.",
    cellularProcess: "Glucose and galactose: absorbed by SGLT1 (Na⁺ cotransport) on brush border → exit via GLUT2 on basolateral side. Fructose: absorbed by GLUT5. Amino acids: by Na⁺-amino acid cotransporters. Fats: bile emulsifies triglycerides → pancreatic lipase cleaves to monoglycerides + fatty acids → micelles deliver to enterocyte → resynthesized into triglycerides → packaged into chylomicrons → exit via lacteals.",
    conditions: [
      { name: "Celiac Disease", description: "Immune reaction to gluten destroys villi, causing malabsorption of virtually all nutrients" },
      { name: "Crohn's Disease", description: "Transmural granulomatous inflammation that can affect any segment, causing fistulas and strictures" },
      { name: "Short Bowel Syndrome", description: "Malabsorption following surgical removal of large portions of small intestine" }
    ],
    fact: "If you could unfold all the villi and microvilli of your small intestine, the total absorptive surface area would cover the floor of a 2-bedroom apartment — approximately 200 square meters."
  },

  // ── LARGE INTESTINE ──────────────────────────────────────────────
  {
    id: "large_intestine",
    name: "Large Intestine (Colon)",
    medicalName: "Intestinum Crassum / Colon",
    system: "digestive",
    sex: "both",
    svgZone: "abdomen-lower",
    icon: "〽️",
    description: "The large intestine is a 1.5-meter wide-bore tube that receives unabsorbed material from the small intestine, recovers remaining water and electrolytes, and houses 100 trillion bacteria that form your gut microbiome. It converts liquid chyme into formed stool over 12–48 hours.",
    medicalDescription: "The intestinum crassum comprises the cecum, appendix, ascending colon, transverse colon, descending colon, sigmoid colon, rectum, and anus. Unlike the small intestine, it lacks villi but contains deep crypts, haustra (sacculations), and taeniae coli (three longitudinal muscle bands) giving it its characteristic appearance.",
    function: "Absorbs water (reabsorbs 1–1.5L/day), Na⁺, K⁺, and short-chain fatty acids (produced by bacteria). Forms, stores, and expels feces. Houses gut microbiome essential for vitamin K2 production, immune training, and SCFA production. Appendix may serve as microbiome reservoir.",
    vitamins: [
      { name: "Vitamin K2 (MK-7)", role: "Produced by colonic bacteria (Bacteroides, Lactobacillus) and absorbed through colon wall" },
      { name: "Biotin (B7)", role: "Synthesized by gut bacteria; absorbed in the colon" },
      { name: "Vitamin B12", role: "Synthesized by colon bacteria but cannot be absorbed here — an evolutionary paradox" }
    ],
    minerals: [
      { name: "Sodium", role: "Actively reabsorbed via ENaC channels; drives secondary water reabsorption" },
      { name: "Potassium", role: "Secreted into lumen in exchange for sodium; can cause hypokalemia in diarrhea" },
      { name: "Magnesium", role: "Some magnesium absorbed in colon; colonic bacteria affect magnesium bioavailability" }
    ],
    cellTypes: [
      { name: "Colonocytes", description: "Absorptive cells lacking microvilli but with dense mitochondria for active Na⁺ transport. Uniquely, they use short-chain fatty acids (acetate, propionate, butyrate) from bacterial fermentation as their primary fuel — not glucose." },
      { name: "Goblet cells", description: "Extremely numerous in colon — up to 25% of cells in sigmoid colon. Produce the thick two-layered mucus essential for lubricating feces and maintaining a microbe-free inner mucus layer." },
      { name: "Enteroendocrine L cells", description: "Secrete GLP-1, GLP-2, peptide YY (PYY). GLP-1 enhances insulin secretion; PYY suppresses appetite — the gut-brain satiety axis." }
    ],
    bloodFlow: "Ascending and transverse colon: superior mesenteric artery. Descending and sigmoid: inferior mesenteric artery. Rectum: superior, middle, and inferior rectal arteries. Venous drainage → portal system. Superior hemorrhoidal veins drain to portal (liver); middle/inferior hemorrhoidal to systemic circulation — creating a portosystemic anastomosis.",
    fluidRole: "Receives 1.5L of ileocecal contents daily; reduces this to 100–150ml of fecal water output. Mucus production is essential — without the inner mucus layer, bacteria contact and invade the epithelium causing inflammatory bowel disease.",
    cellularProcess: "Bacterial fermentation of dietary fiber → produces SCFAs (butyrate, propionate, acetate). Butyrate enters colonocytes → beta-oxidation → ATP → powers Na⁺ reabsorption. This is why a high-fiber diet directly fuels colon cell energy metabolism. Water follows Na⁺ osmotically via AQP3/4 aquaporins. Haustra mix contents while slow mass movements 1–3x/day propel stool toward rectum.",
    conditions: [
      { name: "Colorectal Cancer", description: "Most common GI cancer; polyps progress over 10–15 years to adenocarcinoma via APC/KRAS/TP53 mutations" },
      { name: "Ulcerative Colitis", description: "Continuous mucosal inflammation from rectum extending proximally; bloody diarrhea, cramping" },
      { name: "Diverticular Disease", description: "Herniation of mucosa through muscle weakness, forming diverticula prone to infection" },
      { name: "Irritable Bowel Syndrome (IBS)", description: "Altered gut-brain signaling causing altered motility, visceral hypersensitivity, and bloating" }
    ],
    fact: "Your gut microbiome contains 100 trillion bacteria from 500+ species — outnumbering your own cells 1.3:1 — and their collective genome (the microbiome) contains 150x more genes than the human genome."
  },

  // ── PANCREAS ──────────────────────────────────────────────────────
  {
    id: "pancreas",
    name: "Pancreas",
    medicalName: "Pancreas",
    system: "digestive",
    sex: "both",
    svgZone: "abdomen-upper-center",
    icon: "⚗️",
    description: "The pancreas is your body's dual-function master gland — a 15cm fish-shaped organ tucked behind the stomach. Its exocrine portion releases powerful digestive enzymes into the small intestine, while its endocrine islets of Langerhans produce insulin and glucagon to precisely control your blood sugar every minute of every day.",
    medicalDescription: "The pancreas has exocrine acinar cells (98% of mass) secreting 1.5–2L/day of enzyme-rich juice (pH 8.0) via pancreatic ducts. The endocrine islets of Langerhans (1–2% of mass, ~1 million islets) contain alpha cells (glucagon), beta cells (insulin), delta cells (somatostatin), and PP cells (pancreatic polypeptide).",
    function: "Exocrine: digests fats (lipase), proteins (trypsinogen, chymotrypsinogen), carbohydrates (amylase), and nucleic acids. Endocrine: insulin lowers blood glucose (promotes cellular uptake and glycogen synthesis); glucagon raises blood glucose (promotes glycogenolysis and gluconeogenesis).",
    vitamins: [
      { name: "Vitamin D", role: "Vitamin D receptors on beta cells; deficiency impairs insulin secretion and increases T2DM risk" },
      { name: "Vitamin E", role: "Antioxidant protecting beta cells from oxidative stress; may delay T1DM progression" },
      { name: "Vitamin B3 (Niacin)", role: "At pharmacological doses protects beta cells, but high doses can actually impair glucose tolerance" }
    ],
    minerals: [
      { name: "Zinc", role: "Essential for insulin crystallization, storage, and secretion in beta cell granules" },
      { name: "Chromium", role: "Potentiates insulin signaling; deficiency impairs glucose tolerance" },
      { name: "Magnesium", role: "Required for insulin receptor activation; deficiency linked to insulin resistance" },
      { name: "Manganese", role: "Cofactor for antioxidant enzymes protecting acinar and islet cells" }
    ],
    cellTypes: [
      { name: "Beta cells (β)", description: "Located in the islet center; produce insulin and C-peptide in response to rising blood glucose. They contain 10,000+ secretory granules of crystallized insulin-zinc hexamers." },
      { name: "Alpha cells (α)", description: "Located at islet periphery; produce glucagon when blood glucose falls. Glucagon signals the liver to release stored glucose (glycogenolysis)." },
      { name: "Acinar cells", description: "Exocrine cells arranged around centroacinar cells; synthesize inactive zymogens (trypsinogen, chymotrypsinogen) stored as zymogen granules released by CCK and vagal stimulation." },
      { name: "Delta cells (δ)", description: "Produce somatostatin that inhibits both insulin and glucagon secretion locally — the pancreas's own paracrine regulatory system." }
    ],
    bloodFlow: "Supplied by the celiac trunk and superior mesenteric artery via pancreaticoduodenal arcades. Islets receive 10x higher blood flow per unit volume than exocrine tissue. Importantly, blood flows from beta cell core outward to alpha cells — insulin from beta cells actually inhibits glucagon from adjacent alpha cells (paracrine effect).",
    fluidRole: "Pancreatic juice: bicarbonate-rich (HCO₃⁻ up to 120mEq/L) to neutralize gastric acid in duodenum; packed with digestive enzymes. Secreted as inactive zymogens (enterokinase in duodenum activates trypsinogen → trypsin → activates all others), preventing autodigestion.",
    cellularProcess: "Glucose enters beta cell via GLUT2 → glucose metabolism → ATP/ADP ratio rises → ATP-sensitive K⁺ channels close → membrane depolarizes → L-type Ca²⁺ channels open → calcium triggers exocytosis of insulin granules. This is the mechanism blocked in sulfonylurea drug therapy. Glucagon secretion uses a similar mechanism but is triggered by low glucose/amino acids.",
    conditions: [
      { name: "Type 1 Diabetes Mellitus", description: "Autoimmune destruction of beta cells eliminating insulin production; absolute insulin deficiency" },
      { name: "Type 2 Diabetes Mellitus", description: "Progressive beta cell dysfunction combined with peripheral insulin resistance" },
      { name: "Acute Pancreatitis", description: "Premature activation of digestive enzymes within the pancreas causing autodigestion and inflammation" },
      { name: "Pancreatic Cancer", description: "Extremely aggressive adenocarcinoma with <10% 5-year survival; often asymptomatic until advanced" }
    ],
    fact: "Your pancreas produces about 8 units of insulin per hour when fasting and can release a surge of 40 units within minutes after a meal. The beta cells must maintain insulin production non-stop for your entire lifetime."
  },

  // ── SPLEEN ──────────────────────────────────────────────────────
  {
    id: "spleen",
    name: "Spleen",
    medicalName: "Splen / Lien",
    system: "lymphatic",
    sex: "both",
    svgZone: "abdomen-upper-left",
    icon: "🔵",
    description: "The spleen is the body's largest lymphoid organ and a sophisticated blood filter the size of your fist. It acts as a quality control checkpoint for red blood cells — recycling old or damaged ones while trapping bacteria and activating immune responses. During fetal life, it's a blood-forming organ.",
    medicalDescription: "The splen is a secondary lymphoid organ weighing 150–200g, located in the left hypochondrium. It comprises red pulp (blood filtration and RBC storage/recycling) and white pulp (immune surveillance) separated by a marginal zone. It filters 350L of blood daily via the open circulation in red pulp sinusoids.",
    function: "Removes old, damaged, or abnormal red blood cells (hematopoietic function). Filters blood-borne pathogens and antigens. Stores platelets (~30% of total platelet pool). Produces antibodies and activates B and T lymphocytes. In hemolytic emergencies, can resume blood cell production (extramedullary hematopoiesis).",
    vitamins: [
      { name: "Vitamin D", role: "Modulates splenic macrophage activity and lymphocyte function" },
      { name: "Vitamin C", role: "Supports lymphocyte proliferation and immunoglobulin synthesis in white pulp" },
      { name: "Vitamin A", role: "Required for maintaining B cell zones (follicles) and T cell activation in spleen" }
    ],
    minerals: [
      { name: "Iron", role: "Recycled from hemoglobin in old red blood cells by splenic macrophages" },
      { name: "Zinc", role: "Essential for lymphocyte development and NK cell activity in white pulp" },
      { name: "Selenium", role: "Supports glutathione peroxidase in macrophages neutralizing ROS from phagocytosis" }
    ],
    cellTypes: [
      { name: "Red pulp macrophages", description: "The 'quality control inspectors' of red blood cells. They recognize aged, damaged, or parasitized RBCs via exposed phosphatidylserine and phagocytose them, recycling hemoglobin iron." },
      { name: "Marginal zone B cells", description: "Rapid-response B lymphocytes that provide the first antibody wave against blood-borne bacteria (especially encapsulated bacteria like pneumococcus) without needing T cell help." },
      { name: "Follicular dendritic cells", description: "Present antigens to B cells in germinal centers, driving antibody somatic hypermutation and affinity maturation." }
    ],
    bloodFlow: "Splenic artery branches into central arteries → capillaries open into red pulp sinusoids → blood percolates through reticular meshwork → venous sinuses → splenic vein → portal vein. This 'open circulation' allows macrophages to screen all passing blood cells.",
    fluidRole: "Stores ~200ml of blood and up to 30% of total platelets as a reserve. During hemorrhage or exercise, splenic contraction can add 200ml of blood to circulation within seconds (more pronounced in athletes and people at altitude).",
    cellularProcess: "Aged RBCs (>120 days) have oxidized cytoskeletal proteins → decreased deformability → unable to squeeze through 3μm slit-like pores in splenic sinusoids → trapped → engulfed by macrophages → hemoglobin → globin (recycled as amino acids) + heme → iron (stored as ferritin/transferred to transferrin) + biliverdin → bilirubin (conjugated by liver, excreted in bile).",
    conditions: [
      { name: "Splenomegaly", description: "Enlarged spleen from infections (EBV, malaria), liver disease, or blood disorders" },
      { name: "Hypersplenism", description: "Overactive spleen destroying too many blood cells, causing anemia, thrombocytopenia, and neutropenia" },
      { name: "Splenic Rupture", description: "Medical emergency — traumatic laceration causes rapid massive hemorrhage into peritoneal cavity" },
      { name: "Asplenia", description: "Life-long increased risk of overwhelming sepsis from encapsulated bacteria (pneumococcus, meningococcus, Haemophilus)" }
    ],
    fact: "People without a spleen (due to surgery or sickle cell disease) must take prophylactic antibiotics for life and receive extra vaccinations because their ability to fight encapsulated bacteria is severely impaired."
  },

  // ── THYROID ──────────────────────────────────────────────────────
  {
    id: "thyroid",
    name: "Thyroid Gland",
    medicalName: "Glandula Thyroidea",
    system: "endocrine",
    sex: "both",
    svgZone: "neck",
    icon: "⚗️",
    description: "The butterfly-shaped thyroid gland in your neck is your body's master metabolic thermostat. It produces thyroid hormones (T3 and T4) that control the metabolic rate of virtually every cell in your body — affecting temperature, energy, heart rate, brain development, bone growth, and much more.",
    medicalDescription: "The glandula thyroidea consists of two lobes connected by an isthmus, weighing 20–30g. Follicular cells produce T3 (triiodothyronine) and T4 (thyroxine) stored as thyroglobulin within follicular colloid. Parafollicular C-cells produce calcitonin. The hypothalamic-pituitary-thyroid (HPT) axis regulates secretion via TRH → TSH feedback.",
    function: "T3/T4 increase basal metabolic rate, stimulate protein synthesis, enhance sensitivity to catecholamines, regulate normal cardiac function, promote CNS development (critical in fetal life), stimulate bone turnover, and regulate body temperature. Calcitonin lowers blood calcium by inhibiting osteoclasts.",
    vitamins: [
      { name: "Vitamin D", role: "Regulates immune response against thyroid; deficiency linked to Hashimoto's and Graves' disease" },
      { name: "Vitamin A", role: "Regulates TSH and thyroid-stimulating hormone receptor gene expression" },
      { name: "Vitamin E", role: "Antioxidant protecting follicular cells from hydrogen peroxide used in thyroid hormone synthesis" },
      { name: "Vitamin C", role: "Reduces the oxidative stress inherent in thyroid hormone synthesis" }
    ],
    minerals: [
      { name: "Iodine", role: "Essential raw material for T3 (3 iodine atoms) and T4 (4 iodine atoms); deficiency causes goiter" },
      { name: "Selenium", role: "Required for 5'-deiodinase enzymes that convert T4 to active T3; deficiency impairs all thyroid function" },
      { name: "Zinc", role: "Required for T3 receptor binding and pituitary TSH production" },
      { name: "Iron", role: "Required for thyroid peroxidase (TPO) enzyme that incorporates iodine into thyroglobulin" }
    ],
    cellTypes: [
      { name: "Follicular cells (Thyrocytes)", description: "Cuboidal cells surrounding colloid-filled follicles. They perform the entire T3/T4 synthesis cycle: iodide uptake via NIS transporter → oxidation by TPO → iodination of thyroglobulin → endocytosis → proteolysis → T3/T4 release into blood." },
      { name: "Parafollicular C cells", description: "Located between follicles; produce calcitonin in response to elevated blood calcium. Calcitonin inhibits osteoclasts and promotes renal calcium excretion." }
    ],
    bloodFlow: "Highly vascular — receives ~80–120ml blood/min per gram of tissue (among highest of any organ). Supplied by superior and inferior thyroid arteries. Thyroid veins drain to internal jugular and brachiocephalic veins.",
    fluidRole: "Secretes 90% T4 (prohormone) and 10% T3 directly. T4 is converted to the more active T3 (3–5x more potent) by selenoprotein deiodinases in target tissues (especially liver, kidney, and brain). Both hormones bind to thyroid-binding globulin (TBG) for transport in blood.",
    cellularProcess: "TSH binds TSHR on follicular cell → cAMP cascade → NIS transporter brings iodide (I⁻) into cell → thyroid peroxidase (TPO) oxidizes I⁻ to I₂ using H₂O₂ → iodination of tyrosine residues on thyroglobulin forming MIT and DIT → coupling of MIT+DIT → T3/T4 stored in colloid → TSH stimulation → endocytosis of colloid → lysosomes release T3/T4 → diffuse into blood.",
    conditions: [
      { name: "Hypothyroidism", description: "Insufficient thyroid hormone causing fatigue, weight gain, cold intolerance; Hashimoto's is the most common cause" },
      { name: "Hyperthyroidism (Graves' Disease)", description: "Autoantibodies stimulate TSH receptor causing excess T3/T4, weight loss, heat intolerance, and exophthalmos" },
      { name: "Thyroid Cancer", description: "Most common endocrine cancer; usually papillary type from follicular cells; excellent prognosis if caught early" },
      { name: "Goiter", description: "Thyroid enlargement from iodine deficiency or TSH hyperstimulation" }
    ],
    fact: "Thyroid hormones are the only ones in the body that require an essential mineral (iodine) obtained entirely from diet. Iodine deficiency is the world's leading preventable cause of intellectual disability and affects about 2 billion people globally."
  },

  // ── SKIN ──────────────────────────────────────────────────────
  {
    id: "skin",
    name: "Skin",
    medicalName: "Cutis / Integumentum Commune",
    system: "integumentary",
    sex: "both",
    svgZone: "skin-layer",
    icon: "🫶",
    description: "Your skin is your body's largest organ — about 2 square meters and weighing 4–5kg. It's a remarkable multi-layered barrier that keeps pathogens out, prevents dehydration, regulates temperature, detects sensations, synthesizes vitamin D, and even plays a role in immunity and communication through sweat and pheromones.",
    medicalDescription: "The cutis consists of the epidermis (stratified squamous epithelium), dermis (dense irregular connective tissue with collagen/elastin), and hypodermis (subcutaneous adipose and connective tissue). Skin appendages include hair follicles, eccrine/apocrine sweat glands, and sebaceous glands.",
    function: "Physical barrier against pathogens, UV radiation, and chemicals. Prevents trans-epidermal water loss (TEWL). Thermoregulation via eccrine sweat glands and vasodilation/constriction of dermal blood vessels. Synthesizes vitamin D3 from 7-dehydrocholesterol on UV exposure. Sensory detection of touch, pressure, pain, and temperature. Immune defense via Langerhans cells.",
    vitamins: [
      { name: "Vitamin D3", role: "Synthesized in skin from 7-dehydrocholesterol via UV-B radiation; essential for calcium absorption and immunity" },
      { name: "Vitamin C", role: "Essential cofactor for collagen synthesis (hydroxylation of proline and lysine); deficiency causes scurvy (collagen failure)" },
      { name: "Vitamin E", role: "Primary antioxidant in skin lipids protecting against UV-induced oxidative damage" },
      { name: "Vitamin A (Retinol)", role: "Required for normal keratinocyte differentiation; deficiency causes rough, scaly skin (phrynoderma)" },
      { name: "Biotin (B7)", role: "Cofactor for fatty acid synthesis needed for sebum and keratin production; deficiency causes hair loss and dermatitis" },
      { name: "Niacin (B3)", role: "Deficiency causes pellagra (dermatitis in sun-exposed areas — the '4 Ds': Dermatitis, Diarrhea, Dementia, Death)" }
    ],
    minerals: [
      { name: "Zinc", role: "Required for collagen synthesis and wound healing; deficiency causes delayed healing and skin lesions" },
      { name: "Silicon", role: "Supports collagen and elastin cross-linking; maintains skin elasticity" },
      { name: "Selenium", role: "Part of glutathione peroxidase protecting skin cells; deficiency increases skin cancer risk" },
      { name: "Sulfur", role: "Structural component of keratin protein in skin, hair, and nails" },
      { name: "Copper", role: "Required for lysyl oxidase cross-linking collagen and elastin; needed for melanin synthesis" }
    ],
    cellTypes: [
      { name: "Keratinocytes (90% of epidermis)", description: "Continuously produced from basal layer → differentiate → migrate upward over 28–40 days → form dead, keratin-packed corneocytes of the stratum corneum → shed (desquamation). Produce keratin, a tough structural protein." },
      { name: "Melanocytes", description: "Located at stratum basale; produce melanin (eumelanin = brown/black, pheomelanin = red/yellow) in melanosomes transferred to keratinocytes. Melanin absorbs UV radiation protecting DNA." },
      { name: "Langerhans cells", description: "Dermal dendritic immune cells that capture antigens penetrating the epidermis and present them to T cells in lymph nodes — the skin's sentinel immune system." },
      { name: "Merkel cells", description: "Mechanoreceptors at the stratum basale; detect sustained light touch and pressure. They synapse with sensory nerve fibers." },
      { name: "Dermal fibroblasts", description: "Synthesize and maintain the dermal collagen/elastin ECM. Activity declines with age causing skin thinning and wrinkles." }
    ],
    bloodFlow: "Skin receives 8–10% of cardiac output at rest; increases to ~40% during heat stress for thermoregulation. Arteriovenous shunts in the dermis can rapidly divert blood. In cold, vasoconstriction shunts blood away; in heat, vasodilation radiates heat. Dermal capillary loops deliver nutrients to the avascular epidermis by diffusion.",
    fluidRole: "Eccrine glands produce up to 10L/day of sweat (primarily water, NaCl, urea, lactate) for evaporative cooling. Sebaceous glands secrete sebum (lipid mixture) lubricating skin and hair. The acid mantle (pH 4.5–5.5) from sweat and sebum inhibits bacterial/fungal colonization.",
    cellularProcess: "UV-B radiation (290–315nm) hits 7-dehydrocholesterol in keratinocytes → thermal isomerization → previtamin D3 → vitamin D3. Separately, UV-B causes direct DNA damage (cyclobutane pyrimidine dimers) → p53 activation → DNA repair or apoptosis. Keratinocyte differentiation driven by calcium gradient: low Ca²⁺ at basal layer (proliferative), high Ca²⁺ at upper layers (differentiation) → involucrin/loricrin/filaggrin cross-linking creates cornified envelope.",
    conditions: [
      { name: "Melanoma", description: "Malignant transformation of melanocytes; deadliest skin cancer due to early metastasis" },
      { name: "Psoriasis", description: "Immune-driven keratinocyte hyperproliferation (3x normal speed) causing thick, silvery scaly plaques" },
      { name: "Atopic Dermatitis (Eczema)", description: "Barrier defect (filaggrin mutations) combined with Th2 immune skewing causing chronic itchy inflammation" },
      { name: "Acne Vulgaris", description: "Sebaceous follicle obstruction + Cutibacterium acnes proliferation causing comedones and inflammation" }
    ],
    fact: "Your outer skin layer (stratum corneum) is completely replaced every 2–4 weeks. You shed approximately 30,000–40,000 dead skin cells every hour — generating about 30–40kg of skin over a lifetime."
  },

  // ── EYES ──────────────────────────────────────────────────────
  {
    id: "eyes",
    name: "Eyes",
    medicalName: "Oculi",
    system: "sensory",
    sex: "both",
    svgZone: "head-face",
    icon: "👁",
    description: "Your eyes are the most complex sensory organs in the body, containing over 120 million photoreceptors that convert light into the electrical signals your brain interprets as vision. Each eye is a complete optical system with a lens that adjusts focus, a diaphragm (iris) controlling light entry, and a light-sensitive retina that processes an estimated 10 million bits of visual data per second.",
    medicalDescription: "The oculus is a sphere (~24mm diameter) with three concentric tunics: fibrous (cornea + sclera), vascular (choroid + ciliary body + iris), and neural (retina). Refraction of light through the cornea (70%) and lens (30%) focuses images on the fovea centralis of the macula lutea, where cone density is highest.",
    function: "Detects visible light (380–700nm) with high spatial resolution and color discrimination (trichromacy from S, M, L cones). Rods provide scotopic (night) vision. The retina performs initial image processing before signals travel via optic nerve → lateral geniculate nucleus → primary visual cortex (V1). Also regulates circadian rhythms via intrinsically photosensitive retinal ganglion cells (ipRGCs).",
    vitamins: [
      { name: "Vitamin A (Retinal)", role: "11-cis-retinal is the chromophore in rhodopsin and cone opsins; absolute requirement for vision; deficiency causes night blindness" },
      { name: "Vitamin C", role: "Highest concentration in the eye among all body tissues; protects lens from UV-oxidative damage; delays cataract formation" },
      { name: "Vitamin E", role: "Antioxidant in photoreceptor membranes; deficiency causes retinal degeneration" },
      { name: "Lutein & Zeaxanthin", role: "Concentrated in the macula as a protective 'yellow filter' absorbing harmful blue light and quenching ROS" }
    ],
    minerals: [
      { name: "Zinc", role: "Highest concentration in the retinal pigment epithelium (RPE); cofactor for retinol dehydrogenase; deficiency linked to AMD" },
      { name: "Selenium", role: "Antioxidant protecting photoreceptors from light-induced oxidative stress" },
      { name: "Copper", role: "Required with zinc for antioxidant enzymes; must be supplemented when taking high-dose zinc (AMD treatment)" }
    ],
    cellTypes: [
      { name: "Rod photoreceptors (~120 million)", description: "Highly sensitive to light; respond to single photons. Contain rhodopsin (opsin + 11-cis retinal). Located throughout peripheral retina for peripheral and night vision." },
      { name: "Cone photoreceptors (~6 million)", description: "Three types (S/M/L) absorbing short/medium/long wavelengths (blue/green/red). Concentrated in fovea for high-acuity color vision." },
      { name: "Retinal Pigment Epithelium (RPE)", description: "Dark cuboidal cells underlying photoreceptors. They phagocytose and recycle outer rod/cone segments, regenerate 11-cis retinal (visual cycle), and maintain photoreceptor health." },
      { name: "Retinal Ganglion cells (RGCs)", description: "Output neurons of the retina; their axons form the optic nerve. Intrinsically photosensitive RGCs (ipRGCs) containing melanopsin signal the suprachiasmatic nucleus regulating circadian rhythms." }
    ],
    bloodFlow: "Retina has dual supply: inner layers via central retinal artery (branch of ophthalmic artery), outer layers (photoreceptors, RPE) via choriocapillaris — a rich capillary bed in the choroid. The macula is supplied exclusively by choriocapillaris, making it vulnerable to vascular disease (AMD).",
    fluidRole: "Aqueous humor (~0.3ml) produced by ciliary body epithelium fills anterior and posterior chambers, maintaining intraocular pressure (IOP) of 10–21mmHg. It nourishes the avascular cornea and lens. Outflow via trabecular meshwork → Schlemm's canal. Disrupted outflow causes glaucoma.",
    cellularProcess: "Phototransduction: photon absorbed by 11-cis retinal → isomerizes to all-trans retinal → activates rhodopsin → activates transducin (G protein) → activates phosphodiesterase → cGMP hydrolysis → cGMP-gated Na⁺ channels close → hyperpolarization → reduced glutamate release → bipolar → ganglion cell signal. Dark current restored by guanylyl cyclase regenerating cGMP in the dark.",
    conditions: [
      { name: "Age-related Macular Degeneration (AMD)", description: "Drusen accumulation and RPE degeneration destroying central vision" },
      { name: "Glaucoma", description: "Elevated IOP damages optic nerve fibers, causing progressive peripheral vision loss" },
      { name: "Diabetic Retinopathy", description: "Retinal capillary damage from chronic hyperglycemia; leading cause of blindness in working-age adults" },
      { name: "Cataract", description: "Oxidative cross-linking of lens crystallin proteins causing opacity; most common cause of blindness globally" }
    ],
    fact: "Your eyes can detect a candle flame from 14 miles away on a clear, dark night. They process information faster than any supercomputer — interpreting an image within 13 milliseconds of light hitting the retina."
  },

  // ── SKELETON (BONES) ──────────────────────────────────────────
  {
    id: "skeleton",
    name: "Skeletal System",
    medicalName: "Systema Skeletale",
    system: "skeletal",
    sex: "both",
    svgZone: "full-body",
    icon: "🦴",
    description: "Your skeleton is 206 bones forming a living, dynamic framework that provides structure, protects organs, enables movement, stores minerals, and manufactures blood cells. Bone is a composite material — harder than reinforced concrete yet lighter than steel — that continuously remodels itself throughout life in response to stress and hormonal signals.",
    medicalDescription: "The systema skeletale consists of the axial skeleton (80 bones: skull, vertebral column, ribs, sternum) and appendicular skeleton (126 bones: pectoral/pelvic girdles and limbs). Bone matrix is a composite of type I collagen (organic, provides tensile strength) and hydroxyapatite Ca₁₀(PO₄)₆(OH)₂ (mineral, provides compressive strength).",
    function: "Provides structural framework and lever system for movement. Protects brain (skull), spinal cord (vertebrae), heart and lungs (ribcage). Stores 99% of body calcium and 85% of phosphorus as mineral reservoir. Red marrow produces all blood cells (hematopoiesis). Produces hormones: osteocalcin (regulates metabolism), FGF-23 (regulates phosphate).",
    vitamins: [
      { name: "Vitamin D3 (Calcitriol)", role: "Increases intestinal calcium and phosphorus absorption; without it, bone mineralization fails (rickets in children, osteomalacia in adults)" },
      { name: "Vitamin K2 (MK-7)", role: "Carboxylates osteocalcin enabling it to bind calcium into hydroxyapatite; directs calcium to bones, away from arteries" },
      { name: "Vitamin C", role: "Essential cofactor for hydroxylation of proline and lysine in type I collagen; deficiency (scurvy) causes fragile, painful bones" },
      { name: "Vitamin A", role: "Required for osteoblast and osteoclast differentiation; both deficiency and excess impair bone health" }
    ],
    minerals: [
      { name: "Calcium", role: "99% stored in bone as hydroxyapatite; required for bone strength, muscle contraction, and nerve signaling" },
      { name: "Phosphorus", role: "85% in bone; component of hydroxyapatite and ATP; regulated with calcium by PTH and vitamin D" },
      { name: "Magnesium", role: "~60% stored in bone; cofactor for alkaline phosphatase in osteoblasts; regulates PTH secretion" },
      { name: "Zinc", role: "Cofactor for alkaline phosphatase and collagenase; stimulates osteoblast activity and inhibits osteoclast activity" },
      { name: "Manganese", role: "Required for glycosaminoglycan synthesis in bone matrix and cartilage" },
      { name: "Boron", role: "Influences magnesium and calcium metabolism; may reduce calcium excretion" },
      { name: "Silicon", role: "Stimulates type I collagen synthesis in osteoblasts; high bone concentrations in areas of active calcification" },
      { name: "Strontium", role: "Incorporated into hydroxyapatite; stimulates osteoblasts and inhibits osteoclasts" }
    ],
    cellTypes: [
      { name: "Osteoblasts", description: "Bone-forming cells derived from mesenchymal stem cells. They synthesize and secrete type I collagen matrix (osteoid) and direct its mineralization with hydroxyapatite. ~10–15% become trapped as osteocytes." },
      { name: "Osteoclasts", description: "Giant multinucleated cells derived from monocyte precursors that resorb bone. They create a 'sealed zone', acidify it to pH 4.5 dissolving mineral, then secrete cathepsin K protease digesting collagen. RANK/RANKL pathway drives their activation." },
      { name: "Osteocytes", description: "Most abundant bone cells (>90%), embedded in lacunae within mineralized matrix. They sense mechanical strain via canalicular fluid flow and signal osteoblasts/osteoclasts via sclerostin and RANKL to adapt bone to loading. Each osteocyte maintains its own ~0.1mm³ territory." },
      { name: "Bone lining cells", description: "Quiescent osteoblasts covering the bone surface; can be activated to remodel bone and maintain the bone marrow niche." }
    ],
    bloodFlow: "Bone receives ~10% of cardiac output. Nutrient arteries enter through nutrient foramina → Haversian canal system → canaliculi nourish individual osteocytes. Red marrow in vertebrae, ribs, sternum, and proximal long bones is highly vascularized for hematopoiesis.",
    fluidRole: "Osteocytes communicate via gap junctions and canalicular fluid. Bone continuously releases calcium into blood when blood Ca²⁺ falls (PTH activates osteoclasts). Bone marrow produces blood cells: red marrow (hematopoiesis) and yellow marrow (fat storage, reserve hematopoiesis).",
    cellularProcess: "Bone remodeling cycle (3–6 months): osteocyte senses microdamage → RANKL expression → RANKL binds RANK on osteoclast precursors → osteoclast differentiation → resorption (dissolves ~0.05mm³ bone/day) → reversal → osteoblast recruitment via TGF-β, IGF-1 from matrix → osteoid secretion → mineralization begins within 10–15 days → 3–6 months to complete mineralization. 10% of the skeleton is remodeled annually.",
    conditions: [
      { name: "Osteoporosis", description: "Imbalanced remodeling (resorption > formation) causing porous, fracture-prone bone; affects 200 million worldwide" },
      { name: "Osteoarthritis", description: "Cartilage degeneration at joint surfaces causing subchondral bone changes, pain, and stiffness" },
      { name: "Fractures", description: "Break in bone continuity; heals via hematoma → callus (cartilage) → ossification over 6–8 weeks" },
      { name: "Osteosarcoma", description: "Malignant bone tumor, most common in adolescents at the growth plates of long bones" }
    ],
    fact: "Bone is actually 5 times stronger than steel by weight. A human femur can withstand about 1,700 pounds of force per square inch — stronger than concrete — yet weighs only about 250 grams."
  },

  // ── MUSCLES ──────────────────────────────────────────────────────
  {
    id: "muscles",
    name: "Muscular System",
    medicalName: "Systema Musculare",
    system: "muscular",
    sex: "both",
    svgZone: "full-body",
    icon: "💪",
    description: "Your 600+ skeletal muscles make up 40–45% of your body weight and are responsible for every voluntary movement — from blinking to marathon running. But muscles do far more than move: they generate nearly all body heat, act as endocrine organs secreting myokines, store amino acids as a metabolic reserve, and even influence brain health and aging.",
    medicalDescription: "Skeletal muscle is striated voluntary muscle composed of multinucleated myofibers organized into fascicles. Each myofiber contains parallel myofibrils built from sarcomere units — the contractile unit consisting of interdigitating thick (myosin) and thin (actin, troponin, tropomyosin) filaments arranged in the characteristic A, I, H, and Z bands producing the striated appearance.",
    function: "Produces movement and force via concentric, eccentric, and isometric contractions. Maintains posture against gravity. Stabilizes joints. Generates heat (shivering thermogenesis, up to 90% resting heat). Pumps blood back to heart (skeletal muscle pump). Produces myokines (IL-6, irisin, BDNF) — hormone-like molecules that improve brain function, reduce inflammation, and drive fat oxidation.",
    vitamins: [
      { name: "Vitamin D", role: "Binds vitamin D receptors in muscle cells regulating calcium handling and protein synthesis; deficiency causes proximal muscle weakness" },
      { name: "Vitamin B1 (Thiamine)", role: "Required for pyruvate dehydrogenase complex; needed for aerobic ATP production from glucose in exercising muscle" },
      { name: "Vitamin C", role: "Required for carnitine synthesis (moves fatty acids into mitochondria); supports collagen in tendons and fascia" },
      { name: "Vitamin E", role: "Protects muscle cell membranes from exercise-induced lipid peroxidation" }
    ],
    minerals: [
      { name: "Calcium", role: "Triggers every muscle contraction by binding troponin C; released from sarcoplasmic reticulum on neural stimulation" },
      { name: "Magnesium", role: "Required for ATP-Mg²⁺ complex (active form of ATP); needed for muscle relaxation (Ca²⁺ reuptake into SR)" },
      { name: "Potassium", role: "Maintains resting membrane potential; lost in sweat during exercise, causing cramps" },
      { name: "Sodium", role: "Essential for action potential generation at the neuromuscular junction" },
      { name: "Iron", role: "Component of myoglobin (oxygen storage in muscle) and cytochromes (mitochondrial electron transport chain)" },
      { name: "Phosphorus", role: "Component of phosphocreatine (PCr) — the immediate energy buffer for the first 10 seconds of maximal effort" }
    ],
    cellTypes: [
      { name: "Type I (Slow-twitch) fibers", description: "Rich in mitochondria and myoglobin (giving red color). Use aerobic oxidative metabolism. Fatigue-resistant; ideal for endurance. Dominated by MHC-I myosin isoform with slow ATPase rate." },
      { name: "Type IIa (Fast oxidative-glycolytic) fibers", description: "Intermediate fiber; both aerobic and anaerobic capacity. Moderately fatigable. Training can shift Type IIx toward Type IIa." },
      { name: "Type IIx (Fast glycolytic) fibers", description: "White, few mitochondria, rely on anaerobic glycolysis. Highest force production but fatigue quickly (seconds to minutes). Dominate in explosive/sprint activities." },
      { name: "Satellite cells (Muscle stem cells)", description: "Quiescent stem cells beneath the basal lamina of each myofiber. Activated by exercise-induced damage → proliferate → fuse with existing fibers for repair and hypertrophy." }
    ],
    bloodFlow: "At rest: muscles receive ~15–20% of cardiac output. During maximal exercise: can demand up to 88% of cardiac output via local vasodilation (metabolic hyperemia driven by adenosine, K⁺, H⁺, CO₂). Capillary density varies: Type I fibers have 2–3x more capillaries per fiber than Type IIx. Endurance training increases capillarization.",
    fluidRole: "Muscle contains ~75% water. Glycogen (500–800g total body stores) is stored as granules in myofibers — each gram glycogen bound to 3g water. Exercise: glycogen → glucose-1-phosphate → glycolysis → pyruvate → acetyl-CoA → Krebs cycle → ATP. Creatine phosphate (PCr) buffers immediate ATP demand via: PCr + ADP → Cr + ATP (creatine kinase reaction).",
    cellularProcess: "Neuromuscular junction: motor neuron action potential → ACh release → nicotinic ACh receptor depolarizes sarcolemma → action potential propagates into T-tubules → RyR1 Ca²⁺ channels in SR open → Ca²⁺ flood → Ca²⁺ binds troponin C → tropomyosin shifts → myosin binding sites on actin exposed → myosin head binds actin (cross-bridge) → power stroke (force generation, 5–10nm movement) → ATP hydrolysis resets head. SERCA pump reuptakes Ca²⁺ for relaxation.",
    conditions: [
      { name: "Sarcopenia", description: "Age-related loss of muscle mass and strength (3–5% per decade after 30); linked to frailty and metabolic disease" },
      { name: "Muscular Dystrophies (DMD)", description: "Genetic absence of dystrophin causes progressive myofiber destruction and fibrosis" },
      { name: "Rhabdomyolysis", description: "Massive myofiber breakdown releasing myoglobin → kidney damage; from extreme exercise, crush injuries, or statins" }
    ],
    fact: "The gluteus maximus (buttock) is your largest muscle and generates the most power. Your hardest-working muscle is the heart. Your most precise is the extraocular muscle controlling eye movement — it fires in bursts as short as 1 millisecond."
  },

  // ── NERVOUS SYSTEM (Spinal Cord) ──────────────────────────────
  {
    id: "spinal_cord",
    name: "Spinal Cord",
    medicalName: "Medulla Spinalis",
    system: "nervous",
    sex: "both",
    svgZone: "spine",
    icon: "⚡",
    description: "The spinal cord is the brain's main communication highway — a 45cm cable of nerve tissue running down your back through the vertebral column. It transmits signals to and from the brain at incredible speed, controls reflex actions independently (you pull your hand from a hot stove before your brain registers pain), and coordinates walking patterns.",
    medicalDescription: "The medulla spinalis extends from the medulla oblongata to L1–L2. It contains 31 pairs of spinal nerves (8 cervical, 12 thoracic, 5 lumbar, 5 sacral, 1 coccygeal). The gray matter (H-shaped in cross-section) contains interneurons and motor neuron cell bodies; white matter contains myelinated ascending/descending tracts.",
    function: "Sensory transmission to brain (spinothalamic: pain/temperature; dorsal column: touch/proprioception). Motor commands from brain to muscles (corticospinal tract). Reflex arcs (monosynaptic and polysynaptic). Pattern generators for locomotion, breathing, and urination. Autonomic pathways (sympathetic: T1–L2; parasympathetic: S2–S4).",
    vitamins: [
      { name: "Vitamin B12", role: "Critical for myelin synthesis; subacute combined degeneration from B12 deficiency destroys dorsal columns and corticospinal tracts" },
      { name: "Vitamin E", role: "Antioxidant protecting myelin lipids from peroxidation; deficiency causes spinocerebellar ataxia" },
      { name: "Vitamin D", role: "Neuroprotective; reduces neuroinflammation; deficiency may contribute to MS severity" }
    ],
    minerals: [
      { name: "Magnesium", role: "NMDA receptor antagonist preventing excitotoxicity in spinal interneurons" },
      { name: "Zinc", role: "Modulates synaptic transmission and GABA receptor function in spinal cord" }
    ],
    cellTypes: [
      { name: "Alpha motor neurons", description: "Large neurons in ventral horn that directly innervate skeletal muscle fibers. Their axons can be over 1 meter long. The 'final common pathway' — all voluntary movement converges on them." },
      { name: "Dorsal horn interneurons", description: "Process and gate incoming sensory information. Gate theory of pain: these cells can be inhibited by large-fiber touch signals, reducing pain perception." },
      { name: "Oligodendrocytes", description: "Myelinate CNS axons in the spinal cord white matter. Each oligodendrocyte myelinates up to 50 axon segments, enabling saltatory conduction (speeds up to 120m/s)." }
    ],
    bloodFlow: "Anterior spinal artery (single, from vertebral arteries) supplies anterior 2/3. Two posterior spinal arteries supply posterior 1/3. Radicular arteries from aorta reinforce supply (artery of Adamkiewicz at T8–L1 is critical). Watershed zone vulnerability to ischemia at T4.",
    fluidRole: "Surrounded by cerebrospinal fluid (CSF) within the subarachnoid space and protected by three meninges: pia mater (innermost), arachnoid (middle), dura mater (outermost). CSF acts as a shock absorber and delivers nutrients.",
    cellularProcess: "Reflex arc: sensory receptor → afferent neuron → spinal cord synapse → interneuron (optional) → efferent motor neuron → effector muscle. Knee-jerk reflex completes in ~50ms — far faster than conscious perception (250ms). Myelination enables saltatory (jumping) conduction between Nodes of Ranvier at 70–120m/s.",
    conditions: [
      { name: "Spinal Cord Injury (SCI)", description: "Traumatic damage causing complete or incomplete loss of sensation and movement below injury level" },
      { name: "Multiple Sclerosis (MS)", description: "Autoimmune demyelination of CNS white matter causing relapsing-remitting neurological deficits" },
      { name: "Amyotrophic Lateral Sclerosis (ALS)", description: "Progressive degeneration of both upper and lower motor neurons causing total paralysis" }
    ],
    fact: "Your fastest nerve signals travel at 120 m/s (270 mph) — they're the fastest signals in the entire body, allowing you to catch a falling object before you consciously realize it's falling."
  },

  // ── ADRENAL GLANDS ──────────────────────────────────────────────
  {
    id: "adrenal_glands",
    name: "Adrenal Glands",
    medicalName: "Glandulae Suprarenales",
    system: "endocrine",
    sex: "both",
    svgZone: "abdomen-upper-back",
    icon: "⚗️",
    description: "Perched atop your kidneys like two little hats, the adrenal glands are your body's crisis management system. They produce adrenaline (epinephrine) for the instant 'fight or flight' response and cortisol for longer-term stress adaptation. They also produce androgens and aldosterone controlling blood pressure and salt balance.",
    medicalDescription: "Each glandula suprarenalis has an outer cortex (3 zones: zona glomerulosa → aldosterone; zona fasciculata → cortisol; zona reticularis → androgens DHEA/DHEAS) and an inner medulla (chromaffin cells → catecholamines: epinephrine 80%, norepinephrine 20%). Cortical hormones are steroid-based; medullary are amine-based.",
    function: "Medulla: adrenaline/noradrenaline for acute stress response (↑HR, ↑BP, ↑glucose, bronchodilation, pupil dilation, redirected blood flow). Cortex — aldosterone: Na⁺/K⁺ regulation and blood pressure control. Cortisol: immune modulation, gluconeogenesis, fat mobilization, anti-inflammatory. DHEA/DHEAS: androgen precursors for sex hormones.",
    vitamins: [
      { name: "Vitamin C", role: "Highest concentration in the body; required for cortisol synthesis and adrenaline production; rapidly depleted during stress" },
      { name: "Vitamin B5 (Pantothenic acid)", role: "Required for CoA synthesis needed in steroid hormone production; deficiency impairs adrenal cortex function" },
      { name: "Vitamin B6", role: "Required for DOPA decarboxylase in catecholamine synthesis pathway in adrenal medulla" }
    ],
    minerals: [
      { name: "Sodium", role: "Aldosterone directly regulates renal sodium reabsorption, body fluid volume, and blood pressure" },
      { name: "Potassium", role: "Elevated K⁺ directly stimulates aldosterone secretion from zona glomerulosa" },
      { name: "Magnesium", role: "Modulates HPA axis activity; deficiency causes elevated cortisol and adrenal hypersensitivity" }
    ],
    cellTypes: [
      { name: "Chromaffin cells (Medulla)", description: "Modified sympathetic neurons that secrete catecholamines directly into blood instead of across a synapse. They respond within seconds to sympathetic stimulation." },
      { name: "Zona fasciculata cells", description: "Largest zone cells; packed with lipid droplets (cholesterol stores for steroid synthesis). Produce cortisol via ACTH-driven signaling." }
    ],
    bloodFlow: "Receives among the highest blood flow per gram of any organ (~6–7ml/min/g). Supplied by superior, middle, and inferior suprarenal arteries. Centrally drains via suprarenal vein. The portal-like flow from cortex to medulla means medullary cells are bathed in high-cortisol blood — necessary for inducing PNMT enzyme converting NE to epinephrine.",
    fluidRole: "Cortisol and aldosterone are lipid-soluble steroids carried bound to plasma proteins (cortisol-binding globulin, albumin). They diffuse directly through cell membranes to bind nuclear receptors.",
    cellularProcess: "Stress → hypothalamus CRH → anterior pituitary ACTH → adrenal cortex → StAR protein transports cholesterol into mitochondria → P450scc cleaves side chain → pregnenolone → series of enzymatic conversions (CYP11A1, CYP17A1, CYP21A2, CYP11B1/B2) → cortisol or aldosterone. Cortisol binds GR receptor → translocates to nucleus → transcription of hundreds of anti-inflammatory/metabolic genes.",
    conditions: [
      { name: "Addison's Disease", description: "Autoimmune destruction of adrenal cortex causing deficiency of cortisol and aldosterone — can be fatal in acute crisis" },
      { name: "Cushing's Syndrome", description: "Excess cortisol (from tumor or steroid medication) causing central obesity, moon face, purple striae, hypertension, and diabetes" },
      { name: "Pheochromocytoma", description: "Adrenal medulla tumor secreting excess catecholamines causing hypertensive crises, sweating, and palpitations" },
      { name: "Congenital Adrenal Hyperplasia", description: "Genetic enzyme deficiency (usually 21-hydroxylase) shunting cortisol precursors to androgens" }
    ],
    fact: "During an acute stress response, your adrenal glands can release enough epinephrine in 30 seconds to raise blood glucose by 25%, increase heart rate by 50%, and redirect 80% of blood flow from non-essential organs to muscles and brain."
  }
];

// Helper functions
window.getOrganById = id => window.ANATOMY.find(o => o.id === id);
window.getOrgansBySystem = sys => window.ANATOMY.filter(o => o.system === sys);
window.searchOrgans = query => {
  const q = query.toLowerCase();
  return window.ANATOMY.filter(o =>
    o.name.toLowerCase().includes(q) ||
    o.medicalName.toLowerCase().includes(q) ||
    (o.description && o.description.toLowerCase().includes(q))
  );
};
