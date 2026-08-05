'use client';
import React, { useState, useRef, useMemo, Suspense, useCallback, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, RotateCcw, Layers, X, ChevronRight, Info,
  Search, Trophy, CheckCircle2, XCircle, Zap, Activity,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

type Gender    = 'MALE' | 'FEMALE';
type Phase     = 'SELECT' | 'BODY';
type Tab       = 'FULL' | 'SKELETAL' | 'ORGANS' | 'CIRCULATORY' | 'NERVOUS' | 'RESPIRATORY' | 'MUSCULAR';
type DetailTab = 'OVERVIEW' | 'NUTRITION' | 'CELLULAR' | 'CONDITIONS';
type AppMode   = 'EXPLORE' | 'QUIZ';

interface VitaminEntry   { name: string; role: string }
interface CellTypeEntry  { name: string; description: string }
interface ConditionEntry { name: string; description: string }

interface OrganDef {
  id: string; name: string; latin: string;
  color: string; emissiveColor: string;
  position: [number, number, number];
  scale: [number, number, number];
  explodeOffset: [number, number, number];
  shape: 'brain' | 'capsule' | 'flat-sphere' | 'torus' | 'blob' | 'sphere';
  systems: Tab[]; genders: Gender[];
  animationType: 'pulse' | 'breathe' | 'neutral' | 'flow';
  description: string; functions: string[]; funFacts: string[];
  medicalDescription?: string;
  vitamins?: VitaminEntry[];
  minerals?: VitaminEntry[];
  cellTypes?: CellTypeEntry[];
  bloodFlow?: string;
  fluidRole?: string;
  cellularProcess?: string;
  conditions?: ConditionEntry[];
  fact?: string;
}

// ─── Organ Data ─────────────────────────────────────────────────────────────────

const ORGANS: OrganDef[] = [
  {
    id:'brain', name:'Brain', latin:'Cerebrum', color:'#9B72CF', emissiveColor:'#5A2A8A',
    position:[0,1.28,0.02], scale:[0.21,0.2,0.21], explodeOffset:[0,0.9,0.7],
    shape:'brain', systems:['FULL','NERVOUS'], genders:['MALE','FEMALE'], animationType:'pulse',
    description:'The brain is your body\'s command center — a 3-pound organ that processes every thought, memory, sensation, movement, and emotion. Despite being only 2% of body weight, it consumes 20% of all oxygen and generates up to 25 watts of electricity.',
    functions:['Controls all voluntary movement and reflexes','Processes every sensory signal','Forms and retrieves memory','Regulates hormones via the hypothalamus','Drives emotion, language, and abstract thought'],
    funFacts:['86 billion neurons — comparable to stars in the Milky Way','Generates ~23 watts of electricity when awake','Has no pain receptors — cannot feel pain itself','Continues developing until age 25'],
    medicalDescription:'The encephalon is the rostral portion of the central nervous system enclosed within the cranium. It comprises the cerebrum (telencephalon and diencephalon), cerebellum (metencephalon), and brainstem (pons, medulla oblongata, and mesencephalon). Neuronal communication occurs via electrochemical signaling across synaptic junctions.',
    vitamins:[
      { name:'Vitamin B12 (Cobalamin)', role:'Maintains myelin sheath insulating nerve fibers; deficiency causes cognitive decline' },
      { name:'Vitamin B6 (Pyridoxine)', role:'Essential for synthesizing serotonin, dopamine, and GABA neurotransmitters' },
      { name:'Vitamin D', role:'Modulates neurotransmitter synthesis and neuroprotection against inflammation' },
      { name:'Vitamin E', role:'Powerful antioxidant protecting neurons from oxidative stress and free radicals' },
      { name:'Choline (B-complex)', role:'Precursor to acetylcholine, the neurotransmitter for memory and learning' },
    ],
    minerals:[
      { name:'Iron', role:'Required for oxygen delivery to brain cells and dopamine receptor synthesis' },
      { name:'Zinc', role:'Regulates synaptic signaling; essential for BDNF (brain growth factor) activity' },
      { name:'Magnesium', role:'Blocks NMDA receptors, preventing excitotoxicity; supports synaptic plasticity' },
      { name:'Selenium', role:'Part of antioxidant enzymes protecting neurons from oxidative damage' },
    ],
    cellTypes:[
      { name:'Neurons', description:'The primary signaling cells. Over 86 billion neurons communicate via electrical impulses and chemical messengers (neurotransmitters) across synapses.' },
      { name:'Astrocytes', description:'Star-shaped glial cells that support neurons, regulate synapses, maintain the blood-brain barrier, and recycle neurotransmitters.' },
      { name:'Microglia', description:'The brain\'s immune cells. They constantly survey for damage and infection, clearing debris by phagocytosis.' },
      { name:'Oligodendrocytes', description:'Produce myelin, the fatty insulating sheath around axons that dramatically speeds up electrical signal transmission.' },
      { name:'Ependymal cells', description:'Line the brain ventricles and produce cerebrospinal fluid (CSF), which cushions and nourishes the brain.' },
    ],
    bloodFlow:'The brain receives blood via the internal carotid arteries (frontal/parietal lobes) and vertebral arteries (brainstem/occipital lobes), which unite to form the Circle of Willis — a circular safety network ensuring continuous supply. The blood-brain barrier (BBB), formed by tight junctions in endothelial cells, strictly controls what enters brain tissue.',
    fluidRole:'Cerebrospinal fluid (CSF) — produced at ~500 ml/day by the choroid plexus — cushions the brain against impact, removes metabolic waste, and delivers nutrients. The glymphatic system (active during sleep) flushes protein waste including amyloid-beta implicated in Alzheimer\'s disease.',
    cellularProcess:'Neurons fire action potentials when membrane potential reaches ~−55 mV, opening voltage-gated Na⁺ channels (depolarization), followed by K⁺ efflux (repolarization). Synaptic vesicles release neurotransmitters (glutamate, GABA, dopamine, serotonin) into the synaptic cleft. Long-term potentiation (LTP) — repeated synapse activation — strengthens connections forming memory.',
    conditions:[
      { name:'Stroke (CVA)', description:'Interrupted blood flow causing rapid neuron death; ischemic (clot) or hemorrhagic (bleed)' },
      { name:'Alzheimer\'s Disease', description:'Progressive accumulation of amyloid plaques and tau tangles destroying memory circuits' },
      { name:'Parkinson\'s Disease', description:'Dopamine-producing neurons in the substantia nigra degenerate, causing tremors and rigidity' },
      { name:'Epilepsy', description:'Recurrent seizures from abnormal synchronous electrical discharges in neural networks' },
    ],
    fact:'Your brain generates about 12–25 watts of electricity — enough to power a low-energy LED bulb — and contains enough neural connections to store an estimated 2.5 petabytes of information.',
  },
  {
    id:'thyroid', name:'Thyroid', latin:'Glandula thyroidea', color:'#67e8f9', emissiveColor:'#0891b2',
    position:[0,0.84,0.09], scale:[0.10,0.05,0.06], explodeOffset:[0,0.9,1.1],
    shape:'flat-sphere', systems:['FULL','ORGANS'], genders:['MALE','FEMALE'], animationType:'neutral',
    description:'The butterfly-shaped thyroid gland in your neck is your body\'s master metabolic thermostat. It produces thyroid hormones (T3 and T4) that control the metabolic rate of virtually every cell — affecting temperature, energy, heart rate, brain development, and bone growth.',
    functions:['Produces T3 and T4 hormones that set metabolic rate','Regulates heart rate and body temperature','Controls energy use in every cell','Produces calcitonin for bone calcium regulation','Critical for brain and bone development in infants'],
    funFacts:['Only organ that stores hormones outside its cells','Thyroid hormone reaches every cell in the body','About 20 million Americans have thyroid disorders'],
    medicalDescription:'The glandula thyroidea consists of two lobes connected by an isthmus, weighing 20–30 g. Follicular cells produce T3 (triiodothyronine) and T4 (thyroxine) stored as thyroglobulin within follicular colloid. Parafollicular C-cells produce calcitonin. The hypothalamic-pituitary-thyroid (HPT) axis regulates secretion via TRH → TSH feedback.',
    vitamins:[
      { name:'Vitamin D', role:'Regulates immune response against thyroid; deficiency linked to Hashimoto\'s and Graves\' disease' },
      { name:'Vitamin A', role:'Regulates TSH and thyroid-stimulating hormone receptor gene expression' },
      { name:'Vitamin E', role:'Antioxidant protecting follicular cells from hydrogen peroxide used in thyroid hormone synthesis' },
      { name:'Vitamin C', role:'Reduces the oxidative stress inherent in thyroid hormone synthesis' },
    ],
    minerals:[
      { name:'Iodine', role:'Essential raw material for T3 (3 iodine atoms) and T4 (4 iodine atoms); deficiency causes goiter' },
      { name:'Selenium', role:'Required for 5\'-deiodinase enzymes that convert T4 to active T3; deficiency impairs all thyroid function' },
      { name:'Zinc', role:'Required for T3 receptor binding and pituitary TSH production' },
      { name:'Iron', role:'Required for thyroid peroxidase (TPO) enzyme that incorporates iodine into thyroglobulin' },
    ],
    cellTypes:[
      { name:'Follicular cells (Thyrocytes)', description:'Cuboidal cells surrounding colloid-filled follicles. They perform the entire T3/T4 synthesis cycle: iodide uptake via NIS transporter → oxidation by TPO → iodination of thyroglobulin → endocytosis → proteolysis → T3/T4 release into blood.' },
      { name:'Parafollicular C cells', description:'Located between follicles; produce calcitonin in response to elevated blood calcium. Calcitonin inhibits osteoclasts and promotes renal calcium excretion.' },
    ],
    bloodFlow:'Highly vascular — receives ~80–120 ml blood/min per gram of tissue (among the highest of any organ). Supplied by superior and inferior thyroid arteries from the external carotid and subclavian arteries. Thyroid veins drain to internal jugular and brachiocephalic veins.',
    fluidRole:'Secretes 90% T4 (prohormone) and 10% T3 directly. T4 is converted to the more active T3 (3–5x more potent) by selenoprotein deiodinases in target tissues (especially liver, kidney, and brain). Both hormones bind to thyroid-binding globulin (TBG) for transport in blood.',
    cellularProcess:'TSH binds TSHR on follicular cell → cAMP cascade → NIS transporter brings iodide (I⁻) into cell → thyroid peroxidase (TPO) oxidizes I⁻ to I₂ using H₂O₂ → iodination of tyrosine residues on thyroglobulin forming MIT and DIT → coupling of MIT+DIT → T3/T4 stored in colloid → TSH stimulation → endocytosis of colloid → lysosomes release T3/T4 → diffuse into blood.',
    conditions:[
      { name:'Hypothyroidism', description:'Insufficient thyroid hormone causing fatigue, weight gain, cold intolerance; Hashimoto\'s is the most common cause' },
      { name:'Hyperthyroidism (Graves\' Disease)', description:'Autoantibodies stimulate TSH receptor causing excess T3/T4, weight loss, heat intolerance, and exophthalmos' },
      { name:'Thyroid Cancer', description:'Most common endocrine cancer; usually papillary type from follicular cells; excellent prognosis if caught early' },
      { name:'Goiter', description:'Thyroid enlargement from iodine deficiency or TSH hyperstimulation' },
    ],
    fact:'Thyroid hormones are the only ones in the body that require an essential mineral (iodine) obtained entirely from diet. Iodine deficiency is the world\'s leading preventable cause of intellectual disability, affecting about 2 billion people globally.',
  },
  {
    id:'heart', name:'Heart', latin:'Cor', color:'#E8354A', emissiveColor:'#A0101E',
    position:[-0.1,0.46,0.06], scale:[0.14,0.16,0.13], explodeOffset:[-0.8,0.55,0.85],
    shape:'blob', systems:['FULL','ORGANS','CIRCULATORY','MUSCULAR'], genders:['MALE','FEMALE'], animationType:'pulse',
    description:'Your heart is a tireless muscular pump — roughly the size of your fist — that beats 60–100 times per minute, every minute of your life. It circulates your entire blood volume (~5 liters) around the body in about 60 seconds, delivering oxygen and nutrients to every one of your 37 trillion cells.',
    functions:['Pumps oxygenated blood to every cell','Returns blood to lungs for re-oxygenation','Regulates blood pressure via rate and force','Releases hormones affecting kidney function'],
    funFacts:['Beats ~3 billion times in a lifetime','Left ventricle wall is 3× thicker than the right','Can continue beating outside the body if oxygenated'],
    medicalDescription:'The cor is a hollow, four-chambered muscular organ located in the mediastinum, slightly left of center. Its chambers — right and left atria and ventricles — are separated by interatrial and interventricular septa. Diastole (filling) and systole (contraction) are governed by the cardiac conduction system originating at the sinoatrial node.',
    vitamins:[
      { name:'Vitamin B1 (Thiamine)', role:'Critical for cardiac energy metabolism; deficiency causes beriberi heart disease' },
      { name:'Vitamin D', role:'Regulates blood pressure and calcium handling in cardiomyocytes' },
      { name:'Vitamin K2 (MK-7)', role:'Activates matrix GLA protein preventing arterial calcification' },
      { name:'CoQ10 (Ubiquinone)', role:'Essential for mitochondrial ATP production in high-demand cardiac cells' },
    ],
    minerals:[
      { name:'Magnesium', role:'Regulates heart rhythm, relaxes blood vessels, and supports ATP production' },
      { name:'Potassium', role:'Maintains resting membrane potential; imbalance causes life-threatening arrhythmias' },
      { name:'Calcium', role:'Triggers cardiomyocyte contraction via excitation-contraction coupling' },
      { name:'Selenium', role:'Antioxidant protecting cardiomyocytes; deficiency linked to Keshan cardiomyopathy' },
    ],
    cellTypes:[
      { name:'Cardiomyocytes', description:'Specialized striated muscle cells making up ~85% of heart volume. They contract rhythmically and are highly resistant to fatigue due to extreme mitochondrial density.' },
      { name:'Pacemaker cells (SA/AV nodes)', description:'Autorhythmic cells in the sinoatrial node that spontaneously depolarize at 60–100/min, generating the heartbeat independently of the nervous system.' },
      { name:'Cardiac fibroblasts', description:'Maintain the collagen-based extracellular matrix (ECM). After injury they become myofibroblasts that form scar tissue.' },
      { name:'Purkinje fibers', description:'Specialized conducting cells that rapidly distribute electrical impulses to ventricular muscle, ensuring coordinated contraction from apex to base.' },
    ],
    bloodFlow:'Deoxygenated blood enters the right atrium via superior and inferior vena cava → right ventricle pumps it to pulmonary arteries → lungs oxygenate blood → pulmonary veins return it to left atrium → left ventricle pumps oxygenated blood through aortic valve into the aorta. Coronary arteries (branching from aortic root) supply blood to the heart muscle itself.',
    fluidRole:'The pericardial sac contains 15–50 ml of lubricating pericardial fluid preventing friction during contraction. Lymphatic vessels in the myocardium drain interstitial fluid preventing edema.',
    cellularProcess:'Action potentials enter cardiomyocytes → voltage-gated L-type Ca²⁺ channels open → calcium triggers calcium release from sarcoplasmic reticulum (CICR) → calcium binds troponin C → tropomyosin shifts exposing actin binding sites → myosin heads hydrolyze ATP and walk along actin (cross-bridge cycling) → sarcomere shortens → cell contracts. The cycle repeats 60–100x per minute for a lifetime.',
    conditions:[
      { name:'Myocardial Infarction (Heart Attack)', description:'Coronary artery blockage starves cardiac muscle of oxygen, causing irreversible cell death' },
      { name:'Heart Failure', description:'Reduced cardiac output fails to meet metabolic demands; fluid accumulates in lungs or periphery' },
      { name:'Atrial Fibrillation', description:'Chaotic electrical signals in atria cause irregular, often fast ventricular response' },
      { name:'Hypertension', description:'Chronically elevated blood pressure forces the left ventricle to work harder, causing hypertrophy' },
    ],
    fact:'In a lifetime (~80 years), your heart beats approximately 3.5 billion times and pumps roughly 200 million liters of blood — enough to fill over 80 Olympic swimming pools.',
  },
  {
    id:'left-lung', name:'Left Lung', latin:'Pulmo sinister', color:'#F4A0B8', emissiveColor:'#9A3060',
    position:[-0.27,0.42,0.0], scale:[0.13,0.23,0.1], explodeOffset:[-1.1,0.35,0.6],
    shape:'capsule', systems:['FULL','ORGANS','RESPIRATORY'], genders:['MALE','FEMALE'], animationType:'breathe',
    description:'Slightly smaller than the right lung to accommodate the heart. Your lungs are the body\'s oxygen exchange hubs — two spongy organs that breathe in oxygen and exhale carbon dioxide about 20,000 times a day. Spread flat, lung surface area would cover a tennis court.',
    functions:['Absorbs oxygen into the bloodstream','Expels carbon dioxide','Filters small blood clots','Regulates blood pH via CO₂ balance'],
    funFacts:['Has 2 lobes vs the right lung\'s 3','Total lung surface area equals a tennis court','You breathe ~22,000 times per day'],
    medicalDescription:'The pulmones are paired cone-shaped organs occupying the pleural cavities. Gas exchange occurs at ~300–500 million alveoli — thin-walled sacs surrounded by pulmonary capillaries. Ventilation is driven by diaphragmatic and intercostal muscle contraction creating negative intrathoracic pressure per Boyle\'s Law.',
    vitamins:[
      { name:'Vitamin A', role:'Essential for maintaining respiratory epithelium integrity and mucus production' },
      { name:'Vitamin D', role:'Reduces airway inflammation; deficiency increases asthma and respiratory infection risk' },
      { name:'Vitamin C', role:'Antioxidant protecting lung tissue from inhaled pollutants and oxidative stress' },
      { name:'Vitamin E', role:'Protects alveolar cells from oxidative damage from pollution and cigarette smoke' },
    ],
    minerals:[
      { name:'Magnesium', role:'Relaxes bronchial smooth muscle; used intravenously for acute asthma attacks' },
      { name:'Selenium', role:'Antioxidant enzyme cofactor; low levels increase COPD and lung cancer risk' },
      { name:'Zinc', role:'Supports immune defense in respiratory epithelium; essential for healing' },
      { name:'Iron', role:'Critical for hemoglobin oxygen binding in red blood cells passing through lungs' },
    ],
    cellTypes:[
      { name:'Type I Pneumocytes', description:'Thin, flat cells covering ~95% of alveolar surface. Their extreme thinness (0.1–0.5 μm) enables rapid oxygen and CO₂ diffusion across the blood-air barrier.' },
      { name:'Type II Pneumocytes', description:'Cuboidal cells producing pulmonary surfactant (DPPC) that reduces surface tension, preventing alveolar collapse at the end of each exhale.' },
      { name:'Alveolar macrophages', description:'Immune cells that patrol alveolar surfaces, engulfing inhaled bacteria, dust particles, and cellular debris — called "dust cells".' },
      { name:'Ciliated epithelial cells', description:'Line the bronchi with hair-like cilia beating ~1,000x per minute, driving the mucociliary escalator that clears debris from airways.' },
    ],
    bloodFlow:'The entire cardiac output (5 L/min) passes through the pulmonary circulation. Pulmonary arteries carry deoxygenated blood from the right ventricle → spreads through pulmonary capillary network wrapping each alveolus → O₂ diffuses in, CO₂ diffuses out → pulmonary veins return oxygenated blood to left atrium. Transit time through alveolar capillary: ~0.75 seconds.',
    fluidRole:'Pleural fluid (~20 ml) lubricates the pleural membranes preventing friction during breathing. Surfactant (a lipid-protein mixture) in alveoli reduces surface tension 5–15x compared to water, making inhalation energetically feasible.',
    cellularProcess:'O₂ crosses the 0.5 μm blood-air barrier by simple diffusion driven by partial pressure gradients (alveolar pO₂ ~105 mmHg vs. venous pO₂ ~40 mmHg). O₂ binds hemoglobin via cooperative R/T state transition. CO₂ (as bicarbonate HCO₃⁻) releases from blood, converts back to CO₂ via carbonic anhydrase, and diffuses out.',
    conditions:[
      { name:'Asthma', description:'Reversible bronchoconstriction and airway inflammation triggered by allergens, exercise, or irritants' },
      { name:'COPD (Emphysema + Bronchitis)', description:'Irreversible airway damage from smoking; alveolar walls destroyed, airflow chronically obstructed' },
      { name:'Pneumonia', description:'Infection fills alveoli with fluid and pus, impairing gas exchange' },
      { name:'Pulmonary Embolism', description:'Blood clot in pulmonary arteries blocking blood flow through the lungs' },
    ],
    fact:'If you could unroll and flatten all the alveoli in both lungs, the surface area would be approximately 70 square meters — the size of a singles tennis court.',
  },
  {
    id:'right-lung', name:'Right Lung', latin:'Pulmo dexter', color:'#F4B0C4', emissiveColor:'#9A3060',
    position:[0.27,0.44,0.0], scale:[0.14,0.25,0.11], explodeOffset:[1.1,0.35,0.6],
    shape:'capsule', systems:['FULL','ORGANS','RESPIRATORY'], genders:['MALE','FEMALE'], animationType:'breathe',
    description:'The larger of the two lungs with three lobes, performing the gas exchange that keeps every cell alive — processing roughly 500 litres of air per hour at rest.',
    functions:['Absorbs oxygen into the bloodstream','Expels carbon dioxide','Filters micro-emboli from circulation','Works with diaphragm to create inhalation pressure'],
    funFacts:['3 lobes — superior, middle, and inferior','Processes ~500 litres of air per hour at rest'],
    medicalDescription:'The right pulmo is larger than the left, containing three lobes (superior, middle, inferior) separated by the horizontal and oblique fissures. It receives deoxygenated blood from the right ventricle and returns oxygenated blood via pulmonary veins. Right main bronchus is more vertical than left, explaining why inhaled objects preferentially lodge here.',
    vitamins:[
      { name:'Vitamin A', role:'Essential for maintaining respiratory epithelium integrity and mucus production' },
      { name:'Vitamin D', role:'Reduces airway inflammation; deficiency increases asthma and respiratory infection risk' },
      { name:'Vitamin C', role:'Antioxidant protecting lung tissue from inhaled pollutants and oxidative stress' },
      { name:'Beta-carotene', role:'Precursor to vitamin A; protects airways from oxidative damage' },
    ],
    minerals:[
      { name:'Magnesium', role:'Relaxes bronchial smooth muscle; used intravenously for acute asthma attacks' },
      { name:'Selenium', role:'Antioxidant enzyme cofactor; low levels increase COPD and lung cancer risk' },
      { name:'Zinc', role:'Supports immune defense in respiratory epithelium; essential for healing' },
      { name:'Iron', role:'Critical for hemoglobin oxygen binding in red blood cells passing through lungs' },
    ],
    cellTypes:[
      { name:'Type I Pneumocytes', description:'Thin, flat cells covering ~95% of alveolar surface enabling rapid gas diffusion.' },
      { name:'Type II Pneumocytes', description:'Produce pulmonary surfactant preventing alveolar collapse at the end of each exhale.' },
      { name:'Alveolar macrophages', description:'Patrol alveolar surfaces, engulfing inhaled bacteria, dust particles, and cellular debris.' },
      { name:'Goblet cells', description:'Produce mucus that traps inhaled particles and pathogens in the airways.' },
    ],
    bloodFlow:'Receives deoxygenated blood from the right ventricle via the right pulmonary artery. Blood percolates through capillary networks surrounding the ~300 million alveoli for gas exchange, then returns via the right pulmonary veins to the left atrium.',
    fluidRole:'Pleural fluid lubricates the pleural membranes. Surfactant from Type II pneumocytes reduces alveolar surface tension, making each breath energetically feasible and preventing alveolar collapse on exhalation.',
    cellularProcess:'During inspiration, diaphragm contracts → thoracic volume increases → intrapleural pressure drops below atmospheric → air flows into alveoli → O₂ diffuses across the blood-air barrier → binds hemoglobin. On expiration, elastic recoil forces air out passively at rest.',
    conditions:[
      { name:'Lung Cancer', description:'Malignant transformation of respiratory epithelial cells, often smoking-related' },
      { name:'Pneumonia', description:'Infection fills alveoli with fluid and pus, impairing gas exchange' },
      { name:'COPD', description:'Irreversible airway damage from smoking; alveolar walls destroyed, airflow chronically obstructed' },
    ],
    fact:'The right lung is about 10% larger than the left and has 3 lobes to the left\'s 2, because the left lung makes space for the heart in the mediastinum.',
  },
  {
    id:'diaphragm', name:'Diaphragm', latin:'Diaphragma', color:'#86efac', emissiveColor:'#15803d',
    position:[0,-0.06,0.07], scale:[0.32,0.025,0.22], explodeOffset:[0,-0.9,1.1],
    shape:'flat-sphere', systems:['FULL','ORGANS','RESPIRATORY','MUSCULAR'], genders:['MALE','FEMALE'], animationType:'breathe',
    description:'The diaphragm is the dome-shaped muscle floor of your chest cavity — the primary breathing muscle. When it contracts it flattens downward, increasing chest volume and drawing air into the lungs. It works non-stop from before birth until death, contracting about 20,000 times a day without fatigue.',
    functions:['Contracts to draw air into lungs','Relaxes to expel air on exhalation','Assists in coughing, sneezing, and vomiting','Separates thoracic and abdominal cavities','Allows passage of the esophagus and aorta through its openings'],
    funFacts:['You breathe ~22,000 times per day entirely because of the diaphragm','Hiccups are involuntary diaphragm spasms','Responsible for 70–80% of the work of breathing at rest'],
    medicalDescription:'The diaphragma is a musculotendinous dome separating the thoracic and abdominal cavities. The central tendon is pierced by the inferior vena cava (T8), while the esophagus (T10) and aorta (T12) pass through muscular openings. Innervated by the phrenic nerve (C3,4,5 — "C3,4,5 keeps the diaphragm alive").',
    vitamins:[
      { name:'Vitamin D', role:'Vitamin D receptors on diaphragm myocytes; deficiency causes diaphragm weakness in COPD' },
      { name:'Vitamin B1 (Thiamine)', role:'Required for aerobic ATP production sustaining non-stop diaphragmatic activity' },
    ],
    minerals:[
      { name:'Magnesium', role:'Required for muscle relaxation after each contraction cycle' },
      { name:'Potassium', role:'Membrane potential maintenance; hypokalemia causes diaphragm cramps (hiccups)' },
      { name:'Phosphorus', role:'As phosphocreatine, provides the immediate ATP buffer for each contractile cycle' },
    ],
    cellTypes:[
      { name:'Type I slow-twitch fibers (55%)', description:'Fatigue-resistant oxidative fibers essential for continuous breathing. Rich in mitochondria and myoglobin. The diaphragm has the highest proportion of Type I fibers of any skeletal muscle.' },
      { name:'Type IIa fast oxidative fibers (21%)', description:'Intermediate fibers activated during increased respiratory demand (exercise, illness). The mixed fiber composition ensures performance across all ventilatory demands.' },
    ],
    bloodFlow:'Supplied by superior phrenic arteries (from aorta), inferior phrenic arteries (largest supply), and musculophrenic branches of internal thoracic artery. Highly vascular — the diaphragm consumes ~15% of the body\'s oxygen during heavy exercise.',
    fluidRole:'The diaphragm\'s rhythmic contraction and relaxation cyclically changes pleural pressure (−5 to −10 cmH₂O at rest; −50 to −100 cmH₂O during maximal inspiration), driving airflow. This pressure change also acts as a thoracic pump, augmenting venous return to the right heart.',
    cellularProcess:'Phrenic nerve fires → ACh at NMJ → T-tubule action potential → Ca²⁺ release from SR → troponin binding → cross-bridge cycling → sarcomere shortens → dome flattens ~1.5 cm (tidal) to 10 cm (maximal) → ~300–500 ml increase in thoracic volume → pressure drops below atmospheric → air flows in. On relaxation: elastic recoil of lungs and chest wall forces air out passively.',
    conditions:[
      { name:'Hiatal Hernia', description:'Stomach herniates through the esophageal hiatus into the chest, impairs LES, and worsens GERD' },
      { name:'Phrenic Nerve Palsy', description:'Unilateral paralysis causes paradoxical diaphragm motion; bilateral is life-threatening requiring ventilator support' },
      { name:'Hiccups (Singultus)', description:'Sudden diaphragm spasm with simultaneous glottis closure; usually benign but intractable hiccups indicate serious underlying pathology' },
    ],
    fact:'The diaphragm contracts approximately 20,000 times per day — never pausing, even during sleep. Over a 70-year lifetime, it makes over 500 million contractions without a single day off.',
  },
  {
    id:'liver', name:'Liver', latin:'Hepar', color:'#8B2218', emissiveColor:'#4A0E08',
    position:[0.18,0.08,0.0], scale:[0.22,0.11,0.12], explodeOffset:[1.0,0.05,0.75],
    shape:'flat-sphere', systems:['FULL','ORGANS'], genders:['MALE','FEMALE'], animationType:'neutral',
    description:'The liver is your body\'s largest internal organ and its master chemical factory, performing over 500 distinct functions. It filters all blood from your digestive tract, detoxifies drugs and alcohol, produces bile for fat digestion, stores glycogen as energy, and manufactures blood proteins.',
    functions:['Detoxifies drugs, alcohol, and metabolic waste','Produces bile for fat digestion','Synthesises blood clotting factors','Regulates blood glucose via glycogen','Makes albumin and essential blood proteins'],
    funFacts:['Can regenerate from just 30% of its tissue','Receives blood from two sources simultaneously','Generates significant body heat'],
    medicalDescription:'The hepar is the largest parenchymal organ weighing 1.4–1.8 kg, occupying the right hypochondrium. It is organized into functional units called hepatic lobules with sinusoidal blood flow from portal triads to central veins. Dual blood supply via the hepatic portal vein (75%) and hepatic artery (25%) is unique among organs.',
    vitamins:[
      { name:'Vitamin A', role:'Stored in hepatic stellate cells; liver is the primary storage site (90% body stores)' },
      { name:'Vitamin D', role:'Converted from D3 to 25-hydroxyvitamin D (calcidiol) by liver hydroxylase enzymes' },
      { name:'Vitamin B12', role:'Stored in liver for up to 5 years; released as needed for neural and blood cell function' },
      { name:'Vitamin K', role:'Essential cofactor for hepatic synthesis of clotting factors II, VII, IX, X' },
      { name:'Choline', role:'Required for VLDL assembly and fat export; deficiency causes hepatic steatosis (fatty liver)' },
    ],
    minerals:[
      { name:'Iron', role:'Stored in hepatocytes as ferritin; liver regulates whole-body iron homeostasis' },
      { name:'Zinc', role:'Cofactor for ~300 liver enzymes including alcohol dehydrogenase and carbonic anhydrase' },
      { name:'Copper', role:'Stored and excreted in bile; accumulation causes Wilson\'s disease' },
      { name:'Selenium', role:'Part of glutathione peroxidase protecting liver cells from oxidative damage' },
    ],
    cellTypes:[
      { name:'Hepatocytes', description:'Main parenchymal cells (~70% of liver mass). Each performs all major metabolic functions and can regenerate within weeks — the liver can regrow from just 25% of its original mass.' },
      { name:'Kupffer cells', description:'Resident liver macrophages lining hepatic sinusoids. They destroy pathogens, old red blood cells, and endotoxins arriving from the gut via portal blood.' },
      { name:'Hepatic Stellate cells (HSCs)', description:'Store vitamin A in fat droplets in healthy liver. When activated by injury, they produce collagen causing fibrosis (cirrhosis).' },
      { name:'Cholangiocytes', description:'Line bile ducts, modifying bile composition. They secrete bicarbonate and water, adjusting bile pH and dilution.' },
    ],
    bloodFlow:'Portal vein (nutrient-rich blood from gut, spleen, pancreas) and hepatic artery converge at portal triads. Blood flows through sinusoids between hepatocyte plates → Kupffer cells filter it → exits via central veins → hepatic veins → inferior vena cava. This arrangement exposes hepatocytes first to nutrient-rich, sometimes toxin-laden portal blood.',
    fluidRole:'Produces 600–1,000 ml of bile daily, stored and concentrated in the gallbladder. Bile contains bile salts (for fat emulsification), bilirubin (from hemoglobin breakdown), cholesterol, and phospholipids. Also synthesizes ~10 g/day of albumin, maintaining plasma oncotic pressure.',
    cellularProcess:'Hepatocytes run parallel metabolic programs: fed state → glycogen synthesis, fatty acid synthesis, protein synthesis; fasted state → glycogenolysis, gluconeogenesis (from amino acids/lactate), ketogenesis, beta-oxidation. Cytochrome P450 enzymes (CYP3A4, CYP2D6) oxidize drugs for detoxification via Phase I (oxidation) and Phase II (conjugation) reactions.',
    conditions:[
      { name:'Cirrhosis', description:'End-stage fibrosis replacing hepatocytes with scar tissue from chronic alcohol, viral hepatitis, or fatty liver disease' },
      { name:'Non-alcoholic Fatty Liver Disease (NAFLD)', description:'Fat accumulation in hepatocytes from insulin resistance; increasingly common with obesity' },
      { name:'Hepatitis B/C', description:'Viral infection causing hepatocyte inflammation and eventual cirrhosis/liver cancer' },
      { name:'Liver Cancer (HCC)', description:'Hepatocellular carcinoma arising from chronically damaged hepatocytes' },
    ],
    fact:'The liver is the only internal organ capable of complete regeneration. You can surgically remove up to 75% of a healthy liver and it will grow back to full size within 8–12 weeks.',
  },
  {
    id:'stomach', name:'Stomach', latin:'Gaster', color:'#5A9A3C', emissiveColor:'#2A5A10',
    position:[-0.12,0.0,0.07], scale:[0.13,0.12,0.1], explodeOffset:[-0.75,-0.25,0.85],
    shape:'blob', systems:['FULL','ORGANS'], genders:['MALE','FEMALE'], animationType:'flow',
    description:'The stomach is a J-shaped muscular bag that acts as a food processor and temporary holding tank. When food arrives, it stretches from a 50 ml resting volume to over 1.5 liters. Its muscular walls churn food into a semi-liquid paste (chyme) while hydrochloric acid and digestive enzymes begin breaking down proteins.',
    functions:['Mechanical churning of food into chyme','Secretes acid to sterilise food and activate enzymes','Begins protein digestion via pepsin','Controls food delivery rate to the intestine'],
    funFacts:['Stomach acid can dissolve certain metals','Its lining is replaced every 3–5 days to resist acid damage'],
    medicalDescription:'The gaster is a J-shaped muscular viscus extending from the gastroesophageal junction (cardia) through the fundus, body, and antrum to the pylorus. The rugae-lined mucosa secretes gastric juice containing HCl (pH 1–2), pepsinogen, intrinsic factor, mucus, and bicarbonate via specialized cells in gastric glands.',
    vitamins:[
      { name:'Vitamin B12 (Cobalamin)', role:'Requires intrinsic factor (produced by parietal cells) for absorption in the ileum' },
      { name:'Vitamin C', role:'Reduces nitrite to nitric oxide, potentially protecting against gastric cancer' },
      { name:'Vitamin A', role:'Maintains the integrity of gastric mucosal lining cells' },
      { name:'Vitamin E', role:'Antioxidant protection for gastric mucosa against H. pylori oxidative damage' },
    ],
    minerals:[
      { name:'Zinc', role:'Required for gastric mucosa repair and healing of ulcers; accelerates mucosal regeneration' },
      { name:'Iron', role:'Stomach acid converts dietary Fe³⁺ to Fe²⁺ for absorption; PPI drugs reduce this' },
      { name:'Sodium', role:'Drives HCl secretion via H⁺/K⁺-ATPase proton pump in parietal cells' },
      { name:'Chloride', role:'Combined with H⁺ forms HCl; essential for activating pepsin from pepsinogen' },
    ],
    cellTypes:[
      { name:'Parietal cells (Oxyntic cells)', description:'Secrete hydrochloric acid (HCl) using the H⁺/K⁺-ATPase proton pump and intrinsic factor for B12 absorption. They are the target of proton pump inhibitors (omeprazole).' },
      { name:'Chief cells (Zymogenic cells)', description:'Secrete pepsinogen, which is converted by acid to pepsin — the main gastric protease that cleaves proteins at phenylalanine and leucine bonds.' },
      { name:'Mucous neck cells', description:'Secrete alkaline mucus creating a pH 7 protective layer directly above the pH 1–2 gastric lumen, shielding the stomach from self-digestion.' },
      { name:'G cells', description:'Enteroendocrine cells in the antrum secreting gastrin hormone, which stimulates parietal cell acid production and gastric motility.' },
    ],
    bloodFlow:'Supplied by the celiac trunk branches: left gastric artery (lesser curvature), right gastric artery, gastroepiploic arteries (greater curvature), and short gastric arteries (fundus). Venous drainage goes via the portal vein to the liver.',
    fluidRole:'Produces 1.5–2 liters of gastric juice daily. HCl sterilizes food, denatures proteins, and activates pepsin. Mucus (0.2 mm thick) protects mucosal cells. Secretion is regulated in three phases: cephalic (sight/smell of food), gastric (stomach distension), and intestinal.',
    cellularProcess:'Parietal cells: acetylcholine, gastrin, and histamine bind receptors → adenylyl cyclase/IP3 cascade → H⁺/K⁺-ATPase pumped to canalicular membrane → actively pumps H⁺ ions into the lumen → gastric pH drops to 1–2. G cells sense amino acids → secrete gastrin → ECL cells release histamine → amplifies acid secretion via H2 receptors.',
    conditions:[
      { name:'Peptic Ulcer Disease', description:'H. pylori infection or NSAIDs disrupt mucosal barrier, allowing acid to erode the stomach wall' },
      { name:'Gastroesophageal Reflux (GERD)', description:'Lower esophageal sphincter weakness allows acid to reflux into esophagus causing heartburn' },
      { name:'Gastric Cancer', description:'Most often from chronic H. pylori-driven inflammation progressing to adenocarcinoma' },
      { name:'Gastroparesis', description:'Delayed gastric emptying from vagal nerve damage (often from diabetes)' },
    ],
    fact:'The stomach produces a new layer of mucus every two weeks to protect itself. Without this constantly renewed protective barrier, stomach acid would digest its own wall within 3 days.',
  },
  {
    id:'left-kidney', name:'Left Kidney', latin:'Ren sinister', color:'#A0522D', emissiveColor:'#5A2008',
    position:[-0.24,-0.1,-0.07], scale:[0.08,0.13,0.08], explodeOffset:[-1.05,-0.55,-0.65],
    shape:'capsule', systems:['FULL','ORGANS'], genders:['MALE','FEMALE'], animationType:'flow',
    description:'Your two bean-shaped kidneys are your body\'s sophisticated filtration and recycling system, cleaning all 5 liters of your blood about 40 times per day — filtering roughly 200 liters and producing 1–2 liters of urine. They precisely control blood pressure, salt balance, acid-base chemistry, and stimulate red blood cell production.',
    functions:['Filter waste and excess fluid from blood','Regulate sodium, potassium, and calcium balance','Produce erythropoietin to stimulate red blood cells','Activate vitamin D for bone health','Regulate blood pressure via renin–angiotensin'],
    funFacts:['Contains ~1 million nephrons (filtering units)','Filters ~180 litres of blood daily','A single kidney can fully compensate for two'],
    medicalDescription:'The renes are retroperitoneal organs each containing ~1 million nephrons — the functional filtration units. The nephron comprises the glomerulus (filtration), proximal tubule (bulk reabsorption), Loop of Henle (concentration), distal tubule (fine-tuning), and collecting duct. Juxtaglomerular apparatus regulates renin secretion and GFR.',
    vitamins:[
      { name:'Vitamin D', role:'Kidneys activate 25-hydroxyvitamin D to calcitriol (active vitamin D) — essential for calcium absorption' },
      { name:'Vitamin B6', role:'Deficiency increases oxalate production, raising kidney stone risk' },
      { name:'Vitamin C', role:'Antioxidant protecting tubular cells; high doses may increase oxalate stones' },
      { name:'Vitamin E', role:'Protects kidney cells from oxidative stress, especially during diabetic nephropathy' },
    ],
    minerals:[
      { name:'Potassium', role:'Kidneys regulate potassium balance precisely; excess is excreted via collecting ducts under aldosterone' },
      { name:'Sodium', role:'Primary osmolyte regulating water reabsorption via ADH and aldosterone' },
      { name:'Calcium', role:'Kidneys reclaim 98% of filtered calcium; calcitriol and PTH control this' },
      { name:'Magnesium', role:'~50% dietary magnesium is absorbed; excess excreted renally' },
    ],
    cellTypes:[
      { name:'Podocytes', description:'Specialized glomerular cells with intricate "foot processes" that form the filtration slits — allowing small molecules through while blocking proteins and cells.' },
      { name:'Proximal tubule cells', description:'Packed with mitochondria and brush-border microvilli. Reabsorb 65% of filtered Na⁺, water, glucose, and amino acids via active transport.' },
      { name:'Juxtaglomerular (JG) cells', description:'Modified smooth muscle cells in the afferent arteriole that sense blood pressure and release renin, activating the RAAS blood pressure response.' },
      { name:'Macula densa cells', description:'Specialized cells in the distal tubule that sense luminal [NaCl] and signal JG cells to adjust renin release and arteriole tone.' },
    ],
    bloodFlow:'Kidneys receive ~20–25% of cardiac output (1.1 L/min combined) via renal arteries. Blood enters glomeruli under high pressure → 180 L/day is filtered → 99% is reabsorbed → peritubular capillaries and vasa recta collect reabsorbed substances → renal veins return blood to vena cava.',
    fluidRole:'Produce 1–2 L urine daily (variable with ADH). Urine contains urea (major nitrogen waste), creatinine (muscle turnover), uric acid, electrolytes, and water. Secrete erythropoietin (EPO) stimulating bone marrow red cell production in response to hypoxia.',
    cellularProcess:'Glomerular filtration: hydrostatic pressure (55 mmHg) overcomes oncotic + tubular pressure → net filtration of 125 ml/min (GFR). Tubular reabsorption: Na⁺/K⁺-ATPase on basolateral membrane creates gradient driving Na⁺ entry via luminal cotransporters. Water follows osmotically via aquaporins (AQP1 in PCT, AQP2 in collecting duct regulated by ADH/vasopressin).',
    conditions:[
      { name:'Chronic Kidney Disease (CKD)', description:'Progressive loss of nephrons from diabetes, hypertension, or immune disease; leads to end-stage renal failure' },
      { name:'Kidney Stones (Nephrolithiasis)', description:'Crystallization of calcium oxalate, uric acid, or struvite from supersaturated urine' },
      { name:'Acute Kidney Injury (AKI)', description:'Sudden loss of kidney function from dehydration, drugs, sepsis, or obstruction' },
      { name:'Polycystic Kidney Disease (PKD)', description:'Genetic disorder causing progressive cyst formation and kidney enlargement' },
    ],
    fact:'Each kidney contains about 1 million nephrons. You can lose up to 75% of your kidney function before experiencing symptoms — that\'s why kidney disease is called a "silent killer".',
  },
  {
    id:'right-kidney', name:'Right Kidney', latin:'Ren dexter', color:'#A0522D', emissiveColor:'#5A2008',
    position:[0.24,-0.1,-0.07], scale:[0.08,0.13,0.08], explodeOffset:[1.05,-0.55,-0.65],
    shape:'capsule', systems:['FULL','ORGANS'], genders:['MALE','FEMALE'], animationType:'flow',
    description:'Sits slightly lower than the left kidney to accommodate the liver. Both kidneys maintain the body\'s precise chemical balance 24 hours a day, filtering ~200 liters of blood daily to produce 1–2 liters of urine.',
    functions:['Filter waste products from blood','Regulate electrolytes and blood pH','Produce erythropoietin','Activate vitamin D'],
    funFacts:['Sits lower due to the liver above it','Kidneys receive 25% of total cardiac output'],
    medicalDescription:'The right ren sits slightly lower than the left due to the liver occupying the upper right quadrant. Both kidneys contain ~1 million nephrons and together filter all the blood in the body approximately 40 times per day, producing precisely regulated urine.',
    vitamins:[
      { name:'Vitamin D', role:'Kidneys activate 25-hydroxyvitamin D to calcitriol (active vitamin D) — essential for calcium absorption' },
      { name:'Vitamin B6', role:'Deficiency increases oxalate production, raising kidney stone risk' },
      { name:'Vitamin C', role:'Antioxidant protecting tubular cells from oxidative injury' },
    ],
    minerals:[
      { name:'Potassium', role:'Kidneys regulate potassium balance; excess is excreted under aldosterone control' },
      { name:'Sodium', role:'Primary osmolyte regulating water reabsorption via ADH and aldosterone' },
      { name:'Calcium', role:'Kidneys reclaim 98% of filtered calcium; calcitriol and PTH control this' },
    ],
    cellTypes:[
      { name:'Podocytes', description:'Form the filtration slits in the glomerulus — allowing small molecules through while blocking proteins.' },
      { name:'Proximal tubule cells', description:'Reabsorb 65% of filtered Na⁺, water, glucose, and amino acids via active transport.' },
      { name:'Collecting duct cells', description:'Regulate water reabsorption via aquaporin-2 channels under ADH control — the final step in urine concentration.' },
    ],
    bloodFlow:'Supplied by the right renal artery, branching directly from the aorta at L1–L2. The right renal artery is longer than the left, crossing behind the inferior vena cava. Blood exits via the right renal vein into the inferior vena cava.',
    fluidRole:'Produces 50–100 ml/hr of urine in normal conditions. Concentrated urine during dehydration can reach 1,200 mOsm — 4x the concentration of blood plasma.',
    cellularProcess:'Loop of Henle cells create an osmotic concentration gradient (300–1,200 mOsm) in the renal medulla via countercurrent multiplication, enabling the body to produce concentrated or dilute urine on demand.',
    conditions:[
      { name:'Chronic Kidney Disease (CKD)', description:'Progressive nephron loss from diabetes or hypertension; often asymptomatic until advanced' },
      { name:'Kidney Stones', description:'Crystallization of calcium oxalate or uric acid causing severe flank pain' },
      { name:'Renal Cell Carcinoma', description:'Most common kidney cancer; arises from proximal tubule cells; often detected incidentally' },
    ],
    fact:'Kidneys receive 25% of all cardiac output yet make up less than 0.5% of body weight. They filter approximately 1,700 liters of blood every day.',
  },
  {
    id:'intestines', name:'Small Intestine', latin:'Intestinum tenue', color:'#C89A3C', emissiveColor:'#7A5808',
    position:[0.02,-0.28,0.06], scale:[0.28,0.22,0.18], explodeOffset:[0,-1.25,0.95],
    shape:'torus', systems:['FULL','ORGANS'], genders:['MALE','FEMALE'], animationType:'flow',
    description:'Despite its name, the small intestine is a 6–7 meter long coiled tube — the longest part of your digestive system and the primary site where nutrients enter your bloodstream. Its inner lining is covered in millions of finger-like projections (villi), each covered in microvilli, creating an enormous surface area for absorption.',
    functions:['Absorbs 90% of nutrients — glucose, amino acids, fatty acids','Secretes digestive enzymes','Mixes food with bile and pancreatic enzymes','Delivers nutrients into blood and lymph'],
    funFacts:['6–7 metres long — longer than most rooms','Surface area with villi equals half a badminton court','Digestion takes 2–6 hours to complete'],
    medicalDescription:'The intestinum tenue consists of three segments: duodenum (25 cm; receives bile and pancreatic juice), jejunum (2.5 m; primary absorption), and ileum (3.5 m; B12/bile salt reabsorption). The mucosa features circular folds (plicae circulares), villi, and microvilli (brush border) providing ~200 m² of absorptive surface.',
    vitamins:[
      { name:'All fat-soluble vitamins (A,D,E,K)', role:'Absorbed with dietary fat via micelles and chylomicrons in the duodenum and jejunum' },
      { name:'Vitamin B12 (Cobalamin)', role:'Absorbed exclusively in the terminal ileum via receptor-mediated endocytosis with intrinsic factor' },
      { name:'Vitamin C', role:'Absorbed in the ileum by sodium-dependent transporters SVCT1' },
      { name:'Folate (B9)', role:'Absorbed in the jejunum after conversion to monoglutamate by brush-border enzymes' },
    ],
    minerals:[
      { name:'Iron', role:'Absorbed as heme iron (from meat) and non-heme Fe²⁺ in the duodenum; regulated by hepcidin' },
      { name:'Calcium', role:'Active absorption in duodenum via TRPV6 channels, driven by calcitriol (vitamin D)' },
      { name:'Zinc', role:'Absorbed through ZIP4 transporters in duodenum and jejunum' },
      { name:'Magnesium', role:'Absorbed mainly in ileum and colon via TRPM6/7 channels' },
    ],
    cellTypes:[
      { name:'Enterocytes (Absorptive cells)', description:'Tall columnar cells with microvillous brush borders covering ~95% of villus surface. They absorb nutrients and have tight junctions preventing paracellular leakage.' },
      { name:'Goblet cells', description:'Secrete mucin forming a protective mucus layer 150–300 μm thick covering all intestinal surfaces.' },
      { name:'Paneth cells', description:'Located at the base of crypts; secrete antimicrobial peptides (defensins, lysozyme) shaping the gut microbiome.' },
      { name:'Intestinal Stem cells (ISCs)', description:'Located at crypt bases; divide every 24 hours replacing the entire intestinal epithelium every 3–5 days — the fastest renewing tissue in the body.' },
    ],
    bloodFlow:'Supplied by the superior mesenteric artery (branches to all jejunum and ileum via arcades). Nutrient-rich venous blood from intestinal capillaries drains into the portal vein to the liver. Absorbed fats enter lacteals (lymphatic capillaries in villi) → thoracic duct → systemic circulation, bypassing the liver.',
    fluidRole:'Secretes 1–2 L intestinal juice daily (alkaline, with enzymes). Receives 1.5 L bile + 1.5 L pancreatic juice daily. Absorbs ~7 L of fluid (from diet plus secretions). Chyme is propelled by peristalsis and segmentation contractions controlled by the enteric nervous system.',
    cellularProcess:'Glucose and galactose absorbed by SGLT1 (Na⁺ cotransport) on brush border → exit via GLUT2 on basolateral side. Fructose: absorbed by GLUT5. Amino acids: by Na⁺-amino acid cotransporters. Fats: bile emulsifies triglycerides → pancreatic lipase cleaves to monoglycerides + fatty acids → micelles deliver to enterocyte → resynthesized into triglycerides → packaged into chylomicrons → exit via lacteals.',
    conditions:[
      { name:'Celiac Disease', description:'Immune reaction to gluten destroys villi, causing malabsorption of virtually all nutrients' },
      { name:'Crohn\'s Disease', description:'Transmural granulomatous inflammation that can affect any segment, causing fistulas and strictures' },
      { name:'Small Bowel Obstruction', description:'Mechanical blockage preventing intestinal contents from passing; can cause strangulation and necrosis' },
    ],
    fact:'If you could unfold all the villi and microvilli of your small intestine, the total absorptive surface area would cover the floor of a 2-bedroom apartment — approximately 200 square meters.',
  },
  {
    id:'colon', name:'Large Intestine', latin:'Intestinum crassum', color:'#b45309', emissiveColor:'#78350f',
    position:[0.0,-0.46,0.03], scale:[0.30,0.28,0.16], explodeOffset:[0.6,-1.4,1.0],
    shape:'torus', systems:['FULL','ORGANS'], genders:['MALE','FEMALE'], animationType:'flow',
    description:'The large intestine is a 1.5-meter wide-bore tube that receives unabsorbed material from the small intestine, recovers remaining water and electrolytes, and houses 100 trillion bacteria that form your gut microbiome. It converts liquid chyme into formed stool over 12–48 hours.',
    functions:['Absorbs water and electrolytes from waste material','Compacts and stores faecal matter','Houses the gut microbiome (trillions of bacteria)','Synthesises vitamins K and B12 via gut bacteria','Transports waste toward the rectum for elimination'],
    funFacts:['Contains more bacteria than there are cells in your body','The gut microbiome weighs about 1.5 kg','Gut bacteria produce 90% of the body\'s serotonin supply'],
    medicalDescription:'The intestinum crassum comprises the cecum, appendix, ascending colon, transverse colon, descending colon, sigmoid colon, rectum, and anus. Unlike the small intestine, it lacks villi but contains deep crypts, haustra (sacculations), and taeniae coli (three longitudinal muscle bands).',
    vitamins:[
      { name:'Vitamin K2 (MK-7)', role:'Produced by colonic bacteria (Bacteroides, Lactobacillus) and absorbed through the colon wall' },
      { name:'Biotin (B7)', role:'Synthesized by gut bacteria; absorbed in the colon' },
      { name:'Vitamin B12', role:'Synthesized by colon bacteria but cannot be absorbed here — an evolutionary paradox' },
    ],
    minerals:[
      { name:'Sodium', role:'Actively reabsorbed via ENaC channels; drives secondary water reabsorption' },
      { name:'Potassium', role:'Secreted into lumen in exchange for sodium; can cause hypokalemia in diarrhea' },
      { name:'Magnesium', role:'Some magnesium absorbed in colon; colonic bacteria affect magnesium bioavailability' },
    ],
    cellTypes:[
      { name:'Colonocytes', description:'Absorptive cells lacking microvilli but with dense mitochondria for active Na⁺ transport. Uniquely, they use short-chain fatty acids (acetate, propionate, butyrate) from bacterial fermentation as their primary fuel — not glucose.' },
      { name:'Goblet cells', description:'Extremely numerous in colon — up to 25% of cells in the sigmoid colon. Produce the thick two-layered mucus essential for lubricating feces and maintaining a microbe-free inner mucus layer.' },
      { name:'Enteroendocrine L cells', description:'Secrete GLP-1, GLP-2, and peptide YY (PYY). GLP-1 enhances insulin secretion; PYY suppresses appetite — the gut-brain satiety axis.' },
    ],
    bloodFlow:'Ascending and transverse colon: superior mesenteric artery. Descending and sigmoid: inferior mesenteric artery. Rectum: superior, middle, and inferior rectal arteries. Venous drainage → portal system. Superior hemorrhoidal veins drain to portal (liver); middle/inferior to systemic circulation.',
    fluidRole:'Receives 1.5 L of ileocecal contents daily; reduces this to 100–150 ml of fecal water output. Mucus production is essential — without the inner mucus layer, bacteria contact and invade the epithelium causing inflammatory bowel disease.',
    cellularProcess:'Bacterial fermentation of dietary fiber → produces SCFAs (butyrate, propionate, acetate). Butyrate enters colonocytes → beta-oxidation → ATP → powers Na⁺ reabsorption. This is why a high-fiber diet directly fuels colon cell energy metabolism. Water follows Na⁺ osmotically via AQP3/4 aquaporins. Haustra mix contents while slow mass movements 1–3x/day propel stool toward rectum.',
    conditions:[
      { name:'Colorectal Cancer', description:'Most common GI cancer; polyps progress over 10–15 years to adenocarcinoma via APC/KRAS/TP53 mutations' },
      { name:'Ulcerative Colitis', description:'Continuous mucosal inflammation from rectum extending proximally; bloody diarrhea, cramping' },
      { name:'Diverticular Disease', description:'Herniation of mucosa through muscle weakness, forming diverticula prone to infection' },
      { name:'Irritable Bowel Syndrome (IBS)', description:'Altered gut-brain signaling causing altered motility, visceral hypersensitivity, and bloating' },
    ],
    fact:'Your gut microbiome contains 100 trillion bacteria from 500+ species — outnumbering your own cells 1.3:1 — and their collective genome contains 150x more genes than the human genome.',
  },
  {
    id:'spleen', name:'Spleen', latin:'Splen', color:'#8B4069', emissiveColor:'#4A1535',
    position:[-0.28,0.06,0.0], scale:[0.10,0.12,0.08], explodeOffset:[-1.2,-0.1,0.6],
    shape:'flat-sphere', systems:['FULL','ORGANS','CIRCULATORY'], genders:['MALE','FEMALE'], animationType:'neutral',
    description:'The spleen is the body\'s largest lymphoid organ and a sophisticated blood filter the size of your fist. It acts as a quality control checkpoint for red blood cells — recycling old or damaged ones while trapping bacteria and activating immune responses.',
    functions:['Filters and destroys worn-out red blood cells','Stores platelets and white blood cells','Mounts immune responses to bloodborne pathogens','Recycles iron from haemoglobin','Acts as emergency blood reservoir'],
    funFacts:['You can live without a spleen (with higher infection risk)','Stores up to 500 mL of blood','Can double in size during severe infection'],
    medicalDescription:'The splen is a secondary lymphoid organ weighing 150–200 g, located in the left hypochondrium. It comprises red pulp (blood filtration and RBC storage/recycling) and white pulp (immune surveillance) separated by a marginal zone. It filters 350 L of blood daily via the open circulation in red pulp sinusoids.',
    vitamins:[
      { name:'Vitamin D', role:'Modulates splenic macrophage activity and lymphocyte function' },
      { name:'Vitamin C', role:'Supports lymphocyte proliferation and immunoglobulin synthesis in white pulp' },
      { name:'Vitamin A', role:'Required for maintaining B cell zones (follicles) and T cell activation in spleen' },
    ],
    minerals:[
      { name:'Iron', role:'Recycled from hemoglobin in old red blood cells by splenic macrophages' },
      { name:'Zinc', role:'Essential for lymphocyte development and NK cell activity in white pulp' },
      { name:'Selenium', role:'Supports glutathione peroxidase in macrophages neutralizing ROS from phagocytosis' },
    ],
    cellTypes:[
      { name:'Red pulp macrophages', description:'The "quality control inspectors" of red blood cells. They recognize aged, damaged, or parasitized RBCs via exposed phosphatidylserine and phagocytose them, recycling hemoglobin iron.' },
      { name:'Marginal zone B cells', description:'Rapid-response B lymphocytes that provide the first antibody wave against blood-borne bacteria (especially encapsulated bacteria like pneumococcus) without needing T cell help.' },
      { name:'Follicular dendritic cells', description:'Present antigens to B cells in germinal centers, driving antibody somatic hypermutation and affinity maturation.' },
    ],
    bloodFlow:'Splenic artery branches into central arteries → capillaries open into red pulp sinusoids → blood percolates through reticular meshwork → venous sinuses → splenic vein → portal vein. This "open circulation" allows macrophages to screen all passing blood cells.',
    fluidRole:'Stores ~200 ml of blood and up to 30% of total platelets as a reserve. During hemorrhage or exercise, splenic contraction can add 200 ml of blood to circulation within seconds.',
    cellularProcess:'Aged RBCs (>120 days) have oxidized cytoskeletal proteins → decreased deformability → unable to squeeze through 3 μm slit-like pores in splenic sinusoids → trapped → engulfed by macrophages → hemoglobin → globin (recycled as amino acids) + heme → iron (stored as ferritin/transferred to transferrin) + biliverdin → bilirubin (conjugated by liver, excreted in bile).',
    conditions:[
      { name:'Splenomegaly', description:'Enlarged spleen from infections (EBV, malaria), liver disease, or blood disorders' },
      { name:'Hypersplenism', description:'Overactive spleen destroying too many blood cells, causing anemia, thrombocytopenia, and neutropenia' },
      { name:'Splenic Rupture', description:'Medical emergency — traumatic laceration causes rapid massive hemorrhage into peritoneal cavity' },
    ],
    fact:'People without a spleen must take prophylactic antibiotics for life and receive extra vaccinations because their ability to fight encapsulated bacteria (pneumococcus, meningococcus) is severely impaired.',
  },
  {
    id:'pancreas', name:'Pancreas', latin:'Pancreas', color:'#E8B84B', emissiveColor:'#8A6010',
    position:[0.0,-0.06,-0.06], scale:[0.18,0.06,0.07], explodeOffset:[0.2,-0.8,0.5],
    shape:'flat-sphere', systems:['FULL','ORGANS'], genders:['MALE','FEMALE'], animationType:'neutral',
    description:'The pancreas is your body\'s dual-function master gland — a 15 cm fish-shaped organ tucked behind the stomach. Its exocrine portion releases powerful digestive enzymes into the small intestine, while its endocrine islets of Langerhans produce insulin and glucagon to precisely control your blood sugar every minute of every day.',
    functions:['Produces insulin to lower blood glucose','Produces glucagon to raise blood glucose','Secretes lipase, amylase, and protease for digestion','Neutralises stomach acid entering the intestine via bicarbonate'],
    funFacts:['Only 2% of pancreas cells (beta cells) produce insulin','Can produce up to 1.5 litres of digestive juice per day'],
    medicalDescription:'The pancreas has exocrine acinar cells (98% of mass) secreting 1.5–2 L/day of enzyme-rich juice (pH 8.0) via pancreatic ducts. The endocrine islets of Langerhans (1–2% of mass, ~1 million islets) contain alpha cells (glucagon), beta cells (insulin), delta cells (somatostatin), and PP cells (pancreatic polypeptide).',
    vitamins:[
      { name:'Vitamin D', role:'Vitamin D receptors on beta cells; deficiency impairs insulin secretion and increases T2DM risk' },
      { name:'Vitamin E', role:'Antioxidant protecting beta cells from oxidative stress; may delay T1DM progression' },
      { name:'Vitamin B3 (Niacin)', role:'At pharmacological doses may protect beta cells, but high doses can impair glucose tolerance' },
    ],
    minerals:[
      { name:'Zinc', role:'Essential for insulin crystallization, storage, and secretion in beta cell granules' },
      { name:'Chromium', role:'Potentiates insulin signaling; deficiency impairs glucose tolerance' },
      { name:'Magnesium', role:'Required for insulin receptor activation; deficiency linked to insulin resistance' },
    ],
    cellTypes:[
      { name:'Beta cells (β)', description:'Located in the islet center; produce insulin and C-peptide in response to rising blood glucose. They contain 10,000+ secretory granules of crystallized insulin-zinc hexamers.' },
      { name:'Alpha cells (α)', description:'Located at islet periphery; produce glucagon when blood glucose falls. Glucagon signals the liver to release stored glucose (glycogenolysis).' },
      { name:'Acinar cells', description:'Exocrine cells that synthesize inactive zymogens (trypsinogen, chymotrypsinogen) stored as zymogen granules released by CCK and vagal stimulation.' },
      { name:'Delta cells (δ)', description:'Produce somatostatin that inhibits both insulin and glucagon secretion locally — the pancreas\'s own paracrine regulatory system.' },
    ],
    bloodFlow:'Supplied by the celiac trunk and superior mesenteric artery via pancreaticoduodenal arcades. Islets receive 10x higher blood flow per unit volume than exocrine tissue. Blood flows from beta cell core outward to alpha cells — insulin from beta cells actually inhibits glucagon from adjacent alpha cells.',
    fluidRole:'Pancreatic juice: bicarbonate-rich (HCO₃⁻ up to 120 mEq/L) to neutralize gastric acid in the duodenum; packed with digestive enzymes. Secreted as inactive zymogens (enterokinase in duodenum activates trypsinogen → trypsin → activates all others), preventing autodigestion.',
    cellularProcess:'Glucose enters beta cell via GLUT2 → glucose metabolism → ATP/ADP ratio rises → ATP-sensitive K⁺ channels close → membrane depolarizes → L-type Ca²⁺ channels open → calcium triggers exocytosis of insulin granules. This is the mechanism blocked in sulfonylurea drug therapy. Glucagon secretion uses a similar mechanism triggered by low glucose/amino acids.',
    conditions:[
      { name:'Type 1 Diabetes Mellitus', description:'Autoimmune destruction of beta cells eliminating insulin production; absolute insulin deficiency' },
      { name:'Type 2 Diabetes Mellitus', description:'Progressive beta cell dysfunction combined with peripheral insulin resistance' },
      { name:'Acute Pancreatitis', description:'Premature activation of digestive enzymes within the pancreas causing autodigestion and inflammation' },
      { name:'Pancreatic Cancer', description:'Extremely aggressive adenocarcinoma with <10% 5-year survival; often asymptomatic until advanced' },
    ],
    fact:'Your pancreas produces about 8 units of insulin per hour when fasting and can release a surge of 40 units within minutes after a meal. The beta cells must maintain insulin production non-stop for your entire lifetime.',
  },
  {
    id:'bladder', name:'Bladder', latin:'Vesica urinaria', color:'#4A9ACA', emissiveColor:'#1A4A7A',
    position:[0.0,-0.62,0.06], scale:[0.12,0.10,0.1], explodeOffset:[0,-1.5,0.9],
    shape:'blob', systems:['FULL','ORGANS'], genders:['MALE','FEMALE'], animationType:'neutral',
    description:'The urinary bladder is a highly expandable muscular reservoir that stores urine produced by the kidneys, stretching from a 50 ml empty state to 400–600 ml when full, without significant pressure rise — thanks to its unique transitional epithelium. Urination is controlled by both voluntary and involuntary sphincters.',
    functions:['Stores urine produced by the kidneys','Signals fullness via stretch receptor nerves','Voluntarily expels urine via the urethra','Its mucosal lining resists bacterial adhesion'],
    funFacts:['Can expand from 50 mL to 500+ mL','The urge to urinate begins at ~150 mL','Adults produce 1–2 litres of urine per day'],
    medicalDescription:'The vesica urinaria is a retroperitoneal hollow muscular organ with three layers of detrusor smooth muscle. The trigone (triangular region between two ureteral orifices and the internal urethral meatus) is smooth and relatively fixed. Urothelium (transitional epithelium/umbrella cells) allows extreme stretching. Voiding is coordinated by the micturition center (pons) and sacral spinal cord (S2–S4).',
    vitamins:[
      { name:'Vitamin C', role:'High urinary excretion; urothelium protection; megadoses may irritate bladder in some people' },
      { name:'Vitamin D', role:'Receptors in detrusor muscle; deficiency linked to overactive bladder and urinary incontinence' },
      { name:'Vitamin B6', role:'Deficiency increases urinary oxalate, contributing to stone formation in bladder' },
    ],
    minerals:[
      { name:'Potassium', role:'High urinary K⁺ can irritate sensitive urothelium in interstitial cystitis' },
      { name:'Magnesium', role:'Inhibits calcium oxalate crystallization; urinary magnesium excretion important in stone prevention' },
      { name:'Calcium', role:'Urinary calcium excretion regulated by kidneys; hypercalciuria leads to calcium oxalate stones' },
    ],
    cellTypes:[
      { name:'Umbrella cells (Superficial urothelium)', description:'Giant terminally differentiated cells with highly specialized apical membrane containing uroplakin plaques — rigid protein complexes that create an impermeable barrier preventing urine from re-entering tissue. They flatten dramatically during filling.' },
      { name:'Intermediate urothelial cells', description:'Provide a mitotic reserve; can differentiate into umbrella cells when the surface is damaged. Transitional cells can increase from 2 cell layers (distended) to 6–7 cell layers (empty).' },
      { name:'Detrusor smooth muscle cells', description:'Arranged in three interlocking layers that can generate pressures up to 100 cmH₂O during forceful voiding. Between voidings, β3-adrenoreceptors maintain relaxation.' },
    ],
    bloodFlow:'Superior vesical arteries (from umbilical arteries) supply the dome; inferior vesical arteries (internal iliac) supply the base and trigone. Venous drainage via vesical plexus to internal iliac veins. Lymphatics drain to obturator, internal iliac, and external iliac nodes.',
    fluidRole:'Stores and periodically expels urine. Urine is a complex solution: water (~95%), urea (~2%), creatinine, uric acid, ions (Na⁺, K⁺, Cl⁻, NH₄⁺), vitamins, hormones, and drug metabolites. The GAG (glycosaminoglycan) layer lining the urothelium prevents bacteria from adhering.',
    cellularProcess:'During filling: stretch-activated mechanoreceptors in urothelium respond to distension → ATP release → Aδ and C-fiber afferents signal spinal cord → inhibitory interneurons prevent voiding until appropriate time. At voluntary voiding: frontal cortex releases inhibition → pontine micturition center activates → sacral parasympathetics fire → ACh binds M3 on detrusor → IP3/Ca²⁺ contraction → simultaneous relaxation of external sphincter.',
    conditions:[
      { name:'Overactive Bladder (OAB)', description:'Involuntary detrusor contractions causing urgency, frequency, and urge incontinence; affects 1 in 6 adults' },
      { name:'Bladder Cancer', description:'Most common urological cancer; 90% transitional cell carcinoma linked to smoking and aromatic amines' },
      { name:'Interstitial Cystitis', description:'Chronic bladder pain syndrome with urothelial barrier dysfunction; poorly understood' },
      { name:'Urinary Tract Infection (UTI)', description:'E. coli adheres to urothelium causing dysuria, urgency, frequency; women 30x more susceptible due to shorter urethra' },
    ],
    fact:'Bladder umbrella cells are so effective at expanding that a single cell can increase its surface area by 5–6 times as the bladder fills — effectively stretching like a biological balloon without tearing.',
  },
  {
    id:'gallbladder', name:'Gallbladder', latin:'Vesica fellea', color:'#6DB56D', emissiveColor:'#2A5A2A',
    position:[0.22,-0.02,0.06], scale:[0.07,0.09,0.07], explodeOffset:[1.2,-0.3,0.8],
    shape:'blob', systems:['FULL','ORGANS'], genders:['MALE','FEMALE'], animationType:'neutral',
    description:'The gallbladder is a small pear-shaped sac tucked under the liver that stores and concentrates bile — concentrating it up to 10-fold. When you eat a fatty meal, it contracts and squirts bile into the small intestine where bile salts emulsify fats into tiny droplets, dramatically increasing the surface area for digestive enzymes to work on.',
    functions:['Concentrates and stores bile from the liver','Releases bile in response to dietary fat','Aids fat digestion and absorption of fat-soluble vitamins'],
    funFacts:['Can be removed with minimal long-term effects','Gallstones form in ~10-15% of adults','Bile is 97% water'],
    medicalDescription:'The vesica biliaris is a ~7–10 cm saccular organ lying in the gallbladder fossa of the liver\'s inferior surface. It concentrates hepatic bile by actively absorbing water and Na⁺. The cystic duct joins the common hepatic duct to form the common bile duct (choledochus) which enters the duodenum at the ampulla of Vater, regulated by the sphincter of Oddi.',
    vitamins:[
      { name:'Vitamin C', role:'Converts cholesterol to bile acids via CYP7A1 — deficiency promotes cholesterol gallstone formation' },
      { name:'Vitamin D', role:'Regulates cholesterol metabolism; deficiency associated with increased gallstone risk' },
    ],
    minerals:[
      { name:'Calcium', role:'Calcium bilirubinate is a component of pigment stones; excess calcium in bile promotes stone formation' },
      { name:'Magnesium', role:'Magnesium-rich diet associated with reduced gallstone risk' },
    ],
    cellTypes:[
      { name:'Gallbladder epithelial cells (Cholecystocytes)', description:'Tall columnar cells with apical microvilli and extensive basolateral folding maximizing surface area for water and Na⁺ absorption. They reduce bile volume 5–10x, concentrating bile salts and bilirubin.' },
      { name:'Rokitansky-Aschoff sinuses', description:'Herniations of mucosa through the muscular wall. May trap bile and form stones within the wall; found in both normal and diseased gallbladders.' },
    ],
    bloodFlow:'Cystic artery (from right hepatic artery) supplies the gallbladder. Venous drainage is directly into the liver via small veins through the gallbladder fossa — bypassing the main portal system. This anatomical relationship means gallbladder inflammation easily involves the adjacent liver.',
    fluidRole:'Concentrates 600–1,000 ml/day of hepatic bile to 50–150 ml of concentrated bile. Bile composition: bile salts (67%), phosphatidylcholine (22%), cholesterol (4%), bilirubin, electrolytes, water. Bile salts form mixed micelles with dietary fats, essential for fat-soluble vitamin (A, D, E, K) absorption.',
    cellularProcess:'CCK binds to CCK-A receptors on gallbladder smooth muscle → Gq → IP3 → Ca²⁺ release → myosin light chain kinase activation → contraction → bile ejected. Simultaneously, CCK relaxes the sphincter of Oddi via VIP/nitric oxide → bile flows into duodenum. Bile salts emulsify fat globules into 1 μm micelles → 1,000x increase in surface area for pancreatic lipase.',
    conditions:[
      { name:'Cholelithiasis (Gallstones)', description:'Cholesterol supersaturation (most common, 80%) or bilirubin excess → crystal nucleation → stone growth; "fat, female, forty, fertile" risk profile' },
      { name:'Acute Cholecystitis', description:'Gallstone impaction in cystic duct → bile stasis → bacterial overgrowth → inflammation; RUQ pain, fever, Murphy\'s sign' },
      { name:'Cholangitis', description:'Bacterial infection of bile ducts, often with Charcot\'s triad: fever, jaundice, RUQ pain; life-threatening' },
    ],
    fact:'You can live perfectly well without a gallbladder — bile simply flows continuously from the liver into the duodenum instead of being stored. The gallbladder is considered a vestigial concentrating organ in modern humans who eat frequent small meals.',
  },
];

const SYSTEMS: { id: Tab; label: string; color: string; description: string }[] = [
  { id:'FULL',        label:'All Systems',  color:'#22d3ee',  description:'View all organs together — the complete integrated machine.' },
  { id:'SKELETAL',    label:'Skeletal',     color:'#d4d4cc',  description:'206 bones form the structural framework, protecting organs and enabling movement.' },
  { id:'MUSCULAR',    label:'Muscular',     color:'#f97316',  description:'Over 600 muscles covering every bone — generating movement, posture, and body heat.' },
  { id:'ORGANS',      label:'Organs',       color:'#f97316',  description:'Specialised structures each performing critical chemical and mechanical functions.' },
  { id:'CIRCULATORY', label:'Circulatory',  color:'#ef4444',  description:'Heart + 100,000 km of blood vessels delivering oxygen and nutrients to every cell.' },
  { id:'NERVOUS',     label:'Nervous',      color:'#a78bfa',  description:'86 billion neurons forming the body\'s electrical network — sensing, deciding, commanding.' },
  { id:'RESPIRATORY', label:'Respiratory',  color:'#f9a8d4',  description:'Lungs + airways — exchanging 22,000 breaths per day to keep every cell alive.' },
];

// ─── Geometry Hook ──────────────────────────────────────────────────────────────

function useOrganGeometry(shape: OrganDef['shape']) {
  return useMemo(() => {
    if (shape === 'brain') {
      const geo = new THREE.SphereGeometry(1, 48, 48);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const n = Math.sin(x * 9 + 1.2) * Math.cos(y * 7 - 0.5) * Math.sin(z * 8 + 2.1) * 0.07
                + Math.sin(x * 15) * Math.cos(z * 12) * 0.025;
        const l = Math.sqrt(x * x + y * y + z * z) || 1;
        pos.setXYZ(i, x / l * (1 + n), y / l * (1 + n), z / l * (1 + n));
      }
      geo.computeVertexNormals();
      return geo;
    }
    if (shape === 'capsule') return new THREE.CapsuleGeometry(0.5, 1, 8, 16);
    if (shape === 'torus')   return new THREE.TorusGeometry(1, 0.38, 12, 48);
    return new THREE.SphereGeometry(1, 24, 24);
  }, [shape]);
}

// ─── Organ Mesh ─────────────────────────────────────────────────────────────────

function OrganMesh({ organ, isExploded, isSelected, isVisible, onClick }: {
  organ: OrganDef; isExploded: boolean; isSelected: boolean;
  isVisible: boolean; onClick: (o: OrganDef) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const matRef   = useRef<THREE.MeshPhysicalMaterial>(null!);
  const [hovered, setHovered] = useState(false);
  const geo     = useOrganGeometry(organ.shape);
  const timeRef = useRef(Math.random() * 100);

  const restPos    = useMemo(() => new THREE.Vector3(...organ.position), [organ.position]);
  const explodePos = useMemo(() => new THREE.Vector3(
    organ.position[0] + organ.explodeOffset[0],
    organ.position[1] + organ.explodeOffset[1],
    organ.position[2] + organ.explodeOffset[2],
  ), [organ.position, organ.explodeOffset]);

  useFrame((_, delta) => {
    if (!groupRef.current || !matRef.current) return;
    timeRef.current += delta;
    const t = timeRef.current;
    groupRef.current.position.lerp(isExploded ? explodePos : restPos, 0.06);

    if (organ.animationType === 'pulse') {
      const s = 1 + Math.sin(t * 2.5) * 0.03;
      groupRef.current.scale.setScalar(s);
    } else if (organ.animationType === 'breathe') {
      const b = Math.sin(t * 0.75);
      groupRef.current.scale.set(1 - b * 0.018, 1 + b * 0.055, 1 - b * 0.018);
    } else if (organ.animationType === 'flow') {
      groupRef.current.rotation.y = Math.sin(t * 0.4) * 0.18;
    }

    matRef.current.emissiveIntensity = (isSelected || hovered)
      ? 0.35 + Math.sin(t * 3.5) * 0.12
      : 0.08;
  });

  const meshScale: [number, number, number] = organ.shape === 'flat-sphere'
    ? [organ.scale[0], organ.scale[1] * 0.42, organ.scale[2]]
    : organ.scale;

  if (!isVisible) return null;

  return (
    <group ref={groupRef} position={restPos.toArray() as [number, number, number]}>
      <mesh
        geometry={geo}
        scale={meshScale}
        onClick={(e) => { e.stopPropagation(); onClick(organ); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
      >
        <meshPhysicalMaterial
          ref={matRef}
          color={organ.color}
          emissive={organ.emissiveColor}
          emissiveIntensity={0.08}
          roughness={0.52}
          metalness={0}
          clearcoat={0.65}
          clearcoatRoughness={0.22}
        />
      </mesh>

      {(isSelected || hovered) && (
        <mesh geometry={geo} scale={meshScale.map(s => s * 1.07) as [number, number, number]}>
          <meshBasicMaterial color={organ.color} transparent opacity={0.15} side={THREE.BackSide} />
        </mesh>
      )}

      {(isSelected || hovered) && (
        <Html center distanceFactor={5}
          position={[0, (meshScale[1] ?? 0.15) * 1.6, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            background: 'rgba(2,4,10,0.92)', border: `1px solid ${organ.color}60`,
            borderRadius: 6, padding: '3px 10px', color: organ.color,
            fontSize: 10, fontWeight: 800, letterSpacing: '0.18em',
            textTransform: 'uppercase', whiteSpace: 'nowrap',
          }}>
            {organ.name}
          </div>
        </Html>
      )}
    </group>
  );
}

// ─── Body Silhouette ────────────────────────────────────────────────────────────

function BodySilhouette({ gender }: { gender: Gender }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);
  const ghostMat = { color: '#1e8aff', opacity: 0.04, transparent: true, roughness: 0.9 };

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    timeRef.current += delta;
    const b = Math.sin(timeRef.current * 0.75) * 0.008;
    meshRef.current.scale.set(1 + b, 1, 1 + b * 0.5);
  });

  const geo = useMemo(() => {
    const male: [number, number][] = [
      [0.0,-1.72],[0.12,-1.6],[0.17,-1.18],[0.14,-0.88],[0.19,-0.48],
      [0.26,-0.13],[0.21,0.16],[0.27,0.5],[0.30,0.76],[0.20,0.88],
      [0.11,0.99],[0.19,1.1],[0.23,1.28],[0.20,1.46],[0.0,1.56],
    ];
    const female: [number, number][] = [
      [0.0,-1.72],[0.13,-1.6],[0.18,-1.18],[0.15,-0.88],[0.24,-0.44],
      [0.30,-0.1],[0.18,0.19],[0.26,0.5],[0.28,0.76],[0.19,0.88],
      [0.11,0.99],[0.19,1.1],[0.22,1.28],[0.19,1.46],[0.0,1.56],
    ];
    return new THREE.LatheGeometry(
      (gender === 'FEMALE' ? female : male).map(([r, y]) => new THREE.Vector2(r, y)), 48
    );
  }, [gender]);

  const limbMat = <meshPhysicalMaterial color="#1e8aff" opacity={0.04} transparent roughness={0.9} />;

  return (
    <group raycast={() => null}>
      <mesh ref={meshRef} geometry={geo} raycast={() => null}>
        <meshPhysicalMaterial {...ghostMat} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* Upper arms */}
      {([-1, 1] as const).map(side => (
        <mesh key={`ua${side}`} position={[side * 0.42, 0.46, 0]} rotation={[0, 0, side * 0.32]} raycast={() => null}>
          <capsuleGeometry args={[0.08, 0.48, 4, 8]} />{limbMat}
        </mesh>
      ))}
      {/* Forearms */}
      {([-1, 1] as const).map(side => (
        <mesh key={`fa${side}`} position={[side * 0.52, 0.06, 0.02]} rotation={[0.08, 0, side * 0.52]} raycast={() => null}>
          <capsuleGeometry args={[0.065, 0.42, 4, 8]} />{limbMat}
        </mesh>
      ))}
      {/* Upper legs */}
      {([-1, 1] as const).map(side => (
        <mesh key={`ul${side}`} position={[side * 0.12, -0.85, 0]} rotation={[0, 0, side * 0.08]} raycast={() => null}>
          <capsuleGeometry args={[0.10, 0.52, 4, 8]} />{limbMat}
        </mesh>
      ))}
      {/* Lower legs */}
      {([-1, 1] as const).map(side => (
        <mesh key={`ll${side}`} position={[side * 0.10, -1.40, 0]} rotation={[0, 0, side * 0.05]} raycast={() => null}>
          <capsuleGeometry args={[0.075, 0.46, 4, 8]} />{limbMat}
        </mesh>
      ))}
    </group>
  );
}

// ─── Skeleton Layer ─────────────────────────────────────────────────────────────

function SkeletonLayer() {
  const c = '#d0d0c6';
  const mat = <meshStandardMaterial color={c} roughness={0.75} />;
  const transparentMat = (op: number) => <meshStandardMaterial color={c} roughness={0.8} opacity={op} transparent />;

  const ribs: [number, number, number][] = [
    [0.70,0.26,0.12],[0.62,0.27,0.13],[0.53,0.265,0.13],
    [0.45,0.255,0.12],[0.37,0.240,0.115],[0.28,0.220,0.11],
  ];

  return (
    <group>
      {/* Spine — segmented vertebrae */}
      {Array.from({ length: 24 }).map((_, i) => (
        <mesh key={`v${i}`} position={[0, 0.72 - i * 0.064, -0.055]}>
          <cylinderGeometry args={[0.022, 0.024, 0.054, 8]} />{mat}
        </mesh>
      ))}

      {/* Skull */}
      <mesh position={[0, 1.35, 0]}>
        <sphereGeometry args={[0.215, 20, 16]} />
        <meshPhysicalMaterial color={c} roughness={0.85} opacity={0.45} transparent />
      </mesh>
      {/* Jaw */}
      <mesh position={[0, 1.11, 0.06]} rotation={[0.25, 0, 0]}>
        <boxGeometry args={[0.17, 0.055, 0.1]} />
        {transparentMat(0.5)}
      </mesh>

      {/* Clavicles */}
      {([-1, 1] as const).map(side => (
        <mesh key={`cl${side}`} position={[side * 0.14, 0.99, 0.04]} rotation={[0, 0, side * 0.45]}>
          <cylinderGeometry args={[0.012, 0.012, 0.22, 6]} />{mat}
        </mesh>
      ))}

      {/* Rib cage */}
      {ribs.map(([y, rx, rz], i) => (
        <React.Fragment key={i}>
          <mesh position={[-rx * 0.5, y, 0]} rotation={[0, 0, -0.55 + i * 0.04]}>
            <torusGeometry args={[rx * 0.72, 0.009, 6, 28, Math.PI * 0.9]} />
            <meshStandardMaterial color={c} roughness={0.75} />
          </mesh>
          <mesh position={[rx * 0.5, y, 0]} rotation={[0, Math.PI, 0.55 - i * 0.04]}>
            <torusGeometry args={[rx * 0.72, 0.009, 6, 28, Math.PI * 0.9]} />
            <meshStandardMaterial color={c} roughness={0.75} />
          </mesh>
        </React.Fragment>
      ))}

      {/* Sternum */}
      <mesh position={[0, 0.5, 0.09]}>
        <boxGeometry args={[0.04, 0.52, 0.025]} />{mat}
      </mesh>

      {/* Pelvis */}
      <mesh position={[0, -0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.24, 0.045, 8, 32, Math.PI * 1.7]} />
        <meshStandardMaterial color={c} roughness={0.8} />
      </mesh>

      {/* Shoulder blades */}
      {([-1, 1] as const).map(side => (
        <mesh key={`sb${side}`} position={[side * 0.22, 0.75, -0.07]} rotation={[0, side * 0.2, 0]}>
          <boxGeometry args={[0.09, 0.14, 0.025]} />
          {transparentMat(0.6)}
        </mesh>
      ))}

      {/* Upper arms — humerus */}
      {([-1, 1] as const).map(side => (
        <mesh key={`h${side}`} position={[side * 0.38, 0.60, 0]} rotation={[0, 0, side * 0.35]}>
          <cylinderGeometry args={[0.022, 0.018, 0.40, 8]} />{mat}
        </mesh>
      ))}

      {/* Forearms — radius */}
      {([-1, 1] as const).map(side => (
        <mesh key={`r${side}`} position={[side * 0.49, 0.18, 0.02]} rotation={[0.08, 0, side * 0.55]}>
          <cylinderGeometry args={[0.013, 0.013, 0.38, 8]} />{mat}
        </mesh>
      ))}

      {/* Forearms — ulna (parallel, offset slightly) */}
      {([-1, 1] as const).map(side => (
        <mesh key={`u${side}`} position={[side * 0.52, 0.17, -0.02]} rotation={[0.08, 0, side * 0.55]}>
          <cylinderGeometry args={[0.010, 0.010, 0.38, 8]} />{mat}
        </mesh>
      ))}

      {/* Hand — simplified metacarpals */}
      {([-1, 1] as const).map(side => (
        <mesh key={`hd${side}`} position={[side * 0.58, -0.10, 0.01]}>
          <boxGeometry args={[0.08, 0.06, 0.03]} />
          {transparentMat(0.55)}
        </mesh>
      ))}

      {/* Upper legs — femur */}
      {([-1, 1] as const).map(side => (
        <mesh key={`f${side}`} position={[side * 0.10, -0.82, 0]} rotation={[0, 0, side * 0.07]}>
          <cylinderGeometry args={[0.032, 0.028, 0.52, 8]} />{mat}
        </mesh>
      ))}

      {/* Lower legs — tibia */}
      {([-1, 1] as const).map(side => (
        <mesh key={`ti${side}`} position={[side * 0.09, -1.38, 0.01]} rotation={[0, 0, side * 0.04]}>
          <cylinderGeometry args={[0.022, 0.016, 0.50, 8]} />{mat}
        </mesh>
      ))}

      {/* Lower legs — fibula */}
      {([-1, 1] as const).map(side => (
        <mesh key={`fi${side}`} position={[side * 0.12, -1.38, -0.01]} rotation={[0, 0, side * 0.06]}>
          <cylinderGeometry args={[0.010, 0.010, 0.46, 8]} />{mat}
        </mesh>
      ))}

      {/* Feet — simplified */}
      {([-1, 1] as const).map(side => (
        <mesh key={`ft${side}`} position={[side * 0.09, -1.67, 0.05]} rotation={[0.4, 0, 0]}>
          <boxGeometry args={[0.09, 0.04, 0.18]} />
          {transparentMat(0.55)}
        </mesh>
      ))}
    </group>
  );
}

// ─── Blood Particles (used inside CirculatoryLayer) ─────────────────────────────

function AnimatedBloodParticles() {
  const COUNT = 40;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // vessel path pairs: [start, end]
  const paths = useMemo<[THREE.Vector3, THREE.Vector3][]>(() => [
    [new THREE.Vector3(-0.1,0.46,0.06), new THREE.Vector3(-0.22,0.44,0.0)],   // → left lung
    [new THREE.Vector3(0.1,0.46,0.06),  new THREE.Vector3(0.22,0.46,0.0)],    // → right lung
    [new THREE.Vector3(0,0.46,0.06),    new THREE.Vector3(0,0.92,0.04)],       // → head
    [new THREE.Vector3(0,0.46,0.06),    new THREE.Vector3(0,0.08,0.04)],       // → abdomen
    [new THREE.Vector3(0,0.08,0.04),    new THREE.Vector3(-0.09,-0.68,0.02)],  // → left leg
    [new THREE.Vector3(0,0.08,0.04),    new THREE.Vector3(0.09,-0.68,0.02)],   // → right leg
    [new THREE.Vector3(0,0.08,0.04),    new THREE.Vector3(0.18,0.08,0.0)],     // → liver
    [new THREE.Vector3(0,0.08,0.04),    new THREE.Vector3(-0.24,-0.1,-0.07)],  // → kidney
  ], []);

  const state = useRef(
    Array.from({ length: COUNT }, (_, i) => ({
      t: i / COUNT,
      speed: 0.28 + Math.random() * 0.45,
      pathIdx: i % paths.length,
    }))
  );

  useFrame((_, delta) => {
    const m = meshRef.current;
    if (!m) return;
    state.current.forEach((p, i) => {
      p.t = (p.t + delta * p.speed) % 1;
      const [s, e] = paths[p.pathIdx];
      dummy.position.lerpVectors(s, e, p.t);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]}>
      <sphereGeometry args={[0.013, 5, 5]} />
      <meshBasicMaterial color="#ff2244" transparent opacity={0.85} />
    </instancedMesh>
  );
}

// ─── Circulatory Layer ──────────────────────────────────────────────────────────

function CirculatoryLayer() {
  const c = '#cc1122';
  return (
    <group>
      {/* Aorta */}
      <mesh position={[0, 0.30, 0.06]}>
        <cylinderGeometry args={[0.026, 0.022, 0.75, 8]} />
        <meshStandardMaterial color={c} roughness={0.45} />
      </mesh>
      {/* Pulmonary vessels */}
      {([-1, 1] as const).map((side, i) => (
        <mesh key={i} position={[side * 0.13, 0.48, 0.04]} rotation={[0, 0, side * 0.7]}>
          <cylinderGeometry args={[0.013, 0.013, 0.22, 6]} />
          <meshStandardMaterial color="#dd4466" roughness={0.5} />
        </mesh>
      ))}
      {/* Abdominal aorta branches */}
      {([-1, 1] as const).map((side, i) => (
        <mesh key={i} position={[side * 0.11, 0.05, 0.02]} rotation={[0, 0, side * 0.55]}>
          <cylinderGeometry args={[0.011, 0.011, 0.26, 6]} />
          <meshStandardMaterial color={c} roughness={0.5} />
        </mesh>
      ))}
      {/* Iliac vessels */}
      {([-1, 1] as const).map((side, i) => (
        <mesh key={i} position={[side * 0.09, -0.42, 0.02]} rotation={[0, 0, side * 0.35]}>
          <cylinderGeometry args={[0.013, 0.013, 0.38, 6]} />
          <meshStandardMaterial color={c} roughness={0.5} />
        </mesh>
      ))}
      {/* Femoral arteries */}
      {([-1, 1] as const).map((side, i) => (
        <mesh key={i} position={[side * 0.09, -0.82, 0.02]} rotation={[0, 0, side * 0.08]}>
          <cylinderGeometry args={[0.010, 0.010, 0.50, 6]} />
          <meshStandardMaterial color={c} roughness={0.5} />
        </mesh>
      ))}
      {/* Superior vena cava */}
      <mesh position={[0.04, 0.62, 0.05]}>
        <cylinderGeometry args={[0.018, 0.018, 0.22, 6]} />
        <meshStandardMaterial color="#2244aa" roughness={0.45} />
      </mesh>
      {/* Jugular veins */}
      {([-1, 1] as const).map((side, i) => (
        <mesh key={i} position={[side * 0.065, 0.92, 0.03]} rotation={[0, 0, side * 0.15]}>
          <cylinderGeometry args={[0.009, 0.009, 0.26, 6]} />
          <meshStandardMaterial color="#2244aa" roughness={0.5} />
        </mesh>
      ))}
      <AnimatedBloodParticles />
    </group>
  );
}

// ─── Nervous Layer ──────────────────────────────────────────────────────────────

function NervousLayer() {
  const c = '#a78bfa';
  const timeRef = useRef(0);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    timeRef.current += delta;
    groupRef.current?.children.forEach((child, i) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.emissiveIntensity = 0.15 + Math.sin(timeRef.current * 2.0 + i * 0.4) * 0.1;
      }
    });
  });

  const nerveMat = <meshStandardMaterial color={c} emissive="#5a3fb0" emissiveIntensity={0.2} roughness={0.3} />;

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0.18, -0.04]}><cylinderGeometry args={[0.013, 0.013, 1.25, 8]} />{nerveMat}</mesh>
      {([-1, 1] as const).map((side, i) => (
        <mesh key={`cp${i}`} position={[side * 0.055, 0.98, 0.0]} rotation={[0, 0, side * 1.1]}>
          <cylinderGeometry args={[0.006, 0.006, 0.18, 6]} />{nerveMat}
        </mesh>
      ))}
      {([-1, 1] as const).map((side, i) => (
        <mesh key={`bp${i}`} position={[side * 0.18, 0.72, 0.0]} rotation={[0.1, 0, side * 0.85]}>
          <cylinderGeometry args={[0.007, 0.007, 0.32, 6]} />{nerveMat}
        </mesh>
      ))}
      {/* Arm nerves */}
      {([-1, 1] as const).map((side, i) => (
        <mesh key={`an${i}`} position={[side * 0.44, 0.38, 0.0]} rotation={[0, 0, side * 0.38]}>
          <cylinderGeometry args={[0.005, 0.005, 0.44, 6]} />{nerveMat}
        </mesh>
      ))}
      {Array.from({ length: 5 }).map((_, i) => {
        const y = 0.65 - i * 0.14;
        return ([-1, 1] as const).map((side, j) => (
          <mesh key={`ic${i}-${j}`} position={[side * 0.12, y, 0.0]} rotation={[0, 0, side * 1.3]}>
            <cylinderGeometry args={[0.005, 0.005, 0.22, 5]} />{nerveMat}
          </mesh>
        ));
      })}
      {([-1, 1] as const).map((side, i) => (
        <mesh key={`lp${i}`} position={[side * 0.10, -0.35, 0.0]} rotation={[0, 0, side * 0.7]}>
          <cylinderGeometry args={[0.007, 0.007, 0.26, 6]} />{nerveMat}
        </mesh>
      ))}
      {/* Sciatic nerves */}
      {([-1, 1] as const).map((side, i) => (
        <mesh key={`sc${i}`} position={[side * 0.09, -0.72, -0.03]} rotation={[0.1, 0, side * 0.18]}>
          <cylinderGeometry args={[0.009, 0.007, 0.55, 6]} />{nerveMat}
        </mesh>
      ))}
      <mesh position={[0, 1.06, 0.0]}><cylinderGeometry args={[0.028, 0.020, 0.16, 8]} />{nerveMat}</mesh>
    </group>
  );
}

// ─── Respiratory Layer ───────────────────────────────────────────────────────────

function RespiratoryLayer() {
  const timeRef   = useRef(0);
  const diaphRef  = useRef<THREE.Mesh>(null);
  const tracheaRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    timeRef.current += delta;
    const b = Math.sin(timeRef.current * 0.75);
    if (diaphRef.current)  diaphRef.current.position.y = -0.07 + b * 0.025;
    if (tracheaRef.current) tracheaRef.current.scale.y = 1 + b * 0.01;
  });

  return (
    <group>
      <mesh ref={tracheaRef} position={[0, 0.78, 0.04]}>
        <cylinderGeometry args={[0.022, 0.022, 0.30, 10]} />
        <meshStandardMaterial color="#f9a8d4" roughness={0.5} opacity={0.7} transparent />
      </mesh>
      {/* Bronchi */}
      {([-1, 1] as const).map((side, i) => (
        <mesh key={i} position={[side * 0.10, 0.62, 0.04]} rotation={[0, 0, side * 0.7]}>
          <cylinderGeometry args={[0.016, 0.016, 0.18, 8]} />
          <meshStandardMaterial color="#f4a0b8" roughness={0.5} opacity={0.7} transparent />
        </mesh>
      ))}
      {/* Bronchioles (smaller branches) */}
      {([-1, 1] as const).map((side, i) => (
        <mesh key={`br${i}`} position={[side * 0.19, 0.54, 0.03]} rotation={[0, 0, side * 0.95]}>
          <cylinderGeometry args={[0.009, 0.009, 0.14, 6]} />
          <meshStandardMaterial color="#f4a0b8" roughness={0.5} opacity={0.6} transparent />
        </mesh>
      ))}
      <mesh ref={diaphRef} position={[0, -0.07, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.28, 0.028, 6, 32, Math.PI * 2]} />
        <meshStandardMaterial color="#86efac" roughness={0.6} opacity={0.55} transparent />
      </mesh>
    </group>
  );
}

// ─── Muscular Layer ─────────────────────────────────────────────────────────────

function MuscularLayer() {
  const timeRef  = useRef(0);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    timeRef.current += delta;
    // Subtle flex pulse on major muscles
    groupRef.current?.children.forEach((child, i) => {
      if (child instanceof THREE.Mesh) {
        const pulse = 1 + Math.sin(timeRef.current * 1.2 + i * 0.25) * 0.015;
        child.scale.setScalar(pulse);
      }
    });
  });

  const muscleMat = (color = '#c0392b', op = 1) => (
    <meshStandardMaterial color={color} roughness={0.72} metalness={0} opacity={op} transparent={op < 1} />
  );

  return (
    <group ref={groupRef}>
      {/* Pectorals */}
      {([-1, 1] as const).map(side => (
        <mesh key={`pec${side}`} position={[side * 0.13, 0.56, 0.09]} rotation={[0.1, side * 0.15, side * 0.1]}>
          <sphereGeometry args={[0.15, 12, 8]} />{muscleMat('#e74c3c')}
        </mesh>
      ))}
      {/* Deltoids */}
      {([-1, 1] as const).map(side => (
        <mesh key={`delt${side}`} position={[side * 0.30, 0.76, 0.01]} rotation={[0, 0, side * 0.5]}>
          <sphereGeometry args={[0.09, 10, 8]} />{muscleMat('#c0392b')}
        </mesh>
      ))}
      {/* Trapezius */}
      <mesh position={[0, 0.88, -0.04]}>
        <boxGeometry args={[0.44, 0.17, 0.06]} />{muscleMat('#c0392b', 0.9)}
      </mesh>
      {/* Biceps */}
      {([-1, 1] as const).map(side => (
        <mesh key={`bic${side}`} position={[side * 0.38, 0.54, 0.05]} rotation={[0.05, 0, side * 0.36]}>
          <capsuleGeometry args={[0.055, 0.20, 6, 12]} />{muscleMat('#e74c3c')}
        </mesh>
      ))}
      {/* Triceps */}
      {([-1, 1] as const).map(side => (
        <mesh key={`tri${side}`} position={[side * 0.38, 0.54, -0.05]} rotation={[0.05, 0, side * 0.36]}>
          <capsuleGeometry args={[0.045, 0.18, 6, 12]} />{muscleMat('#a93226', 0.85)}
        </mesh>
      ))}
      {/* Forearm extensors */}
      {([-1, 1] as const).map(side => (
        <mesh key={`fex${side}`} position={[side * 0.48, 0.18, 0.01]} rotation={[0.08, 0, side * 0.54]}>
          <capsuleGeometry args={[0.038, 0.30, 6, 10]} />{muscleMat('#c0392b', 0.8)}
        </mesh>
      ))}
      {/* Rectus abdominis — segmented */}
      {[-0.24, -0.07, 0.10].map((y, ri) =>
        ([-1, 1] as const).map(side => (
          <mesh key={`ab${ri}${side}`} position={[side * 0.08, y, 0.11]}>
            <boxGeometry args={[0.082, 0.10, 0.055]} />{muscleMat('#c0392b')}
          </mesh>
        ))
      )}
      {/* Obliques */}
      {([-1, 1] as const).map(side => (
        <mesh key={`obl${side}`} position={[side * 0.21, -0.05, 0.07]} rotation={[0, 0, side * 0.42]}>
          <capsuleGeometry args={[0.058, 0.32, 6, 12]} />{muscleMat('#e74c3c', 0.82)}
        </mesh>
      ))}
      {/* Latissimus dorsi */}
      {([-1, 1] as const).map(side => (
        <mesh key={`lat${side}`} position={[side * 0.20, 0.38, -0.07]} rotation={[0, side * 0.15, side * 0.38]}>
          <capsuleGeometry args={[0.085, 0.40, 6, 12]} />{muscleMat('#a93226', 0.78)}
        </mesh>
      ))}
      {/* Gluteus maximus */}
      {([-1, 1] as const).map(side => (
        <mesh key={`glu${side}`} position={[side * 0.13, -0.50, -0.08]}>
          <sphereGeometry args={[0.13, 10, 8]} />{muscleMat('#c0392b', 0.88)}
        </mesh>
      ))}
      {/* Quadriceps */}
      {([-1, 1] as const).map(side => (
        <mesh key={`quad${side}`} position={[side * 0.10, -0.78, 0.05]} rotation={[0, 0, side * 0.07]}>
          <capsuleGeometry args={[0.09, 0.46, 8, 12]} />{muscleMat('#e74c3c')}
        </mesh>
      ))}
      {/* Hamstrings */}
      {([-1, 1] as const).map(side => (
        <mesh key={`ham${side}`} position={[side * 0.10, -0.78, -0.07]} rotation={[0, 0, side * 0.07]}>
          <capsuleGeometry args={[0.072, 0.42, 8, 12]} />{muscleMat('#c0392b', 0.82)}
        </mesh>
      ))}
      {/* Gastrocnemius — calves */}
      {([-1, 1] as const).map(side => (
        <mesh key={`calf${side}`} position={[side * 0.09, -1.22, 0.04]} rotation={[0.1, 0, side * 0.06]}>
          <capsuleGeometry args={[0.065, 0.25, 6, 10]} />{muscleMat('#c0392b')}
        </mesh>
      ))}
      {/* Tibialis anterior — shin */}
      {([-1, 1] as const).map(side => (
        <mesh key={`tib${side}`} position={[side * 0.09, -1.22, 0.07]} rotation={[0.05, 0, side * 0.05]}>
          <capsuleGeometry args={[0.038, 0.28, 6, 10]} />{muscleMat('#e74c3c', 0.75)}
        </mesh>
      ))}
    </group>
  );
}

// ─── Main 3D Scene ──────────────────────────────────────────────────────────────

function BodyScene({ gender, systemTab, isExploded, selectedOrgan, onSelectOrgan }: {
  gender: Gender; systemTab: Tab; isExploded: boolean;
  selectedOrgan: OrganDef | null; onSelectOrgan: (o: OrganDef | null) => void;
}) {
  const visibleOrgans = useMemo(() =>
    ORGANS.filter(o => o.genders.includes(gender) && o.systems.includes(systemTab)),
    [gender, systemTab]
  );

  return (
    <>
      <color attach="background" args={['#010509']} />
      <ambientLight intensity={0.35} color="#1a2040" />
      <directionalLight position={[3, 5, 4]} intensity={2.4} color="#ffffff" castShadow />
      <pointLight position={[-3, 2, 2]} intensity={1.8} color="#3366ff" />
      <pointLight position={[2, -2, 2]} intensity={0.6} color="#ff3322" />
      <pointLight position={[0, 3, -2]} intensity={0.5} color="#ffffff" />
      {systemTab === 'MUSCULAR' && <pointLight position={[0, 0, 3]} intensity={1.2} color="#f97316" />}

      <BodySilhouette gender={gender} />
      {systemTab === 'SKELETAL'    && <SkeletonLayer />}
      {systemTab === 'MUSCULAR'    && <MuscularLayer />}
      {systemTab === 'CIRCULATORY' && <CirculatoryLayer />}
      {systemTab === 'NERVOUS'     && <NervousLayer />}
      {systemTab === 'RESPIRATORY' && <RespiratoryLayer />}

      {ORGANS.map(organ => (
        <OrganMesh
          key={organ.id}
          organ={organ}
          isExploded={isExploded}
          isSelected={selectedOrgan?.id === organ.id}
          isVisible={visibleOrgans.some(o => o.id === organ.id)}
          onClick={o => onSelectOrgan(selectedOrgan?.id === o.id ? null : o)}
        />
      ))}

      <OrbitControls
        enableDamping dampingFactor={0.05}
        minDistance={1.6} maxDistance={6}
        minPolarAngle={Math.PI * 0.08} maxPolarAngle={Math.PI * 0.9}
        target={[0, 0.2, 0]}
      />

      <EffectComposer>
        <Bloom intensity={0.9} luminanceThreshold={0.55} radius={0.45} />
        <Vignette offset={0.38} darkness={0.52} />
      </EffectComposer>
    </>
  );
}

// ─── Organ Detail Panel ─────────────────────────────────────────────────────────

const TAB_LABELS: Record<DetailTab, string> = {
  OVERVIEW: 'Overview', NUTRITION: 'Nutrition', CELLULAR: 'Cellular', CONDITIONS: 'Conditions',
};

function OrganDetailPanel({ organ, onClose }: { organ: OrganDef; onClose: () => void }) {
  const [tab, setTab] = useState<DetailTab>('OVERVIEW');
  const vitColors = ['#f39c12','#e74c3c','#3498db','#27ae60','#9b59b6','#1abc9c','#e67e22'];

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 24, stiffness: 200 }}
      className="absolute top-0 right-0 h-full w-[320px] flex flex-col z-30"
      style={{ background: 'rgba(2,4,12,0.95)', backdropFilter: 'blur(20px)', borderLeft: `1px solid ${organ.color}25` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-5 pb-3" style={{ borderBottom: `1px solid ${organ.color}20` }}>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] mb-1" style={{ color: organ.color }}>{organ.latin}</p>
          <h2 className="text-2xl font-black uppercase tracking-tight text-white">{organ.name}</h2>
        </div>
        <button onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full mt-1 transition-colors"
          style={{ background: `${organ.color}15`, color: organ.color }}>
          <X size={14} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="grid grid-cols-4 gap-1 px-3 py-2">
        {(Object.keys(TAB_LABELS) as DetailTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all"
            style={{
              background: tab === t ? organ.color : `${organ.color}10`,
              color: tab === t ? '#000' : `${organ.color}90`,
            }}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-6" style={{ scrollbarWidth: 'thin', scrollbarColor: `${organ.color}30 transparent` }}>
        <AnimatePresence mode="wait">

          {tab === 'OVERVIEW' && (
            <motion.div key="ov" initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:-8 }} className="flex flex-col gap-3 mt-2">
              <div className="flex justify-center my-3">
                <div className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ background: `radial-gradient(circle, ${organ.color}40, ${organ.color}10)`, border: `2px solid ${organ.color}40` }}>
                  <div className="w-5 h-5 rounded-full animate-pulse" style={{ background: organ.color }} />
                </div>
              </div>
              <p className="text-white/75 text-sm leading-relaxed">{organ.description}</p>
              {organ.medicalDescription && (
                <div className="p-3 rounded-lg mt-1" style={{ background: `${organ.color}08`, border: `1px solid ${organ.color}18` }}>
                  <p className="text-[8px] font-black uppercase tracking-widest mb-1.5" style={{ color: organ.color }}>Medical</p>
                  <p className="text-white/50 text-[11px] leading-relaxed">{organ.medicalDescription}</p>
                </div>
              )}
              {/* Functions */}
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest mb-1.5" style={{ color: organ.color }}>Functions</p>
                {organ.functions.map((f, i) => (
                  <div key={i} className="flex gap-2 items-start py-1.5">
                    <ChevronRight size={10} className="mt-0.5 shrink-0" style={{ color: organ.color }} />
                    <p className="text-white/65 text-[11px] leading-relaxed">{f}</p>
                  </div>
                ))}
              </div>
              {/* Blood flow */}
              {organ.bloodFlow && (
                <div className="p-3 rounded-lg" style={{ background: 'rgba(231,76,60,0.06)', border: '1px solid rgba(231,76,60,0.18)' }}>
                  <p className="text-[8px] font-black uppercase tracking-widest mb-1.5 text-red-400">🩸 Blood Flow</p>
                  <p className="text-white/55 text-[11px] leading-relaxed">{organ.bloodFlow}</p>
                </div>
              )}
              {organ.fluidRole && (
                <div className="p-3 rounded-lg" style={{ background: 'rgba(52,152,219,0.06)', border: '1px solid rgba(52,152,219,0.18)' }}>
                  <p className="text-[8px] font-black uppercase tracking-widest mb-1.5 text-blue-400">💧 Fluids</p>
                  <p className="text-white/55 text-[11px] leading-relaxed">{organ.fluidRole}</p>
                </div>
              )}
              {/* Fact */}
              {(organ.fact || organ.funFacts[0]) && (
                <div className="p-3 rounded-lg" style={{ background: `${organ.color}0A`, border: `1px solid ${organ.color}22` }}>
                  <p className="text-[8px] font-black uppercase tracking-widest mb-1.5" style={{ color: organ.color }}>⚡ Did You Know?</p>
                  <p className="text-white/65 text-[11px] leading-relaxed">{organ.fact ?? organ.funFacts[0]}</p>
                </div>
              )}
            </motion.div>
          )}

          {tab === 'NUTRITION' && (
            <motion.div key="nu" initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:-8 }} className="flex flex-col gap-4 mt-3">
              {/* Vitamins */}
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest mb-2" style={{ color: organ.color }}>Vitamins</p>
                {(organ.vitamins ?? []).map((v, i) => (
                  <div key={i} className="flex gap-2.5 items-start py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: vitColors[i % vitColors.length] }} />
                    <div>
                      <p className="text-white/80 text-[11px] font-semibold">{v.name}</p>
                      <p className="text-white/45 text-[10px] leading-relaxed mt-0.5">{v.role}</p>
                    </div>
                  </div>
                ))}
                {!organ.vitamins?.length && <p className="text-white/30 text-xs">No vitamin data available.</p>}
              </div>
              {/* Minerals */}
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest mb-2 text-slate-300">Minerals</p>
                {(organ.minerals ?? []).map((m, i) => (
                  <div key={i} className="flex gap-2.5 items-start py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-slate-400" />
                    <div>
                      <p className="text-white/80 text-[11px] font-semibold">{m.name}</p>
                      <p className="text-white/45 text-[10px] leading-relaxed mt-0.5">{m.role}</p>
                    </div>
                  </div>
                ))}
                {!organ.minerals?.length && <p className="text-white/30 text-xs">No mineral data available.</p>}
              </div>
            </motion.div>
          )}

          {tab === 'CELLULAR' && (
            <motion.div key="ce" initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:-8 }} className="flex flex-col gap-3 mt-3">
              {organ.cellularProcess && (
                <div className="p-3 rounded-lg" style={{ background: `${organ.color}08`, border: `1px solid ${organ.color}20` }}>
                  <p className="text-[8px] font-black uppercase tracking-widest mb-1.5" style={{ color: organ.color }}>⚛ Cellular Process</p>
                  <p className="text-white/55 text-[11px] leading-relaxed">{organ.cellularProcess}</p>
                </div>
              )}
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest mb-2" style={{ color: organ.color }}>Cell Types</p>
                {(organ.cellTypes ?? []).map((c, i) => (
                  <div key={i} className="p-3 rounded-lg mb-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <p className="text-white/85 text-[11px] font-black mb-1">{c.name}</p>
                    <p className="text-white/45 text-[10px] leading-relaxed">{c.description}</p>
                  </div>
                ))}
                {!organ.cellTypes?.length && <p className="text-white/30 text-xs">No cell type data available.</p>}
              </div>
            </motion.div>
          )}

          {tab === 'CONDITIONS' && (
            <motion.div key="co" initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:-8 }} className="flex flex-col gap-2 mt-3">
              <p className="text-white/30 text-[10px] mb-1">Common conditions affecting this organ or system.</p>
              {(organ.conditions ?? []).map((c, i) => (
                <div key={i} className="p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.14)' }}>
                  <p className="text-red-300 text-[11px] font-black mb-1">{c.name}</p>
                  <p className="text-white/50 text-[11px] leading-relaxed">{c.description}</p>
                </div>
              ))}
              {!organ.conditions?.length && (
                <div>
                  {organ.funFacts.map((f, i) => (
                    <div key={i} className="p-3 rounded-lg mb-2" style={{ background: `${organ.color}0A`, border: `1px solid ${organ.color}20` }}>
                      <p className="text-[8px] font-black uppercase tracking-widest mb-1" style={{ color: organ.color }}>Fact {String(i + 1).padStart(2, '0')}</p>
                      <p className="text-white/60 text-[11px] leading-relaxed">{f}</p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Body Stats Counter ──────────────────────────────────────────────────────────

function BodyStatsCounter() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const stats = [
    { label: 'Heartbeats',       value: Math.floor(elapsed * 1.17).toLocaleString(),     color: '#e74c3c', sub: '70/min avg' },
    { label: 'Breaths',          value: Math.floor(elapsed * 0.233).toLocaleString(),    color: '#f9a8d4', sub: '14/min avg' },
    { label: 'Blood Filtered',   value: `${(elapsed * 0.02).toFixed(1)}L`,               color: '#4A9ACA', sub: '1.2L/min via kidneys' },
    { label: 'Red Cells Made',   value: (elapsed * 2400000).toLocaleString(),            color: '#ef4444', sub: '2.4M per second' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
      className="absolute bottom-20 right-4 z-30 w-60 rounded-2xl overflow-hidden"
      style={{ background: 'rgba(2,4,12,0.90)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
        <Activity size={11} className="text-cyan-400" />
        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-cyan-400">Live Body Stats</p>
      </div>
      <div className="p-3 grid grid-cols-2 gap-2">
        {stats.map(s => (
          <div key={s.label} className="p-2.5 rounded-xl" style={{ background: `${s.color}0E`, border: `1px solid ${s.color}22` }}>
            <p className="text-white font-black text-sm tabular-nums leading-none">{s.value}</p>
            <p className="text-[8px] font-black uppercase tracking-widest mt-1" style={{ color: s.color }}>{s.label}</p>
            <p className="text-white/25 text-[8px] mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── System Overview Card ────────────────────────────────────────────────────────

function SystemOverviewCard({ system, organCount }: { system: typeof SYSTEMS[0]; organCount: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
      className="absolute bottom-20 right-4 w-60 rounded-2xl p-4 z-30"
      style={{ background: 'rgba(2,4,12,0.88)', backdropFilter: 'blur(16px)', border: `1px solid ${system.color}25` }}
    >
      <p className="text-[8px] font-black uppercase tracking-[0.3em] mb-1" style={{ color: system.color }}>Active System</p>
      <p className="text-white font-black text-sm mb-2">{system.label}</p>
      <p className="text-white/55 text-[11px] leading-relaxed mb-3">{system.description}</p>
      {organCount > 0 && (
        <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: system.color }}>
          {organCount} organ{organCount !== 1 ? 's' : ''} in view · Click to inspect
        </p>
      )}
    </motion.div>
  );
}

// ─── Organ Index Panel ───────────────────────────────────────────────────────────

function OrganIndex({ organs, selected, onSelect }: {
  organs: OrganDef[]; selected: OrganDef | null; onSelect: (o: OrganDef) => void;
}) {
  if (organs.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
      className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-44 max-h-[55vh] overflow-y-auto rounded-2xl"
      style={{ background: 'rgba(2,4,12,0.88)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.07)', scrollbarWidth: 'none' }}
    >
      <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/25 px-3 pt-3 pb-1">Organs</p>
      <div className="p-1.5 space-y-0.5">
        {organs.map(o => (
          <button
            key={o.id}
            onClick={() => onSelect(o)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all"
            style={{
              background: selected?.id === o.id ? `${o.color}1A` : 'transparent',
              border: `1px solid ${selected?.id === o.id ? o.color + '45' : 'transparent'}`,
            }}
          >
            <div className="w-2 h-2 rounded-full shrink-0 flex-none" style={{ background: o.color, boxShadow: `0 0 5px ${o.color}80` }} />
            <span className="text-[9px] font-bold uppercase tracking-widest truncate"
              style={{ color: selected?.id === o.id ? o.color : 'rgba(255,255,255,0.55)' }}>
              {o.name}
            </span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Quiz Mode ──────────────────────────────────────────────────────────────────

function QuizMode({ onExit }: { onExit: () => void }) {
  const questions = useMemo(() => {
    const pool = ORGANS.flatMap(o => [
      // Identify from fun fact or description fallback
      { organ: o, clue: o.fact ?? o.funFacts[0] ?? o.description.slice(0, 90) + '…', type: 'identify' },
      // Identify from function
      ...(o.functions[0] ? [{ organ: o, clue: `This organ: "${o.functions[0].toLowerCase()}"`, type: 'function' }] : []),
      // Identify from a notable condition
      ...(o.conditions?.[0] ? [{ organ: o, clue: `Which organ is commonly associated with "${o.conditions[0].name}"?`, type: 'condition' }] : []),
      // Identify from a key vitamin it needs
      ...(o.vitamins?.[0] ? [{ organ: o, clue: `Which organ especially relies on ${o.vitamins[0].name.split(' ')[0]} ${o.vitamins[0].name.split(' ')[1] ?? ''} — ${o.vitamins[0].role.slice(0, 60)}…?`, type: 'nutrition' }] : []),
    ]);
    return pool
      .sort(() => Math.random() - 0.5)
      .slice(0, 10)
      .map(q => ({
        ...q,
        choices: [q.organ.name, ...ORGANS.filter(x => x.id !== q.organ.id)
          .sort(() => Math.random() - 0.5).slice(0, 3).map(x => x.name)]
          .sort(() => Math.random() - 0.5),
      }));
  }, []);

  const [idx, setIdx]         = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore]     = useState(0);
  const [done, setDone]       = useState(false);

  const q = questions[idx];

  const handleAnswer = useCallback((choice: string) => {
    if (selected) return;
    setSelected(choice);
    if (choice === q.organ.name) setScore(s => s + 1);
    setTimeout(() => {
      if (idx + 1 >= questions.length) setDone(true);
      else { setIdx(i => i + 1); setSelected(null); }
    }, 1200);
  }, [selected, q, idx, questions.length]);

  if (done) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center z-50"
        style={{ background: 'rgba(1,5,9,0.97)', backdropFilter: 'blur(20px)' }}>
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center gap-5 text-center max-w-sm px-8">
          <div className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ background: pct >= 70 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', border: `2px solid ${pct >= 70 ? '#22c55e' : '#ef4444'}` }}>
            <Trophy size={32} className={pct >= 70 ? 'text-green-400' : 'text-red-400'} />
          </div>
          <div>
            <p className="text-4xl font-black text-white mb-1">{score}/{questions.length}</p>
            <p className="text-white/50 text-sm">{pct}% correct</p>
          </div>
          <p className="text-white/70 text-sm">
            {pct >= 90 ? 'Excellent! You know the human body well.' :
             pct >= 70 ? 'Good work! A few more to master.' :
             'Keep exploring — click organs to learn their facts.'}
          </p>
          <button onClick={onExit}
            className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white/60"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            Back to Explorer
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-50 px-6"
      style={{ background: 'rgba(1,5,9,0.97)', backdropFilter: 'blur(20px)' }}>
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
        <button onClick={onExit} className="flex items-center gap-2 text-white/40 text-xs font-bold uppercase tracking-widest">
          <ArrowLeft size={12} /> Exit Quiz
        </button>
        <div className="flex items-center gap-3">
          <span className="text-white/30 text-xs font-bold uppercase tracking-widest">{idx + 1} / {questions.length}</span>
          <div className="flex gap-1">
            {questions.map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full"
                style={{ background: i < idx ? '#22c55e' : i === idx ? '#FF8C00' : 'rgba(255,255,255,0.15)' }} />
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-xs font-black text-amber-400"><Zap size={12} /> {score}</div>
        </div>
      </div>

      <motion.div key={idx} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md flex flex-col items-center gap-5">
        <div className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: `radial-gradient(circle, ${q.organ.color}30, transparent)`, border: `2px solid ${q.organ.color}40` }}>
          <div className="w-5 h-5 rounded-full animate-pulse" style={{ background: q.organ.color }} />
        </div>
        <div className="text-center">
          <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30 mb-3">Identify the organ</p>
          <p className="text-white/80 text-sm leading-relaxed text-center max-w-xs">"{q.clue}"</p>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full">
          {q.choices.map(choice => {
            const isCorrect = choice === q.organ.name;
            const isChosen  = choice === selected;
            let bg = 'rgba(255,255,255,0.05)', border = '1px solid rgba(255,255,255,0.1)', textColor = 'rgba(255,255,255,0.7)';
            if (selected) {
              if (isCorrect) { bg = 'rgba(34,197,94,0.15)'; border = '1px solid rgba(34,197,94,0.4)'; textColor = '#22c55e'; }
              else if (isChosen) { bg = 'rgba(239,68,68,0.15)'; border = '1px solid rgba(239,68,68,0.4)'; textColor = '#ef4444'; }
            }
            return (
              <motion.button key={choice} onClick={() => handleAnswer(choice)}
                className="py-3 px-4 rounded-xl text-xs font-bold text-left transition-all flex items-center justify-between"
                style={{ background: bg, border, color: textColor }}
                whileTap={{ scale: 0.97 }}>
                <span>{choice}</span>
                {selected && isCorrect && <CheckCircle2 size={13} />}
                {selected && isChosen && !isCorrect && <XCircle size={13} />}
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Search Panel ────────────────────────────────────────────────────────────────

function SearchPanel({ onSelect, onClose }: { onSelect: (o: OrganDef) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const results = ORGANS.filter(o =>
    o.name.toLowerCase().includes(query.toLowerCase()) ||
    o.latin.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
      className="absolute top-14 left-1/2 -translate-x-1/2 z-50 w-72 rounded-2xl overflow-hidden"
      style={{ background: 'rgba(2,4,12,0.96)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
        <Search size={13} className="text-white/40 shrink-0" />
        <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search organs…"
          className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none" />
        <button onClick={onClose}><X size={13} className="text-white/30" /></button>
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        {results.map(o => (
          <button key={o.id} onClick={() => { onSelect(o); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors text-left">
            <div className="w-5 h-5 rounded-full shrink-0" style={{ background: `radial-gradient(circle, ${o.color}60, ${o.color}20)` }} />
            <div>
              <p className="text-white text-sm font-semibold">{o.name}</p>
              <p className="text-white/35 text-[10px]">{o.latin}</p>
            </div>
          </button>
        ))}
        {results.length === 0 && <p className="text-white/30 text-xs text-center py-6">No organs found</p>}
      </div>
    </motion.div>
  );
}

// ─── Gender Select ──────────────────────────────────────────────────────────────

function GenderSelectScreen({ onSelect, onBack }: { onSelect: (g: Gender) => void; onBack: () => void }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative" style={{ background: '#010509' }}>
      <button onClick={onBack}
        className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
        <ArrowLeft size={12} /> Back
      </button>
      <div className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: 'linear-gradient(#22d3ee 1px, transparent 1px), linear-gradient(90deg, #22d3ee 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center mb-12">
        <p className="text-[9px] font-black uppercase tracking-[0.5em] text-cyan-400 mb-3">Classroom Module</p>
        <h1 className="text-4xl font-black uppercase tracking-tighter text-white mb-2">The Human Body</h1>
        <p className="text-white/40 text-sm tracking-widest uppercase">Select a body to explore</p>
      </motion.div>
      <div className="flex gap-8">
        {(['MALE', 'FEMALE'] as Gender[]).map((g, idx) => (
          <motion.button key={g}
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + idx * 0.1 }}
            onClick={() => onSelect(g)}
            className="group flex flex-col items-center gap-4 p-8 rounded-3xl transition-all duration-300"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
          >
            <svg width="80" height="160" viewBox="0 0 80 160" fill="none">
              {g === 'MALE' ? (
                <path d="M40 8 C50 8 56 16 56 24 C56 32 52 37 48 40 L52 55 C58 56 66 62 68 80 L62 82 L60 120 L52 120 L50 160 L30 160 L28 120 L20 120 L18 82 L12 80 C14 62 22 56 28 55 L32 40 C28 37 24 32 24 24 C24 16 30 8 40 8Z"
                  fill="rgba(34,211,238,0.15)" stroke="rgba(34,211,238,0.5)" strokeWidth="1" />
              ) : (
                <path d="M40 8 C49 8 55 16 55 24 C55 32 51 37 47 40 L52 56 C60 58 70 66 72 82 L64 84 L60 120 L52 120 L50 160 L30 160 L28 120 L20 120 L16 84 L8 82 C10 66 20 58 28 56 L33 40 C29 37 25 32 25 24 C25 16 31 8 40 8Z"
                  fill="rgba(244,160,184,0.15)" stroke="rgba(244,160,184,0.5)" strokeWidth="1" />
              )}
            </svg>
            <div className="text-center">
              <p className="text-xs font-black uppercase tracking-[0.25em]"
                style={{ color: g === 'MALE' ? '#22d3ee' : '#f9a8d4' }}>
                {g === 'MALE' ? 'Male Body' : 'Female Body'}
              </p>
              <p className="text-[10px] text-white/30 mt-1">16 organs · 7 systems</p>
            </div>
          </motion.button>
        ))}
      </div>
      <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.5 }}
        className="absolute bottom-8 text-[9px] font-bold uppercase tracking-[0.3em] text-white/20">
        Drag to rotate · Scroll to zoom · Click organs to explore
      </motion.p>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function HumanBodyExperience({ onBack }: { onBack: () => void }) {
  const [phase,         setPhase]         = useState<Phase>('SELECT');
  const [gender,        setGender]        = useState<Gender>('MALE');
  const [systemTab,     setSystemTab]     = useState<Tab>('FULL');
  const [isExploded,    setIsExploded]    = useState(false);
  const [selectedOrgan, setSelectedOrgan] = useState<OrganDef | null>(null);
  const [appMode,       setAppMode]       = useState<AppMode>('EXPLORE');
  const [showSearch,    setShowSearch]    = useState(false);

  const activeSystem = SYSTEMS.find(s => s.id === systemTab)!;
  const visibleOrgans = useMemo(() =>
    ORGANS.filter(o => o.genders.includes(gender) && o.systems.includes(systemTab)),
    [gender, systemTab]
  );

  const handleOrganSelect = useCallback((o: OrganDef | null) => {
    setSelectedOrgan(o);
    setShowSearch(false);
  }, []);

  return (
    <div className="w-full h-screen relative overflow-hidden bg-[#010509] text-white">

      <AnimatePresence mode="wait">
        {phase === 'SELECT' ? (
          <motion.div key="select" className="absolute inset-0 z-10" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
            <GenderSelectScreen onSelect={g => { setGender(g); setPhase('BODY'); }} onBack={onBack} />
          </motion.div>
        ) : (
          <motion.div key="body" className="absolute inset-0" initial={{ opacity:0 }} animate={{ opacity:1 }}>

            {/* Back — only shown in BODY phase */}
            <button onClick={onBack}
              className="absolute top-4 left-4 z-50 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
              <ArrowLeft size={12} /> Back
            </button>

            <AnimatePresence>
              {appMode === 'QUIZ' && <QuizMode onExit={() => setAppMode('EXPLORE')} />}
            </AnimatePresence>

            {/* 3D Canvas */}
            <Canvas
              camera={{ position: [0, 0.3, 3.4], fov: 45, near: 0.1, far: 100 }}
              gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.25 }}
              style={{ width: '100%', height: '100%' }}
            >
              <Suspense fallback={null}>
                <BodyScene
                  gender={gender}
                  systemTab={systemTab}
                  isExploded={isExploded}
                  selectedOrgan={selectedOrgan}
                  onSelectOrgan={handleOrganSelect}
                />
              </Suspense>
            </Canvas>

            {/* System tab bar */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex flex-wrap gap-1 p-1 rounded-2xl"
              style={{ background: 'rgba(2,4,12,0.85)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {SYSTEMS.map(s => (
                <button key={s.id} onClick={() => { setSystemTab(s.id); setSelectedOrgan(null); }}
                  className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                  style={{
                    background: systemTab === s.id ? s.color : 'transparent',
                    color: systemTab === s.id ? '#000' : 'rgba(255,255,255,0.4)',
                  }}>
                  {s.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <button onClick={() => setShowSearch(s => !s)}
              className="absolute top-4 right-4 z-40 w-9 h-9 flex items-center justify-center rounded-xl transition-all"
              style={{ background: 'rgba(2,4,12,0.85)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }}>
              <Search size={14} />
            </button>

            <AnimatePresence>
              {showSearch && <SearchPanel onSelect={o => handleOrganSelect(o)} onClose={() => setShowSearch(false)} />}
            </AnimatePresence>

            {/* Organ index — left panel */}
            <AnimatePresence>
              {!selectedOrgan && appMode === 'EXPLORE' && (
                <OrganIndex organs={visibleOrgans} selected={selectedOrgan} onSelect={handleOrganSelect} />
              )}
            </AnimatePresence>

            {/* Controls — bottom left */}
            <div className="absolute bottom-6 left-6 z-40 flex flex-col gap-2">
              <button onClick={() => { setIsExploded(e => !e); setSelectedOrgan(null); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                style={{
                  background: isExploded ? activeSystem.color : 'rgba(2,4,12,0.85)',
                  color: isExploded ? '#000' : activeSystem.color,
                  border: `1px solid ${activeSystem.color}40`,
                  backdropFilter: 'blur(12px)',
                }}>
                <Layers size={12} />
                {isExploded ? 'Collapse' : 'Explode View'}
              </button>

              <button onClick={() => { setGender(g => g === 'MALE' ? 'FEMALE' : 'MALE'); setSelectedOrgan(null); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest"
                style={{ background: 'rgba(2,4,12,0.85)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)' }}>
                <RotateCcw size={12} />
                {gender === 'MALE' ? 'Female Body' : 'Male Body'}
              </button>

              <button onClick={() => { setAppMode('QUIZ'); setSelectedOrgan(null); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                style={{ background: 'rgba(2,4,12,0.85)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)', backdropFilter: 'blur(12px)' }}>
                <Trophy size={12} /> Quiz Mode
              </button>
            </div>

            {/* Right panel: stats (FULL) or system card (others) — hidden when organ selected */}
            <AnimatePresence>
              {!selectedOrgan && !showSearch && (
                systemTab === 'FULL'
                  ? <BodyStatsCounter key="stats" />
                  : <SystemOverviewCard key="sys" system={activeSystem} organCount={visibleOrgans.length} />
              )}
            </AnimatePresence>

            {/* Hint */}
            <div className="absolute bottom-6 right-6 z-40 flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.18)' }}>
              <Info size={11} />
              <p className="text-[9px] font-bold uppercase tracking-widest">Click organs to inspect</p>
            </div>

            {/* Organ detail panel */}
            <AnimatePresence>
              {selectedOrgan && (
                <OrganDetailPanel key={selectedOrgan.id} organ={selectedOrgan} onClose={() => setSelectedOrgan(null)} />
              )}
            </AnimatePresence>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
