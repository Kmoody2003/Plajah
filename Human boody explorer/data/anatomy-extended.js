// ============================================================
//  anatomy-extended.js — Plajah Human Body Explorer
//  Extended organ data: remaining structures head-to-toe
//  Appended to window.ANATOMY after anatomy.js loads
// ============================================================

(function () {
  const extra = [

  // ── EARS ──────────────────────────────────────────────────────
  {
    id: "ears",
    name: "Ears",
    medicalName: "Aures / Organum Vestibulocochleare",
    system: "sensory",
    sex: "both",
    svgZone: "head-sides",
    icon: "👂",
    description: "Your ears do double duty: they're the organs of hearing AND balance. The outer ear funnels sound waves to the eardrum; the middle ear amplifies vibrations through three tiny bones (the smallest in your body); and the fluid-filled inner ear converts those vibrations to electrical nerve signals — while simultaneously detecting gravity and head movement for balance.",
    medicalDescription: "The organum vestibulocochleare comprises three anatomical regions: the auricle and external auditory meatus (outer ear), the tympanic membrane and ossicular chain (malleus, incus, stapes) in the middle ear, and the membranous labyrinth of the inner ear — containing the cochlea (hearing) and vestibular apparatus (semicircular canals + utricle/saccule for balance). Innervated by CN VIII (vestibulocochlear nerve).",
    function: "Hearing: sound waves → tympanic membrane vibration → ossicular chain amplification (×20 mechanical advantage) → oval window → cochlear fluid waves → basilar membrane displacement → hair cell depolarization → CN VIII → auditory cortex. Balance: semicircular canals detect rotational acceleration; utricle/saccule detect linear acceleration and gravity via otolithic membranes.",
    vitamins: [
      { name: "Vitamin D", role: "Deficiency linked to sensorineural hearing loss and otosclerosis (abnormal bone growth)" },
      { name: "Folate (B9)", role: "Low folate associated with age-related hearing loss; protects cochlear vasculature" },
      { name: "Vitamin C", role: "Antioxidant protecting cochlear hair cells from noise-induced oxidative damage" },
      { name: "Vitamin E", role: "Combined with C and Mg shown to reduce noise-induced hearing loss in studies" }
    ],
    minerals: [
      { name: "Magnesium", role: "Protects against noise-induced hearing loss by preventing cochlear vasoconstriction" },
      { name: "Zinc", role: "High concentration in cochlea; deficiency linked to tinnitus and hearing loss in elderly" },
      { name: "Iron", role: "Anemia impairs oxygen delivery to cochlea's stria vascularis, causing hearing loss" },
      { name: "Potassium", role: "Endolymph has uniquely high K⁺ (150mEq/L) maintained by stria vascularis — essential for hair cell function" }
    ],
    cellTypes: [
      { name: "Inner hair cells (~3,500)", description: "The true sensory cells of hearing. Mechanosensory stereocilia deflect with basilar membrane movement → tip links stretch → K⁺ channels open → depolarization → glutamate release → cochlear nerve firing. Each is contacted by 95% of all auditory nerve fibers." },
      { name: "Outer hair cells (~12,000)", description: "Act as biological amplifiers — they actively change length (electromotility) via prestin protein to amplify basilar membrane motion up to 1000-fold, enabling hearing of very quiet sounds (0–20 dB)." },
      { name: "Type I vestibular hair cells", description: "Flask-shaped cells in maculae detecting linear acceleration; stereocilia deflect when otolithic membrane shifts due to gravity or acceleration." },
      { name: "Stria vascularis cells", description: "Highly vascular epithelium lining the cochlear duct; maintain the endocochlear potential (+80mV) that drives hair cell depolarization." }
    ],
    bloodFlow: "Inner ear supplied by the labyrinthine artery (branch of anterior inferior cerebellar artery — AICA) with virtually no collateral circulation, making it extremely vulnerable to vascular events. The cochlea has no lymphatics — waste removed by perilymph circulation.",
    fluidRole: "Two separate fluid compartments: perilymph (resembles CSF; high Na⁺, low K⁺) fills the scala vestibuli and tympani; endolymph (unique composition; high K⁺, low Na⁺) fills the scala media. The electrochemical gradient between them powers hair cell transduction. Endolymph overproduction causes Ménière's disease (hydrops).",
    cellularProcess: "Sound → stereocilia bundle deflects toward tallest → tip links tighten → MET (mechanotransduction) channels open → K⁺ and Ca²⁺ enter from high-K⁺ endolymph → depolarization → basolateral Ca²⁺-gated K⁺ channels repolarize → voltage oscillations → calcium triggers glutamate vesicle release → afferent nerve fires. Tonotopic organization: high frequencies encoded at cochlear base (stiff basilar membrane), low frequencies at apex (flexible).",
    conditions: [
      { name: "Sensorineural Hearing Loss", description: "Permanent hair cell or cochlear nerve damage from noise, aging (presbycusis), ototoxic drugs, or viral infection" },
      { name: "Ménière's Disease", description: "Endolymph hydrops causing episodic vertigo, fluctuating hearing loss, tinnitus, and ear fullness" },
      { name: "Otitis Media", description: "Bacterial/viral middle ear infection causing effusion, pain, and conductive hearing loss; most common in children" },
      { name: "Tinnitus", description: "Phantom sounds (ringing, buzzing) from aberrant neural activity in auditory pathways" }
    ],
    fact: "The stapes (stirrup bone) in your inner ear is the smallest bone in the human body at just 2.8mm. The cochlea, if uncoiled, would be 35mm long and contain 16,000 hair cells that you are born with and cannot regenerate if damaged."
  },

  // ── NOSE & SINUSES ────────────────────────────────────────────
  {
    id: "nose",
    name: "Nose & Sinuses",
    medicalName: "Nasus / Sinus Paranasales",
    system: "respiratory",
    sex: "both",
    svgZone: "head-center",
    icon: "👃",
    description: "Your nose is the gateway and guardian of your respiratory system — it filters, warms, and humidifies every breath you take. Specialized olfactory neurons in the nasal roof can detect over 10,000 distinct odors. The four pairs of hollow sinuses (maxillary, frontal, ethmoid, sphenoid) lighten the skull and add resonance to your voice.",
    medicalDescription: "The nasus externus and cavitas nasi are separated by the nasal septum into two passages. Turbinates (conchae) create turbulent airflow maximizing contact time with mucosa. The olfactory epithelium (~5cm²) in the roof contains olfactory receptor neurons projecting directly to the olfactory bulb via CN I. Paranasal sinuses drain into the nasal cavity via ostia.",
    function: "Filtration: nasal hairs (vibrissae) trap particles >10μm; mucus traps finer particles; cilia sweep toward pharynx. Warming: inspired air heated to ~37°C by turbinate vasculature. Humidification: air reaches 100% relative humidity before lungs. Olfaction: ~400 types of olfactory receptors detect odors. Voice resonance: sinuses act as sound chambers.",
    vitamins: [
      { name: "Vitamin A", role: "Essential for nasal mucosa integrity and normal ciliary function; deficiency causes squamous metaplasia of respiratory epithelium" },
      { name: "Vitamin C", role: "Antioxidant in nasal secretions; supports immune defense against inhaled pathogens" },
      { name: "Vitamin D", role: "Regulates antimicrobial peptide (defensin, cathelicidin) production in nasal mucosa" }
    ],
    minerals: [
      { name: "Zinc", role: "Zinc nasal spray used for cold prevention; zinc lozenges may shorten rhinovirus duration" },
      { name: "Selenium", role: "Required for glutathione peroxidase in nasal mucosa protecting against inhaled oxidants" }
    ],
    cellTypes: [
      { name: "Olfactory receptor neurons (ORNs)", description: "Bipolar neurons with 10–30 specialized cilia bearing olfactory receptor proteins (G-protein coupled). Each neuron expresses only ONE of the ~400 receptor types. Unique among CNS neurons: they regenerate every 30–60 days from basal stem cells." },
      { name: "Respiratory epithelial cells (pseudostratified)", description: "Ciliated columnar cells covering the respiratory nasal mucosa. Each cell bears ~200 cilia beating 10–15x/second in coordinated waves, propelling mucus toward the nasopharynx at ~6mm/min." },
      { name: "Bowman's gland cells", description: "Serous glands in the olfactory region secreting a watery fluid that dissolves odorant molecules, enabling them to reach olfactory receptor cilia." }
    ],
    bloodFlow: "Nasal mucosa is extremely vascular — a deep capillary plexus under the turbinate epithelium acts as a heat exchanger, warming inspired air. Subepithelial sinusoids can engorge dramatically (nasal cycle: alternating congestion L/R every 2–6 hours). Epistaxis (nosebleed) usually originates from Kiesselbach's plexus (Little's area) on the anterior septum where five arteries anastomose.",
    fluidRole: "Nasal mucosa produces ~1–2L of mucus daily, moving on a biphasic mucus blanket: low-viscosity sol layer (periciliary fluid) in which cilia beat freely, topped by a viscous gel layer trapping inhaled particles. IgA antibodies in mucus neutralize pathogens.",
    cellularProcess: "Olfaction: odorant molecule dissolves in mucus → binds GPCR olfactory receptor → Golf protein activates adenylyl cyclase III → cAMP opens CNG channels → Ca²⁺ influx → Ca²⁺-activated Cl⁻ channels amplify depolarization → action potential in ORN axon → olfactory bulb glomeruli → piriform cortex and amygdala (emotional/memory processing). Smell bypasses the thalamus — the only sense with direct limbic access, explaining why scents trigger powerful memories.",
    conditions: [
      { name: "Chronic Rhinosinusitis (CRS)", description: "Persistent mucosal inflammation of sinuses (>12 weeks), often with polyps; impairing nasal breathing and smell" },
      { name: "Anosmia", description: "Loss of smell from viral damage (post-COVID), head trauma, or nasal polyps; severely impairs taste" },
      { name: "Allergic Rhinitis", description: "IgE-mediated mast cell degranulation triggered by allergens causing histamine-driven sneezing and congestion" }
    ],
    fact: "Your nose can detect the smell of a drop of perfume diffused through a three-bedroom house. The olfactory system is so closely wired to memory that a smell can trigger a vivid recollection from 40 years ago more reliably than any other sense."
  },

  // ── MOUTH, TONGUE & SALIVARY GLANDS ──────────────────────────
  {
    id: "mouth",
    name: "Mouth, Tongue & Salivary Glands",
    medicalName: "Cavitas Oris / Lingua / Glandulae Salivariae",
    system: "digestive",
    sex: "both",
    svgZone: "head-lower",
    icon: "👅",
    description: "Your mouth is where digestion begins — not in the stomach. Saliva starts breaking down starches before you swallow. Your tongue's 10,000 taste buds detect 5 basic tastes (sweet, salty, sour, bitter, umami), while also manipulating food, helping form speech sounds, and providing immune defense via antibodies in saliva.",
    medicalDescription: "The oral cavity is bounded by the lips, cheeks, hard and soft palate, and floor of mouth. Three paired major salivary glands (parotid, submandibular, sublingual) plus thousands of minor salivary glands produce 1–1.5L of saliva daily. The tongue contains intrinsic (longitudinal, transverse, vertical) and extrinsic (genioglossus, hyoglossus, styloglossus, palatoglossus) muscles innervated by CN XII.",
    function: "Mechanical digestion (mastication with 32 teeth). Chemical digestion: salivary amylase (α-1,4-glucosidic bonds in starch), lingual lipase (triglycerides). Taste detection (CN VII anterior 2/3, CN IX posterior 1/3). Speech articulation. Antimicrobial defense (lysozyme, IgA, lactoferrin, defensins in saliva). Bolus formation and swallowing initiation.",
    vitamins: [
      { name: "Vitamin B2 (Riboflavin)", role: "Deficiency causes angular stomatitis (cracked mouth corners) and glossitis (inflamed tongue)" },
      { name: "Vitamin B3 (Niacin)", role: "Deficiency causes pellagrous glossitis (raw, bright red tongue) — 'beefy tongue'" },
      { name: "Vitamin B12", role: "Deficiency causes glossitis with loss of papillae ('smooth tongue') and aphthous ulcers" },
      { name: "Vitamin C", role: "Deficiency (scurvy) causes bleeding, swollen gums and loose teeth from collagen failure" },
      { name: "Vitamin A", role: "Required for healthy oral mucosa; deficiency causes leukoplakia and dry mouth" }
    ],
    minerals: [
      { name: "Calcium", role: "Primary mineral in tooth enamel (hydroxyapatite) and dentin; saliva is supersaturated with calcium to protect enamel" },
      { name: "Phosphorus", role: "Component of tooth mineral alongside calcium; salivary phosphate buffers oral pH" },
      { name: "Fluoride", role: "Substitutes for hydroxyl in hydroxyapatite forming fluorapatite — far more acid-resistant, preventing caries" },
      { name: "Zinc", role: "Cofactor for taste receptors; deficiency causes dysgeusia (distorted taste)" },
      { name: "Iron", role: "Deficiency causes painful glossitis and angular cheilitis (Plummer-Vinson syndrome)" }
    ],
    cellTypes: [
      { name: "Taste receptor cells (TRCs)", description: "Secondary sensory cells clustered in taste buds (~10,000 total). Type II TRCs detect sweet/bitter/umami via GPCRs and PLCβ2/IP3 pathway. Type III TRCs detect sour (proton-sensing) and salt via ion channels." },
      { name: "Oral keratinocytes", description: "Non-keratinized stratified squamous epithelium in most of oral cavity (faster-renewing than skin, replacing every 7–14 days). Gingival and hard palate epithelium is keratinized for mechanical protection." },
      { name: "Acinar cells (salivary glands)", description: "Serous acinar cells produce protein-rich saliva (amylase, proline-rich proteins); mucous acinar cells produce mucin-rich saliva for lubrication." }
    ],
    bloodFlow: "Tongue is highly vascular (lingual artery, from external carotid). Parotid gland supplied by branches of external carotid. Rich submucosal capillary networks supply rapid cell turnover. The lips have end-arteries, making them vulnerable to ischemic injury.",
    fluidRole: "Saliva (~1–1.5L/day): 99.5% water; pH 6.2–7.4 (buffered by bicarbonate). Contains amylase, mucins, IgA, lysozyme, lactoferrin, defensins, histatin, statherin, proline-rich proteins. Flow rate varies 30-fold: 0.1ml/min at rest → 3ml/min during eating. Saliva remineralizes early carious lesions and prevents dry-mouth-associated tooth decay.",
    cellularProcess: "Taste transduction (sweet): tastant binds T1R2/T1R3 GPCR → Gα-gustducin activates PLCβ2 → IP3 → Ca²⁺ release from ER → TRPM5 ion channel opens → depolarization → ATP release (pannexin-1/CALHM1) → purinergic signaling to taste nerve. Bitter: same pathway via T2R family (~25 receptors). Sour: H⁺ directly inhibits K⁺ channels and activates PKD2L1 channel. Salt: ENaC sodium channels.",
    conditions: [
      { name: "Dental Caries (Cavities)", description: "Streptococcus mutans ferments sugars → lactic acid → enamel demineralization below pH 5.5" },
      { name: "Oral Cancer", description: "Squamous cell carcinoma, strongly linked to tobacco, alcohol, and HPV16/18 infection" },
      { name: "Sjögren's Syndrome", description: "Autoimmune exocrine gland destruction causing severe dry mouth (xerostomia) and dry eyes" }
    ],
    fact: "Your mouth contains more bacteria (700+ species; 20 billion bacteria) than there are people on Earth. Despite this, healthy saliva keeps them in ecological balance and prevents opportunistic infections through an arsenal of antimicrobial proteins."
  },

  // ── ESOPHAGUS ─────────────────────────────────────────────────
  {
    id: "esophagus",
    name: "Esophagus",
    medicalName: "Oesophagus",
    system: "digestive",
    sex: "both",
    svgZone: "neck-chest",
    icon: "〰️",
    description: "The esophagus is a 25cm muscular tube that carries food and liquid from your throat to your stomach using coordinated waves of muscle contractions called peristalsis. It can propel food upward, downward, or even horizontally — astronauts can eat and drink in zero gravity thanks to this mechanism.",
    medicalDescription: "The oesophagus extends from the pharynx (C6) to the gastroesophageal junction (T11), passing through the diaphragmatic hiatus. Its wall has four layers: mucosa (non-keratinized stratified squamous epithelium), submucosa, muscularis propria (upper 1/3 skeletal, lower 2/3 smooth muscle), and adventitia. The lower esophageal sphincter (LES) prevents acid reflux.",
    function: "Transport of bolus from pharynx to stomach via primary peristalsis (triggered by swallowing) and secondary peristalsis (triggered by distension, clears residual material). The upper esophageal sphincter (UES) prevents air entry; the LES prevents gastric reflux. Mucus secretion lubricates passage.",
    vitamins: [
      { name: "Vitamin C", role: "Antioxidant protecting esophageal mucosa; low intake associated with Barrett's esophagus progression" },
      { name: "Vitamin E", role: "Antioxidant; combined with C may reduce esophageal cancer risk" },
      { name: "Folate (B9)", role: "Deficiency associated with increased esophageal cancer risk due to impaired DNA repair in squamous cells" }
    ],
    minerals: [
      { name: "Selenium", role: "Antioxidant; deficiency linked to esophageal squamous cell carcinoma in high-risk regions" },
      { name: "Zinc", role: "Required for esophageal mucosal integrity and wound healing" }
    ],
    cellTypes: [
      { name: "Non-keratinized squamous epithelial cells", description: "Stratified, rapidly renewed (~5 days) epithelium resistant to mechanical abrasion from food boluses. Unlike stomach, these cells have no acid protection — hence GERD damage." },
      { name: "Submucosal gland cells", description: "Mucous glands in the upper and lower esophagus secrete mucin glycoproteins lubricating the mucosal surface and providing a minor acid buffer." },
      { name: "Interstitial cells of Cajal (ICCs)", description: "Smooth muscle pacemaker cells in muscularis propria generating rhythmic slow waves that drive peristaltic contractions along the lower 2/3 of the esophagus." }
    ],
    bloodFlow: "Cervical esophagus: inferior thyroid arteries. Thoracic: bronchial arteries and direct aortic branches. Abdominal: left gastric and inferior phrenic arteries. Venous drainage of the lower esophagus flows to the portal system (via left gastric vein) AND systemic (via azygos) — creating portosystemic varices when portal hypertension is present.",
    fluidRole: "Receives saliva (1.5L/day) and adds mucus from submucosal glands. No digestion occurs. The LES is maintained partially closed at rest (~15–25mmHg pressure) by intrinsic smooth muscle tone and extrinsic diaphragmatic compression — relaxes transiently with each swallow under vagal control.",
    cellularProcess: "Swallowing: voluntary initiation → medullary swallowing center activates sequential motor neurons → UES relaxes → upper esophageal peristaltic wave begins (striated muscle, 3–4 cm/s) → transitions to smooth muscle-driven peristalsis → LES relaxes 1–3 seconds before bolus arrives → bolus enters stomach. Total transit: 8–20 seconds for solid food.",
    conditions: [
      { name: "GERD / Esophagitis", description: "Chronic acid reflux erodes squamous epithelium; causes heartburn, regurgitation, and potential Barrett's metaplasia" },
      { name: "Barrett's Esophagus", description: "Metaplastic replacement of squamous by intestinal-type columnar epithelium; pre-malignant for adenocarcinoma" },
      { name: "Achalasia", description: "Failure of LES relaxation and absent peristalsis from enteric neuron destruction; causes progressive dysphagia" },
      { name: "Esophageal Cancer", description: "Squamous cell (mid-esophagus; tobacco/alcohol) or adenocarcinoma (lower; Barrett's); both have poor prognosis" }
    ],
    fact: "Your esophagus can propel food upward against gravity as effectively as downward. The peristaltic wave moves at 2–6 cm/second and generates pressures up to 100 mmHg — enough to push a bolus the full 25cm in under 10 seconds."
  },

  // ── GALLBLADDER ───────────────────────────────────────────────
  {
    id: "gallbladder",
    name: "Gallbladder",
    medicalName: "Vesica Biliaris / Vesica Fellea",
    system: "digestive",
    sex: "both",
    svgZone: "abdomen-upper-right",
    icon: "🫙",
    description: "The gallbladder is a small pear-shaped sac tucked under the liver that stores and concentrates bile — concentrating it up to 10-fold. When you eat a fatty meal, it contracts and squirts bile into the small intestine where bile salts emulsify fats into tiny droplets, dramatically increasing the surface area for digestive enzymes to work on.",
    medicalDescription: "The vesica biliaris is a ~7–10cm saccular organ lying in the gallbladder fossa of the liver's inferior surface. It concentrates hepatic bile by actively absorbing water and Na⁺. The cystic duct joins the common hepatic duct to form the common bile duct (choledochus) which enters the duodenum at the ampulla of Vater, regulated by the sphincter of Oddi.",
    function: "Stores and concentrates bile (removes water/electrolytes, increases bile salt concentration 5–10x). Releases concentrated bile in response to CCK (secreted by duodenal I cells after fat enters). Regulates bile delivery to optimize fat digestion timing. Modulates bile acid composition through enterohepatic circulation.",
    vitamins: [
      { name: "Vitamin C", role: "Converts cholesterol to bile acids via CYP7A1 — deficiency promotes cholesterol gallstone formation" },
      { name: "Vitamin D", role: "Regulates cholesterol metabolism; deficiency associated with increased gallstone risk" }
    ],
    minerals: [
      { name: "Calcium", role: "Calcium bilirubinate is a component of pigment stones; excess calcium in bile promotes stone formation" },
      { name: "Magnesium", role: "Magnesium-rich diet associated with reduced gallstone risk" }
    ],
    cellTypes: [
      { name: "Gallbladder epithelial cells (Cholecystocytes)", description: "Tall columnar cells with apical microvilli and extensive basolateral folding maximizing the surface area for water and Na⁺ absorption. They reduce bile volume 5–10x, concentrating bile salts and bilirubin." },
      { name: "Rokitansky-Aschoff sinuses", description: "Herniations of mucosa through the muscular wall, found in normal and diseased gallbladders. May trap bile and form stones within the wall." }
    ],
    bloodFlow: "Cystic artery (from right hepatic artery) supplies the gallbladder. Venous drainage is directly into the liver via small veins through the gallbladder fossa — bypassing the main portal system. This anatomical relationship means gallbladder inflammation easily involves the adjacent liver.",
    fluidRole: "Concentrates 600–1000ml/day of hepatic bile to 50–150ml of concentrated bile. Bile composition: bile salts (primary: chenodeoxycholic, cholic acid) 67%, phosphatidylcholine 22%, cholesterol 4%, bilirubin, electrolytes, water. Bile salts form mixed micelles with dietary fats, essential for fat-soluble vitamin (A, D, E, K) absorption.",
    cellularProcess: "CCK binds to CCK-A receptors on gallbladder smooth muscle → Gq → IP3 → Ca²⁺ release → myosin light chain kinase activation → contraction → bile ejected. Simultaneously, CCK relaxes the sphincter of Oddi via VIP/nitric oxide → bile flows into duodenum. Bile salts emulsify fat globules into 1μm micelles → 1000x increase in surface area for pancreatic lipase.",
    conditions: [
      { name: "Cholelithiasis (Gallstones)", description: "Cholesterol supersaturation (most common, 80%) or bilirubin excess → crystal nucleation → stone growth; 'fat, female, forty, fertile' risk profile" },
      { name: "Acute Cholecystitis", description: "Gallstone impaction in cystic duct → bile stasis → bacterial overgrowth → inflammation; RUQ pain, fever, Murphy's sign" },
      { name: "Cholangitis", description: "Bacterial infection of bile ducts, often with Charcot's triad: fever, jaundice, RUQ pain; life-threatening" }
    ],
    fact: "You can live perfectly well without a gallbladder — bile simply flows continuously from the liver into the duodenum instead of being stored. The gallbladder is considered a vestigial concentrating organ in modern humans who eat frequent small meals."
  },

  // ── TRACHEA & BRONCHI ─────────────────────────────────────────
  {
    id: "trachea",
    name: "Trachea & Bronchi",
    medicalName: "Trachea / Bronchi",
    system: "respiratory",
    sex: "both",
    svgZone: "neck-chest-center",
    icon: "🌬️",
    description: "The trachea is a 12cm reinforced cartilage tube — your windpipe — that divides into two main bronchi leading to the lungs. The bronchi branch repeatedly (like an upside-down tree) into smaller bronchioles, conducting air deep into the lung tissue while warming, filtering, and humidifying it along the way.",
    medicalDescription: "The trachea (16–20 C-shaped cartilage rings; posterior membranous wall) bifurcates at the carina (T4–T5) into right (more vertical, shorter) and left main bronchi. Bronchi divide 23 times from trachea to alveoli: generations 1–16 = conducting zone (no gas exchange); 17–23 = respiratory zone (bronchioles → alveolar ducts → alveoli).",
    function: "Conducting airway — warms air to body temperature, adds moisture to ~100% humidity, traps particles in mucus. Cilia beat upward (mucociliary escalator) clearing mucus toward pharynx at 1–2cm/min. The carina's rich sensory innervation triggers the most powerful cough reflex in the airway.",
    vitamins: [
      { name: "Vitamin A", role: "Essential for ciliated epithelium maintenance; deficiency causes squamous metaplasia (cilia loss)" },
      { name: "Vitamin C", role: "Antioxidant in airway lining fluid; scavenges inhaled ozone and nitrogen dioxide" }
    ],
    minerals: [
      { name: "Magnesium", role: "Smooth muscle relaxant in bronchial walls; IV magnesium used in severe asthma attacks" },
      { name: "Selenium", role: "Antioxidant enzyme cofactor in airway epithelium protecting against pollutant-induced damage" }
    ],
    cellTypes: [
      { name: "Pseudostratified ciliated columnar cells", description: "Dominant airway cell type. Each cell bears 200–300 cilia beating 1000 times/minute in coordinated metachronal waves, propelling the mucus blanket toward the throat at 1–2cm/min." },
      { name: "Goblet cells", description: "Scattered among ciliated cells; produce MUC5AC and MUC5B mucins. In asthma and COPD they hypertrophy dramatically, overwhelming ciliary clearance." },
      { name: "Club cells (Clara cells)", description: "Non-ciliated bronchiolar cells secreting Club cell secretory protein (CC16), surfactant proteins, and detoxifying enzymes. Serve as bronchiolar stem cells." },
      { name: "Neuroendocrine cells", description: "Solitary or clustered (neuroepithelial bodies); sense airway oxygen levels and chemical stimuli, adjusting airway tone via locally released neuropeptides." }
    ],
    bloodFlow: "Trachea and bronchi supplied by bronchial arteries (from aorta or intercostal arteries). Venous drainage primarily to azygos system. The bronchial circulation does NOT participate in gas exchange — it nourishes the airway wall itself.",
    fluidRole: "Airway surface liquid (ASL): ~7μm thick, two-layer system — periciliary liquid (PCL, watery, cilia beat in it) topped by mucus gel. Correct PCL depth is maintained by Na⁺ absorption (ENaC channels) and Cl⁻ secretion (CFTR channels) — in cystic fibrosis, CFTR dysfunction collapses the PCL trapping cilia.",
    cellularProcess: "Mucus transport: goblet cells exocytose mucin granules → mucins expand 1000-fold absorbing water → form visco-elastic gel → ciliary metachronal wave creates an effective stroke (upward) and recovery stroke (downward) → net mucus transport toward pharynx → mucus (with trapped debris/pathogens) swallowed. Rate: 1–2cm/min in bronchi, 5–20mm/min in trachea.",
    conditions: [
      { name: "Asthma", description: "Reversible bronchospasm with eosinophilic inflammation, goblet cell hyperplasia, and airway hyperreactivity" },
      { name: "COPD / Chronic Bronchitis", description: "Goblet cell hypertrophy and mucus hypersecretion with chronic productive cough; from smoking" },
      { name: "Cystic Fibrosis", description: "CFTR mutation → ASL dehydration → thick sticky mucus → trapped pathogens → chronic infection → bronchiectasis" }
    ],
    fact: "During normal breathing, your airways filter 10,000 liters of air per day. The mucociliary escalator removes debris so efficiently that a particle deposited in your main bronchus can reach your throat within 30–60 minutes."
  },

  // ── DIAPHRAGM ─────────────────────────────────────────────────
  {
    id: "diaphragm",
    name: "Diaphragm",
    medicalName: "Diaphragma",
    system: "muscular",
    sex: "both",
    svgZone: "chest-lower",
    icon: "💪",
    description: "The diaphragm is the dome-shaped muscle floor of your chest cavity — and the primary breathing muscle. When it contracts it flattens downward, increasing chest volume and drawing air into the lungs. It works non-stop from before birth until death, contracting about 20,000 times a day without fatigue.",
    medicalDescription: "The diaphragma is a musculotendinous dome separating the thoracic and abdominal cavities. The central tendon is pierced by the inferior vena cava (T8), while esophagus (T10) and aorta (T12) pass through muscular/aortic openings. Innervated by the phrenic nerve (C3,4,5 — 'C3,4,5 keeps the diaphragm alive').",
    function: "Primary respiratory muscle: contraction flattens dome → increases thoracic volume → negative intrathoracic pressure → air flows in (Boyle's Law). Accessory functions: assists venous return (abdominal pressure changes), aids defecation, micturition, and parturition (Valsalva maneuver), prevents acid reflux (crural diaphragm reinforces LES).",
    vitamins: [
      { name: "Vitamin D", role: "Vitamin D receptors on diaphragm myocytes; deficiency causes diaphragm weakness in COPD" },
      { name: "Vitamin B1 (Thiamine)", role: "Required for aerobic ATP production sustaining non-stop diaphragmatic activity" }
    ],
    minerals: [
      { name: "Magnesium", role: "Required for muscle relaxation after each contraction cycle" },
      { name: "Potassium", role: "Membrane potential maintenance; hypokalemia causes diaphragm cramps (hiccups)" },
      { name: "Phosphorus", role: "As phosphocreatine, provides the immediate ATP buffer for each contractile cycle" }
    ],
    cellTypes: [
      { name: "Type I slow-twitch fibers (55%)", description: "Fatigue-resistant oxidative fibers — essential for continuous breathing. Rich in mitochondria and myoglobin. The diaphragm has the highest proportion of Type I fibers of any skeletal muscle." },
      { name: "Type IIa fast oxidative fibers (21%)", description: "Intermediate fibers activated during increased respiratory demand (exercise, illness). The diaphragm's mixed fiber composition ensures performance across all ventilatory demands." }
    ],
    bloodFlow: "Superior phrenic arteries (from aorta), inferior phrenic arteries (largest supply), and musculophrenic branches of internal thoracic artery. Highly vascular — the diaphragm consumes ~15% of the body's oxygen during heavy exercise.",
    fluidRole: "The diaphragm's rhythmic contraction and relaxation cyclically changes pleural pressure (−5 to −10cmH₂O at rest; −50 to −100cmH₂O during maximal inspiration), driving airflow. This pressure change also acts as a thoracic pump, augmenting venous return to the right heart.",
    cellularProcess: "Phrenic nerve fires → ACh at NMJ → T-tubule action potential → Ca²⁺ release from SR → troponin binding → cross-bridge cycling → sarcomere shortens → dome flattens ~1.5cm (tidal) to 10cm (maximal) → ~300–500ml increase in thoracic volume → pressure drops 1–3cmH₂O below atmospheric → air flows in. On relaxation (passive): elastic recoil of lungs + chest wall forces air out.",
    conditions: [
      { name: "Hiatal Hernia", description: "Stomach herniates through the esophageal hiatus into the chest, impairs LES, and worses GERD" },
      { name: "Phrenic Nerve Palsy", description: "Unilateral paralysis causes paradoxical diaphragm motion; bilateral is life-threatening requiring ventilator support" },
      { name: "Hiccups (Singultus)", description: "Sudden diaphragm spasm with simultaneous glottis closure; usually benign but intractable hiccups indicate serious underlying pathology" }
    ],
    fact: "The diaphragm contracts approximately 20,000 times per day — never pausing, even during sleep. Over a 70-year lifetime, it makes over 500 million contractions without a single day off."
  },

  // ── BLADDER ───────────────────────────────────────────────────
  {
    id: "bladder",
    name: "Urinary Bladder",
    medicalName: "Vesica Urinaria",
    system: "urinary",
    sex: "both",
    svgZone: "pelvis",
    icon: "🫘",
    description: "The urinary bladder is a highly expandable muscular reservoir that stores urine produced by the kidneys, stretching from a 50ml empty state to 400–600ml when full, without significant pressure rise — thanks to its unique transitional epithelium. Urination is controlled by both voluntary and involuntary sphincters.",
    medicalDescription: "The vesica urinaria is a retroperitoneal hollow muscular organ with three layers of detrusor smooth muscle. The trigone (triangular region between two ureteral orifices and the internal urethral meatus) is smooth and relatively fixed. Urothelium (transitional epithelium/umbrella cells) allows extreme stretching. Voiding is coordinated by the micturition center (pons) and sacral spinal cord (S2–S4).",
    function: "Low-pressure urine storage (compliance): detrusor relaxes as volume increases via inhibitory sympathetic input (β3-adrenoreceptors). Voluntary voiding: pudendal nerve relaxes external sphincter → parasympathetic S2–S4 contracts detrusor (muscarinic M3 receptors) → voiding. The urinary system excretes ~1.5L urine/day containing metabolic wastes.",
    vitamins: [
      { name: "Vitamin C", role: "High urinary excretion; urothelium protection; megadoses may irritate bladder in some people" },
      { name: "Vitamin D", role: "Receptors in detrusor muscle; deficiency linked to overactive bladder and urinary incontinence" },
      { name: "Vitamin B6", role: "Deficiency increases urinary oxalate, contributing to stone formation in bladder" }
    ],
    minerals: [
      { name: "Potassium", role: "High urinary K⁺ can irritate sensitive urothelium in interstitial cystitis" },
      { name: "Magnesium", role: "Inhibits calcium oxalate crystallization; urinary magnesium excretion important in stone prevention" },
      { name: "Calcium", role: "Urinary calcium excretion regulated by kidneys; hypercalciuria leads to calcium oxalate stones" }
    ],
    cellTypes: [
      { name: "Umbrella cells (Superficial urothelium)", description: "Giant terminally differentiated cells with highly specialized apical membrane containing uroplakin plaques — rigid hexagonal protein complexes that create an impermeable barrier preventing urine from re-entering tissue. They flatten dramatically during filling." },
      { name: "Intermediate urothelial cells", description: "Provide a mitotic reserve; can differentiate into umbrella cells when the surface is damaged. Transitional cells can increase from 2 cell layers (distended) to 6–7 cell layers (empty)." },
      { name: "Detrusor smooth muscle cells", description: "Arranged in three interlocking layers that can generate pressures up to 100cmH₂O during forceful voiding. Between voidings, β3-adrenoreceptors maintain relaxation." }
    ],
    bloodFlow: "Superior vesical arteries (from umbilical arteries) supply the dome; inferior vesical arteries (internal iliac) supply the base and trigone. Venous drainage via vesical plexus to internal iliac veins. Lymphatics drain to obturator, internal iliac, and external iliac nodes — relevant to bladder cancer staging.",
    fluidRole: "Stores and periodically expels urine. Urine is a complex solution: water (~95%), urea (~2%), creatinine, uric acid, ions (Na⁺, K⁺, Cl⁻, NH₄⁺), vitamins, hormones, and drug metabolites. Normal urine pH 4.5–8. The GAG (glycosaminoglycan) layer lining the urothelium prevents bacteria and crystalline particles from adhering.",
    cellularProcess: "During filling: stretch-activated mechanoreceptors (P2X, P2Y, TRP channels) in urothelium respond to distension → ATP release → Aδ and C-fiber afferents signal spinal cord → inhibitory interneurons prevent voiding until appropriate time. At voluntary voiding: frontal cortex releases inhibition → pontine micturition center activates → sacral parasympathetics fire → ACh binds M3 on detrusor → IP3/Ca²⁺ contraction → simultaneous pudendal nerve inhibition relaxes external sphincter.",
    conditions: [
      { name: "Overactive Bladder (OAB)", description: "Involuntary detrusor contractions causing urgency, frequency, and urge incontinence; affects 1 in 6 adults" },
      { name: "Bladder Cancer", description: "Most common urological cancer; 90% transitional cell carcinoma linked to smoking and aromatic amines" },
      { name: "Interstitial Cystitis", description: "Chronic bladder pain syndrome with urothelial barrier dysfunction; poorly understood" },
      { name: "Urinary Tract Infection (UTI)", description: "E. coli adheres to urothelium causing dysuria, urgency, frequency; women 30x more susceptible due to shorter urethra" }
    ],
    fact: "Bladder epithelial cells (urothelium) are so effective at expanding that a single umbrella cell can increase its surface area by 5–6 times as the bladder fills — effectively stretching like a biological balloon without tearing."
  },

  // ── LYMPH NODES & THYMUS ─────────────────────────────────────
  {
    id: "lymph_nodes",
    name: "Lymph Nodes & Thymus",
    medicalName: "Nodi Lymphoidei / Thymus",
    system: "lymphatic",
    sex: "both",
    svgZone: "full-body",
    icon: "🔵",
    description: "Your 600–700 lymph nodes are the immune system's filter stations — bean-shaped checkpoints that screen lymph fluid for invaders before it returns to blood. The thymus, active mostly in childhood, is where T lymphocytes (the immune system's 'special forces') undergo education and selection, learning to distinguish self from non-self.",
    medicalDescription: "Lymph nodes (2–25mm) are encapsulated secondary lymphoid organs containing B cell follicles (cortex), T cell paracortex, and macrophage-rich medullary sinuses. Afferent lymphatics bring fluid in; one efferent lymphatic exits. The thymus (bilobed, anterior mediastinum) is a primary lymphoid organ with a cortex (proliferation) and medulla (selection/tolerance induction via AIRE-expressing medullary thymic epithelial cells).",
    function: "Lymph nodes: filter lymph removing pathogens, debris, and cancer cells; activate adaptive immune responses (antigen-presenting cells activate naïve T/B cells → clonal expansion → effector cells). Thymus: T cell maturation — positive selection (retain T cells that recognize self-MHC) and negative selection (delete autoreactive T cells that would attack self-tissues = central tolerance).",
    vitamins: [
      { name: "Vitamin D", role: "Regulates T cell differentiation toward regulatory T cells (Tregs) and modulates cytokine production" },
      { name: "Vitamin A", role: "Required for gut-homing imprinting of lymphocytes; deficiency impairs mucosal immunity" },
      { name: "Vitamin C", role: "Accumulates in phagocytes and lymphocytes; needed for neutrophil chemotaxis and lymphocyte proliferation" },
      { name: "Vitamin E", role: "Enhances T cell-mediated immunity; particularly important in aging when thymus involutes" }
    ],
    minerals: [
      { name: "Zinc", role: "Critical for T cell development in thymus; deficiency causes thymic atrophy and profound T cell lymphopenia" },
      { name: "Selenium", role: "Required for NK cell cytotoxicity and proliferation of lymphocytes after antigenic stimulation" },
      { name: "Iron", role: "Needed for lymphocyte proliferation (ribonucleotide reductase is iron-dependent); deficiency impairs cell-mediated immunity" }
    ],
    cellTypes: [
      { name: "Naive T lymphocytes (Thymus-derived)", description: "Small, resting lymphocytes expressing unique TCRα/β heterodimers that recognize antigen only in MHC context. They circulate between blood and secondary lymphoid organs searching for their specific antigen." },
      { name: "B lymphocytes (Follicular)", description: "In lymph node germinal centers, B cells mutate their antibody genes (somatic hypermutation) and undergo affinity maturation — iterative cycles of mutation and selection producing ever-more precise antibodies." },
      { name: "Follicular Dendritic cells (FDCs)", description: "Unique non-hematopoietic cells in B cell follicles that display native antigens on their surface for weeks to months, driving memory B cell formation and affinity maturation." },
      { name: "High Endothelial Venules (HEVs)", description: "Specialized post-capillary venules in lymph node paracortex expressing addressin molecules (PNAd, MAdCAM-1) that mediate lymphocyte homing from blood into the lymph node." }
    ],
    bloodFlow: "Lymph nodes receive blood via arterioles entering the hilum → specialized HEV capillaries → lymphocytes extravasate → return via efferent lymphatic. The thymus is highly vascular with a blood-thymus barrier (dense pericytes + thymic epithelial cells) preventing circulating antigens from reaching T cells during their education.",
    fluidRole: "Lymph fluid (3L/day returned to blood via thoracic duct) carries: interstitial fluid, dietary fats (chylomicrons from intestinal lacteals), immune cells, pathogens, and cellular debris. Lymph nodes filter and sample this fluid — a tiny volume (0.1μL of lymph/minute) can contain enough antigen to trigger a system-wide immune response.",
    cellularProcess: "T cell education in thymus: CD34⁺ progenitors arrive → cortical epithelial cells present self-MHC+self-peptide → TCR rearrangement → positive selection (>95% of cells die from neglect) → medullary cells present tissue-specific antigens (AIRE gene) → negative selection of self-reactive cells (5–10% deleted by apoptosis) → ~2% survive as mature naïve T cells. The entire process takes 2–3 weeks.",
    conditions: [
      { name: "Lymphoma (Hodgkin's/Non-Hodgkin's)", description: "Malignant transformation of lymphocytes causing painless lymphadenopathy and constitutional symptoms" },
      { name: "HIV/AIDS", description: "HIV infects and depletes CD4⁺ T helper cells — the master coordinators of adaptive immunity" },
      { name: "DiGeorge Syndrome", description: "Thymic aplasia from chromosome 22q11.2 deletion causing T cell deficiency and severe combined immunodeficiency" }
    ],
    fact: "Your thymus is most active during childhood and begins involuting (shrinking and being replaced by fat) at puberty. By age 75, it has shrunk to 5–10% of its peak size — one reason the elderly are more susceptible to infection and less responsive to new vaccines."
  },

  // ── PITUITARY GLAND ───────────────────────────────────────────
  {
    id: "pituitary",
    name: "Pituitary Gland",
    medicalName: "Glandula Pituitaria / Hypophysis",
    system: "endocrine",
    sex: "both",
    svgZone: "head-center-deep",
    icon: "⚗️",
    description: "The pituitary — a pea-sized gland at the brain's base — is the 'master gland' of the endocrine system. It receives commands from the hypothalamus above it and in turn directs virtually all other hormone-producing glands in the body: thyroid, adrenals, gonads, and growth. Despite weighing less than a gram, it controls processes ranging from height to childbirth.",
    medicalDescription: "The hypophysis (0.5–1g) sits in the sella turcica of the sphenoid bone, connected to the hypothalamus by the infundibular stalk. The anterior pituitary (adenohypophysis) contains 5 cell types producing 6 hormones. The posterior pituitary (neurohypophysis) is neural tissue storing and releasing hypothalamic hormones ADH and oxytocin via axon terminals of supraoptic and paraventricular nuclei neurons.",
    function: "Anterior pituitary: GH (growth), TSH (thyroid), ACTH (adrenals/cortisol), FSH/LH (gonadal function), prolactin (milk production). Posterior pituitary: ADH/vasopressin (water reabsorption in kidneys), oxytocin (uterine contraction in labor; milk ejection; social bonding). All anterior hormones under negative feedback control.",
    vitamins: [
      { name: "Vitamin D", role: "Modulates pituitary GH and TSH secretion; D receptors present in anterior pituitary cells" },
      { name: "Vitamin B6", role: "Required for DOPA decarboxylase in dopamine synthesis — dopamine inhibits prolactin secretion" }
    ],
    minerals: [
      { name: "Zinc", role: "Required for GH secretion and GH receptor signaling; zinc finger proteins regulate pituitary gene expression" },
      { name: "Selenium", role: "Required for type 2 deiodinase converting T4 to T3 in pituitary (regulates TSH feedback)" },
      { name: "Iodine", role: "Low iodine → low T4 → reduced feedback → TSH hypersecretion → goiter" }
    ],
    cellTypes: [
      { name: "Somatotrophs (50% of anterior pituitary)", description: "Secrete GH (growth hormone) under GHRH stimulation; inhibited by somatostatin. GH pulses are highest during sleep — explaining why children 'grow while they sleep'." },
      { name: "Corticotrophs (20%)", description: "Secrete ACTH, which stimulates cortisol production. Also produce MSH (skin pigmentation), β-endorphin (endogenous opioid), and β-lipotropin from the same POMC precursor." },
      { name: "Thyrotrophs (5%)", description: "Secrete TSH (thyroid-stimulating hormone) in response to hypothalamic TRH, driving thyroid hormone production." },
      { name: "Pituicytes (posterior)", description: "Glial-like cells in the neurohypophysis supporting axon terminals of hypothalamic neurons. ADH and oxytocin are stored in Herring bodies (axon terminal swellings) and released into the posterior pituitary capillaries." }
    ],
    bloodFlow: "Unique dual portal blood supply: hypophyseal portal system carries hypothalamic releasing hormones (TRH, GnRH, CRH, GHRH, somatostatin) from median eminence → anterior pituitary. This portal system allows hypothalamic hormones to reach pituitary cells in nanomolar concentrations far exceeding systemic levels. Posterior pituitary: axovascular release directly into capillaries.",
    fluidRole: "Pituitary hormones are released in pulses — GH has 6–12 peaks/day, largest during slow-wave sleep; LH/FSH pulse every 60–120 minutes. Pulse frequency and amplitude encode different biological messages (e.g., rapid GnRH pulses favor LH; slow pulses favor FSH).",
    cellularProcess: "GH secretion: hypothalamic GHRH → GHRHR on somatotrophs → Gs-cAMP-PKA → Ca²⁺ → GH exocytosis. GH binds JAK2-coupled receptor on liver → JAK2 phosphorylation → STAT5b dimerization → nuclear translocation → IGF-1 gene transcription → IGF-1 released → growth and metabolic effects. Negative feedback: IGF-1 inhibits pituitary and hypothalamus; somatostatin from hypothalamus inhibits somatotrophs.",
    conditions: [
      { name: "Acromegaly / Gigantism", description: "GH-secreting pituitary adenoma in adults (acromegaly) or children (gigantism) causing excess growth" },
      { name: "Hypopituitarism", description: "Partial or complete anterior pituitary failure from tumor, infarction (Sheehan's), radiation, or autoimmunity" },
      { name: "Diabetes Insipidus (Central)", description: "ADH deficiency from posterior pituitary/hypothalamic damage causing massive dilute urine output (up to 20L/day)" },
      { name: "Prolactinoma", description: "Most common pituitary adenoma; hyperprolactinemia suppresses gonadotropins causing infertility and galactorrhea" }
    ],
    fact: "Despite weighing less than 1 gram, the pituitary gland controls at least 9 major hormone axes. If you removed it without treatment, you would die within weeks from combined cortisol deficiency, thyroid failure, and severe electrolyte imbalance."
  },

  // ── REPRODUCTIVE SYSTEM (FEMALE) ─────────────────────────────
  {
    id: "uterus_ovaries",
    name: "Uterus & Ovaries",
    medicalName: "Uterus / Ovaria",
    system: "reproductive",
    sex: "female",
    svgZone: "pelvis",
    icon: "✦",
    description: "The uterus is a muscular pear-shaped organ that nurtures a developing fetus, growing from 7cm to over 30cm during pregnancy. The ovaries — about the size of almonds — contain every egg a woman will ever have (1–2 million at birth, declining to ~400,000 at puberty) and produce estrogen and progesterone that govern the 28-day menstrual cycle and beyond.",
    medicalDescription: "The uterus has three layers: endometrium (inner glandular lining, shed monthly), myometrium (thick smooth muscle, generates labor contractions), and perimetrium (serosal outer layer). Paired ovaries contain follicles at all stages (primordial → primary → secondary → Graafian). The HPG axis (GnRH → LH/FSH → estrogen/progesterone) governs cyclical function.",
    function: "Ovaries: oogenesis and hormone production (estrogen: female secondary sex characteristics, endometrial growth, bone density; progesterone: endometrial preparation for implantation, pregnancy maintenance). Uterus: implantation site for fertilized egg, fetal development, and parturition. Fallopian tubes: transport oocyte to uterus; site of fertilization.",
    vitamins: [
      { name: "Folate (B9)", role: "Critical in first 28 days of pregnancy for neural tube closure; all women of childbearing age should supplement" },
      { name: "Vitamin D", role: "Receptors in endometrium and myometrium; deficiency linked to endometriosis, PCOS, and infertility" },
      { name: "Vitamin B6", role: "Required for progesterone synthesis and reduces PMS symptoms by supporting dopamine/serotonin production" },
      { name: "Vitamin E", role: "Antioxidant; improves endometrial thickness in thin-lining infertility" },
      { name: "Vitamin C", role: "Required for collagen in cervix and membranes; also supports corpus luteum progesterone production" }
    ],
    minerals: [
      { name: "Iron", role: "Monthly menstrual blood loss (30–80ml) makes iron deficiency the most common nutritional deficiency in premenopausal women" },
      { name: "Calcium", role: "Required for myometrial contractions during labor; low calcium increases preeclampsia risk" },
      { name: "Magnesium", role: "Reduces uterine cramping (dysmenorrhea); magnesium sulfate used to stop preterm labor and prevent eclamptic seizures" },
      { name: "Zinc", role: "Required for follicular development and oocyte maturation; deficiency impairs fertility" },
      { name: "Iodine", role: "Essential for fetal brain development; deficiency in early pregnancy causes intellectual disability" }
    ],
    cellTypes: [
      { name: "Endometrial glandular cells", description: "Proliferate under estrogen in the follicular phase, then differentiate under progesterone in the luteal phase to form secretory endometrium rich in glycogen — preparing for embryo implantation." },
      { name: "Uterine NK cells (uNK)", description: "The dominant immune cell in early pregnancy decidua. Critically, they are NOT cytotoxic toward the fetus — instead they regulate trophoblast invasion, spiral artery remodeling, and immune tolerance." },
      { name: "Granulosa cells (Ovarian)", description: "Surround the oocyte in follicles; convert androgens to estrogen via aromatase enzyme. After ovulation they luteinize (LH-driven) to become the corpus luteum — producing progesterone to sustain early pregnancy." },
      { name: "Myometrial smooth muscle cells", description: "Estrogen-primed quiescent cells become profoundly contractile at term parturition due to upregulation of oxytocin receptors, connexin-43 gap junctions, and prostaglandin receptors — allowing synchronised, forceful labor contractions." }
    ],
    bloodFlow: "Ovarian arteries (from aorta) and uterine arteries (from internal iliac) supply the uterus and ovaries. During pregnancy, uterine blood flow increases from 50ml/min to 750ml/min at term. Spiral arteries in the decidua are remodeled by trophoblast invasion — removing muscular walls to create high-flow, low-resistance vessels supplying the placenta.",
    fluidRole: "Menstrual fluid (30–80ml/cycle): blood, endometrial tissue, prostaglandins, cervical mucus. Cervical mucus changes cyclically: thin and spinnbarkeit (stretchable) at ovulation (sperm-permeable) → thick and impenetrable after ovulation (progesterone-driven). Follicular fluid (LH-surge) contains oocyte maturation factors, steroids, growth factors.",
    cellularProcess: "Menstrual cycle: Day 1–14 (follicular): FSH stimulates follicle growth → granulosa estrogen production → endometrial proliferation → LH surge (Day 14) → ovulation. Day 15–28 (luteal): corpus luteum secretes progesterone + estrogen → endometrial secretory transformation → if no implantation: corpus luteum regresses → hormone fall → endometrial shedding. Implantation: blastocyst trophoblast expresses integrins → adheres to L-selectin on endometrial cells → invasion → hCG production (pregnancy test hormone) maintains corpus luteum.",
    conditions: [
      { name: "Endometriosis", description: "Endometrial tissue outside uterus causes cyclical pain, adhesions, and infertility affecting 10% of women" },
      { name: "Polycystic Ovary Syndrome (PCOS)", description: "Anovulation, hyperandrogenism, and insulin resistance affecting 10–15% of women; leading cause of infertility" },
      { name: "Uterine Fibroids (Leiomyoma)", description: "Benign smooth muscle tumors causing heavy bleeding and pelvic pressure; present in 70% of women by age 50" },
      { name: "Cervical Cancer", description: "HPV16/18-driven squamous cell carcinoma; almost entirely preventable by vaccination and screening" }
    ],
    fact: "A female baby is born with approximately 1–2 million eggs already formed in her ovaries — more than she will ever need. By puberty, only 400,000 remain. Over a lifetime, only about 400–500 eggs will actually be ovulated."
  },

  // ── REPRODUCTIVE SYSTEM (MALE) ────────────────────────────────
  {
    id: "testes_prostate",
    name: "Testes & Prostate",
    medicalName: "Testes / Glandula Prostatica",
    system: "reproductive",
    sex: "male",
    svgZone: "pelvis",
    icon: "✦",
    description: "The testes are the male gonads — they produce 1,500 sperm per second (100–300 million per day) and testosterone, the hormone driving male development, muscle growth, bone density, libido, and red blood cell production. The walnut-sized prostate gland produces secretions that activate and protect sperm, comprising ~30% of seminal fluid volume.",
    medicalDescription: "Each testis contains 800+ seminiferous tubules (total length ~250m) lined by Sertoli cells and spermatogenic cells. Leydig cells in the interstitium produce testosterone under LH stimulation. Sperm mature in the epididymis (~12 days). The prostate's three zones (peripheral, central, transition) produce PSA (kallikrein-3), zinc-rich citrate, and proteases that liquefy semen.",
    function: "Testes: spermatogenesis (complete in 64–74 days); testosterone production (regulates secondary sex characteristics, muscle, bone, erythropoiesis, libido, cognition). Prostate: produces prostatic fluid (pH 6.5; zinc, citrate, PSA, fructose) activating sperm motility and liquefying the semen coagulum formed by seminal vesicle secretions.",
    vitamins: [
      { name: "Vitamin D", role: "Receptors on Leydig cells and sperm; deficiency reduces testosterone levels and sperm motility" },
      { name: "Vitamin E", role: "Antioxidant protecting sperm from ROS-induced lipid peroxidation (a major cause of male infertility)" },
      { name: "Vitamin C", role: "Highest concentration in seminal plasma; protects sperm DNA from oxidative damage" },
      { name: "Folate (B9)", role: "Required for sperm DNA methylation integrity; deficiency causes sperm DNA fragmentation" }
    ],
    minerals: [
      { name: "Zinc", role: "Highest concentration in body found in prostate and seminal plasma; essential for testosterone synthesis, sperm formation, and DNA integrity" },
      { name: "Selenium", role: "Component of GPX5 antioxidant in epididymis; required for normal sperm motility and morphology" },
      { name: "Magnesium", role: "Required for testosterone biosynthesis and sperm capacitation (final activation step before fertilization)" },
      { name: "Iron", role: "Required for testosterone production and mitochondrial function in sperm midpiece" }
    ],
    cellTypes: [
      { name: "Sertoli cells", description: "Non-dividing 'nurse' cells of the seminiferous tubules. They form the blood-testis barrier (via tight junctions), phagocytose excess cytoplasm, secrete androgen-binding protein (concentrating testosterone 100x for spermatogenesis), and produce inhibin-B (FSH feedback)." },
      { name: "Leydig cells", description: "Interstitial cells producing 95% of circulating testosterone via LH stimulation. They convert cholesterol → pregnenolone → testosterone through a 5-step enzymatic pathway involving 3β-HSD, 17β-HSD, and CYP17A1." },
      { name: "Spermatogonia (stem cells)", description: "Undifferentiated stem cells on the basement membrane that continuously self-renew while also producing spermatocytes. Unlike female gametes, they are continuously produced from puberty throughout life." },
      { name: "Prostatic luminal cells", description: "Tall columnar secretory cells producing PSA, PAP, and citrate. They are the cells transformed in prostate cancer (adenocarcinoma) and respond to androgen deprivation therapy because they require testosterone for survival." }
    ],
    bloodFlow: "Testicular arteries arise directly from the aorta (at L1, reflecting testicular descent). The pampiniform venous plexus surrounding the artery acts as a counter-current heat exchanger — cooling arterial blood to 32–35°C (below body temperature) which is required for spermatogenesis. This is why testes are outside the body. Prostate: internal pudendal and inferior vesical arteries.",
    fluidRole: "Semen (~3.5ml per ejaculate): sperm (5%) + seminal vesicle secretions (~65%; fructose, prostaglandins, coagulation factors) + prostatic fluid (~30%; PSA, zinc, citrate, acid phosphatase) + bulbourethral gland mucus (2%). Fructose provides energy for sperm motility (~1,800 ATP per sperm per second during swimming). PSA liquefies the semen coagulum 5–30 minutes after ejaculation.",
    cellularProcess: "Spermatogenesis: spermatogonium (2N) → mitosis → spermatocyte → meiosis I → secondary spermatocyte (2N) → meiosis II → spermatid (N) → spermiogenesis (acrosome formation, flagellum development, cytoplasm shedding) → sperm (N). Total: 64–74 days at 32–35°C. Testosterone biosynthesis: LH → STAR protein → cholesterol → mitochondrial CYP11A1 → pregnenolone → SER CYP17A1 → DHEA → 17β-HSD → testosterone → secreted into blood and intratesticular fluid.",
    conditions: [
      { name: "Benign Prostatic Hyperplasia (BPH)", description: "Age-related glandular enlargement compressing urethra; affects 50% of men by age 60, 90% by age 85" },
      { name: "Prostate Cancer", description: "Most common cancer in men; usually indolent; PSA screening detects early stages; androgen-driven" },
      { name: "Male Infertility", description: "Azoospermia, oligospermia, or poor motility/morphology; causes include varicocele, genetic, hormonal, or oxidative" },
      { name: "Hypogonadism", description: "Low testosterone from testicular failure (primary) or pituitary/hypothalamic dysfunction (secondary)" }
    ],
    fact: "A healthy male produces approximately 1,500 sperm per second — about 130 million per day — from puberty until death. Over a lifetime, a man produces roughly 525 billion sperm cells, of which only a few hundred will ever come close to fertilizing an egg."
  },

  // ── CEREBELLUM & BRAINSTEM ────────────────────────────────────
  {
    id: "cerebellum",
    name: "Cerebellum & Brainstem",
    medicalName: "Cerebellum / Truncus Encephali",
    system: "nervous",
    sex: "both",
    svgZone: "head-posterior",
    icon: "🧠",
    description: "The cerebellum ('little brain') at the back of your head contains more neurons than the rest of the brain combined — about 70 billion — and is responsible for all smooth, coordinated movement, balance, and fine motor learning. The brainstem beneath it is your survival hardware: it controls breathing, heartbeat, blood pressure, and sleep/wake cycles, and connects the brain to the spinal cord.",
    medicalDescription: "The cerebellum (10% of brain volume, 50% of neurons) has two hemispheres + vermis, covered by tightly folded cerebellar cortex (folia). Three functional zones: vestibulocerebellum (balance), spinocerebellum (limb coordination), cerebrocerebellum (motor planning). The brainstem comprises midbrain (CN III–IV), pons (CN V–VIII), and medulla oblongata (CN IX–XII), housing critical autonomic control centers.",
    function: "Cerebellum: compares intended vs. actual movement, corrects errors in real-time, stores procedural motor memories (riding a bike), coordinates timing of multi-joint movements, and calibrates the vestibulo-ocular reflex. Brainstem: cardiovascular center (HR/BP), respiratory centers (dorsal and ventral respiratory groups), reticular activating system (consciousness/sleep), cranial nerve nuclei, and relay of all sensorimotor tracts.",
    vitamins: [
      { name: "Vitamin B1 (Thiamine)", role: "Critical for brainstem energy metabolism; deficiency causes Wernicke's encephalopathy — preferentially destroying mammillary bodies and brainstem nuclei" },
      { name: "Vitamin B12", role: "Myelin maintenance; subacute combined degeneration predominantly affects cerebellar-connected tracts" },
      { name: "Vitamin E", role: "Antioxidant; isolated vitamin E deficiency causes spinocerebellar ataxia with Purkinje cell loss" }
    ],
    minerals: [
      { name: "Magnesium", role: "Modulates NMDA receptor-dependent plasticity in cerebellar Purkinje cells" },
      { name: "Iron", role: "Brainstem is one of the highest-iron regions of the brain; required for monoamine synthesis in raphe nuclei and locus coeruleus" }
    ],
    cellTypes: [
      { name: "Purkinje cells", description: "The largest neurons in the brain — each with a dendritic tree receiving ~200,000 synaptic inputs. They are the sole output of the cerebellar cortex, projecting inhibitory (GABA) signals to deep cerebellar nuclei. They are uniquely vulnerable to ataxia disorders, alcoholism, and paraneoplastic syndromes." },
      { name: "Granule cells (~70 billion)", description: "Tiny, densely packed neurons making up over 50% of all neurons in the brain. They receive input from mossy fibers (spinal/pontine information) and send parallel fiber signals to Purkinje cells — enabling the cerebellum's massive computational power." },
      { name: "Raphe nuclei neurons (Brainstem)", description: "Serotonergic neurons in the medullary/pontine raphe nuclei projecting throughout the CNS. They regulate mood, pain, sleep-wake cycles, and appetite — targeted by SSRI antidepressants." },
      { name: "Locus coeruleus neurons", description: "The brain's primary norepinephrine source (pontine nucleus). Projects to entire cortex, regulating attention, arousal, stress response, and memory consolidation." }
    ],
    bloodFlow: "Posterior circulation: vertebral arteries → basilar artery → PICA (posterior inferior cerebellar), AICA (anterior inferior cerebellar), SCA (superior cerebellar arteries). Brainstem supplied by direct basilar perforators. The posterior fossa is a tight compartment — even small bleeds or tumors cause catastrophic herniation.",
    fluidRole: "4th ventricle in the brainstem produces CSF that circulates around the entire CNS. The reticular formation of the brainstem modulates both cerebellar output and global cortical activation states. The area postrema (medulla) — a circumventricular organ without blood-brain barrier — detects blood-borne toxins and triggers vomiting.",
    cellularProcess: "Cerebellar motor learning (adaptation): climbing fiber from inferior olive fires when movement error occurs → complex spike in Purkinje cell → triggers long-term depression (LTD) of parallel fiber → Purkinje cell synapse → strengthened motor program. This error-driven synaptic plasticity (using AMPA receptor internalization) allows you to learn to hit a baseball after missing — the cerebellum 'updates' its internal model of the movement.",
    conditions: [
      { name: "Cerebellar Ataxia", description: "Incoordination of voluntary movements, gait, and speech from Purkinje cell damage (alcohol, genetic, paraneoplastic)" },
      { name: "Brainstem Stroke", description: "Posterior circulation infarcts cause crossed deficits (ipsilateral face, contralateral body), vertigo, and coma" },
      { name: "Multiple System Atrophy (MSA)", description: "Progressive neurodegeneration of cerebellum, brainstem, and basal ganglia causing ataxia, autonomic failure, and parkinsonism" }
    ],
    fact: "The cerebellum contains approximately 70 billion neurons — more than 3 times the number in the cerebral cortex — packed into just 10% of the brain's volume. Despite this, people can live relatively normally after removing an entire cerebellar hemisphere."
  },

  // ── BONE MARROW ───────────────────────────────────────────────
  {
    id: "bone_marrow",
    name: "Bone Marrow",
    medicalName: "Medulla Ossium",
    system: "circulatory",
    sex: "both",
    svgZone: "full-body",
    icon: "🦴",
    description: "Bone marrow is the soft, spongy tissue inside your bones — and one of the most productive factories in your body. Red marrow produces 2–3 million red blood cells, 120,000 white blood cells, and 150 million platelets every single second. Yellow marrow stores fat as an energy reserve and can convert back to red marrow if blood cell production needs surge.",
    medicalDescription: "Medulla ossium rubra (red marrow) contains hematopoietic stem cells (HSCs) in specialized vascular niches within trabecular bone spaces. Present in vertebrae, sternum, ribs, pelvis, and proximal long bones in adults. Yellow marrow (medulla ossium flava) replaces red marrow in peripheral long bones after puberty. HSCs are pluripotent — each can generate all 10+ blood cell lineages via hierarchical differentiation.",
    function: "Hematopoiesis: continuous production of all blood cells — erythropoiesis (RBCs), leukopoiesis (WBCs: neutrophils, monocytes, eosinophils, basophils), thrombopoiesis (platelets), and lymphopoiesis (lymphocyte precursors). Also site of B lymphocyte maturation (positive selection by bone marrow stromal cells). HSC self-renewal maintains lifelong blood cell production.",
    vitamins: [
      { name: "Folate (B9)", role: "Required for DNA synthesis in rapidly dividing progenitor cells; deficiency causes megaloblastic anemia from impaired RBC maturation" },
      { name: "Vitamin B12", role: "Cofactor for methionine synthase needed for folate recycling and thymidine synthesis; deficiency = megaloblastic anemia identical to folate deficiency" },
      { name: "Vitamin B6", role: "Required for hemoglobin synthesis (δ-aminolevulinic acid synthetase) — first step in heme production" },
      { name: "Vitamin C", role: "Required for iron absorption; also supports collagen framework of marrow stromal niche" },
      { name: "Vitamin D", role: "Regulates HSC niche function and differentiation; receptors on megakaryocytes and erythroid precursors" }
    ],
    minerals: [
      { name: "Iron", role: "Absolutely essential for hemoglobin synthesis — each RBC requires 2.8×10⁸ iron atoms; iron deficiency is the most common nutritional cause of anemia worldwide" },
      { name: "Copper", role: "Required for ceruloplasmin (iron mobilization from stores) and for normal neutrophil development; deficiency mimics myelodysplastic syndrome" },
      { name: "Zinc", role: "Required for DNA polymerase and cell division in erythroid and myeloid progenitors" },
      { name: "Cobalt", role: "Core of vitamin B12 molecule — essential for red blood cell production" }
    ],
    cellTypes: [
      { name: "Hematopoietic Stem Cells (HSCs)", description: "Rare cells (1 in 100,000 marrow cells) with unlimited self-renewal capacity and pluripotency. They reside in endosteal and perivascular niches. A single HSC can reconstitute the entire blood system — the basis of bone marrow transplantation." },
      { name: "Erythroblasts (Erythroid precursors)", description: "HSC → BFU-E → CFU-E → proerythroblast → 4 divisions → polychromatophilic erythroblasts → enucleation → reticulocyte → mature erythrocyte. The entire process takes ~7 days; EPO (from kidneys) is the master regulator accelerating production under hypoxia." },
      { name: "Megakaryocytes", description: "Giant polyploid cells (up to 128N — 64x the normal DNA content) that fragment their cytoplasm into 1,000–5,000 platelets each. Thrombopoietin (TPO) from liver drives their development." },
      { name: "Osteoblasts/Osteoclasts", description: "Bone marrow stromal cells include osteoblasts (endosteal niche) that maintain HSCs in quiescence via CXCL12-CXCR4 signaling — the mechanism exploited by G-CSF mobilization in stem cell transplant harvest." }
    ],
    bloodFlow: "Bone marrow sinusoids are specialized fenestrated vessels with thin walls allowing mature blood cells to cross ('egress') into circulation. Arteriolar blood enters → central longitudinal artery → radial arterioles → sinusoids → mature cells squeeze through sinusoidal wall → venous sinuses → emissary veins. Only fully mature cells with appropriate surface markers pass through the sinusoidal barrier.",
    fluidRole: "Marrow produces 200 billion RBCs, 100 billion WBCs, and 300 billion platelets daily — all released into blood. Old red blood cells (after 120 days) are removed by splenic macrophages, their iron recycled via transferrin back to marrow. This iron economy recycles ~20mg iron/day (dietary intake provides only 1–2mg/day).",
    cellularProcess: "Erythropoiesis: EPO binds EPOR → JAK2/STAT5 signaling → anti-apoptotic BCL-XL expression → survival and proliferation of erythroid progenitors → hemoglobin synthesis: 8 enzymatic steps producing heme (protoporphyrin IX + Fe²⁺) → 4 heme + 4 globin chains = hemoglobin A (α₂β₂). Iron delivery: transferrin-TfR1 endocytosis → lysosomal acidification releases Fe³⁺ → STEAP3 reductase → Fe²⁺ → ferroportin export to cytoplasm → incorporated into heme.",
    conditions: [
      { name: "Aplastic Anemia", description: "Autoimmune or toxic destruction of HSCs causing pancytopenia (low RBC, WBC, platelets); treated with BMT" },
      { name: "Leukemia", description: "Malignant clonal expansion of myeloid (AML/CML) or lymphoid (ALL/CLL) progenitors flooding marrow and suppressing normal hematopoiesis" },
      { name: "Myelodysplastic Syndrome (MDS)", description: "Clonal disorder with ineffective hematopoiesis — precursor to AML in 30% of cases" },
      { name: "Multiple Myeloma", description: "Malignant plasma cell tumor in marrow secreting monoclonal immunoglobulin; destroys bone and impairs marrow function" }
    ],
    fact: "Your bone marrow produces approximately 2 million red blood cells every second — that's 173 billion per day. If laid edge to edge, the red blood cells produced in one day would form a chain 170,000 km long — nearly halfway to the Moon."
  }

  ]; // end extra array

  // Append to global ANATOMY array
  if (window.ANATOMY) {
    window.ANATOMY = window.ANATOMY.concat(extra);
  } else {
    window.ANATOMY = extra;
  }

  console.log(`[Plajah] Total anatomy entries: ${window.ANATOMY.length}`);
})();
