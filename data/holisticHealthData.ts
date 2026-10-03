// ============================================================================
// PLAJAH HOLISTIC HEALTH & ANCIENT BOTANICAL REPOSITORY
// Meticulously researched bridge between millennia of traditional medicine 
// (Ayurveda, Traditional Chinese Medicine, Indigenous, Mediterranean)
// and modern peer-reviewed pharmacology, biochemistry, and neuroscience.
// ============================================================================

export type HolisticCategory = 
  | 'herbs'
  | 'minerals'
  | 'enzymes'
  | 'foods'
  | 'movement'
  | 'acupressure'
  | 'philosophy';

export type TraditionLineage = 
  | 'Ayurveda'
  | 'Traditional Chinese Medicine'
  | 'Indigenous & Folk Herbalism'
  | 'Mediterranean & Greco-Arab'
  | 'Integrative Modern Science'
  | 'Daoist Internal Arts'
  | 'Yogic Sciences';

export interface BotanicalHerb {
  id: string;
  name: string;
  botanicalName: string;
  plantFamily: string;
  commonAliases: string[];
  plantOrigin: string;
  partsUsed: string[];
  plantDescription: string;
  imageUrl: string;
  traditions: TraditionLineage[];
  primaryActions: string[];
  bodyBenefits: string[];
  mindBenefits: string[];
  activePhytochemicals: { name: string; mechanism: string }[];
  scientificResearch: {
    summary: string;
    keyFindings: string[];
    evidenceLevel: 'Extensive Human Clinical Trials' | 'Strong Clinical Trials' | 'Promising Human & In-Vivo Studies' | 'Validated Mechanistic Evidence';
    citations: string[];
  };
  traditionalEnergetics: {
    tcmTasteNature?: string; // e.g., "Bitter, Slightly Cold; Enters Liver and Gallbladder"
    ayurvedicDosha?: string; // e.g., "Pacifies Vata & Kapha, balances Pitta"
    historicalContext: string;
  };
  preparationMethods: {
    method: string;
    description: string;
    dosageOrRitual: string;
  }[];
  safetyAndInteractions: {
    contraindications: string[];
    potentialInteractions: string[];
    pregnancyCaution: boolean;
    sourcingIntegrity: string;
  };
}

export interface MineralNutrient {
  id: string;
  name: string;
  elementSymbol: string;
  category: 'Electrolyte' | 'Essential Trace Mineral' | 'Macromineral';
  imageUrl: string;
  biologicalRole: string;
  bodyBenefits: string[];
  mindBenefits: string[];
  formsAndBioavailability: { form: string; bestFor: string; absorptionNotes: string }[];
  dietarySources: string[];
  deficiencySigns: string[];
  clinicalResearch: {
    summary: string;
    evidenceLevel: string;
    citations: string[];
  };
  recommendedIntake: string;
  synergiesAndCofactors: string[];
}

export interface BioEnzyme {
  id: string;
  name: string;
  type: 'Proteolytic / Systemic' | 'Digestive' | 'Metabolic / Mitochondrial' | 'Antioxidant Defense';
  naturalSource: string;
  imageUrl: string;
  mechanismOfAction: string;
  bodyBenefits: string[];
  mindBenefits: string[];
  clinicalResearch: {
    summary: string;
    keyFindings: string[];
    citations: string[];
  };
  optimalAdministration: string;
  safetyNotes: string;
}

export interface FunctionalFoodDrink {
  id: string;
  name: string;
  subtitle: string;
  category: 'Medicinal Mushroom' | 'Adaptogenic Elixir' | 'Fermented Living Tonic' | 'Botanical Infusion';
  imageUrl: string;
  originTradition: string;
  bodyBenefits: string[];
  mindBenefits: string[];
  keyCompounds: string[];
  scientificBacking: string;
  traditionalLore: string;
  recipeOrRitual: {
    ingredients: string[];
    steps: string[];
    optimalTiming: string;
  };
}

export interface MindBodyPractice {
  id: string;
  name: string;
  system: 'Tai Chi (Taijiquan)' | 'Qigong (Internal Energy)' | 'Pranayama (Breath Science)' | 'Somatic Movement & Martial Arts';
  lineage: string;
  imageUrl: string;
  summary: string;
  physicalImpact: string[];
  neurologicalAndMentalImpact: string[];
  whatTraditionSays: string;
  whatModernScienceSays: string;
  coreMovementsOrTechniques: {
    name: string;
    instruction: string;
    breathCoordination: string;
    targetFasciaOrEnergyConduit: string;
  }[];
  idealFrequency: string;
}

export interface AcupressurePoint {
  id: string;
  code: string; // e.g. "LI4", "PC6", "ST36"
  pinyinName: string;
  englishName: string;
  meridian: string;
  elementAssociation: string; // e.g. "Metal", "Fire", "Earth"
  anatomicalLocation: string;
  bodyZone: 'Head & Neck' | 'Wrists & Hands' | 'Torso & Core' | 'Legs & Feet';
  imageUrl: string;
  traditionalIndication: string;
  scientificMechanism: {
    neurovascularPathway: string;
    activeBiomarkers: string[]; // e.g. ["Adenosine A1 receptor activation", "Dynorphin/Endorphin release"]
    clinicalEvidence: string;
  };
  howToStimulate: {
    technique: string;
    pressureDepth: string;
    durationSeconds: number;
    breathingSync: string;
  };
  precautions: string;
  isContraindicatedInPregnancy: boolean;
}

// ============================================================================
// BOTANICAL HERBS DATA
// ============================================================================

export const BOTANICAL_HERBS: BotanicalHerb[] = [
  {
    id: 'ashwagandha',
    name: 'Ashwagandha',
    botanicalName: 'Withania somnifera',
    plantFamily: 'Solanaceae (Nightshade family)',
    commonAliases: ['Indian Ginseng', 'Winter Cherry', 'Asgandh'],
    plantOrigin: 'Arid regions of India, the Middle East, and North Africa',
    partsUsed: ['Root (predominantly)', 'Leaves (topical/extracts)'],
    plantDescription: 'A stout, evergreen shrub reaching 35–75 cm in height with velvety, tomentose branches. Features small, bell-shaped greenish-yellow flowers that mature into vivid red berries encased in a papery calyx. The fleshy roots possess a characteristic earthy, horse-like scent ("ashwa" meaning horse in Sanskrit, signifying the strength and vitality of a stallion).',
    imageUrl: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=800&q=80',
    traditions: ['Ayurveda'],
    primaryActions: ['Adaptogen', 'Nervine Relaxant', 'Immunomodulator', 'Thyroid Modulator', 'Anti-inflammatory'],
    bodyBenefits: [
      'Down-regulates hypothalamic-pituitary-adrenal (HPA) axis, dramatically reducing serum cortisol levels.',
      'Enhances cardiorespiratory endurance (VO2 max) and muscle strength in active adults.',
      'Supports male reproductive parameters and testosterone synthesis by mitigating oxidative testicular stress.',
      'Helps normalize subclinical thyroid hormone levels (elevating T3 and T4 levels under chronic stress).'
    ],
    mindBenefits: [
      'GABA-mimetic activity produces significant anxiolytic and calming effects without sedation.',
      'Promotes neurogenesis and dendritic arborization via withanamides, supporting long-term memory.',
      'Deepens non-REM sleep architecture and shortens sleep latency via triethylene glycol compounds.',
      'Enhances mental clarity, executive function, and psychomotor speed under chronic stress.'
    ],
    activePhytochemicals: [
      { name: 'Withanolides (Withaferin A & Withanolide A)', mechanism: 'Steroidal lactones that cross the blood-brain barrier, regulate glucocorticoid receptors, and suppress inflammatory NF-κB transcription.' },
      { name: 'Sitoindosides VII–X', mechanism: 'Acylated sterol glucosides with profound antioxidant and anti-stress activity in brain cortex and hippocampus.' },
      { name: 'Triethylene Glycol', mechanism: 'Hypnogenic natural molecule demonstrated to induce physiologic slow-wave non-REM sleep.' }
    ],
    scientificResearch: {
      summary: 'Dozens of double-blind, randomized, placebo-controlled human clinical trials have established Ashwagandha (specifically full-spectrum KSM-66 and Shoden extracts) as a premier botanical for systemic stress reduction, cortisol suppression, cognitive enhancement, and endocrine balance.',
      keyFindings: [
        'A 60-day randomized controlled trial in 64 stressed adults showed a 27.9% reduction in serum cortisol and a 44% reduction on the Perceived Stress Scale (PSS).',
        'Meta-analyses confirm significant improvements in VO2 max, muscle recovery, sleep efficiency, and subjective well-being compared to placebo.',
        'Human trials indicate meaningful improvements in executive function, attention span, and information processing speed.'
      ],
      evidenceLevel: 'Extensive Human Clinical Trials',
      citations: [
        'Chandrasekhar K et al., Indian J Psychol Med. 2012; 34(3): 255-262.',
        'Langade D et al., Cureus. 2019; 11(9): e5797.',
        'Wankhede S et al., J Int Soc Sports Nutr. 2015; 12: 43.'
      ]
    },
    traditionalEnergetics: {
      ayurvedicDosha: 'Balances Vata and Kapha doshas; can elevate Pitta if taken in excessive heat. Classified as a supreme Rasayana (rejuvenator) and Medhya Rasayana (intellect/nerve tonic).',
      historicalContext: 'Revered for over 3,000 years in classical Ayurvedic texts (Charaka Samhita and Sushruta Samhita) as a foundational restorative tonic given to the young to build vitality (Ojas) and to elders to preserve cognitive vitality and physical stamina.'
    },
    preparationMethods: [
      {
        method: 'Traditional Warm Moon Milk (Kshirapak)',
        description: 'Decoct 1/2 to 1 tsp of fine organic root powder in warm organic milk or almond milk with a pinch of nutmeg, cardamom, and ghee.',
        dosageOrRitual: 'Taken 30–45 minutes before sleep to nourish the nervous system and induce restorative rest.'
      },
      {
        method: 'Standardized Full-Spectrum Extract',
        description: '300 mg to 600 mg daily of standardized root extract (minimum 5% withanolides) with water or meals.',
        dosageOrRitual: 'Split into morning and evening doses for sustained daily adaptogenic resilience.'
      }
    ],
    safetyAndInteractions: {
      contraindications: ['Severe autoimmune flare-ups (may stimulate immune response)', 'Untreated hyperthyroidism', 'Pre-existing acute liver disease'],
      potentialInteractions: ['Sedatives and benzodiazepines (additive GABAergic effect)', 'Thyroid hormone replacement medications (may increase free T4/T3)'],
      pregnancyCaution: true,
      sourcingIntegrity: 'Insist on 100% root extracts certified for absence of heavy metals (lead, arsenic, mercury) which can contaminate substandard soil.'
    }
  },
  {
    id: 'holy-basil-tulsi',
    name: 'Holy Basil (Tulsi)',
    botanicalName: 'Ocimum sanctum (syn. Ocimum tenuiflorum)',
    plantFamily: 'Lamiaceae (Mint family)',
    commonAliases: ['Tulasi', 'The Incomparable One', 'Queen of Herbs', 'Sacred Basil'],
    plantOrigin: 'Indian subcontinent and across Southeast Asia',
    partsUsed: ['Leaves', 'Flowering aerial tops', 'Seeds'],
    plantDescription: 'An aromatic, erect perennial subshrub growing up to 60–100 cm with softly pubescent stems and serrated, ovate purplish-green leaves rich in essential oil glands. Produces slender racemes of small purplish to pale-pink flowers. Emits an intoxicating, spicy clove-and-lemon fragrance that is instantly recognizable.',
    imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80',
    traditions: ['Ayurveda', 'Indigenous & Folk Herbalism'],
    primaryActions: ['Adaptogen', 'Antioxidant', 'Antimicrobial', 'Bronchodilator', 'Radioprotective', 'Cardioprotective'],
    bodyBenefits: [
      'Normalizes physiological blood glucose and lipid panels through pancreatic beta-cell support.',
      'Acts as a natural bronchodilator and expectorant, clearing phlegm and supporting respiratory volume.',
      'Protects organs and cellular membranes from heavy metal toxicity and industrial environmental pollutants.',
      'Inhibits inflammatory COX-2 and 5-LOX enzymes, easing joint stiffness and systemic soreness.'
    ],
    mindBenefits: [
      'Elevates emotional spirits and dissipates cognitive fog through monoterpene and sesquiterpene aromas.',
      'Mitigates psychological exhaustion, burnout, and acute sensory overload.',
      'Regulates autonomic nervous system balance during intense mental work or grief.',
      'Supports neuro-endurance and mental clarity without caffeine-induced adrenergic jitters.'
    ],
    activePhytochemicals: [
      { name: 'Eugenol', mechanism: 'Phenolic constituent providing broad antimicrobial, analgesic, and COX-2 inhibiting properties.' },
      { name: 'Rosmarinic Acid', mechanism: 'Potent polyphenolic antioxidant that scavenges reactive oxygen species and safeguards neural synapses.' },
      { name: 'Ursolic & Oleanolic Acids', mechanism: 'Triterpenes that promote metabolic homeostasis and cellular cytoprotection.' }
    ],
    scientificResearch: {
      summary: 'Comprehensive clinical studies demonstrate that Tulsi acts as an environmental adaptogen, shielding the human organism from physical, chemical, metabolic, and psychological stress while enhancing cellular antioxidant defenses.',
      keyFindings: [
        'A comprehensive review of 24 human clinical studies showed consistent improvements in metabolic syndrome parameters, blood glucose regulation, and psychological stress scores.',
        'Double-blind studies demonstrated a 39% reduction in generalized anxiety symptoms, forgetfulness, and stress-related sleep disruptions.',
        'Exhibits measurable immune-boosting effects by increasing natural killer (NK) cells and T-helper cell populations.'
      ],
      evidenceLevel: 'Strong Clinical Trials',
      citations: [
        'Cohen MM. J Ayurveda Integr Med. 2014; 5(4): 251-259.',
        'Bhattacharyya D et al., Nepal Med Coll J. 2008; 10(3): 176-179.',
        'Mondal S et al., J Ethnopharmacol. 2011; 136(3): 452-456.'
      ]
    },
    traditionalEnergetics: {
      ayurvedicDosha: 'Light and dry (Laghu, Ruksha); Warm potency (Ushna Virya); Pungent and bitter taste. Pacifies Vata and Kapha; slightly increases Pitta in excess.',
      historicalContext: 'Planted in the central courtyard of Indian homes for millennia, considered an earthly incarnation of the divine feminine (Lakshmi). Tulsi is revered as an elixir of life (Amrita) that purifies both internal prana and the external atmosphere.'
    },
    preparationMethods: [
      {
        method: 'Sacred Fresh Infusion (Tisane)',
        description: 'Steep 1–2 tsp of dried leaves (or a small handful of fresh leaves) in boiling water covered for 7–10 minutes to retain volatile eugenol vapours.',
        dosageOrRitual: 'Sipped mindfully throughout the day, particularly during morning contemplation or afternoon mental fatigue.'
      },
      {
        method: 'Tincture / Liquid Extract',
        description: '30–40 drops in a small glass of water twice daily.',
        dosageOrRitual: 'Taken before meals to support digestion and respiratory resilience.'
      }
    ],
    safetyAndInteractions: {
      contraindications: ['May have mild anti-fertility effects in high doses according to animal studies; exercise caution if actively trying to conceive'],
      potentialInteractions: ['Anticoagulants/Antiplatelet drugs (eugenol exhibits mild blood-thinning synergy)', 'Oral hypoglycemic medications (may potentiate glucose-lowering effects)'],
      pregnancyCaution: true,
      sourcingIntegrity: 'Select organic Krishna or Rama Tulsi varieties cultivated on sacred, chemical-free soils away from industrial runoff.'
    }
  },
  {
    id: 'turmeric-curcumin',
    name: 'Turmeric (Curcumin)',
    botanicalName: 'Curcuma longa',
    plantFamily: 'Zingiberaceae (Ginger family)',
    commonAliases: ['Golden Spice', 'Haridra', 'Jiang Huang', 'Indian Saffron'],
    plantOrigin: 'South Asia, cultivated extensively across tropical India',
    partsUsed: ['Rhizome (underground root stems)'],
    plantDescription: 'A perennial herbaceous plant reaching up to 1 meter in height, with large, oblong deep-green lanceolate leaves arising from a dense, tuberous underground rhizome system. The rhizomes possess rough brownish skin and an incandescent, vibrant golden-orange interior with an intensely warm, peppery, aromatic taste.',
    imageUrl: 'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?w=800&q=80',
    traditions: ['Ayurveda', 'Traditional Chinese Medicine', 'Indigenous & Folk Herbalism'],
    primaryActions: ['Master Anti-inflammatory', 'Antioxidant', 'Hepatoprotective', 'Neuroprotective', 'Digestive Bitter', 'Cardioprotective'],
    bodyBenefits: [
      'Inhibits master inflammatory cascades by directly binding and down-regulating NF-κB, TNF-alpha, IL-6, and COX-2.',
      'Supports joint mobility, synovial fluid health, and cartilage preservation in osteoarthritis.',
      'Enhances vascular endothelial function and arterial compliance to a degree comparable to aerobic exercise.',
      'Stimulates bile secretion from the gallbladder, optimizing fat digestion and liver detoxification pathways.'
    ],
    mindBenefits: [
      'Crosses the blood-brain barrier to upregulate Brain-Derived Neurotrophic Factor (BDNF), reversing neurodegenerative decline.',
      'Binds to and assists in clearing amyloid-beta plaques associated with neuro-inflammatory cognitive decline.',
      'Modulates dopamine and serotonin neurochemistry, demonstrating significant antidepressant efficacy in clinical trials.',
      'Protects cerebral micro-vessels against oxidative ischemic damage.'
    ],
    activePhytochemicals: [
      { name: 'Curcumin (Diferuloylmethane)', mechanism: 'Primary bioactive polyphenol that suppresses inflammatory transcription factors and increases endogenous SOD and catalase.' },
      { name: 'Demethoxycurcumin & Bisdemethoxycurcumin', mechanism: 'Secondary curcuminoids providing enhanced chemical stability and synergistic anti-mutagenic activity.' },
      { name: 'Turmerones (ar-turmerone)', mechanism: 'Volatile essential oils that stimulate neural stem cell proliferation and drastically enhance curcumin intestinal absorption.' }
    ],
    scientificResearch: {
      summary: 'With over 15,000 published scientific papers and hundreds of human clinical trials, curcumin is one of the most thoroughly validated botanical compounds on Earth, exhibiting remarkable efficacy across rheumatoid conditions, metabolic syndrome, and cognitive longevity.',
      keyFindings: [
        'A landmark randomized trial showed 1,000 mg of bio-enhanced curcumin was as effective as 50 mg diclofenac sodium for rheumatoid knee osteoarthritis, with zero gastrointestinal adverse events.',
        'A UCLA 18-month double-blind study revealed a 28% improvement in memory tests and significant reductions in amyloid and tau brain signals measured via PET scan.',
        'Combining curcumin with piperine (black pepper alkaloid) or lipid phytosomes increases human serum bioavailability by up to 2,000%.'
      ],
      evidenceLevel: 'Extensive Human Clinical Trials',
      citations: [
        'Chandran B, Goel A. Phytother Res. 2012; 26(11): 1719-1725.',
        'Small GW et al., Am J Geriatr Psychiatry. 2018; 26(3): 266-277.',
        'Shoba G et al., Planta Med. 1998; 64(4): 353-356.'
      ]
    },
    traditionalEnergetics: {
      tcmTasteNature: 'Acrid, bitter, warm; enters the Spleen and Liver meridians. Invigorates blood circulation, dispels blood stasis, and opens meridian conduits.',
      ayurvedicDosha: 'Balances all three doshas (Tridoshic in moderation). Promotes Agni (digestive fire), scrapes Ama (toxic metabolic accumulation), and purifies blood (Rakta Shodhana).',
      historicalContext: 'Considered auspicious and sacred across ancient India, used in weddings, temple rites, and cooking for over 4,000 years. Applied to wounds as an instant sterile coagulant and ingested daily as a preservative of life and youth.'
    },
    preparationMethods: [
      {
        method: 'Traditional Golden Milk (Haldi Doodh)',
        description: 'Simmer 1 tsp organic ground turmeric paste with coconut oil, black pepper, and whole milk or oat milk with ginger and raw honey.',
        dosageOrRitual: 'The lipids and piperine are biologically required to dissolve the hydrophobic curcumin molecule for gut absorption.'
      },
      {
        method: 'Standardized Phospholipid / Phytosome Extract',
        description: '500–1000 mg daily with food for targeted systemic anti-inflammatory protocol.',
        dosageOrRitual: 'Taken with breakfast and dinner.'
      }
    ],
    safetyAndInteractions: {
      contraindications: ['Active bile duct obstruction or large gallstones', 'Upcoming surgery within 14 days due to anti-platelet properties'],
      potentialInteractions: ['Warfarin, aspirin, and antiplatelet drugs', 'Chemotherapy agents (must consult oncologist)'],
      pregnancyCaution: false,
      sourcingIntegrity: 'Beware of contaminated turmeric powder adulterated with lead chromate for artificial yellow pigmentation. Buy certified third-party tested organic root.'
    }
  },
  {
    id: 'rhodiola-rosea',
    name: 'Rhodiola Rosea',
    botanicalName: 'Rhodiola rosea',
    plantFamily: 'Crassulaceae (Stonecrop family)',
    commonAliases: ['Golden Root', 'Arctic Root', 'Roseroot', 'Aaron\'s Rod'],
    plantOrigin: 'High-altitude subarctic alpine zones of Siberia, Scandinavia, and Iceland',
    partsUsed: ['Rhizome and Root'],
    plantDescription: 'A hardy, succulent alpine perennial thriving at altitudes up to 3,000 meters in rocky glacial soil. Reaches 10–35 cm in height with thick, fleshy gray-green leaves and dense clusters of yellow-green flowers. Its root emits a delicate, fresh rose fragrance when sliced, possessing a bitter, astringent taste with a vibrant golden interior.',
    imageUrl: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=800&q=80',
    traditions: ['Indigenous & Folk Herbalism', 'Traditional Chinese Medicine', 'Integrative Modern Science'],
    primaryActions: ['Primary Adaptogen', 'Nootropic Ergogenic', 'Mitochondrial Energizer', 'Dopaminergic Tonic', 'Anti-fatigue'],
    bodyBenefits: [
      'Increases cellular ATP synthesis in muscle and liver tissue during extreme physical exertion.',
      'Prevents exercise-induced muscle damage and accelerates post-workout recovery intervals.',
      'Improves cardiovascular efficiency under high-altitude hypoxic and physical stress conditions.',
      'Stimulates neuropeptide Y and heat shock proteins (Hsp70), protecting cells against oxidative damage.'
    ],
    mindBenefits: [
      'Inhibits monoamine oxidase (MAO-A and MAO-B), preserving dopamine, serotonin, and norepinephrine levels in synapses.',
      'Combats chronic cognitive fatigue, burnout, and mental exhaustion in high-stress professions.',
      'Improves executive focus, sustained working memory, and situational processing speed.',
      'Elevates mood and emotional resilience without inducing jitteriness or sleep fragmentation.'
    ],
    activePhytochemicals: [
      { name: 'Rosavins (Rosavin, Rosin, Rosarin)', mechanism: 'Cinnamyl alcohol glycosides unique to authentic Rhodiola rosea that enhance stress adaptation and neuromuscular stamina.' },
      { name: 'Salidroside (Rhodioloside)', mechanism: 'Potent phenylethanoid glycoside with pronounced neuroprotective, anti-hypoxic, and mitochondrial protective actions.' },
      { name: 'Tyrosol', mechanism: 'Phenolic antioxidant that prevents lipid peroxidation and modulates cellular longevity pathways.' }
    ],
    scientificResearch: {
      summary: 'Extensively studied by Soviet sports scientists, space program researchers, and modern Western clinical teams, Rhodiola is the definitive adaptogen for acute and chronic physical and mental fatigue.',
      keyFindings: [
        'Double-blind crossover trials on night-shift physicians and military cadets showed dramatic reductions in mental fatigue, with cognitive performance restored to near baseline within days.',
        'A Phase III clinical study in individuals with chronic burnout demonstrated significant improvements in emotional exhaustion, attentiveness, and fatigue within 12 weeks.',
        'Exhibits a fast onset of action compared to other adaptogens, often producing subjective cognitive and physical energy within 30–60 minutes.'
      ],
      evidenceLevel: 'Extensive Human Clinical Trials',
      citations: [
        'Darbinyan V et al., Phytomedicine. 2000; 7(5): 365-371.',
        'Spasov AA et al., Phytomedicine. 2000; 7(2): 85-89.',
        'Kasper S, Dienel A. Neuropsychiatr Dis Treat. 2017; 13: 889-898.'
      ]
    },
    traditionalEnergetics: {
      tcmTasteNature: 'Sweet, astringent, cool; enters the Lung and Heart meridians. Clears heat from lungs, enriches Qi, and calms the mind.',
      historicalContext: 'Vikings consumed Golden Root to fortify endurance for epic seafaring voyages. Siberian villagers gifted roots to newlyweds to ensure the birth of healthy children, and Chinese emperors sent secret expeditions to the Altai mountains to retrieve the golden treasure.'
    },
    preparationMethods: [
      {
        method: 'Standardized Extract Capsule (3% Rosavins, 1% Salidrosides)',
        description: '200–400 mg taken in the early morning on an empty stomach.',
        dosageOrRitual: 'Best taken 30 minutes before breakfast or a high-demand workout; avoid evening consumption due to stimulating nature.'
      },
      {
        method: 'Alpine Golden Decoction',
        description: 'Simmer 1 tsp of dried chipped root in 2 cups of water for 15 minutes. Strain and sip warm.',
        dosageOrRitual: 'Drank during winter months or high-stress work weeks.'
      }
    ],
    safetyAndInteractions: {
      contraindications: ['Bipolar disorder or manic tendencies (may induce hypomania)', 'Acute anxiety states with severe palpitations'],
      potentialInteractions: ['SSRIs and MAO inhibitors (theoretical serotonergic synergy)', 'Stimulants'],
      pregnancyCaution: true,
      sourcingIntegrity: 'High risk of adulteration with other Rhodiola species lacking rosavins. Demand verified genuine Rhodiola rosea L. with a 3:1 rosavin-to-salidroside ratio.'
    }
  },
  {
    id: 'panax-ginseng',
    name: 'Panax Ginseng (Red Korean Ginseng)',
    botanicalName: 'Panax ginseng C.A. Meyer',
    plantFamily: 'Araliaceae (Ivy family)',
    commonAliases: ['Asian Ginseng', 'Ren Shen', 'True Ginseng', 'Root of Immortality'],
    plantOrigin: 'Mountainous forests of Northeast China, Korea, and Eastern Siberia',
    partsUsed: ['Cultivated mature root (aged 4–6 years)'],
    plantDescription: 'A slow-growing perennial herb reaching 30–60 cm with palmately compound leaves radiating from a single central stem. Produces small greenish flowers followed by clusters of bright crimson drupes. Its celebrated tuberous root often bifurcates to resemble the human body ("Ren Shen" meaning "man-root"). Red ginseng is created by traditional steaming and drying of unpeeled 6-year-old roots.',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    traditions: ['Traditional Chinese Medicine', 'Integrative Modern Science'],
    primaryActions: ['Superior Tonifying Adaptogen', 'Endocrine Revitalizer', 'Immune Catalyst', 'Vasodilator (Nitric Oxide)', 'Cognitive Stimulant'],
    bodyBenefits: [
      'Upregulates endothelial nitric oxide synthase (eNOS), enhancing microvascular perfusion and arterial elasticity.',
      'Supports healthy testosterone levels and erectile function by increasing cavernosal smooth muscle relaxation.',
      'Enhances natural killer (NK) cell cytotoxicity and antibody production against viral pathogens.',
      'Improves glucose clearance by enhancing cellular GLUT-4 transporter translocation.'
    ],
    mindBenefits: [
      'Enhances acetylcholine transmission in the hippocampus, boosting working memory and verbal recall.',
      'Counteracts oxidative stress in dopaminergic circuits, promoting drive, confidence, and cognitive motivation.',
      'Alleviates post-illness brain fog and chronic fatigue syndrome.',
      'Modulates sympathetic tone, preventing nervous collapse following prolonged exertion.'
    ],
    activePhytochemicals: [
      { name: 'Ginsenosides (Rg1, Rb1, Rg3, Rh2)', mechanism: 'Triterpene saponins that bind steroid receptors, stimulate nitric oxide synthesis, and modulate cerebral neuroplasticity.' },
      { name: 'Gintonin', mechanism: 'Ginseng-derived lysophosphatidic acid-protein complex that activates G-protein coupled receptors to stimulate synaptic transmission.' },
      { name: 'Panaxans', mechanism: 'Polysaccharides with profound immunostimulatory and hypoglycemic properties.' }
    ],
    scientificResearch: {
      summary: 'Renowned as the monarch of traditional Asian pharmacopeias, red ginseng is substantiated by rigorous clinical trials verifying its efficacy for cognitive performance, immune defense, and vascular vitality.',
      keyFindings: [
        'A meta-analysis of randomized controlled trials demonstrated significant improvements in psychomotor performance, sustained attention, and abstract reasoning.',
        'Randomized trials on Korean Red Ginseng demonstrated marked improvements in vascular erectile hardness and endothelial health without pharmaceutical side effects.',
        'Clinical studies in elderly populations demonstrated enhanced influenza vaccination antibody responses and reduced incidence of respiratory viral infections.'
      ],
      evidenceLevel: 'Extensive Human Clinical Trials',
      citations: [
        'Reay JL et al., Hum Psychopharmacol. 2005; 20(2): 141-147.',
        'Choi YD et al., Int J Impot Res. 2013; 25(2): 45-50.',
        'Scaglione F et al., Drugs Exp Clin Res. 1996; 22(2): 65-72.'
      ]
    },
    traditionalEnergetics: {
      tcmTasteNature: 'Sweet, slightly bitter, slightly warm; enters the Spleen, Lung, and Heart meridians. Greatly tonifies Primordial Qi (Yuan Qi), restores the pulse, and tranquilizes the Shen (spirit).',
      historicalContext: 'In the Shennong Ben Cao Jing (c. 200 CE), Ginseng was placed in the highest "Superior" class of herbs: non-toxic botanicals that can be taken continuously to lighten the body, prolong years, and prevent disease without adverse consequences.'
    },
    preparationMethods: [
      {
        method: 'Traditional Red Ginseng Decoction / Tonic',
        description: 'Simmer 3–6 grams of sliced 6-year root in ceramic ware with water and jujube dates for 1–2 hours.',
        dosageOrRitual: 'Taken in the morning during seasonal transitions or periods of deep constitutional fatigue.'
      },
      {
        method: 'Standardized Fermented Ginseng Extract',
        description: '200–500 mg daily, providing bio-transformed Compound K for maximum intestinal bioavailability.',
        dosageOrRitual: 'Taken with breakfast.'
      }
    ],
    safetyAndInteractions: {
      contraindications: ['Acute hypertension crisis', 'Active acute fever or severe infection (do not tonify during acute pathogenic invasion in TCM)'],
      potentialInteractions: ['Anticoagulants (warfarin)', 'Insulin / oral diabetes drugs (may increase hypoglycemic effect)', 'Caffeine / strong stimulants'],
      pregnancyCaution: true,
      sourcingIntegrity: 'Roots must be minimum 6 years of age for complete ginsenoside profile development. Steer clear of cheap young ginseng fillers.'
    }
  },
  {
    id: 'lions-mane',
    name: 'Lion\'s Mane Mushroom',
    botanicalName: 'Hericium erinaceus',
    plantFamily: 'Hericiaceae (Tooth fungus family)',
    commonAliases: ['Yamabushitake', 'Hedgehog Mushroom', 'Monkey Head Mushroom', 'Hou Tou Gu'],
    plantOrigin: 'Temperate deciduous forests of North America, Europe, and East Asia',
    partsUsed: ['Fruiting Body', 'Mycelium biomass'],
    plantDescription: 'A striking, cascading fungal specimen forming creamy-white icicle-like spines or spines resembling a lion\'s mane, hanging downwards from hardwood trees (especially oak, beech, and walnut). It has no stem, growing up to 40 cm across. In culinary settings, it has a tender, delicate texture reminiscent of lobster or crab.',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    traditions: ['Traditional Chinese Medicine', 'Indigenous & Folk Herbalism', 'Integrative Modern Science'],
    primaryActions: ['Nootropic Neuroregenerator', 'NGF/BDNF Stimulator', 'Gut-Brain Axis Protector', 'Immunomodulator'],
    bodyBenefits: [
      'Protects mucosal lining of the stomach and duodenum, inhibiting Helicobacter pylori colonization.',
      'Modulates systemic cytokine cascades, decreasing gut-derived neuroinflammation.',
      'Supports healthy lipid metabolism and microvascular circulation.',
      'Promotes myelin sheath integrity and peripheral nerve regeneration following trauma.'
    ],
    mindBenefits: [
      'Crosses the blood-brain barrier to trigger synthesis of Nerve Growth Factor (NGF) and BDNF.',
      'Accelerates synaptic plasticity, dendrite growth, and new neural pathway formation.',
      'Significantly improves mild cognitive impairment (MCI), memory retrieval, and mental processing speed in clinical trials.',
      'Alleviates mild depressive symptoms and anxiety by calming neuroinflammation.'
    ],
    activePhytochemicals: [
      { name: 'Hericenones (A–I)', mechanism: 'Aromatic compounds isolated from the fruiting body that stimulate the secretion of Nerve Growth Factor in brain astrocytes.' },
      { name: 'Erinacines (A–K)', mechanism: 'Diterpenoid molecules concentrated in the mycelium that cross the blood-brain barrier and induce powerful neurogenesis.' },
      { name: 'Beta-(1,3)-(1,6)-D-Glucans', mechanism: 'Complex fungal polysaccharides that bind dectin-1 receptors on immune macrophages to coordinate immune homeostasis.' }
    ],
    scientificResearch: {
      summary: 'Lion\'s Mane has emerged as the premier scientifically validated mycological agent for cognitive preservation, neural repair, and gut-mediated mental clarity.',
      keyFindings: [
        'A double-blind, parallel-group clinical trial on adults with mild cognitive impairment showed significant score increases on the cognitive function scale throughout a 16-week Lion\'s Mane regimen.',
        'Clinical studies demonstrate improved sleep quality, reduction in anxiety and depression scores, and heightened subjective clarity within 4 weeks.',
        'Preclinical models indicate accelerated remyelination and axon regeneration after peripheral nerve crush injuries.'
      ],
      evidenceLevel: 'Strong Clinical Trials',
      citations: [
        'Mori K et al., Phytother Res. 2009; 23(3): 367-372.',
        'Nagano M et al., Biomed Res. 2010; 31(4): 231-237.',
        'Lai PL et al., Int J Med Mushrooms. 2013; 15(6): 539-554.'
      ]
    },
    traditionalEnergetics: {
      tcmTasteNature: 'Sweet, bland, neutral; enters the Spleen, Stomach, and Heart meridians. Tonifies the Spleen, nourishes the gut, and calms the Shen (spirit).',
      historicalContext: 'Consumed by Yamabushi Buddhist monks in Japan to enhance focus and mental concentration during lengthy meditation retreats in the mountains. In TCM, it was prized as a regal tonic for the five internal organs.'
    },
    preparationMethods: [
      {
        method: 'Dual-Extracted Powder (Hot Water & Alcohol)',
        description: '1,000 mg to 3,000 mg daily of certified organic fruiting body extract containing minimum 30% beta-glucans and quantified hericenones.',
        dosageOrRitual: 'Stirred into morning coffee, ceremonial matcha, or cacao elixirs.'
      },
      {
        method: 'Fresh Culinary Sauté',
        description: 'Slice fresh fruiting bodies thick, dry-sauté until moisture evaporates, then sear in grass-fed butter or olive oil with sea salt and garlic.',
        dosageOrRitual: 'Eaten as a functional gourmet brain food.'
      }
    ],
    safetyAndInteractions: {
      contraindications: ['Known mushroom or fungal allergies'],
      potentialInteractions: ['Antidiabetic medications (may mildly potentiate insulin sensitivity)', 'Antiplatelet medications'],
      pregnancyCaution: false,
      sourcingIntegrity: 'Ensure 100% pure organic fruiting body extracted on wood substrates, NOT unextracted mycelium grown on grain with high residual starch.'
    }
  },
  {
    id: 'reishi-mushroom',
    name: 'Reishi Mushroom (Lingzhi)',
    botanicalName: 'Ganoderma lucidum',
    plantFamily: 'Ganodermataceae (Polypore bracket fungus)',
    commonAliases: ['Mushroom of Immortality', 'Lingzhi ("Divine Herb")', 'Ten-Thousand-Year Mushroom'],
    plantOrigin: 'Hardwood forests of East Asia, particularly decaying plum and oak logs',
    partsUsed: ['Fruiting Body', 'Cracked Spores'],
    plantDescription: 'A magnificent, lacquered polypore shelf mushroom characterized by a glossy, kidney-shaped cap displaying concentric amber, burgundy, and mahogany rings with a white or yellow outer margin. It feels rigid and woody, producing millions of microscopic brown spores from under-cap pores. It does not possess gills.',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    traditions: ['Traditional Chinese Medicine', 'Daoist Internal Arts'],
    primaryActions: ['Supreme Calming Adaptogen', 'Shen Tonic (Spirit Pacifier)', 'Immunomodulator', 'Hepato-Renal Shield', 'Cardiovascular Tonic'],
    bodyBenefits: [
      'Balances Th1/Th2 immune responses, calming allergies while enhancing anti-viral immune surveillance.',
      'Protects hepatocytes from chemical and metabolic toxic insults via antioxidant ganoderic acids.',
      'Inhibits ACE (angiotensin-converting enzyme), supporting healthy blood pressure and coronary perfusion.',
      'Mitigates histamine release from mast cells, alleviating seasonal respiratory hypersensitivities.'
    ],
    mindBenefits: [
      'Profoundly quietens racing thoughts, internal dialogue, and emotional turmoil (classic Shen nourishment).',
      'Extends deep slow-wave restorative sleep without morning grogginess or dependence.',
      'Reduces subjective anxiety and depressive symptoms linked to systemic immune dysregulation.',
      'Cultivates an internal feeling of serene emotional centeredness, presence, and meditative stillness.'
    ],
    activePhytochemicals: [
      { name: 'Ganoderic Acids (Triterpenes A–Z)', mechanism: 'Bitter lanostane-type triterpenes that exhibit anti-inflammatory, hepatoprotective, and antihistaminic actions.' },
      { name: 'Beta-(1,3)-(1,6)-Glucans', mechanism: 'Immunomodulating polysaccharides that activate immune receptors and enhance immune cytokine balance.' },
      { name: 'Ling Zhi-8 (LZ-8)', mechanism: 'Bioactive fungal immunomodulatory protein that prevents autoimmune hypersensitivity and protects organs.' }
    ],
    scientificResearch: {
      summary: 'Celebrated across millennia of Asian medical texts, modern pharmacology confirms Reishi\'s unique dual capacity to simultaneously modulate immune defense and down-regulate central nervous system hyper-excitability.',
      keyFindings: [
        'A comprehensive Cochrane systematic review documented significant improvements in immune response parameters and quality of life in clinical cohorts.',
        'Randomized trials demonstrated increased total sleep time, non-REM sleep latency reduction, and increased REM sleep duration through GABAergic modulation.',
        'Clinical studies demonstrate significant hepatoprotective effects and reduction in oxidative stress markers in metabolic patients.'
      ],
      evidenceLevel: 'Extensive Human Clinical Trials',
      citations: [
        'Jin X et al., Cochrane Database Syst Rev. 2016; 4: CD007770.',
        'Cui XY et al., J Ethnopharmacol. 2012; 139(3): 796-800.',
        'Wachtel-Galor S et al., Br J Nutr. 2004; 92(4): 701-710.'
      ]
    },
    traditionalEnergetics: {
      tcmTasteNature: 'Sweet, bitter, neutral; enters the Heart, Lung, Liver, and Kidney meridians. Calms the Shen (spirit), tonifies Heart Qi, nourishes Heart Blood, and transforms phlegm.',
      historicalContext: 'Carved into royal throne rooms and imperial scepters of China\'s emperors. Daoist hermits consumed Reishi before deep cave meditations to illuminate the mind, quiet mundane worldly attachments, and cultivate spiritual immortality.'
    },
    preparationMethods: [
      {
        method: 'Traditional Medicinal Decoction',
        description: 'Simmer 10–15 grams of sliced dried reishi in water for 1–2 hours. The resulting tea is deeply bitter and potent.',
        dosageOrRitual: 'Taken warm in the evening, often sweetened with a touch of honey to balance the bitterness.'
      },
      {
        method: 'Cracked-Cell Spore Powder & Dual Extract',
        description: '1,000–2,000 mg taken 1 hour before sleep.',
        dosageOrRitual: 'Nightly ritual for grounding and deep restorative sleep.'
      }
    ],
    safetyAndInteractions: {
      contraindications: ['Severe bleeding disorders or upcoming surgeries', 'Immunosuppressive drug therapy following organ transplant'],
      potentialInteractions: ['Anticoagulant and antiplatelet medications', 'Antihypertensive drugs (may have additive blood pressure lowering)'],
      pregnancyCaution: true,
      sourcingIntegrity: 'Wood-grown (Duanwood) reishi fruiting bodies grown in pristine mountain regions yield far superior triterpene profiles compared to plastic-bag lab mycelium.'
    }
  },
  {
    id: 'chamomile',
    name: 'German Chamomile',
    botanicalName: 'Matricaria chamomilla (syn. Matricaria recutita)',
    plantFamily: 'Asteraceae (Daisy family)',
    commonAliases: ['Babuna', 'Pinheads', 'Scented Mayweed', 'Kamille'],
    plantOrigin: 'Southern and Eastern Europe, Western Asia, naturalized globally',
    partsUsed: ['Flowering heads (harvested at full bloom)'],
    plantDescription: 'A dainty, branched annual herb reaching 20–60 cm in height with feathery, finely divided pinnate leaves and solitary daisy-like flower heads. The flower features a hollow, conical golden receptacle surrounded by white ray florets that reflex downward as the flower matures. Rubbing the flowers emits a sweet, soothing apple-like scent.',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    traditions: ['Mediterranean & Greco-Arab', 'Indigenous & Folk Herbalism'],
    primaryActions: ['Carminative', 'Mild Nervine Sedative', 'Spasmolytic', 'Vulnerary (Wound Healing)', 'Anti-inflammatory'],
    bodyBenefits: [
      'Relaxes gastrointestinal smooth muscle, resolving intestinal cramping, bloating, and nervous spasms.',
      'Accelerates tissue re-epithelialization and soothes irritated mucous membranes.',
      'Alleviates menstrual cramps via glycine elevation, which relaxes smooth muscle spasms.',
      'Acts as a gentle topical anti-inflammatory for eczema, dermatitis, and conjunctival redness.'
    ],
    mindBenefits: [
      'Apigenin binds selectively to central benzodiazepine GABA-A receptors, relieving tension without hypnotic addiction.',
      'Soothes somatic manifestation of worry (stomach knots, nervous palpitations, tension headaches).',
      'Shortens sleep latency and improves self-reported restorative sleep quality in older adults.',
      'Calms hyper-active nervous tension in children and sensitive adults.'
    ],
    activePhytochemicals: [
      { name: 'Apigenin', mechanism: 'Flavonoid that binds directly to GABA-A benzodiazepine sites in the amygdala, calming emotional alarm signals.' },
      { name: 'Chamazulene', mechanism: 'Deep cobalt-blue sesquiterpene formed during distillation that potently inhibits leukotriene B4 generation.' },
      { name: 'Bisabolol', mechanism: 'Anti-spasmodic, anti-ulcer, and antimicrobial monocyclic sesquiterpene alcohol.' }
    ],
    scientificResearch: {
      summary: 'German Chamomile is one of the world\'s oldest and most reliably documented herbal medicines, supported by human trials verifying its efficacy for generalized anxiety disorder, insomnia, and gastrointestinal spasm.',
      keyFindings: [
        'A randomized, double-blind, placebo-controlled trial in patients with Generalized Anxiety Disorder (GAD) demonstrated a clinically and statistically significant reduction in anxiety scores.',
        'Clinical studies in postpartum women and elderly cohorts demonstrated significant improvements in sleep quality and depressive symptoms.',
        'Endoscopic studies verify gastro-protective effects against mucosal erosions and acid hyper-secretion.'
      ],
      evidenceLevel: 'Extensive Human Clinical Trials',
      citations: [
        'Amsterdam JD et al., J Clin Psychopharmacol. 2009; 29(4): 378-382.',
        'Chang SM, Chen CH. J Adv Nurs. 2016; 72(2): 306-315.',
        'Srivastava JK et al., Mol Med Rep. 2010; 3(6): 895-901.'
      ]
    },
    traditionalEnergetics: {
      ayurvedicDosha: 'Cooling; sweet, bitter, and pungent. Pacifies Pitta and Vata; neutral to Kapha.',
      historicalContext: 'Dedicated to the Sun god Ra by the ancient Egyptians for its power to soothe fevers. In European folk tradition, it was known as the "Plant\'s Physician" because planting it near sick vegetation was said to revive the surrounding garden.'
    },
    preparationMethods: [
      {
        method: 'Covered Infusion (Tisane)',
        description: 'Steep 2–3 heaping tablespoons of whole dried flowers in 10 oz boiling water covered for 10–12 minutes. Covering is essential to capture the volatile chamazulene and bisabolol oils.',
        dosageOrRitual: 'Consumed warm before bedtime or after meals to ease digestion.'
      },
      {
        method: 'Standardized Fluid Extract / Tincture',
        description: '2–4 mL in warm water 3 times daily for acute nervous agitation or dyspepsia.',
        dosageOrRitual: 'Taken between meals.'
      }
    ],
    safetyAndInteractions: {
      contraindications: ['Known severe allergy to Asteraceae/Compositae family plants (ragweed, daisies)'],
      potentialInteractions: ['Warfarin (high theoretical coumarin content, though clinical significance is low)'],
      pregnancyCaution: false,
      sourcingIntegrity: 'Whole intact flower heads with vibrant yellow centers and white petals signify fresh potency; avoid pulverized powdery tea bags with brown oxidized heads.'
    }
  },
  {
    id: 'milk-thistle',
    name: 'Milk Thistle',
    botanicalName: 'Silybum marianum',
    plantFamily: 'Asteraceae (Daisy family)',
    commonAliases: ['Mary Thistle', 'Holy Thistle', 'Silymarin Root', 'St. Mary\'s Thistle'],
    plantOrigin: 'Mediterranean basin, now naturalized across temperate zones',
    partsUsed: ['Ripe seeds (achenes)'],
    plantDescription: 'A striking, stately biennial thistle reaching 1 to 2 meters in height. Features grand, glossy, spiny leaves splashed with vivid milky-white marbling along the veins (legendarily attributed to drops of the Virgin Mary\'s milk). Crowning the thorny stalks are solitary, brilliant magenta-purple flower heads surrounded by sharp involucral spines.',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    traditions: ['Mediterranean & Greco-Arab', 'Integrative Modern Science'],
    primaryActions: ['Master Hepatoprotective', 'Hepatic Cell Regenerator', 'Antioxidant', 'Phase I/II Detox Modulator'],
    bodyBenefits: [
      'Stimulates nucleolar polymerase A in hepatocytes, accelerating ribosome synthesis and liver tissue regeneration.',
      'Acts as a membrane stabilizer, preventing liver cell uptake of environmental toxins, alcohol metabolites, and mycotoxins.',
      'Increases hepatic glutathione levels by up to 35%, fortifying primary intracellular antioxidant defense.',
      'Promotes healthy insulin sensitivity and reduces visceral adiposity by suppressing hepatic steatosis.'
    ],
    mindBenefits: [
      'Alleviates metabolic endotoxemia and systemic brain fog originating from sluggish hepatic clearance.',
      'Protects cerebral neurons from neuro-inflammation and excitotoxic glutamate damage.',
      'Crosses the blood-brain barrier to reduce microglial activation in neurodegenerative models.',
      'Clears lethargy and irritability traditionally linked to liver heat and sluggish bile flow.'
    ],
    activePhytochemicals: [
      { name: 'Silybin (Silibinin A & B)', mechanism: 'The most biologically active flavonolignan of the silymarin complex, responsible for membrane protection and protein synthesis acceleration.' },
      { name: 'Silychristin & Silydianin', mechanism: 'Complementary flavonolignans with potent free radical scavenging and lipid peroxidation inhibition.' },
      { name: 'Taxifolin', mechanism: 'Powerful flavonoid precursor with anti-inflammatory and anti-glycation properties.' }
    ],
    scientificResearch: {
      summary: 'Silymarin from Milk Thistle is the world\'s premier botanical medicine for liver pathologies, recognized in hospital emergency settings as an intravenous antidote for death-cap mushroom (Amanita phalloides) poisoning and substantiated by dozens of clinical trials.',
      keyFindings: [
        'Clinical trials in patients with non-alcoholic fatty liver disease (NAFLD) and viral hepatitis demonstrate significant reductions in ALT, AST, and liver stiffness markers.',
        'Randomized controlled trials confirm significant increases in serum superoxide dismutase (SOD) and glutathione peroxidase (GPx).',
        'Demonstrates substantial improvement in fasting blood glucose and HbA1c levels in diabetic individuals with liver impairment.'
      ],
      evidenceLevel: 'Extensive Human Clinical Trials',
      citations: [
        'Abenavoli L et al., Phytother Res. 2018; 32(11): 2202-2213.',
        'Huseini HF et al., Phytomedicine. 2006; 13(8): 546-552.',
        'Saller R et al., Drugs. 2001; 61(14): 2035-2063.'
      ]
    },
    traditionalEnergetics: {
      tcmTasteNature: 'Bitter, cool; clears heat and dispels toxins, soothes the Liver and Gallbladder.',
      historicalContext: 'Described by Pliny the Elder and Dioscorides in the 1st century CE as an unrivaled remedy for carrying away bile and restoring individuals afflicted with jaundice and liver melancholy.'
    },
    preparationMethods: [
      {
        method: 'Standardized Silymarin Extract (Phytosome Complex)',
        description: '150–300 mg two to three times daily, standardized to 70–80% silymarin. Phospholipid-bound silymarin provides 5-fold higher intestinal absorption.',
        dosageOrRitual: 'Taken with meals alongside healthy dietary fats.'
      },
      {
        method: 'Freshly Ground Seed Powder',
        description: 'Grind 1 tbsp of whole organic milk thistle seeds in a coffee grinder and sprinkle over foods or blends.',
        dosageOrRitual: 'Provides dietary fiber, healthy lipids, and gentle tonic flavonolignans.'
      }
    ],
    safetyAndInteractions: {
      contraindications: ['Known hypersensitivity to Asteraceae plants'],
      potentialInteractions: ['Metabolized via Cytochrome P450 (CYP2C9/CYP3A4) pathways; may alter clearance of certain narrow-therapeutic-index pharmaceuticals'],
      pregnancyCaution: false,
      sourcingIntegrity: 'Silymarin is poorly water-soluble; simple teas yield very low active flavonolignans. Standardized extracts or phytosomes are necessary for therapeutic hepatic support.'
    }
  },
  {
    id: 'bacopa-monnieri',
    name: 'Bacopa (Brahmi)',
    botanicalName: 'Bacopa monnieri',
    plantFamily: 'Plantaginaceae (Plantain family)',
    commonAliases: ['Brahmi', 'Water Hyssop', 'Herb of Grace', 'Jalanimba'],
    plantOrigin: 'Wetlands and marshy shores of India, Nepal, Sri Lanka, and Southeast Asia',
    partsUsed: ['Whole creeping succulent herb'],
    plantDescription: 'A small, creeping succulent perennial herb forming lush aquatic mats in wetlands. Features small, fleshy, oblanceolate opposite leaves and solitary, dainty four- to five-petaled white or pale violet flowers. It thrives in brackish conditions and possesses a distinctly bitter, cooling taste.',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    traditions: ['Ayurveda'],
    primaryActions: ['Supreme Medhya Rasayana (Brain Tonic)', 'Nootropic', 'Synaptic Facilitator', 'Neuroprotective', 'Anxiolytic'],
    bodyBenefits: [
      'Scavenges free radicals in lipid-rich central nervous system tissue, inhibiting lipid peroxidation.',
      'Exhibits gentle bronchodilator activity via calcium channel antagonism in pulmonary tissue.',
      'Supports healthy blood pressure by stimulating cerebral microvascular nitric oxide release.',
      'Attenuates systemic stress response by regulating heat shock protein (Hsp70) expression.'
    ],
    mindBenefits: [
      'Promotes synaptic transmission by repairing damaged neurons and stimulating kinase activity in the hippocampus.',
      'Significantly enhances speed of visual information processing, working memory, and long-term consolidation.',
      'Reduces the rate of forgetting newly acquired knowledge over 12-week testing periods.',
      'Balances dopamine and serotonin synthesis, producing calm, lucid mental stamina without physical sedation.'
    ],
    activePhytochemicals: [
      { name: 'Bacosides (Bacoside A & B)', mechanism: 'Triterpenoid saponins that repair damaged neurons, stimulate synapse repair, and enhance nerve impulse transmission.' },
      { name: 'Bacopasides I–V', mechanism: 'Novel dammarane-type triterpenoid saponins with exceptional neuroprotective and memory-enhancing potency.' },
      { name: 'Luteolin & Apigenin', mechanism: 'Flavonoids that suppress microglial neuroinflammation and preserve cerebral vascular integrity.' }
    ],
    scientificResearch: {
      summary: 'Supported by numerous randomized, double-blind, placebo-controlled human trials, Bacopa is universally recognized in modern neurobiology as one of the few botanical substances clinically proven to enhance memory retention and cognitive processing speed.',
      keyFindings: [
        'A rigorous meta-analysis of randomized controlled trials confirmed that Bacopa significantly improves cognitive speed, attention span, and verbal learning retention after 8–12 weeks of continuous use.',
        'Human trials demonstrated a statistically significant reduction in the rate of forgetting newly acquired information in healthy adults.',
        'Clinical studies in aging populations showed reversal of age-related cognitive decline and improved scores on standard dementia screening scales.'
      ],
      evidenceLevel: 'Extensive Human Clinical Trials',
      citations: [
        'Stough C et al., Psychopharmacology (Berl). 2001; 156(4): 481-484.',
        'Kongkeaw C et al., J Ethnopharmacol. 2014; 151(1): 528-535.',
        'Calabrese C et al., J Altern Complement Med. 2008; 14(6): 707-713.'
      ]
    },
    traditionalEnergetics: {
      ayurvedicDosha: 'Cooling energy (Sheeta); Bitter and sweet taste. Pacifies all three doshas, especially Pitta and Vata in the mind. Classified as the crown Medhya Rasayana.',
      historicalContext: 'Named after Brahma, the creator god in Hindu cosmology. Inscribed in the Atharva Veda and ancient texts where scholar-priests consumed it to memorize vast, complex sacred Vedic hymns comprising tens of thousands of verses.'
    },
    preparationMethods: [
      {
        method: 'Standardized Bacoside Extract',
        description: '300–450 mg daily, standardized to minimum 50% bacosides.',
        dosageOrRitual: 'Must be taken with a fat-containing meal (such as breakfast with avocado, eggs, or ghee) for lipophilic absorption over 8–12 weeks.'
      },
      {
        method: 'Traditional Brahmi Ghee (Brahmi Ghrita)',
        description: 'Herbalized clarified butter infused with Bacopa juice and balancing spices.',
        dosageOrRitual: '1 tsp melted in warm milk or tea taken in the early morning.'
      }
    ],
    safetyAndInteractions: {
      contraindications: ['Bradycardia (slow resting heart rate under 55 bpm)', 'Gastrointestinal ulcers or active intestinal obstruction'],
      potentialInteractions: ['Sedatives', 'Thyroid hormone replacement (may mildly increase thyroxine levels)'],
      pregnancyCaution: true,
      sourcingIntegrity: 'Because Bacopa grows in aquatic environments, it acts as a bio-accumulator of environmental toxins. Demand rigorous batch tests for heavy metals and pesticides.'
    }
  }
];

// ============================================================================
// ESSENTIAL MINERALS & TRACE ELEMENTS
// ============================================================================

export const ESSENTIAL_MINERALS: MineralNutrient[] = [
  {
    id: 'magnesium',
    name: 'Magnesium',
    elementSymbol: 'Mg',
    category: 'Macromineral',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    biologicalRole: 'Required cofactor in over 600 enzymatic reactions in the human body. Essential for cellular ATP synthesis, DNA/RNA replication, neuromuscular transmission, and cardiac rhythm stability.',
    bodyBenefits: [
      'Facilitates active transport of calcium and potassium across cellular membranes for muscle contraction and relaxation.',
      'Promotes vascular smooth muscle dilation, normalizing blood pressure and reducing arterial stiffness.',
      'Improves insulin receptor sensitivity, facilitating efficient glucose uptake into muscle cells.',
      'Essential structural component of hydroxyapatite crystal lattice in bone mineral matrix.'
    ],
    mindBenefits: [
      'Blocks NMDA glutamate receptors in the brain, preventing excitotoxic neuronal over-stimulation.',
      'Agonizes GABA receptors, calming the central nervous system and shortening sleep onset latency.',
      'Supports synaptic plasticity, learning density, and long-term potentiation in the prefrontal cortex.',
      'Substantially mitigates frequency and intensity of migraine attacks and tension headaches.'
    ],
    formsAndBioavailability: [
      { form: 'Magnesium Glycinate (Bisglycinate)', bestFor: 'Anxiety, sleep, systemic muscular relaxation', absorptionNotes: 'Chelated to amino acid glycine; exceptionally gentle on the bowel with superior cellular absorption.' },
      { form: 'Magnesium L-Threonate (Magtein)', bestFor: 'Brain fog, synaptic density, memory, neuroprotection', absorptionNotes: 'The only form clinically shown to readily cross the blood-brain barrier and elevate brain cerebrospinal fluid magnesium levels.' },
      { form: 'Magnesium Malate', bestFor: 'Fibromyalgia, chronic fatigue, cellular energy production', absorptionNotes: 'Bound to malic acid, an essential intermediate in the mitochondrial Krebs energy cycle.' },
      { form: 'Magnesium Citrate', bestFor: 'Constipation, general replenishment', absorptionNotes: 'High osmotic water-drawing effect in intestines; helpful for sluggish bowel transit.' }
    ],
    dietarySources: ['Pumpkin seeds (pepitas)', 'Dark leafy greens (spinach, Swiss chard)', 'Raw cacao / 85%+ dark chocolate', 'Wild Atlantic salmon', 'Avocados', 'Black beans'],
    deficiencySigns: ['Muscle twitches, nocturnal leg cramps', 'Restless legs syndrome', 'Anxiety and heart palpitations', 'Insomnia and shallow sleep', 'Fatigue and carbohydrate cravings'],
    clinicalResearch: {
      summary: 'Modern agricultural soil depletion has left an estimated 50–60% of the Western population magnesium-deficient. Clinical trials overwhelmingly validate magnesium supplementation for hypertension, glycemic control, migraine prophylaxis, and depression.',
      evidenceLevel: 'Extensive Human Clinical Trials',
      citations: [
        'Slutsky I et al., Neuron. 2010; 65(2): 165-177.',
        'Tarleton EK et al., PLoS One. 2017; 12(6): e0180067.',
        'Zhang X et al., Hypertension. 2016; 68(2): 324-333.'
      ]
    },
    recommendedIntake: '320–420 mg elemental magnesium daily (often higher for active athletes and stressed individuals)',
    synergiesAndCofactors: ['Vitamin B6 (Pyridoxal-5-Phosphate) facilitates cellular uptake', 'Vitamin D3 & K2 for proper bone mineralization']
  },
  {
    id: 'zinc',
    name: 'Zinc',
    elementSymbol: 'Zn',
    category: 'Essential Trace Mineral',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    biologicalRole: 'Structural component of over 3,000 zinc-finger transcription proteins regulating gene expression. Critical for DNA polymerase activity, cellular replication, wound re-epithelialization, and gustatory taste perception.',
    bodyBenefits: [
      'Catalyzes development and activation of T-lymphocytes (T-cells) and natural killer (NK) cells.',
      'Inhibits viral replication within respiratory mucosal cells, significantly reducing duration of common colds.',
      'Essential cofactor for testicular Leydig cells and steroidogenesis for healthy testosterone synthesis.',
      'Maintains integrity of the intestinal epithelial tight junctions, preventing leaky gut syndrome.'
    ],
    mindBenefits: [
      'Concentrated within synaptic vesicles of glutamatergic neurons, fine-tuning neurotransmission.',
      'Promotes conversion of vitamin B6 to its active P-5-P form, which synthesizes serotonin and GABA.',
      'Exhibits neuroprotective antioxidant activity in the hippocampus against heavy metal toxicity.',
      'Clinical studies show meaningful reductions in depressive symptom scores when combined with antidepressants.'
    ],
    formsAndBioavailability: [
      { form: 'Zinc Picolinate', bestFor: 'Maximum systemic absorption and immune support', absorptionNotes: 'Bound to picolinic acid, a natural pancreatic chelator that optimizes intestinal absorption.' },
      { form: 'Zinc Bisglycinate', bestFor: 'Sensitive stomachs and daily nutritional maintenance', absorptionNotes: 'Chelated to two glycine molecules; bypasses competitive mineral absorption channels.' },
      { form: 'Zinc Carnosine (Polaprezinc)', bestFor: 'Gastric ulcers, gastritis, and intestinal permeability', absorptionNotes: 'Adheres specifically to damaged stomach and intestinal mucosa to stimulate local tissue healing.' }
    ],
    dietarySources: ['Wild oysters (richest known food source)', 'Grass-fed beef', 'Pumpkin seeds', 'Lentils and chickpeas', 'Cashews', 'Egg yolks'],
    deficiencySigns: ['Loss of taste or smell acuity (hypogeusia)', 'White spots on fingernails (leukonychia)', 'Frequent respiratory infections', 'Impaired wound healing', 'Hair thinning and acne'],
    clinicalResearch: {
      summary: 'The World Health Organization recognizes zinc deficiency as a major global contributor to immune impairment. Clinical trials demonstrate that zinc lozenges administered at cold onset reduce illness duration by 33%.',
      evidenceLevel: 'Extensive Human Clinical Trials',
      citations: [
        'Hemilä H. JRSM Open. 2017; 8(5): 2054270417694291.',
        'Prasad AS. Mol Med. 2008; 14(5-6): 353-357.',
        'Swardfager W et al., Biol Psychiatry. 2013; 74(12): 872-878.'
      ]
    },
    recommendedIntake: '15–30 mg elemental zinc daily with food',
    synergiesAndCofactors: ['Must be balanced with Copper (ratio of 10:1 or 15:1 Zn:Cu) to prevent copper depletion', 'Vitamin A for immune synergy']
  },
  {
    id: 'selenium',
    name: 'Selenium',
    elementSymbol: 'Se',
    category: 'Essential Trace Mineral',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    biologicalRole: 'Directly incorporated into 25 selenoproteins, most notably glutathione peroxidase (GPx), the body\'s master intracellular antioxidant enzyme system, and iodothyronine deiodinases that convert thyroid hormones.',
    bodyBenefits: [
      'Protects cellular membranes from reactive oxygen species and lipid hydroperoxides.',
      'Crucial for thyroid deiodinase enzymes converting inactive T4 hormone into active metabolic T3.',
      'Reduces thyroid peroxidase (TPO) antibodies in patients with Hashimoto\'s autoimmune thyroiditis.',
      'Binds environmental mercury, cadmium, and lead, neutralizing their toxic enzymatic affinity.'
    ],
    mindBenefits: [
      'Protects brain neurons from oxidative neurodegeneration and excitotoxic cascade damage.',
      'Supports healthy cerebral mitochondrial respiration and cognitive stamina in aging.',
      'Deficiency is clinically correlated with increased hostility, anxiety, and depression.',
      'Safeguards dopaminergic pathways from neurotoxin-induced cell death.'
    ],
    formsAndBioavailability: [
      { form: 'Selenomethionine', bestFor: 'Natural dietary mimic, high bioavailability', absorptionNotes: 'Organic form absorbed as an amino acid and stored in muscle protein pools for on-demand synthesis.' },
      { form: 'Sodium Selenite', bestFor: 'Immediate acute enzymatic induction', absorptionNotes: 'Inorganic form utilized directly by liver for selenoprotein P synthesis without tissue accumulation.' }
    ],
    dietarySources: ['Brazil nuts (1–2 nuts provide 100% of daily requirement)', 'Wild yellowfin tuna', 'Halibut and sardines', 'Pasture-raised eggs', 'Shiitake mushrooms'],
    deficiencySigns: ['Hypothyroidism symptoms (fatigue, cold intolerance, weight gain)', 'Muscle weakness and cardiomyopathy (Keshan disease)', 'Weakened immunity and chronic viral susceptibility'],
    clinicalResearch: {
      summary: 'Pivotal randomized clinical trials including the Swedish KiSel-10 study demonstrated that combined selenium and CoQ10 supplementation in older adults cut cardiovascular mortality by 54% and preserved physical vitality.',
      evidenceLevel: 'Extensive Human Clinical Trials',
      citations: [
        'Alehagen U et al., Int J Cardiol. 2013; 167(5): 1860-1866.',
        'Gartner R et al., J Clin Endocrinol Metab. 2002; 87(4): 1687-1691.',
        'Rayman MP. Lancet. 2012; 379(9822): 1256-1268.'
      ]
    },
    recommendedIntake: '100–200 mcg daily (Do not exceed 400 mcg daily to prevent selenosis)',
    synergiesAndCofactors: ['Coenzyme Q10 for cardiovascular antioxidant synergy', 'Vitamin E (alpha-tocopherol) for cell membrane lipid protection']
  },
  {
    id: 'potassium',
    name: 'Potassium',
    elementSymbol: 'K',
    category: 'Electrolyte',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    biologicalRole: 'The major intracellular cation in human cells. Powers the cellular sodium-potassium pump (Na+/K+-ATPase), generating the resting membrane potential that allows nerve firing, heart muscle contraction, and fluid volume homeostasis.',
    bodyBenefits: [
      'Directly antagonizes sodium retention, promoting vasodilation and significantly lowering systolic blood pressure.',
      'Reduces risk of stroke, cardiac arrhythmias, and left ventricular hypertrophy.',
      'Prevents calcium loss in urine, safeguarding bone mineral density and preventing kidney stone formation.',
      'Essential for glycogen storage inside muscle cells, fueling athletic performance and explosive output.'
    ],
    mindBenefits: [
      'Ensures rapid, unhindered synaptic electrical transmission across cerebral neural networks.',
      'Mitigates the physical and neurological tremors associated with sympathetic nervous overload.',
      'Assists in cerebral blood flow regulation, preventing dizziness and orthostatic hypotension.',
      'Improves mental clarity by eliminating cellular metabolic acidity and lactic build-up.'
    ],
    formsAndBioavailability: [
      { form: 'Potassium Citrate', bestFor: 'Systemic alkalinization, kidney stone prevention, blood pressure', absorptionNotes: 'Metabolizes to bicarbonate in the body, providing alkalizing systemic benefits.' },
      { form: 'Potassium Chloride', bestFor: 'Electrolyte rehydration formulas and athletic replacement', absorptionNotes: 'Rapidly dissociates into elemental ions for immediate osmotic re-balancing.' }
    ],
    dietarySources: ['Avocados (twice the potassium of bananas)', 'Coconut water', 'Baked sweet potatoes with skin', 'Wild-caught salmon', 'Spinach and beet greens', 'Bananas'],
    deficiencySigns: ['Muscle cramps, weakness, and heavy limb sensations', 'Heart flutters and irregular heartbeat (arrhythmias)', 'Elevated blood pressure', 'Chronic fatigue and digestive constipation'],
    clinicalResearch: {
      summary: 'Extensive epidemiological studies and clinical trials demonstrate that increasing potassium intake while reducing sodium is one of the most effective non-pharmacological interventions for hypertension and stroke reduction.',
      evidenceLevel: 'Extensive Human Clinical Trials',
      citations: [
        'Aburto NJ et al., BMJ. 2013; 346: f1378.',
        'Whelton PK et al., JAMA. 1997; 277(20): 1624-1632.'
      ]
    },
    recommendedIntake: '3,500–4,700 mg daily (optimally obtained through real whole foods)',
    synergiesAndCofactors: ['Magnesium is strictly required for the Na+/K+-ATPase pump to retain intracellular potassium']
  }
];

// ============================================================================
// VITAL SYSTEMIC & DIGESTIVE ENZYMES
// ============================================================================

export const VITAL_ENZYMES: BioEnzyme[] = [
  {
    id: 'bromelain',
    name: 'Bromelain',
    type: 'Proteolytic / Systemic',
    naturalSource: 'Stems and juice of fresh Pineapple (Ananas comosus)',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    mechanismOfAction: 'A complex mixture of sulfhydryl-containing proteolytic enzymes that hydrolyze peptide bonds. When taken between meals, it is absorbed intact across the intestinal mucosa into the bloodstream, where it selectively degrades circulating immune complexes, inhibits inflammatory thromboxane, and down-regulates PGE2.',
    bodyBenefits: [
      'Accelerates healing and resolution of hematomas, swelling, and surgical trauma (frequently used post-cosmetic surgery).',
      'Breaks down excessive fibrin deposits in inflamed joints, easing pain in osteoarthritis.',
      'Clears sinus congestion and reduces mucosal edema in acute and chronic rhinosinusitis.',
      'When taken with meals, digests dense dietary proteins into readily absorbable free amino acids.'
    ],
    mindBenefits: [
      'Reduces systemic cytokine-mediated neuroinflammation that contributes to fatigue and brain fog.',
      'Improves cerebral micro-perfusion by reducing blood viscosity and micro-thrombi formation.',
      'Promotes post-concussion tissue recovery and reduces headaches originating from sinus inflammation.'
    ],
    clinicalResearch: {
      summary: 'Decades of European and American orthopedic and ENT clinical trials validate oral bromelain as a potent, safe natural anti-inflammatory agent comparable to standard NSAIDs for acute musculoskeletal injuries.',
      keyFindings: [
        'Double-blind randomized trials show dramatic reductions in pain, facial swelling, and post-operative recovery time following third molar extraction.',
        'Meta-analyses support its effectiveness in reducing knee joint tenderness and swelling in osteoarthritis.',
        'Demonstrates significant thinning of viscous bronchial secretions and clinical improvement in chronic sinusitis.'
      ],
      citations: [
        'Brien S et al., Evid Based Complement Alternat Med. 2004; 1(3): 251-257.',
        'Pavan R et al., Biotechnol Res Int. 2012; 2012: 976203.'
      ]
    },
    optimalAdministration: 'For systemic anti-inflammatory effect: 500–1,000 mg (measured in 2,400+ GDU/g) taken on an empty stomach 1 hour before meals. For digestive assistance: taken with protein-rich meals.',
    safetyNotes: 'Use caution with anticoagulant pharmaceuticals (warfarin, heparin). Discontinue 14 days prior to elective surgery. Do not use if allergic to pineapple.'
  },
  {
    id: 'serrapeptase',
    name: 'Serrapeptase (Serratiopeptidase)',
    type: 'Proteolytic / Systemic',
    naturalSource: 'Originally isolated from the non-pathogenic enterobacterium Serratia E-15 inhabiting the silkworm gut',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    mechanismOfAction: 'A potent extracellular endopeptidase that binds to alpha-2-macroglobulin in blood, selectively cleaving dead, non-living necrotic tissue, dead arterial plaque, fibrotic scar tissue, and excess fibrin without harming living arterial walls or healthy connective tissue.',
    bodyBenefits: [
      'Dissolves dead fibrotic scar tissue and micro-thrombi, supporting healthy arterial lumen flow.',
      'Clears dense mucous and biofilm formations in the bronchial passages and sinus cavities.',
      'Reduces pain by hydrolyzing bradykinin, the primary amine mediator responsible for triggering peripheral pain signals.',
      'Accelerates tissue healing in sports injuries, carpal tunnel syndrome, and fibrocystic breast tissue.'
    ],
    mindBenefits: [
      'Reduces vascular inflammation that hinders cerebral oxygen delivery.',
      'Assists in breaking down protective bacterial biofilms that shelter chronic stealth pathogens.',
      'Eases tension headaches caused by suboccipital muscular spasms and micro-vascular congestion.'
    ],
    clinicalResearch: {
      summary: 'Extensively prescribed in Japan and Germany for over 40 years as an ethical anti-inflammatory medicine, Serrapeptase has demonstrated robust clinical efficacy across respiratory, surgical, and otorhinolaryngological conditions.',
      keyFindings: [
        'Multicenter double-blind trials demonstrate significant reduction in postoperative buccal swelling and pain.',
        'Clinical studies in chronic airway disease show marked reductions in sputum volume, viscosity, and neutrophil counts.',
        'Demonstrates potent synergy with antibiotics by dismantling bacterial biofilm shields.'
      ],
      citations: [
        'Tachibana M et al., J Int Med Res. 1984; 12(1): 52-57.',
        'Nakamura S et al., Respirology. 2003; 8(3): 316-320.'
      ]
    },
    optimalAdministration: 'Must be enteric-coated to survive stomach hydrochloric acid. 40,000 to 120,000 SPU taken strictly on an empty stomach with a full glass of water, minimum 2 hours away from all food.',
    safetyNotes: 'Contraindicated in bleeding disorders and alongside anticoagulant therapies. If taking with food, it simply digests the meal rather than entering systemic circulation.'
  },
  {
    id: 'nattokinase',
    name: 'Nattokinase',
    type: 'Proteolytic / Systemic',
    naturalSource: 'Traditional Japanese fermented soybean dish Natto, produced by Bacillus subtilis var. natto',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    mechanismOfAction: 'A serine protease of the subtilisin family that directly cleaves cross-linked fibrin meshes in blood clots, while simultaneously stimulating the release of tissue plasminogen activator (t-PA) and inactivating plasminogen activator inhibitor 1 (PAI-1).',
    bodyBenefits: [
      'Directly dissolves intravascular fibrin clots and reduces whole blood viscosity.',
      'Supports healthy blood pressure by cleaving angiotensin II and inhibiting plasma renin activity.',
      'Prevents deep vein thrombosis (DVT) during long-haul flights and prolonged immobility.',
      'Promotes arterial compliance and dissolves micro-thrombi in peripheral vascular disease.'
    ],
    mindBenefits: [
      'Enhances microvascular capillary blood flow in the cerebral cortex, reducing transient ischemic risk.',
      'Clears sluggish morning cognitive fog associated with poor microcirculation.',
      'Protects hippocampal tissue from ischemic reperfusion injury in neurovascular models.'
    ],
    clinicalResearch: {
      summary: 'Discovered in 1980 by Dr. Hiroyuki Sumi at Chicago University, Nattokinase is regarded as one of the most potent natural fibrinolytic agents discovered, substantiated by human cardiovascular trials.',
      keyFindings: [
        'A human clinical trial in 86 patients showed significant reductions in systolic and diastolic blood pressure after 8 weeks.',
        'The LONFLIT randomized trial in high-risk airline passengers demonstrated that oral Nattokinase completely prevented deep vein thrombosis compared to controls.',
        'Studies verify long-lasting fibrinolytic activity in human blood persisting for over 8–12 hours after a single oral dose.'
      ],
      citations: [
        'Kim JY et al., Hypertens Res. 2008; 31(8): 1583-1588.',
        'Cesarone MR et al., Angiology. 2003; 54(5): 531-539.'
      ]
    },
    optimalAdministration: '2,000 to 4,000 Fibrinolytic Units (FU) daily taken before bedtime on an empty stomach (fibrinolytic events most frequently occur during early morning sleep hours).',
    safetyNotes: 'Do not combine with prescription blood thinners (Coumadin, Eliquis, Plavix) without strict hematological supervision. Ensure vitamin K2 is removed if taking vitamin K-sensitive anticoagulants.'
  },
  {
    id: 'coq10-ubiquinol',
    name: 'Coenzyme Q10 (Ubiquinol)',
    type: 'Metabolic / Mitochondrial',
    naturalSource: 'Organ meats (heart, liver), wild sardines, grass-fed beef, synthesized endogenously in liver',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    mechanismOfAction: 'An essential lipid-soluble electron transporter in the mitochondrial electron transport chain (Complex I and II to Complex III), driving oxidative phosphorylation to generate over 95% of human cellular ATP energy. In its reduced form (Ubiquinol), it is the primary lipophilic antioxidant in cell membranes.',
    bodyBenefits: [
      'Powers the ceaseless pumping action of myocardial cardiac muscle cells, improving ejection fraction in heart failure.',
      'Replenishes critical mitochondrial cofactors depleted by cholesterol-lowering statin drugs.',
      'Improves muscular endurance, reduces post-exercise lactic acid accumulation, and speeds recovery.',
      'Protects vascular endothelial cell walls from lipid peroxidation of low-density lipoproteins (ox-LDL).'
    ],
    mindBenefits: [
      'Restores mitochondrial bioenergetics in brain cortical neurons, combating chronic mental exhaustion.',
      'Clinically proven to reduce frequency, duration, and severity of migraine headaches.',
      'Shields striatal dopaminergic neurons from oxidative apoptosis.',
      'Enhances psychomotor speed and working focus in aging populations.'
    ],
    clinicalResearch: {
      summary: 'The landmark Q-SYMBIO randomized double-blind clinical trial demonstrated that CoQ10 supplementation in chronic heart failure cut cardiovascular mortality in half and dramatically reduced hospitalizations.',
      keyFindings: [
        'The Q-SYMBIO trial in 420 patients demonstrated a 43% reduction in major adverse cardiovascular events and 50% lower cardiovascular mortality.',
        'Double-blind studies show a 50% or greater reduction in migraine attack frequency in over 47% of patients.',
        'Reverses statin-induced myopathy (muscle aches and fatigue) in clinical cohorts.'
      ],
      citations: [
        'Mortensen SA et al., JACC Heart Fail. 2014; 2(6): 641-649.',
        'Sandor PS et al., Neurology. 2005; 64(4): 713-715.',
        'Caso G et al., Am J Cardiol. 2007; 99(10): 1409-1412.'
      ]
    },
    optimalAdministration: '100–300 mg daily of reduced Ubiquinol (3–8 times more bioavailable than oxidized ubiquinone), taken with a fat-containing meal.',
    safetyNotes: 'Remarkably safe with virtually zero toxic threshold. May mildly lower blood sugar in diabetics.'
  }
];

// ============================================================================
// THERAPEUTIC FOODS, TONICS & ELIXIRS
// ============================================================================

export const FUNCTIONAL_FOODS: FunctionalFoodDrink[] = [
  {
    id: 'golden-milk',
    name: 'Adaptogenic Golden Milk',
    subtitle: 'Sacred Haldi Doodh Ayurvedic Rejuvenator',
    category: 'Adaptogenic Elixir',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    originTradition: 'Classical Ayurvedic Tradition (India)',
    bodyBenefits: [
      'Potent full-spectrum joint lubrication and cartilage inflammation relief.',
      'Soothes gastrointestinal mucosal inflammation and relieves evening bloating.',
      'Regulates nocturnal glucose stability, preventing cortisol spikes during sleep.'
    ],
    mindBenefits: [
      'Gently promotes neurogenesis and calms evening rumination and mental chatter.',
      'Creates a grounding, comforting sensory ritual that triggers parasympathetic rest.'
    ],
    keyCompounds: ['Curcuminoids (Turmeric)', 'Gingerols (Fresh Ginger)', 'Piperine (Black Pepper)', 'Cinnamaldehyde (Ceylon Cinnamon)', 'Medium-Chain Triglycerides (Coconut oil / Ghee)'],
    scientificBacking: 'Combining turmeric with black pepper (piperine) enhances systemic curcumin bioavailability by up to 2,000%, while healthy saturated fats in ghee or coconut milk allow hydrophobic polyphenols to form micelles for active lymph-system absorption.',
    traditionalLore: 'Given for thousands of years by Indian grandmothers (Dadis) to family members experiencing aches, chills, or emotional grief. Revered as an embodiment of the golden light of the sun bottled in medicinal form.',
    recipeOrRitual: {
      ingredients: [
        '1 cup organic whole milk, coconut milk, or homemade almond milk',
        '1 tsp finely ground organic turmeric root powder',
        '1/2 tsp freshly grated ginger root',
        'Pinch of freshly cracked black pepper (essential for activation)',
        '1/4 tsp organic Ceylon cinnamon powder',
        '1 tsp grass-fed ghee or cold-pressed virgin coconut oil',
        '1 tsp raw unpasteurized honey (stirred in after cooling below 110°F)'
      ],
      steps: [
        'Whisk milk, turmeric, ginger, black pepper, and cinnamon in a small saucepan over medium heat.',
        'Bring to a gentle simmer (do not boil hard) for 5 minutes, stirring continuously as the milk takes on a luminous golden color.',
        'Stir in the ghee or coconut oil until thoroughly melted and emulsified.',
        'Remove from heat, strain through a fine mesh strainer into your favorite ceramic mug.',
        'Allow to cool slightly before stirring in raw honey.'
      ],
      optimalTiming: 'Sipped slowly 45 minutes before bedtime as a sacred ritual of unwinding and bodily gratitude.'
    }
  },
  {
    id: 'ceremonial-matcha',
    name: 'Ceremonial Japanese Matcha',
    subtitle: 'Shaded Tencha Green Tea of Zen Monks',
    category: 'Botanical Infusion',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    originTradition: 'Chan / Zen Buddhist Monastic Tradition (Uji & Kyoto, Japan)',
    bodyBenefits: [
      'Highest known concentration of Epigallocatechin gallate (EGCG), a master longevity polyphenol.',
      'Accelerates cellular fat oxidation (thermogenesis) during exercise by up to 17%.',
      'Provides rich chlorophyll for cellular detoxification and clean metabolic alkalinity.'
    ],
    mindBenefits: [
      'High concentrations of L-Theanine induce clean, coherent Alpha brainwaves (8–12 Hz).',
      'Produces a state of "relaxed alertness" (Zanshin) with complete absence of caffeine jitters or crashes.',
      'Supports sustained focus, working memory, and creative flow states for 4–6 continuous hours.'
    ],
    keyCompounds: ['L-Theanine (Glutamic acid analog)', 'EGCG (Epigallocatechin Gallate)', 'Chlorophyll', 'Quercetin', 'Caffeine (complexed with tannins)'],
    scientificBacking: 'Electroencephalogram (EEG) research verifies that the exact stoichiometric ratio of L-Theanine and caffeine in shaded green tea stimulates prefrontal alpha brainwave bands, enhancing task accuracy and calming the autonomic nervous system.',
    traditionalLore: 'Brought to Japan from China by Zen Master Eisai in 1191 CE. Monks consumed stone-ground powdered tea before prolonged 10-hour Zazen meditation sessions to keep the mind brilliantly sharp yet inwardly peaceful.',
    recipeOrRitual: {
      ingredients: [
        '1.5 to 2 grams (1–2 bamboo Chashaku scoops) of Ceremonial Grade Matcha (first spring harvest, Uji or Nishio)',
        '70 mL (2.5 oz) pure filtered spring water heated to precisely 175°F (80°C — never boiling)'
      ],
      steps: [
        'Sift the vibrant emerald green matcha powder through a fine stainless-steel strainer into a ceramic Chawan bowl to eliminate clumps.',
        'Pour in the 175°F water down the inner wall of the bowl.',
        'Using a traditional 100-prong bamboo whisk (Chasen), whisk briskly in a rapid "W" or "M" motion from the wrist, ensuring the tines don\'t scrape the bottom.',
        'Continue for 20–30 seconds until a creamy, jade-green foam with micro-bubbles blankets the surface.',
        'Pause, hold the warm bowl with both hands, breathe in the fresh vegetal aroma, and drink mindfully in three serene sips.'
      ],
      optimalTiming: 'Mid-morning or early afternoon during creative immersion or deep contemplative work.'
    }
  },
  {
    id: 'cordyceps-vitality',
    name: 'Wild Cordyceps Vitality Elixir',
    subtitle: 'Himalayan High-Altitude Bio-Energetic Tonic',
    category: 'Medicinal Mushroom',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    originTradition: 'Tibetan & Traditional Chinese Mountain Medicine',
    bodyBenefits: [
      'Increases cellular ATP production by up to 28% and enhances cellular oxygen utilization efficiency.',
      'Significantly increases VO2 max and delays blood lactate accumulation during high-intensity output.',
      'Nourishes the Kidney essence (Jing) in TCM, fortifying sexual stamina and adrenal resilience.'
    ],
    mindBenefits: [
      'Eliminates systemic physical and mental fatigue resulting from over-work and chronic depletion.',
      'Supports steady, clean physiological drive and motivation without adrenal exhaustion.'
    ],
    keyCompounds: ['Cordycepin (3\'-deoxyadenosine)', 'Adenosine', 'Cordycepic Acid (D-mannitol)', 'Sterols (Ergosterol)', 'Polysaccharides'],
    scientificBacking: 'Cordycepin structurally mimics cellular adenosine, directly stimulating the synthesis of ATP within mitochondrial matrices while relaxing bronchial smooth muscle for increased lung oxygen uptake.',
    traditionalLore: 'Discovered centuries ago by Tibetan yak herders who noticed that when their yaks grazed on high alpine fungi at 14,000 feet, they became miraculously energetic, playful, and robust against sub-zero mountain blizzards.',
    recipeOrRitual: {
      ingredients: [
        '1 tsp pure dual-extracted Cordyceps militaris or CS-4 powder',
        '8 oz hot filtered water or organic bone broth',
        '1/2 tsp organic coconut butter or MCT oil',
        'Pinch of unrefined pink Himalayan mineral salt'
      ],
      steps: [
        'Whisk the cordyceps powder into hot water or steaming bone broth.',
        'Blend or froth with coconut butter and pink salt for 15 seconds until velvety.',
        'Inhale the earthy, nutty aroma and drink before athletic exertion or demanding mental labor.'
      ],
      optimalTiming: '30–45 minutes prior to rigorous physical training, mountain hiking, or morning work.'
    }
  },
  {
    id: 'hibiscus-rosehip',
    name: 'Ruby Hibiscus & Rosehip Nectar',
    subtitle: 'Cardio-Endothelial Anthocyanin Infusion',
    category: 'Botanical Infusion',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    originTradition: 'Ancient Egyptian (Karkadeh) & Caribbean Sorrel Traditions',
    bodyBenefits: [
      'Inhibits angiotensin-converting enzyme (ACE) naturally, significantly reducing high blood pressure.',
      'Packed with natural bioflavonoids and vitamin C, stimulating collagen cross-linking and vascular integrity.',
      'Promotes gentle renal fluid clearance without disturbing electrolyte balance.'
    ],
    mindBenefits: [
      'Quenches internal heat, irritability, and physiological frustration with cooling, tart hydration.',
      'Protects cerebral capillary walls against oxidative micro-damage.'
    ],
    keyCompounds: ['Delphinidin & Cyanidin Anthocyanins', 'Hibiscic Acid', 'Natural Vitamin C Complex', 'Protocatechuic Acid'],
    scientificBacking: 'Randomized controlled trials published in the Journal of Nutrition found that drinking 3 cups of hibiscus tea daily lowered systolic blood pressure by 7.2 mmHg, matching low-dose ACE inhibitor medications without side effects.',
    traditionalLore: 'Known as Karkadeh in the Nile Valley, where it was consumed by Pharaohs to maintain a cool, composed mind in desert heat. Served at joyful wedding celebrations throughout North Africa and the Caribbean.',
    recipeOrRitual: {
      ingredients: [
        '2 heaping tbsp dried whole deep-crimson organic Hibiscus calyces (Flor de Jamaica)',
        '1 tbsp crushed dried wild rosehips',
        '32 oz boiling spring water',
        'Optional: Fresh orange peel and a cinnamon stick',
        'Raw honey or fresh mint to taste'
      ],
      steps: [
        'Place hibiscus calyces, rosehips, and cinnamon into a heatproof glass pitcher.',
        'Pour boiling water over the botanicals. Watch as the infusion instantly turns into a mesmerizing, deep jewel-toned magenta ruby color.',
        'Cover and steep for 15–20 minutes (or overnight in the refrigerator for a crisp cold brew).',
        'Strain into a goblet, garnish with fresh mint leaves, and serve warm or poured over ice.'
      ],
      optimalTiming: 'Enjoyed alongside lunch or in the afternoon as a vibrant, caffeine-free revitalizer.'
    }
  }
];

// ============================================================================
// MIND-BODY MOVEMENT, MARTIAL ENERGETICS & BREATH SCIENCE
// ============================================================================

export const MIND_BODY_PRACTICES: MindBodyPractice[] = [
  {
    id: 'tai-chi',
    name: 'Tai Chi (Taijiquan)',
    system: 'Tai Chi (Taijiquan)',
    lineage: 'Chen & Yang Style Internal Martial Traditions (Wudang / Chenjiagou, China)',
    imageUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&q=80',
    summary: 'A sublime internal martial art and moving meditation characterized by slow, continuous, circular movements coordinated with deep diaphragmatic respiration. Emphasizes postural verticality, dantian centering, weight transfer, and whole-body fascia spiraling ("Chan Si Jin" / silk-reeling).',
    physicalImpact: [
      'Trains continuous eccentric and isometric muscle control in lower extremities, reducing fall risk by up to 50% in clinical trials.',
      'Stimulates interstitial fascial gliding, hydrating synovial joint capsules and easing osteoarthritis stiffness.',
      'Promotes venous and lymphatic return through rhythmic calf and diaphragmatic pumping mechanisms.',
      'Improves proprioceptive acuity, vestibular balance, and spinal column articulation.'
    ],
    neurologicalAndMentalImpact: [
      'Shifts the autonomic nervous system into profound parasympathetic vagal dominance within 10 minutes of flow.',
      'Increases brain cortical volume, promotes neuroplasticity, and enhances executive function in aging cohorts.',
      'Cultivates "Song" (sung) — an internal state of deeply relaxed, alert, non-striving dynamic presence.',
      'Reduces systemic cortisol and pro-inflammatory cytokines (IL-6, TNF-alpha) related to chronic anxiety.'
    ],
    whatTraditionSays: 'Taiji embodies the dynamic harmony of Yin (receptive, sinking, yielding) and Yang (expansive, rooting, expressing). The body moves from the Dantian (the internal lower energetic ocean below the navel). "Sink the Qi to the Dantian, suspend the crown of the head as if by a silk thread from heaven, and let movement originate from the waist like a wheel."',
    whatModernScienceSays: 'Harvard Medical School neuroscientists describe Tai Chi as "moving medication." Research shows it activates the default mode network calming response, stimulates vagal tone, enhances heart rate variability (HRV), and releases BDNF through slow, complex bilateral motor coordination.',
    coreMovementsOrTechniques: [
      {
        name: 'Opening the Stance (Qi Shi)',
        instruction: 'Stand with feet shoulder-width, knees softly unlocked, tailbone gently sinking as if sitting on a high stool. Slowly float both arms forward to shoulder height with palms down, then sink elbows and palms down to the lower abdomen while exhaling and rooting into the earth.',
        breathCoordination: 'Inhale as the arms gently rise effortlessly; exhale as the arms sink and body roots.',
        targetFasciaOrEnergyConduit: 'Superficial Back Line & Conception Vessel (Ren Mai)'
      },
      {
        name: 'Parting the Wild Horse\'s Mane (Ye Ma Fen Zong)',
        instruction: 'Hold an energetic ball between hands at the chest. Step forward diagonally, shifting 70% weight into a bow stance while the lower hand sweeps upward diagonally like caressing a galloping horse\'s mane, and the upper hand presses down to the hip.',
        breathCoordination: 'Inhale while gathering the sphere; exhale as you step and spiral outward.',
        targetFasciaOrEnergyConduit: 'Spiral Fascia Line & Du Mai (Governing Vessel)'
      },
      {
        name: 'Wave Hands Like Clouds (Yun Shou)',
        instruction: 'Continuous lateral stepping while the arms trace overlapping circular arcs in front of the torso. The eyes follow the rising palm as the waist turns smoothly like a gate post.',
        breathCoordination: 'Continuous, slow 6-second natural diaphragmatic breath cycle.',
        targetFasciaOrEnergyConduit: 'Dai Mai (Belt Meridian) & Deep Front Fascial Line'
      }
    ],
    idealFrequency: '20–30 minutes daily at sunrise or early evening'
  },
  {
    id: 'qigong-baduanjin',
    name: 'Qigong (Eight Pieces of Brocade / Ba Duan Jin)',
    system: 'Qigong (Internal Energy)',
    lineage: 'Song Dynasty Shaolin & Daoist Health Tradition (Marshal Yue Fei, 12th Century)',
    imageUrl: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&q=80',
    summary: 'A 1,000-year-old classical sequence of eight gentle physical movements designed to stretch and stimulate the 12 primary acupuncture meridians, massage the internal Zang-Fu organs, and harmonize internal energy (Qi) flow.',
    physicalImpact: [
      'Gently mobilizes the thoracic spine, costal joints, and cervical vertebrae, relieving upper body postural stagnation.',
      'Massages the kidneys, spleen, and liver through lateral torsion and gentle abdominal compression.',
      'Enhances microvascular capillary circulation to the skin and peripheral extremities.',
      'Improves vital lung capacity through expansive respiratory biomechanics.'
    ],
    neurologicalAndMentalImpact: [
      'Unifies the triad of San Tiao: regulating the body (Tiao Shen), breath (Tiao Xi), and mind (Tiao Xin).',
      'Quiets sensory distraction and mental wandering, inducing a tranquil meditative state.',
      'Clears emotional heaviness and stress lodged in the myofascial tissues.',
      'Balances cerebral hemisphere synchronization through bilateral symmetric stretches.'
    ],
    whatTraditionSays: 'Each movement acts upon a specific organ and meridian network. "Two Hands Hold up the Heavens" regulates the Triple Burner (San Jiao); "Drawing the Bow" opens the Lung meridian and strengthens the kidneys; "Turning the Head to Look Behind" dispels the Five Fatigues and Seven Injuries.',
    whatModernScienceSays: 'Clinical studies in medical journals confirm that regular practice of Ba Duan Jin significantly reduces systolic blood pressure, improves balance and lumbar flexibility, elevates mood, and stimulates endogenous immune interferon synthesis.',
    coreMovementsOrTechniques: [
      {
        name: 'Two Hands Hold Up the Heavens (Shuang Shou Tuo Tian)',
        instruction: 'Interlace fingers in front of the lower abdomen. Inhale as hands rise up the centerline, invert palms at the throat, and press toward the sky with straight arms and relaxed shoulders. Gently look upward, stretching the entire anterior fascial line. Exhale as arms circle softly back to the sides.',
        breathCoordination: 'Deep slow diaphragmatic inhalation on the upward press; full relaxed exhalation as arms float down.',
        targetFasciaOrEnergyConduit: 'San Jiao (Triple Burner) Meridian & Superficial Front Line'
      },
      {
        name: 'Drawing the Bow to Shoot the Hawk (Zuo You Kai Gong)',
        instruction: 'Sink into a horse-riding stance (Ma Bu). Cross wrists at the chest. Draw one elbow back as if pulling a heavy bowstring while extending the other hand forward with index finger and thumb forming an "L" sight. Gaze intensely through the target.',
        breathCoordination: 'Inhale as the hands cross; exhale deeply as the bow is drawn; hold for 2 seconds.',
        targetFasciaOrEnergyConduit: 'Lung & Large Intestine Meridians (Arm Deep Front Line)'
      },
      {
        name: 'Separating Heaven and Earth (Tiao Li Pi Wei)',
        instruction: 'Press one palm upward toward the sky while pressing the other palm downward toward the earth. Creates an internal diagonal stretch across the abdomen, alternating sides.',
        breathCoordination: 'Inhale as the hands stretch apart; exhale as they pass at the chest.',
        targetFasciaOrEnergyConduit: 'Spleen & Stomach Meridians'
      }
    ],
    idealFrequency: '15 minutes daily upon waking'
  },
  {
    id: 'pranayama-nadi-shodhana',
    name: 'Nadi Shodhana (Alternate Nostril Breath)',
    system: 'Pranayama (Breath Science)',
    lineage: 'Classical Hatha Yoga Tradition (Hatha Yoga Pradipika, 15th Century)',
    imageUrl: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=800&q=80',
    summary: 'The master balancing breath of classical yogic physiology. Alternating airflow through individual nostrils systematically balances autonomic nervous system tone, regulates hemispheric brain activity, and purifies subtle energetic channels (Nadis).',
    physicalImpact: [
      'Normalizes respiratory cadence to an optimal 4–6 breaths per minute, maximizing gas exchange efficiency.',
      'Stimulates the nasal cycle reflex, modulating cerebral arterial blood flow in opposing brain hemispheres.',
      'Reduces resting heart rate and lowers systolic blood pressure within 5 minutes of practice.',
      'Cleanses and humidifies the nasal passages while increasing nasal nitric oxide uptake.'
    ],
    neurologicalAndMentalImpact: [
      'Synchronizes left-brain analytical processing and right-brain spatial-intuitive cognition on EEG.',
      'Reduces hyperactivity in the amygdala, replacing acute emotional panic with centered calm.',
      'Enhances sustained attentional vigilance and reduces reaction time variability.',
      'Promotes deep mental clarity prior to meditation, study, or high-stakes decision making.'
    ],
    whatTraditionSays: 'Purifies the 72,000 Nadis (energy conduits). Inhaling through the left nostril (Ida Nadi) connects with the lunar, cooling, intuitive, parasympathetic current. Inhaling through the right nostril (Pingala Nadi) connects with the solar, warming, logical, sympathetic current. When balanced, energy ascends the central channel (Sushumna Nadi).',
    whatModernScienceSays: 'Neuro-imaging and autonomic testing show that alternate nostril breathing rapidly modulates sympathetic and parasympathetic balance, stimulates the vagus nerve via baroreceptor sensitivity, and optimizes Heart Rate Variability (HRV).',
    coreMovementsOrTechniques: [
      {
        name: 'Vishnu Mudra Hand Position',
        instruction: 'Fold the index and middle fingers of the right hand into the palm. Use the right thumb to gently close the right nostril, and the ring/pinky fingers to close the left nostril.',
        breathCoordination: 'Breath must be silent, smooth, and unbroken like pouring warm oil.',
        targetFasciaOrEnergyConduit: 'Ida & Pingala Nadis / Vagus Nerve'
      },
      {
        name: 'Classical 4-4-4-4 Ratio Flow',
        instruction: 'Close right nostril, inhale left for 4s. Close both nostrils, hold gently for 4s. Release right nostril, exhale right for 4s. Inhale right for 4s. Close both, hold for 4s. Release left, exhale left for 4s. This constitutes one complete round.',
        breathCoordination: 'Rhythmic, calm 1:1:1:1 cadence; can transition to 4-0-4-0 for beginners.',
        targetFasciaOrEnergyConduit: 'Autonomic Balance / Prefrontal Cortex'
      }
    ],
    idealFrequency: '5–10 minutes in the morning and before sleep'
  },
  {
    id: 'bhramari-pranayama',
    name: 'Bhramari (Humming Bee Breath)',
    system: 'Pranayama (Breath Science)',
    lineage: 'Classical Yogic Science (Gheranda Samhita)',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    summary: 'A therapeutic breath practice where the practitioner produces a steady, low-frequency buzzing hum on a long exhalation, accompanied by closing the external senses (Shanmukhi Mudra). The internal acoustic vibration creates a massive surge in endogenous nasal nitric oxide.',
    physicalImpact: [
      'Generates a 15-fold increase in nasal airway Nitric Oxide (NO) production, a potent antiviral and vasodilator.',
      'Vibrates the cranial bones, clearing mucus and promoting micro-circulation in the paranasal sinuses.',
      'Lowers systemic vascular resistance and reduces arterial blood pressure.',
      'Stimulates auricular branches of the vagus nerve in the external ear canal.'
    ],
    neurologicalAndMentalImpact: [
      'The internal acoustic resonance soothes the cranial nerves and shuts down hyperactive default-mode rumination.',
      'Induces dominant Theta and Alpha brainwave states associated with deep restorative calm.',
      'Rapidly alleviates acute panic attacks, rage, and overwhelming sensory over-stimulation.',
      'Soothes neurogenic tinnitus and tension headaches.'
    ],
    whatTraditionSays: '"The breath sounds like the gentle humming of a female black bee (Bhramari). Through this practice, bliss arises in the hearts of yogis, and the mind becomes completely dissolved in the divine sound (Nada)."',
    whatModernScienceSays: 'Karolinska Institute researchers confirmed that nasal humming increases nasal nitric oxide exchange by 1500% compared to silent breathing. Nitric oxide dilates pulmonary capillaries and possesses direct antimicrobial and antiviral properties.',
    coreMovementsOrTechniques: [
      {
        name: 'Shanmukhi Mudra (Closing the Six Gates)',
        instruction: 'Place thumbs gently over the ear tragus to close off sound. Rest index fingers gently over closed eyelids, middle fingers alongside the nostrils, ring fingers above upper lip, and pinkies below lower lip. Keep shoulders relaxed and spine straight.',
        breathCoordination: 'Deep slow diaphragmatic inhalation through both nostrils.',
        targetFasciaOrEnergyConduit: 'Cranial Nerves (Vagus, Trigeminal, Facial) & Ajna Chakra'
      },
      {
        name: 'The Resonant Humming Exhalation',
        instruction: 'With mouth closed and teeth slightly separated, make a continuous, smooth, low-pitched humming sound ("Mmmmmm") at the back of the throat throughout the entire exhalation. Feel the vibration resonate in the skull, teeth, and chest.',
        breathCoordination: 'Exhale slowly for 10–15 seconds while humming; repeat for 6–10 rounds.',
        targetFasciaOrEnergyConduit: 'Paranasal Sinus Mucosa & Vagal Sensory Network'
      }
    ],
    idealFrequency: '5 minutes whenever experiencing mental stress, overwhelm, or sinus congestion'
  }
];

// ============================================================================
// MERIDIANS, PRESSURE POINTS & ACUPUNCTURE (SCIENCE & TRADITION)
// ============================================================================

export const ACUPRESSURE_POINTS: AcupressurePoint[] = [
  {
    id: 'li4-hegu',
    code: 'LI4',
    pinyinName: 'Hé Gǔ',
    englishName: 'Union Valley',
    meridian: 'Large Intestine Meridian (Hand Yangming)',
    elementAssociation: 'Metal',
    anatomicalLocation: 'On the dorsum of the hand, between the 1st and 2nd metacarpal bones, in the middle of the 2nd metacarpal bone on the radial side. At the highest point of the muscle mound when the thumb and index finger are brought together.',
    bodyZone: 'Wrists & Hands',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    traditionalIndication: 'The supreme Yuan-Source point of the Large Intestine meridian and the commanding point for all disorders of the head, face, eyes, nose, mouth, and teeth. Clears exterior wind-heat, relieves acute and chronic pain, unblocks stagnation in the entire meridian, and induces labor.',
    scientificMechanism: {
      neurovascularPathway: 'Stimulates the first dorsal interosseous muscle, innervated by the deep branch of the ulnar nerve and sensory branches of the radial nerve. Impulses travel up the spinal cord to the periaqueductal gray (PAG) matter in the midbrain, triggering descending pain-inhibitory cascades.',
      activeBiomarkers: [
        'Endorphin & Dynorphin cascade in cerebrospinal fluid',
        'Inhibition of Substance P in spinal dorsal horn',
        'Functional MRI shows deactivation of limbic pain matrices'
      ],
      clinicalEvidence: 'Extensive randomized trials confirm LI4 acupressure provides rapid, statistically significant relief for tension-type headaches, dental pain, dysmenorrhea, and post-operative nausea.'
    },
    howToStimulate: {
      technique: 'Pinch the fleshy web between thumb and index finger using the opposite thumb on top and index finger underneath. Apply firm, circular pressure toward the bone of the second finger.',
      pressureDepth: 'Firm, sustained pressure until a distinct "De Qi" sensation (deep, dull, achy distension or mild tingling) is experienced.',
      durationSeconds: 90,
      breathingSync: 'Take 6 deep, slow diaphragmatic breaths while maintaining circular pressure. Switch hands and repeat.'
    },
    precautions: 'CONTRAINDICATED IN PREGNANCY. Because LI4 stimulates strong downward descending Qi and uterine contractions, it must never be used during pregnancy until full labor has begun.',
    isContraindicatedInPregnancy: true
  },
  {
    id: 'pc6-neiguan',
    code: 'PC6',
    pinyinName: 'Nèi Guān',
    englishName: 'Inner Pass',
    meridian: 'Pericardium Meridian (Hand Jueyin)',
    elementAssociation: 'Fire',
    anatomicalLocation: 'On the palmar aspect of the forearm, 2 cun (approximately 3 finger-breadths) above the transverse crease of the wrist, located precisely between the tendons of the palmaris longus and flexor carpi radialis muscles.',
    bodyZone: 'Wrists & Hands',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    traditionalIndication: 'Luo-Connecting point of the Pericardium and confluent point of the Yin Linking (Yin Wei) vessel. Calms the Shen (heart-spirit), unbinds the chest, regulates Heart Qi, soothes nausea, hiccups, and stomach pain, and treats insomnia.',
    scientificMechanism: {
      neurovascularPathway: 'Directly overlies the median nerve. Stimulation sends afferent impulses via the median nerve to the nucleus tractus solitarius (NTS) in the brainstem, which regulates the vomiting center, vagal cardiac reflexes, and gastric motility.',
      activeBiomarkers: [
        'Suppresses neurokinin-1 and serotonin 5-HT3 emetic signals',
        'Elevates cardiac vagal tone and heart rate variability (HRV)',
        'Local adenosine A1 receptor release'
      ],
      clinicalEvidence: 'World-renowned medical validation: Cochrane systematic reviews confirm PC6 acupressure and acupuncture are as effective as prescription anti-emetic medications (ondansetron/Zofran) for postoperative nausea, morning sickness, and chemotherapy nausea.'
    },
    howToStimulate: {
      technique: 'Place three fingers of opposite hand across inner wrist crease to find the 2 cun distance. Press thumb deeply between the two prominent tendons. Massage with steady, firm circular pressure.',
      pressureDepth: 'Moderate to deep pressure with a sensation of mild tingling or fullness radiating toward the fingers.',
      durationSeconds: 120,
      breathingSync: 'Inhale for 4 seconds, exhale for 6 seconds while pressing, consciously releasing tightness in the diaphragm and throat.'
    },
    precautions: 'Extremely safe point for all populations, including pregnant women suffering from morning sickness and motion-sickness travelers.',
    isContraindicatedInPregnancy: false
  },
  {
    id: 'st36-zusanli',
    code: 'ST36',
    pinyinName: 'Zú Sān Lǐ',
    englishName: 'Leg Three Miles',
    meridian: 'Stomach Meridian (Foot Yangming)',
    elementAssociation: 'Earth',
    anatomicalLocation: 'On the anterior-lateral aspect of the lower leg, 3 cun (four finger-breadths) inferior to the lateral hollow of the patella ("eye of the knee"), and one finger-breadth lateral to the anterior crest of the tibia.',
    bodyZone: 'Legs & Feet',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    traditionalIndication: 'He-Sea and Earth point of the Stomach meridian. Considered the single most important longevity, vitality, and digestive point in Chinese medicine. "If an old person massages Zusanli daily, they can walk another three miles." Harmonizes stomach, tonifies Qi and Blood, strengthens immune defense.',
    scientificMechanism: {
      neurovascularPathway: 'Overlies the deep peroneal nerve, anterior tibial artery, and tibialis anterior muscle. Research by Harvard neuroscientist Dr. Qiufu Ma discovered that ST36 electro-acupuncture specifically drives the sciatic-vagal-adrenal anti-inflammatory neuro-axis, suppressing lethal cytokine storms.',
      activeBiomarkers: [
        'Suppresses systemic TNF-alpha, IL-6, and HMGB1 via vagal nerve stimulation',
        'Enhances dopamine secretion from adrenal chromaffin cells',
        'Accelerates gastric emptying and improves intestinal peristalsis'
      ],
      clinicalEvidence: 'Substantiated in over 1,000 biomedical papers: enhances immune natural killer cell activity, speeds post-surgical ileus recovery, reduces fatigue in cancer patients, and strengthens lower limb neuromuscular stamina.'
    },
    howToStimulate: {
      technique: 'Use thumb or knuckles to apply deep, rhythmic, circular pressure into the tender depression lateral to the shinbone.',
      pressureDepth: 'Firm, robust pressure. A warm, spreading ache radiating down the foot confirms accurate location.',
      durationSeconds: 180,
      breathingSync: 'Breathe deeply while visualizing energy circulating through the digestive organs and legs.'
    },
    precautions: 'Safe for general maintenance; traditionally avoided in high-risk pregnancies during early first trimester.',
    isContraindicatedInPregnancy: false
  },
  {
    id: 'lv3-taichong',
    code: 'LV3',
    pinyinName: 'Tài Chōng',
    englishName: 'Great Surge',
    meridian: 'Liver Meridian (Foot Jueyin)',
    elementAssociation: 'Wood',
    anatomicalLocation: 'On the dorsum of the foot, in the hollow distal to the junction of the 1st and 2nd metatarsal bones, approximately 1.5 to 2 cun proximal to the web between the great toe and second toe.',
    bodyZone: 'Legs & Feet',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    traditionalIndication: 'Yuan-Source and Shu-Stream point of the Liver meridian. The master point to soothe Liver Qi stagnation, extinguish Liver fire, subdue Liver Yang rising, and regulate menstruation. Essential for emotional frustration, irritability, PMS, headaches, eye strain, and high blood pressure.',
    scientificMechanism: {
      neurovascularPathway: 'Branches of the deep peroneal nerve and dorsal venous arch of foot. Stimulation decreases sympathetic vascular tone, dilates peripheral arterioles, and down-regulates stress-induced hypothalamic activation.',
      activeBiomarkers: [
        'Suppresses norepinephrine release from sympathetic nerve endings',
        'Reduces blood pressure via endothelial nitric oxide release',
        'Normalizes EEG theta/alpha rhythms in emotional distress'
      ],
      clinicalEvidence: 'Frequently paired with LI4 (the celebrated "Four Gates" / Si Guan combination) to treat generalized anxiety, intractable tension headaches, depression, and severe muscular spasms.'
    },
    howToStimulate: {
      technique: 'Slide your index finger up the groove between big toe and second toe until it catches in the natural "V" notch between the bones. Press firmly downwards toward the sole of the foot.',
      pressureDepth: 'Deep, deliberate pressure. It is often very tender in stressed individuals.',
      durationSeconds: 120,
      breathingSync: 'Exhale fully with an audible sigh to release stuck liver tension and anger.'
    },
    precautions: 'Use gentler pressure in frail or severely depleted individuals.',
    isContraindicatedInPregnancy: false
  },
  {
    id: 'sp6-sanyinjiao',
    code: 'SP6',
    pinyinName: 'Sān Yīn Jiāo',
    englishName: 'Three Yin Intersection',
    meridian: 'Spleen Meridian (Foot Taiyin)',
    elementAssociation: 'Earth',
    anatomicalLocation: 'On the medial side of the lower leg, 3 cun (four finger-breadths) superior to the prominence of the medial malleolus (inner ankle bone), immediately posterior to the medial border of the tibia.',
    bodyZone: 'Legs & Feet',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    traditionalIndication: 'The monumental crossing point where all three Yin meridians of the leg (Spleen, Liver, and Kidney) intersect. Tonifies Spleen and Kidney, harmonizes the Liver, resolves dampness, regulates urination and menstruation, treats insomnia, and nourishes Yin.',
    scientificMechanism: {
      neurovascularPathway: 'Overlies the tibial nerve and posterior tibial artery. Sends neural afferents through sacral and lumbar plexuses (L4–S2) governing the pelvic autonomic nervous system and reproductive organs.',
      activeBiomarkers: [
        'Modulates gonadotropin-releasing hormone (GnRH) and prostaglandin F2-alpha',
        'Relaxes uterine smooth muscle hyper-contractility',
        'Down-regulates central pelvic pain perception'
      ],
      clinicalEvidence: 'Exhaustive clinical trials confirm SP6 acupressure dramatically reduces primary dysmenorrhea pain intensity and duration, shortens labor when applied at term, and alleviates menopausal hot flashes and insomnia.'
    },
    howToStimulate: {
      technique: 'Place four fingers above the inner ankle bone. Slide thumb directly behind the shinbone into the tender muscular groove. Apply sustained circular pressure.',
      pressureDepth: 'Moderate to firm pressure with circular kneading.',
      durationSeconds: 120,
      breathingSync: 'Long, slow abdominal breaths, directing warm attention into the lower pelvis.'
    },
    precautions: 'STRICTLY CONTRAINDICATED DURING PREGNANCY until full 40-week term, as it induces uterine contractions and stimulates downward pelvic blood flow.',
    isContraindicatedInPregnancy: true
  },
  {
    id: 'gb20-fengchi',
    code: 'GB20',
    pinyinName: 'Fēng Chí',
    englishName: 'Wind Pool',
    meridian: 'Gallbladder Meridian (Foot Shaoyang)',
    elementAssociation: 'Wood',
    anatomicalLocation: 'At the posterior base of the skull, in the prominent hollow between the origins of the sternocleidomastoid (SCM) and trapezius muscles, level with the earlobes.',
    bodyZone: 'Head & Neck',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    traditionalIndication: 'Crucial meeting point of the Gallbladder, San Jiao, Yang Motility, and Yang Linking vessels. Dispels exterior and interior wind, clears the head and eyes, alleviates neck rigidity, treats occipital headaches, dizziness, and mental fatigue.',
    scientificMechanism: {
      neurovascularPathway: 'Overlies the greater occipital nerve and occipital artery. Pressure releases chronic contracture in suboccipital triangle muscles (rectus capitis and obliquus capitis), improving vertebral arterial hemodynamics to the visual cortex and brainstem.',
      activeBiomarkers: [
        'Relieves compression on the greater occipital nerve',
        'Improves cerebral basilar arterial blood flow',
        'Suppresses myofascial trigger point tension'
      ],
      clinicalEvidence: 'Highly validated for tension-type headaches, cervicogenic vertigo, cervical spine spondylosis, visual fatigue from digital screens, and insomnia.'
    },
    howToStimulate: {
      technique: 'Interlace fingers behind the back of head, resting thumbs into the hollows beneath the skull base. Push thumbs upward toward the opposite eye while tilting head slightly backward.',
      pressureDepth: 'Firm, deeply satisfying upward and inward pressure.',
      durationSeconds: 120,
      breathingSync: 'Close your eyes, breathe into the base of the brain, and feel mental strain dissolving.'
    },
    precautions: 'Do not jab sharply; use smooth, controlled, upward-angled thumb pressure.',
    isContraindicatedInPregnancy: false
  },
  {
    id: 'gv20-baihui',
    code: 'GV20',
    pinyinName: 'Bǎi Huì',
    englishName: 'Hundred Meetings',
    meridian: 'Governing Vessel (Du Mai)',
    elementAssociation: 'Yang Master Conductor',
    anatomicalLocation: 'At the vertex of the head, on the midline, directly in line with the apex of the ears. Fold the ears forward to find the highest point on the crown.',
    bodyZone: 'Head & Neck',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    traditionalIndication: 'The crown meeting place of all Yang meridians of the body. Raises fallen Yang Qi, pacifies internal wind, stabilizes the spirit, clears the sensory orifices, and treats mental exhaustion, prolapse, dizziness, and chronic sadness.',
    scientificMechanism: {
      neurovascularPathway: 'Galea aponeurotica and branches of the supraorbital and supratrochlear nerves. Modulates central autonomic tone and induces synchronous alpha and theta brainwave rhythms.',
      activeBiomarkers: [
        'Increases cerebral cortical perfusion',
        'Normalizes parasympathetic-sympathetic balance',
        'Promotes subjective mental tranquility'
      ],
      clinicalEvidence: 'Documented to elevate cognitive attention, ease symptoms of depression and anxiety, relieve orthostatic dizziness, and calm mental over-excitability.'
    },
    howToStimulate: {
      technique: 'Place the tip of the middle finger or thumb directly on the crown center. Apply gentle, rhythmic circular pressure or light tapping.',
      pressureDepth: 'Gentle to moderate pressure; does not require heavy force.',
      durationSeconds: 90,
      breathingSync: 'Imagine a warm beam of sunlight entering through the crown of the head down the spine.'
    },
    precautions: 'Gentle pressure on infants (open fontanelle); safe for all adults.',
    isContraindicatedInPregnancy: false
  },
  {
    id: 'ht7-shenmen',
    code: 'HT7',
    pinyinName: 'Shén Mén',
    englishName: 'Spirit Gate',
    meridian: 'Heart Meridian (Hand Shaoyin)',
    elementAssociation: 'Fire',
    anatomicalLocation: 'On the wrist crease, in the depression on the radial side of the flexor carpi ulnaris tendon, just proximal to the pisiform bone (outer edge of the inner wrist crease, pinky side).',
    bodyZone: 'Wrists & Hands',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    traditionalIndication: 'Yuan-Source and Shu-Stream point of the Heart meridian. The primary point to nourish Heart Blood, calm the Shen (mind-spirit), soothe emotional agitation, relieve cardiac palpitations, and resolve severe insomnia and restless dreams.',
    scientificMechanism: {
      neurovascularPathway: 'Adjacent to the ulnar nerve and ulnar artery. Afferent signals modulate cardiac autonomic plexuses and the dorsal vagal motor nucleus, restoring healthy heart rate variability (HRV).',
      activeBiomarkers: [
        'Suppresses sympathetic tachycardia',
        'Promotes endogenous melatonin secretion',
        'Reduces salivary cortisol spikes'
      ],
      clinicalEvidence: 'Extensively studied for sleep disorders: clinical trials demonstrate acupressure on HT7 significantly improves sleep efficiency, shortens sleep onset latency, and eases anxiety in coronary patients and elders.'
    },
    howToStimulate: {
      technique: 'Use thumb tip to press into the small notch directly behind the pisiform bone on the pinky-side wrist crease. Gently rotate thumb in micro-circles.',
      pressureDepth: 'Gentle to moderate, soothing pressure.',
      durationSeconds: 90,
      breathingSync: 'Breathe softly and slowly, visualizing the heart resting in peaceful quiet.'
    },
    precautions: 'Safe and beneficial for all ages.',
    isContraindicatedInPregnancy: false
  },
  {
    id: 'kd1-yongquan',
    code: 'KD1',
    pinyinName: 'Yǒng Quán',
    englishName: 'Gushing Spring',
    meridian: 'Kidney Meridian (Foot Shaoyun)',
    elementAssociation: 'Water',
    anatomicalLocation: 'On the sole of the foot, in the depression formed when the foot is plantar flexed, approximately at the junction of the anterior third and posterior two-thirds of the sole, between the 2nd and 3rd metatarsal bones.',
    bodyZone: 'Legs & Feet',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
    traditionalIndication: 'Jing-Well and Wood point of the Kidney meridian; the lowest, most grounding acupoint on the human body. Descends excess Heat, fire, and Yang from the head; calms the spirit, revives consciousness, restores deep kidney root essence, and anchors floating anxiety.',
    scientificMechanism: {
      neurovascularPathway: 'Plantar aponeurosis and medial plantar nerve. High concentration of mechanoreceptors and sensory pacinian corpuscles trigger immediate spinal somatosensory grounding reflexes, down-regulating cerebral hyper-perfusion.',
      activeBiomarkers: [
        'Promotes peripheral vasodilation to lower acute hypertensive surges',
        'Calms sympathetic fight-or-flight hyper-arousal',
        'Enhances somatosensory balance stability'
      ],
      clinicalEvidence: 'Proven effective for reducing agitated delirium, lowering acute blood pressure spikes, relieving insomnia, and soothing sensory overload.'
    },
    howToStimulate: {
      technique: 'Firmly press thumb or knuckle into the center depression of the sole. Rub with strong, warming friction until a deep sensation of heat radiates into the sole.',
      pressureDepth: 'Firm, vigorous, warming pressure.',
      durationSeconds: 120,
      breathingSync: 'Inhale into the soles of the feet, exhaling any tension or racing thoughts directly into the earth.'
    },
    precautions: 'Excellent nightly point for grounding and deep rest.',
    isContraindicatedInPregnancy: false
  }
];

// ============================================================================
// PHILOSOPHICAL ESSAYS & SCIENTIFIC SYNTHESIS
// ============================================================================

export const HOLISTIC_SYNTHESIS_ESSAYS = [
  {
    id: 'respect-and-science',
    title: 'The Sacred Confluence: Millennia of Wisdom Meets Contemporary Science',
    subtitle: 'Why Ancient Holistic Traditions Deserve Utmost Reverence and Rigorous Scientific Honor',
    author: 'Plajah Holistic Health & Integrative Science Council',
    readTimeMinutes: 6,
    content: `
For thousands of years before the advent of modern pharmaceuticals, human civilizations observed nature with extraordinary patience, reverence, and empirical discernment. Indigenous herbalists, Ayurvedic Vaidyas, Traditional Chinese Medicine doctors, and Mediterranean monastic healers mapped the relationships between human physiology, botanical chemistry, planetary rhythms, and mental consciousness.

Far from being "primitive superstition," traditional medicine was humanity\'s first rigorous empirical laboratory. When traditional texts described herbs in terms of "cooling," "warming," "tonifying Qi," or "drying dampness," they were utilizing a sophisticated metaphorical taxonomy to describe what modern biochemistry now quantifies as:
- **Down-regulation of NF-κB and inflammatory cytokines** (Cooling / Clearing Fire)
- **Mitochondrial biogenesis and ATP synthesis upregulation** (Tonifying Qi / Boosting Prana)
- **Modulation of the Hypothalamic-Pituitary-Adrenal (HPA) axis** (Adaptogenic balance / Nourishing Ojas)
- **Cellular autophagy and clearance of advanced glycation end-products (AGEs)** (Scraping Ama / Dispelling Dampness)

When we examine the history of modern pharmacology, we discover that over 40% of all prescription medicines originate directly from traditional botanical knowledge:
- **Aspirin (Acetylsalicylic acid)** from White Willow Bark (*Salix alba*)
- **Morphine** from the Opium Poppy (*Papaver somniferum*)
- **Metformin**, the world\'s leading diabetes medicine, derived from French Lilac (*Galega officinalis*)
- **Artemisinin**, the Nobel Prize-winning malaria drug discovered by Dr. Tu Youyou directly from a 1,600-year-old Traditional Chinese Medicine recipe for Sweet Wormwood (*Artemisia annua*).

Treating holistic health with the honor it deserves means rejecting two false extremes:
1. Dismissing ancient traditions as unscientific folklore.
2. Promoting ungrounded claims that ignore safety, dosage, and pharmacology.

True integrative health is the harmonious marriage of both: honoring the sacred lineage, cultural stewardship, and whole-plant synergistic intelligence of ancestral practices, illuminated by double-blind randomized clinical trials, mass-spectrometry phytochemical analysis, and neuro-imaging.
    `
  },
  {
    id: 'acupuncture-science-demystified',
    title: 'How Acupuncture & Meridians Actually Work in the Body',
    subtitle: 'From Qi and Jingluo to Fascial Cleavage Planes, Adenosine Signaling, and Vagal Anti-inflammatory Pathways',
    author: 'Neuro-Fascial Research Group',
    readTimeMinutes: 7,
    content: `
For decades in the Western medical world, acupuncture was met with skepticism because anatomical dissections could not find visible "tubes" corresponding to the 12 classical meridians (Jingluo). However, over the past twenty years, groundbreaking imaging, connective tissue biomechanics, and purinergic neurobiology have solved this mystery.

### 1. The Living Fascial Matrix (Connective Tissue Cleavage Planes)
Dr. Helene Langevin, Director of the National Center for Complementary and Integrative Health (NCCIH) at the NIH and former professor of neurology at Harvard, conducted pioneering ultrasound studies demonstrating that **over 80% of classical acupuncture points and 50% of meridian pathways correspond precisely with intermuscular and intramuscular connective tissue cleavage planes**.

When an acupuncture needle is gently inserted and rotated (or when deep acupressure is applied), the surrounding loose subcutaneous collagen fibers wind around the needle like thread on a spindle. This mechanical deformation:
- Sends a wave of mechanical tension through the continuous full-body fascial web.
- Triggers mechanical transduction inside fibroblasts, releasing chemical signals across meters of bodily tissue.
- Generates piezoelectric bio-electric currents that travel along low-electrical-impedance pathways — matching ancient descriptions of Qi.

### 2. Purinergic Signaling & Local Adenosine Release
Research published in *Nature Neuroscience* by Dr. Maiken Nedergaard demonstrated that mechanical stimulation of acupuncture points causes local cells to release massive amounts of **adenosine triphosphate (ATP)**, which is rapidly hydrolyzed into **adenosine**.
Adenosine binds to local **A1 adenosine receptors** on peripheral sensory nerve fibers, which:
- Shuts down local pain signaling instantly for hours.
- Induces local vasodilation and tissue oxygenation.
- Explains why the relief from acupuncture and acupressure is sustained long after the needle or pressure is removed.

### 3. Central Endorphin Cascades & Brainstem Vagal Circuits
When afferent A-delta and C nerve fibers at points like ST36 (Zusanli) or LI4 (Hegu) are stimulated, they travel up the spinothalamic tract to the periaqueductal gray (PAG) and arcuate nucleus of the hypothalamus, prompting the systemic release of **beta-endorphins, enkephalins, and dynorphins** into cerebrospinal fluid.

Furthermore, Harvard neuroscientist Dr. Qiufu Ma discovered in *Nature* that ST36 electro-acupuncture specifically drives the **vagal-adrenal anti-inflammatory pathway**, inducing the adrenal glands to secrete dopamine that binds to receptors on splenic macrophages, switching off lethal systemic cytokine storms.

Tradition and science are speaking the exact same truth in different languages: Tradition speaks in poetry of Qi, Yin-Yang, and Meridians; Science speaks in the syntax of Fascia, Adenosine, Endorphins, and the Vagus Nerve. Both reveal the awe-inspiring, self-healing interconnectedness of the human body.
    `
  }
];
