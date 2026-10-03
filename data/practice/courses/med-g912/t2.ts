import { mcq, type CoursePart } from '../../courseKit';

export const PART: CoursePart = {
  track: {
    id: 'med-g912.t2',
    title: 'How Disease Arises: Pathology Basics',
    blurb: 'Inflammation, infection, cancer, autoimmunity and genetic disease.',
    level: 'INTERMEDIATE',
    lessons: [
      {
        id: 'med-g912.l05',
        title: 'Cell Injury and Inflammation',
        blurb: 'The body response to damage, and when it helps or harms.',
        minutes: 8,
        asOf: '2026-10',
        anchors: [
          { kind: 'mesh', ref: 'Inflammation', note: 'core process in pathology' },
          { kind: 'concept', ref: 'cardinal signs of inflammation' },
        ],
        body: `Pathology is the study of how disease changes the body. Its starting point is cell injury. Cells can be injured by lack of oxygen, toxins, microbes, physical force, heat, cold, radiation or immune attack. Mild injury is reversible: the cell swells and then recovers. Severe or prolonged injury causes cell death, either by necrosis, which is messy and releases contents that provoke inflammation, or by apoptosis, a tidy programmed self-destruction used in normal development and in removing damaged cells.

Inflammation is the coordinated response to injury or infection. Its aim is to bring defenders to the site, remove the cause and dead tissue, and start repair. The classic signs, known since antiquity, are redness, heat, swelling and pain, with loss of function added later. Each has a mechanism. Chemical mediators such as histamine widen local blood vessels, which increases blood flow, causing redness and warmth. The vessels also become leaky, letting fluid and proteins into tissue, causing swelling. Mediators and swelling stimulate nerve endings, causing pain.

Cells arrive in a typical order. Neutrophils come first and are the main early responders to bacteria. Macrophages arrive later, clear debris and help organize repair. If the cause persists, chronic inflammation develops, with lymphocytes and macrophages, ongoing tissue damage and scarring, as in long-standing hepatitis or in the artery wall in atherosclerosis.

Healing then follows. Some tissues regenerate with the same cell type, such as skin surface and liver. Others, such as heart muscle, mainly heal with scar made of collagen. A scar holds tissue together but does not contract or conduct like the original, which is why a heart attack can leave lasting weakness.

Anti-inflammatory drugs such as ibuprofen block enzymes that make prostaglandins, mediators of pain, fever and swelling. They treat symptoms of an inflammatory process rather than its cause.`,
      },
      {
        id: 'med-g912.l06',
        title: 'Infection and the Immune Response',
        blurb: 'Pathogens, innate and adaptive immunity, and how treatments work.',
        minutes: 9,
        asOf: '2026-10',
        anchors: [
          { kind: 'mesh', ref: 'Communicable Diseases', note: 'infectious disease basics' },
          { kind: 'mesh', ref: 'Adaptive Immunity', note: 'antibody and T cell responses' },
          { kind: 'mesh', ref: 'Anti-Bacterial Agents', note: 'antibiotic action' },
        ],
        body: `Pathogens are organisms that cause disease. The main groups are bacteria (single-celled, living on their own), viruses (tiny packages of genetic material that must enter host cells to replicate), fungi, and parasites such as protozoa and worms. Knowing the group matters because treatments differ. Antibiotics act on bacterial features, for example the bacterial cell wall or bacterial ribosomes, and do nothing against viruses. Antiviral drugs target steps in the viral life cycle. Antibiotic use against viral colds therefore adds side effects and resistance risk without benefit.

The immune system has two layers. Innate immunity is immediate and general: skin and mucus barriers, stomach acid, phagocytes that engulf microbes, inflammation, and fever. Adaptive immunity is slower on a first encounter but specific and has memory. B cells make antibodies that bind a particular antigen, and T cells either help coordinate the response or kill infected cells directly.

Memory is why people rarely get some diseases twice and why vaccines work. A vaccine shows the immune system an antigen, for example a piece of a pathogen or a weakened or inactivated form, without causing the disease. The first exposure produces a slow primary response and memory cells; later exposure to the real pathogen triggers a faster, stronger secondary response. Antibodies can also be borrowed: a newborn carries antibodies from the mother that provide temporary protection.

Antibiotic resistance arises by natural selection. When an antibiotic is used, susceptible bacteria die and any bacteria with a resistance gene survive and multiply, and resistance genes can spread between bacteria. Every use of antibiotics selects for resistance, which is why they should be used only when needed and the prescribed course followed as directed by the clinician.

A worked example: in bacterial pneumonia, bacteria in the alveoli trigger neutrophil influx and fluid, which fills air sacs and impairs gas exchange. That explains fever, cough with sputum and low oxygen, and why antibiotics plus support are the standard treatment.`,
      },
      {
        id: 'med-g912.l07',
        title: 'Cancer: When Cell Growth Escapes Control',
        blurb: 'How mutations break the rules of division, and how cancer spreads.',
        minutes: 9,
        asOf: '2026-10',
        anchors: [
          { kind: 'mesh', ref: 'Neoplasms', note: 'definition and classification' },
          { kind: 'mesh', ref: 'Genes, Tumor Suppressor', note: 'brake genes such as TP53' },
          { kind: 'mesh', ref: 'Oncogenes', note: 'accelerator genes' },
        ],
        body: `Cancer is a group of diseases in which cells divide without proper control and can invade other tissues. It begins with changes in DNA called mutations. Most mutations are harmless, but a few hit genes that control growth. Two classes matter most. Proto-oncogenes are accelerators: when mutated into oncogenes they push cells to divide. Tumor suppressor genes are brakes or repair crews; when they are lost, as with TP53, which normally halts damaged cells or triggers their death, errors accumulate. Cancer usually needs several such changes in one cell lineage, which is one reason risk rises with age.

Mutations can be inherited, as in BRCA1 and BRCA2 variants that raise breast and ovarian cancer risk, but most arise during life from random copying errors and from carcinogens. Established carcinogens include tobacco smoke, ultraviolet radiation, asbestos, and some infections such as human papillomavirus, which causes cervical cancer, and hepatitis B and C viruses, which raise liver cancer risk.

A tumor is a mass of abnormal cells. A benign tumor stays local and does not invade; a malignant tumor invades surrounding tissue and can spread. Spread through blood or lymph to distant organs is called metastasis, and it is the main reason cancer kills. Cancers are named by tissue of origin: carcinoma arises in epithelial tissue such as lung, breast or colon; sarcoma arises in connective tissue; leukemia and lymphoma arise from blood and lymphatic cells.

Staging describes how far the cancer has spread and strongly guides treatment and outlook. Treatment options include surgery, radiation, chemotherapy that targets rapidly dividing cells, targeted drugs aimed at a specific mutated protein, and immunotherapy that helps immune cells attack tumor. Because rapidly dividing normal cells, such as hair follicles and gut lining, are also affected by chemotherapy, hair loss and nausea are expected effects.

Screening aims to find cancer early, for example by cervical cytology or HPV testing, mammography, and colon cancer screening. Screening schedules are set by expert bodies and change with evidence.`,
      },
      {
        id: 'med-g912.l08',
        title: 'Autoimmune and Genetic Disease',
        blurb: 'When the immune system turns on the self, and when DNA itself is the cause.',
        minutes: 9,
        asOf: '2026-10',
        anchors: [
          { kind: 'mesh', ref: 'Autoimmune Diseases', note: 'loss of self-tolerance' },
          { kind: 'mesh', ref: 'Cystic Fibrosis', note: 'autosomal recessive example' },
          { kind: 'mesh', ref: 'Sickle Cell Anemia', note: 'single-gene example' },
        ],
        body: `Normally the immune system learns to tolerate the body own tissues: self-reactive lymphocytes are eliminated or restrained as they develop. Autoimmune disease occurs when tolerance fails and the immune system attacks normal tissue. Causes involve a mix of inherited susceptibility, environmental triggers such as infection, and sex hormones, since many autoimmune diseases are more common in women. Examples include type 1 diabetes, where T cells destroy insulin-producing beta cells; rheumatoid arthritis, where joint lining is attacked; multiple sclerosis, where myelin in the central nervous system is damaged; and Graves disease, where antibodies stimulate the thyroid. Treatment usually suppresses or redirects the immune response, and the cost is higher infection risk.

Genetic disease results from changes in DNA. Humans have 23 chromosome pairs, with one copy of each from each parent. In autosomal recessive disease, a person needs two faulty copies; carriers with one copy are usually healthy. Cystic fibrosis, caused by variants in the CFTR gene, which encodes a chloride channel, is an example: thick mucus builds up in the lungs and pancreas. Two carrier parents have a 1 in 4 chance of an affected child with each pregnancy. In autosomal dominant disease, one faulty copy is enough, so an affected parent has a 1 in 2 chance of passing it on; Huntington disease is an example. In X-linked recessive disease, such as hemophilia A and Duchenne muscular dystrophy, males are more often affected because they have only one X chromosome.

Sickle cell disease is a clear case of how a small change has large effects. One altered DNA letter changes one amino acid in the beta chain of hemoglobin. Under low oxygen, the abnormal hemoglobin forms stiff fibers that bend red cells into rigid sickle shapes. They block small vessels, causing pain episodes, and break down early, causing anemia. Carriers have some protection against severe malaria, which helps explain why the variant is common in regions where malaria was widespread.

Other conditions come from chromosome number, such as trisomy 21 causing Down syndrome. Many common diseases are multifactorial, meaning many genes and environment contribute, so having a risk gene is not destiny.`,
      },
    ],
  },
  questions: [
    mcq('med-g912.l05', 1, 1, `Which sign of inflammation is caused mainly by increased blood flow to the injured area?`,
      [`Redness and warmth`, `Pain only`, `Loss of function only`, `Scar formation`], 0,
      `Think about what widened vessels deliver.`, `Mediators like histamine widen vessels, increasing blood flow, which gives redness and heat. Swelling is due to leaky vessels, and pain to stimulation of nerve endings.`),
    mcq('med-g912.l05', 2, 1, `Which cell type is typically the first to arrive in large numbers in acute bacterial inflammation?`,
      [`Neutrophils`, `Macrophages`, `Plasma cells`, `Red blood cells`], 0,
      `It is the main early responder, ahead of the cells that clear debris later.`, `Neutrophils dominate early; macrophages arrive later to clear debris and organize repair. Plasma cells secrete antibodies later in the adaptive response.`),
    mcq('med-g912.l05', 3, 2, `Why does a heart attack that kills heart muscle often leave lasting weakness even after healing?`,
      [`Cardiac muscle mainly heals by collagen scar, which does not contract like muscle`, `Cardiac muscle regenerates fully but only after the inflammatory phase has been blocked`, `Necrosis in the heart is replaced by apoptosis of neighboring vessels`, `Healing in the heart is prevented because neutrophils cannot enter cardiac tissue`], 0,
      `Compare scar tissue with the tissue it replaces.`, `Cardiac muscle has very limited regeneration, so a collagen scar fills the defect; it holds together but does not contract. Full regeneration would not leave weakness.`),
    mcq('med-g912.l05', 4, 3, `A patient takes ibuprofen for a swollen, painful ankle after a sprain. Which statement best explains why it relieves pain and swelling?`,
      [`It blocks enzymes that make prostaglandins, which are mediators of pain and inflammation`, `It destroys neutrophils at the site, so the inflammatory process cannot continue and tissue heals sooner`, `It removes the cause of the injury by speeding collagen scar formation`, `It increases histamine release, which shuts down the vessel leakiness`], 0,
      `Consider which chemical mediators the drug class targets.`, `NSAIDs inhibit cyclooxygenase enzymes and so reduce prostaglandins. They do not remove neutrophils or the injury; increasing histamine would worsen swelling.`),

    mcq('med-g912.l06', 1, 1, `Why are antibiotics ineffective against the common cold?`,
      [`Colds are caused by viruses, and antibiotics target bacterial structures`, `Colds are caused by fungi, which have different cell walls`, `Colds are caused by parasites that live inside red blood cells and are cleared by the spleen`, `Colds produce toxins that antibiotics cannot neutralize`], 0,
      `Identify the type of pathogen first.`, `Antibiotics act on bacterial features such as cell wall synthesis or bacterial ribosomes. Common colds are viral.`),
    mcq('med-g912.l06', 2, 1, `Which cell is the direct source of the antibodies released into the blood?`,
      [`Plasma cells, the differentiated form of B cells`, `Neutrophils, the first phagocytes to arrive`, `Cytotoxic T cells, which kill infected cells`, `Platelets, the fragments that form clots`], 0,
      `Antibodies are secreted proteins from the adaptive branch.`, `Activated B cells differentiate into plasma cells, which are the cells that secrete antibodies. Cytotoxic T cells kill infected cells directly rather than secreting antibodies.`),
    mcq('med-g912.l06', 3, 2, `How does a vaccine provide protection against a later infection?`,
      [`It creates memory cells so a later exposure triggers a faster, stronger response`, `It supplies finished antibodies that persist for the whole life of the person without any immune cell involvement`, `It kills all bacteria in the body before they can multiply`, `It permanently raises the activity of neutrophils`], 0,
      `Ask what the immune system retains after the first exposure.`, `Vaccines induce an adaptive response and memory. Supplying finished antibodies is passive immunity, which fades.`),
    mcq('med-g912.l06', 4, 3, `A patient stops a prescribed antibiotic early because they feel better, and weeks later the infection returns and no longer responds to the same drug. Which mechanism best explains the second result?`,
      [`Surviving bacteria carrying resistance traits were selected and then multiplied`, `The antibiotic taught the bacteria which of its targets to modify in the patient immune system`, `The patient developed an allergy that blocked the drug from reaching the bacteria`, `The drug converted to a form that now stimulates bacterial growth`], 0,
      `Think of natural selection acting on a bacterial population.`, `Incomplete or unnecessary use leaves the more resistant bacteria alive to multiply. Immune memory against the drug or an allergy does not make bacteria resistant.`),

    mcq('med-g912.l07', 1, 1, `In cancer biology, what does the term metastasis describe?`,
      [`Spread of cancer cells to distant sites through blood or lymph`, `Growth of a benign tumor that stays encapsulated in its tissue`, `Repair of damaged DNA by tumor suppressor genes`, `Death of a cancer cell by programmed self-destruction`], 0,
      `The word relates to spread, not growth in place.`, `Metastasis is dissemination to distant organs and is what chiefly makes cancer deadly. A benign tumor does not invade or spread.`),
    mcq('med-g912.l07', 2, 1, `Which description fits a tumor suppressor gene such as TP53?`,
      [`A brake or repair gene whose loss lets damaged cells keep dividing`, `An accelerator gene that must be switched on to cause cell division`, `A gene that produces antibodies against tumor cells`, `A gene that is only present in cancer cells`], 0,
      `The word suppressor tells you its normal job.`, `Tumor suppressors restrain growth or repair DNA, and loss of function contributes to cancer. The accelerator description fits oncogenes.`),
    mcq('med-g912.l07', 3, 2, `A cancer that arises from epithelial cells lining the colon is best classified as which type?`,
      [`Carcinoma`, `Sarcoma`, `Lymphoma`, `Leukemia`], 0,
      `Epithelial origin has its own name.`, `Cancers of epithelial tissue are carcinomas. Sarcomas arise from connective tissue; lymphoma and leukemia come from lymphatic and blood-forming cells.`),
    mcq('med-g912.l07', 4, 3, `A patient receiving chemotherapy has nausea and hair loss. Which explanation best accounts for both effects?`,
      [`Many chemotherapy drugs damage all rapidly dividing cells, including gut lining and hair follicle cells`, `Chemotherapy drugs selectively target neurons and so disrupt hair growth cycles and gut motility through the nervous system`, `Chemotherapy causes oncogene activation in normal cells of the gut and scalp, which triggers nausea and hair shedding`, `Chemotherapy triggers metastasis of the tumor to the skin and stomach`], 0,
      `Ask what property of cancer cells chemotherapy exploits and who else shares it.`, `Classic chemotherapy exploits rapid division, which gut epithelium and hair follicles share. It does not selectively target neurons or cause metastasis.`),

    mcq('med-g912.l08', 1, 1, `In autosomal recessive disease, two carrier parents have what chance of an affected child in each pregnancy?`,
      [`1 in 4`, `1 in 2`, `3 in 4`, `Almost zero`], 0,
      `Each parent passes one of two copies at random.`, `Each parent passes the faulty copy with probability one half, so both do with probability one quarter. One half applies to a dominant condition with one affected parent.`),
    mcq('med-g912.l08', 2, 2, `Which condition is the best example of an autoimmune disease?`,
      [`Type 1 diabetes, where T cells destroy insulin-producing beta cells`, `Cystic fibrosis, where a chloride channel is defective and mucus thickens`, `Sickle cell disease, where hemoglobin forms stiff fibers`, `Down syndrome, which results from an extra chromosome 21`], 0,
      `Look for the immune attack on a normal tissue.`, `Type 1 diabetes is immune-mediated destruction of beta cells. The others are genetic or chromosomal and not driven by a loss of immune tolerance.`),
    mcq('med-g912.l08', 3, 2, `Which pattern of inheritance explains why males are more often affected by hemophilia A than females?`,
      [`X-linked recessive, because males have only one X chromosome`, `Autosomal dominant, because males carry more dominant alleles`, `Mitochondrial inheritance, because males pass it to all sons`, `Autosomal recessive, because males have fewer autosomes`], 0,
      `Count the X chromosomes in each sex.`, `A recessive variant on the X shows in males who have no second X to compensate. Autosomal inheritance affects both sexes equally.`),
    mcq('med-g912.l08', 4, 3, `A couple are both carriers of a CF variant and their first child is unaffected. What is the probability their second child is affected?`,
      [`1 in 4, because each pregnancy is an independent event`, `1 in 3, because the first child lowers the remaining risk`, `1 in 2, because one allele has already been passed on`, `Near zero, because the unaffected first child used up the affected combination`], 0,
      `Do earlier births change the odds of the next one?`, `Each conception is independent, so risk stays 1 in 4. The one-in-three figure is a misapplication that treats births as depleting a pool.`),
  ],
};
