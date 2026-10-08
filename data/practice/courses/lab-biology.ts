import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

const m = (
  id: string, level: 1 | 2 | 3, prompt: string, choices: string[], answer: number, hint: string, explanation: string,
): Question => ({ id, lessonId: id.replace(/\.q\d+$/, ''), kind: 'mcq', prompt, choices, answer, hint, explanation, level });

const tf = (
  id: string, level: 1 | 2 | 3, prompt: string, answer: 0 | 1, hint: string, explanation: string,
): Question => ({ id, lessonId: id.replace(/\.q\d+$/, ''), kind: 'tf', prompt, answer, hint, explanation, level });

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'lab-biology',
    label: 'Biology',
    blurb: 'The living code - from the single cell to the whole biosphere, and how genes, populations and ecosystems work.',
    accent: '#40C057',
    framework: 'ngss',
    tracks: [
      {
        id: 'lab-biology.t1',
        title: 'Cells and the Molecules of Heredity',
        blurb: 'What life is made of and how its information is stored and read.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'lab-biology.l01',
            title: 'Cell Theory',
            blurb: 'All living things are made of cells, and cells come from cells.',
            minutes: 7,
            body: `Cell theory is one of the foundations of biology, and it took nearly two centuries to assemble. In 1665 Robert Hooke looked at thin slices of cork through a microscope and described tiny box-like chambers, which he called cells. What he actually saw were the empty walls of dead cells. A few years later Antonie van Leeuwenhoek saw living creatures in pond water, which he called animalcules, and became the first person to observe bacteria and other single-celled life.

In 1838 and 1839 Matthias Schleiden and Theodor Schwann generalised the idea: plants and animals alike are built of cells. In 1855 Rudolf Virchow added the final principle, omnis cellula e cellula, which means that every cell arises from the division of a pre-existing cell.

Together these ideas say that all living things are composed of one or more cells, that the cell is the basic unit of life, and that new cells only come from existing cells. This last point rules out spontaneous generation at the cellular scale.

Everyday example: when you heal a cut, new skin cells are made by dividing nearby skin cells, not assembled from scratch. Cell theory ties together structure, function and heredity, since the cell is the unit that carries a copy of the genetic material.`,
          },
          {
            id: 'lab-biology.l02',
            title: 'DNA and the Double Helix',
            blurb: 'A paired-strand molecule that stores and copies heredity.',
            minutes: 8,
            body: `DNA is the molecule that carries hereditary information. In 1944 the Avery, MacLeod and McCarty experiment showed that DNA, not protein, is what transmits heredity. In 1952 Rosalind Franklin and Raymond Gosling captured Photo 51, an X-ray diffraction image whose cross-shaped pattern revealed that DNA is a helix. In 1953 James Watson and Francis Crick published a one-page paper proposing the double helix.

The structure explains function. DNA has two strands running in opposite directions, held together by pairs of bases: A always pairs with T, and G always pairs with C. This is complementary base pairing. If one strand reads ATGC, the strand opposite reads TACG. Because each strand is a template for the other, the molecule can be copied with astonishing accuracy.

In 1958 Meselson and Stahl proved that replication is semiconservative: each new double helix keeps one old strand and gets one new strand. After one round of copying, every daughter molecule contains exactly one strand from the original.

Everyday relevance: the same base-pairing rules are why a tiny sample of DNA can identify a person, and why mutations, which are copying mistakes, are rare but real. Crick and Watson noted that the structure immediately suggested how genetic material could be copied.`,
          },
          {
            id: 'lab-biology.l03',
            title: 'The Central Dogma',
            blurb: 'Information flows from DNA to RNA to protein.',
            minutes: 8,
            body: `Francis Crick's central dogma says that sequence information flows from DNA to RNA to protein, and not back from protein into nucleic acid. The two steps have names. Transcription copies a gene into messenger RNA, or mRNA. Translation reads that mRNA on a ribosome, three bases at a time. Each group of three bases is a codon and specifies one amino acid, the building blocks of proteins.

There are four bases, so three-base codons give 4 x 4 x 4 = 64 possible codons. They map to the 20 amino acids and to stop signals. An mRNA segment 9 bases long contains 3 codons and so specifies 3 amino acids.

The code was cracked in the 1960s. In 1961 Nirenberg and Matthaei made a synthetic RNA made only of uracil and found that it produced a protein made only of phenylalanine, revealing that UUU codes for phenylalanine. Nirenberg, Khorana and Holley then mapped all 64 codons.

Remarkably, the genetic code is very nearly universal across all life, from bacteria to humans. This is strong evidence that all living things share a single common ancestor.

Everyday example: insulin made by bacteria in a factory works because bacteria can read a human gene using the same code.`,
          },
          {
            id: 'lab-biology.l04',
            title: 'Mendelian Inheritance',
            blurb: 'Discrete factors of heredity show predictable ratios.',
            minutes: 8,
            body: `Gregor Mendel's genius was to treat heredity as something to be counted. In 1866 he published results from crossing true-breeding pea plants, scoring seven traits across about 28,000 plants. He found that traits are carried by discrete factors, now called genes, which come in pairs. The two copies separate cleanly when gametes form, which is the law of segregation, and different traits are inherited independently of one another, which is the law of independent assortment.

Consider a cross between two heterozygous parents, Aa x Aa, where A is dominant. The offspring are AA, Aa, Aa and aa in equal proportion, so three quarters show the dominant trait and one quarter the recessive: a 3 to 1 ratio. Among 400 offspring you would expect about 100 recessive plants. A cross of two traits at once gives the classic 9:3:3:1 ratio.

Mendel's work was ignored for about 35 years. It was rediscovered in 1900 by De Vries, Correns and von Tschermak. In 1902 and 1903 Sutton and Boveri linked Mendel's factors to chromosomes, and in 1911 Thomas Hunt Morgan's fruit-fly crosses placed genes at ordered positions along the chromosome.

Everyday example: eye-colour and blood-type patterns in families follow these inheritance rules.`,
          },
        ],
      },
      {
        id: 'lab-biology.t2',
        title: 'Evolution and Populations',
        blurb: 'How populations change, and how new species arise.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'lab-biology.l05',
            title: 'Evolution by Natural Selection',
            blurb: 'Variation, heredity and differential reproduction.',
            minutes: 9,
            body: `Natural selection needs only three ingredients.
- First, individuals in a population vary.
- Second, some of that variation is heritable, passed from parents to offspring.
- Third, individuals differ in how many offspring survive and reproduce.

Where all three hold, traits that leave more descendants become more common each generation. Darwin and Wallace first announced the idea in a joint reading in 1858, and Darwin published On the Origin of Species in 1859.

Selection is not random. It is the non-random filtering of variation that arises by random mutation. Over many generations this can build remarkably intricate structures.

Evolution has been observed directly. Peter and Rosemary Grant measured beak size in Galapagos finches and found it shifting within a single generation when a drought changed which seeds were available. In the peppered moth, dark forms rose and fell in frequency as soot pollution came and went. In Richard Lenski's long-term experiment, begun in 1988, E. coli bacteria were followed for over 75,000 generations, and one lineage evolved the ability to metabolise citrate.

Everyday relevance: bacteria evolving resistance to antibiotics is natural selection in action. Selection ties together genetics, ecology, palaeontology and molecular biology.`,
          },
          {
            id: 'lab-biology.l06',
            title: 'Hardy-Weinberg Equilibrium',
            blurb: 'The baseline for detecting evolution in gene pools.',
            minutes: 9,
            body: `Population geneticists need a baseline, a description of what a gene pool does when nothing is changing it. That baseline is the Hardy-Weinberg equilibrium. For a gene with two alleles, A with frequency p and a with frequency q, the frequencies must add to one: p + q = 1. When the population is large, mates randomly, and has no selection, mutation, migration or genetic drift, the genotype frequencies stay constant and equal p squared + 2pq + q squared = 1. Here p squared is the frequency of AA, 2pq of Aa, and q squared of aa.

A worked example: if p = 0.7, then q = 0.3. The heterozygotes make up 2 x 0.7 x 0.3 = 0.42 of the population, and the aa genotype 0.3 x 0.3 = 0.09.

You can also work backwards. If 16 percent of a population shows a recessive trait, then q squared = 0.16, so q = 0.4, p = 0.6, and the carriers (Aa) are 2 x 0.6 x 0.4 = 0.48, or 48 percent.

The equilibrium is a null model. If observed genotype frequencies differ from the predicted ones, something is acting on the population: selection, migration, mutation, drift or non-random mating. Deviations therefore reveal evolution in action.`,
          },
          {
            id: 'lab-biology.l07',
            title: 'Heritability and Response to Selection',
            blurb: 'How much of a trait can selection change?',
            minutes: 8,
            body: `Not every difference between individuals is genetic. Narrow-sense heritability, written h squared, is the proportion of the total variation in a trait that is due to additive genetic effects: h squared = V_A / V_P, where V_A is additive genetic variance and V_P is total phenotypic variance. If V_A is 30 and V_P is 60, h squared is 0.5.

Heritability governs how a population responds to selection. The breeder's equation says R = h squared x S. Here S is the selection differential, how much better the chosen parents are than the population average, and R is the response, how far the mean shifts in the next generation. If h squared = 0.4 and breeders select parents whose average is 10 g heavier than the population mean, the offspring mean rises by 0.4 x 10 = 4 g.

Everyday example: a dairy farmer who breeds only from the highest-producing cows will see a larger increase in milk yield for a trait with high heritability than for one with low heritability.

Note a common misunderstanding. Heritability applies to variation within a particular population and environment. It does not say how much of an individual's trait is caused by genes. If heritability is zero, selection produces no response, however strong it is, because the differences are not passed on.`,
          },
          {
            id: 'lab-biology.l08',
            title: 'Speciation',
            blurb: 'How one lineage splits into two.',
            minutes: 8,
            body: `Speciation is evolution branching in two. It happens when populations become reproductively isolated, meaning they can no longer interbreed successfully. The most common route is allopatric speciation, which begins with geographic isolation. A barrier such as a river, a mountain range or a stretch of sea splits a population. The two halves accumulate different mutations and adapt to different conditions, until eventually they can no longer interbreed even if they meet again.

Isolation can also evolve without a physical barrier. The apple maggot fly Rhagoletis shifted from laying eggs on hawthorn fruit to apples, and populations using different hosts are becoming distinct species. Chromosomal changes and divergent mate choice can also split lineages.

Sometimes a single ancestor diversifies rapidly to fill many ecological niches, called an adaptive radiation. One ancestral finch gave rise to about 15 species on the Galapagos Islands, with beaks suited to different diets. In Lake Victoria hundreds of cichlid fish species arose in under about 15,000 years.

Everyday relevance: speciation explains the branching tree of biodiversity. The Ensatina salamanders of California, which interbreed around a valley but not where the two ends of the ring meet, show the process caught part-way.`,
          },
        ],
      },
      {
        id: 'lab-biology.t3',
        title: 'Physiology and Ecology',
        blurb: 'How organisms and communities keep running.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'lab-biology.l09',
            title: 'Homeostasis, Metabolism and Scaling',
            blurb: 'Stable insides, energy flow and body size.',
            minutes: 8,
            body: `Organisms maintain a stable internal environment, a process called homeostasis. Using feedback regulation, they keep temperature, pH, ion concentrations and fuel levels within a narrow range. When your body temperature rises, you sweat; when blood sugar rises, hormones help lower it. In negative feedback the response opposes the change.

All of this takes energy. Metabolism is the set of coupled chemical reactions that capture, store and release energy. Photosynthesis and respiration power life through the energy carrier ATP.

Rates of metabolism depend on temperature. The Q10 coefficient describes how much a rate changes with a 10 degree Celsius rise. A Q10 of 2 means the rate doubles for each 10 degrees: a rate of 3 units at 15 degrees becomes 6 units at 25 degrees. Cold-blooded animals slow down in the cold for this reason.

Metabolism also scales with body size. Kleiber's law says basal metabolic rate is proportional to body mass to the three-quarter power: B = B0 x M^(3/4). A mouse and a whale differ by a factor of many thousands in mass, but the whale's metabolic rate is far less than proportionally larger. A body 16 times heavier has a metabolic rate about 8 times higher, because 16 to the power 3/4 is 8. Per kilogram, small animals burn energy faster than large ones.`,
          },
          {
            id: 'lab-biology.l10',
            title: 'Enzyme Kinetics',
            blurb: 'Why enzyme reactions saturate.',
            minutes: 7,
            body: `Enzymes are biological catalysts that speed up the chemical reactions of life. Michaelis and Menten described their rate in 1913. The rate v depends on the substrate concentration [S] in a saturating way: v = Vmax [S] / (Km + [S]). Here Vmax is the maximum rate and Km, the Michaelis constant, is a measure of how readily the enzyme binds its substrate.

At low substrate concentrations, the rate rises almost in proportion to [S], because there are plenty of free enzyme molecules. As [S] increases, the enzymes become busy and the curve flattens, approaching Vmax. Because Km is the substrate concentration at which the rate is half of Vmax, setting [S] = Km gives v = Vmax / 2. For example, with Vmax = 100 and Km = 2 (in the same concentration units), a substrate concentration of 2 gives a rate of 100 x 2 / (2 + 2) = 50.

Everyday analogy: a restaurant with a fixed number of waiters. When there are only a few customers, adding more increases the number served. Once all the waiters are busy, extra customers do not increase the rate, which has reached its maximum.

Understanding this saturation is essential for medicine, because many drugs work by slowing enzymes, and for industry, where enzymes make food and fuels.`,
          },
          {
            id: 'lab-biology.l11',
            title: 'Population Growth',
            blurb: 'Exponential, logistic and predator-prey dynamics.',
            minutes: 9,
            body: `Ecologists model how populations change in size. With unlimited resources, a population grows exponentially: N(t) = N0 e^(rt), where N0 is the starting size, r is the intrinsic growth rate and t is time. For species with discrete breeding seasons, the discrete form is N(t+1) = lambda x N(t). If 100 individuals have lambda = 1.5, the population is 150 after one generation and 225 after two.

Exponential growth cannot go on forever. Real environments have limits. The logistic model, from Verhulst in 1838, says dN/dt = r N (1 - N/K), where K is the carrying capacity, the largest population the environment can support. When N is small the factor (1 - N/K) is close to 1 and growth is nearly exponential. As N nears K the factor approaches zero and growth slows, giving an S-shaped curve. At N = K the growth rate is zero.

Species also affect each other. The Lotka-Volterra equations describe a predator and its prey. More prey allows predators to increase, more predators reduce prey, fewer prey then reduce predators, and the cycle repeats. The model generates the oscillations in abundance seen in nature.

Everyday example: a few yeast cells in a fresh jar of grape juice multiply rapidly at first, then level off as food and space run out.`,
          },
          {
            id: 'lab-biology.l12',
            title: 'Ecosystems and Biodiversity',
            blurb: 'Energy flow, nutrient cycles and measuring diversity.',
            minutes: 8,
            body: `An ecosystem is a community of living organisms interacting with their physical environment. Energy flows through it, entering mainly as sunlight captured by producers such as plants, passing to consumers that eat them, and ending up as heat. Nutrients, in contrast, cycle. Decomposers such as fungi and bacteria break down dead material and return nutrients to the soil, where producers can use them again.

Ecologists measure biodiversity with indices that combine how many species there are (richness) and how evenly individuals are spread among them (evenness). Simpson's index is D = 1 - sum of p squared, where p is each species' proportion; it is the probability that two randomly drawn individuals belong to different species. Two species at 50 percent each give D = 1 - (0.25 + 0.25) = 0.5. The Shannon index also rises when a community is richer and more even.

Diversity also depends on area. The species-area relationship is S = c A^z, with z typically between about 0.2 and 0.35. With z = 0.25, a habitat 16 times larger holds about twice as many species, since 16 to the power 0.25 is 2.

Everyday relevance: this relationship underlies island biogeography and conservation planning, for example how much habitat is needed to protect a certain number of species.`,
          },
        ],
      },
      {
        id: 'lab-biology.t4',
        title: 'The Genomic Age',
        blurb: 'Editing and reading the code of life.',
        level: 'ADVANCED',
        lessons: [
          {
            id: 'lab-biology.l13',
            title: 'CRISPR and Genome Editing',
            blurb: 'A bacterial defence turned into programmable scissors.',
            minutes: 8,
            body: `CRISPR began as a puzzle. In 1987 Yoshizumi Ishino noticed strange repeated DNA sequences in E. coli, but nobody knew what they did. They turned out to be part of a bacterial immune system. Bacteria store snippets of viral DNA between the repeats. When the same virus attacks again, an RNA copy of the stored snippet guides the enzyme Cas9 to the matching viral DNA, and Cas9 cuts it.

In 2012 Jennifer Doudna and Emmanuelle Charpentier showed that the guide RNA could be reprogrammed to point Cas9 at any chosen DNA sequence. That turned a bacterial defence into a general-purpose gene-editing tool: to edit a different gene, you change the guide RNA, not the enzyme. They were awarded the 2020 Nobel Prize in Chemistry for the discovery.

The technology moved quickly from the lab to the clinic. In 2023 Casgevy became the first approved CRISPR-based medicine, for sickle-cell disease.

Everyday relevance: CRISPR is now routine in research labs for creating models of disease, and it is being explored for crops and therapies. It also raises ethical questions about which edits, particularly to embryos and inherited DNA, are acceptable.

CRISPR illustrates how basic curiosity about a bacterial oddity can end up transforming medicine.`,
          },
          {
            id: 'lab-biology.l14',
            title: 'A Short History of Biology',
            blurb: 'From Aristotle to genomes: how the science grew.',
            minutes: 9,
            body: `Biology began as natural history. In antiquity Aristotle described and classified animals and Theophrastus catalogued plants, while physicians such as Galen studied anatomy. The microscope in the 1600s opened a hidden world: Hooke named the cell and Leeuwenhoek saw bacteria.

In the 1700s and early 1800s a flood of specimens demanded order. Linnaeus provided binomial nomenclature, a two-part scientific name such as Homo sapiens, and a nested hierarchy of ranks, while Cuvier established that extinction is real. The Darwinian revolution of the mid-1800s then supplied a mechanism, natural selection, and the germ theory of Pasteur explained infectious disease.

Around 1900 the rediscovery of Mendel launched genetics, and the Modern Synthesis united Mendelian inheritance with Darwinian selection through mathematical population genetics by Fisher, Haldane and Wright. From the 1940s biology descended to molecules: the double helix, the genetic code, recombinant DNA and Sanger sequencing in 1977.

The latest era is genomic. High-throughput sequencing turns genomes into data. The Human Genome Project produced a draft between 2001 and 2003, CRISPR made editing routine in 2012, and systems biology models whole networks.

The thread through this history is the habit of looking closely, then measuring, then explaining.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'lab-biology',
    questions: [
      // l01
      m('lab-biology.l01.q1', 1, 'Who first used the word cell, describing the pores of cork?',
        ['Virchow', 'Hooke', 'Leeuwenhoek', 'Schwann'], 1,
        'He published Micrographia in 1665.', 'Robert Hooke named cells after seeing the box-like structure of cork under a microscope.'),
      m('lab-biology.l01.q2', 1, 'What does the principle omnis cellula e cellula mean?',
        ['All cells are identical', 'Every cell comes from a pre-existing cell', 'Cells can form spontaneously from non-living matter', 'Only animals are made of cells'], 1,
        'It was added by Virchow in 1855.', 'Virchow established that cells arise only from the division of other cells.'),
      m('lab-biology.l01.q3', 2, 'A newly discovered organism is found living in a deep-sea vent. According to cell theory, what should it be made of?',
        ['Tissues but not cells', 'One or more cells', 'Only protein', 'Non-living material'], 1,
        'Cell theory covers all living things.', 'Cell theory states all living things are composed of one or more cells.'),
      m('lab-biology.l01.q4', 3, 'Why does the principle that every cell comes from a pre-existing cell argue against spontaneous generation?',
        ['It shows cells are too small to see', 'It says new cells only arise from existing cells, not from non-living matter', 'It proves that cork is alive', 'It shows animals cannot reproduce'], 1,
        'Think about the source of new cells.', 'If cells only arise by division of existing cells, they do not appear spontaneously from non-living matter.'),
      // l02
      m('lab-biology.l02.q1', 1, 'In DNA, which base pairs with adenine (A)?',
        ['Guanine', 'Cytosine', 'Uracil', 'Thymine'], 3,
        'It is a base found in DNA but not RNA.', 'A pairs with T and G pairs with C.'),
      m('lab-biology.l02.q2', 1, 'What did the Meselson-Stahl experiment show?',
        ['DNA carries heredity, not protein', 'DNA replication is semiconservative', 'DNA is a helix', 'Genes are on chromosomes'], 1,
        'Each daughter helix keeps something from the parent.', 'Each new double helix contains one old strand and one new strand.'),
      m('lab-biology.l02.q3', 2, 'One strand of DNA has the sequence ATGC. What is the sequence of the complementary strand?',
        ['ATGC', 'CGTA', 'TACG', 'GCAT'], 2,
        'Pair each base: A with T, G with C.', 'A pairs with T, T with A, G with C and C with G, giving TACG.'),
      m('lab-biology.l02.q4', 3, 'Why does the double-helix structure suggest a way to copy genetic information?',
        ['Because each strand can serve as a template for the other through base pairing', 'Because DNA is a single strand', 'Because the helix contains protein', 'Because DNA is rarely copied accurately'], 0,
        'Think about what complementary means.', 'Because bases pair specifically, each strand specifies its partner and can be used as a template.'),
      // l03
      m('lab-biology.l03.q1', 1, 'What is the direction of information flow described by the central dogma?',
        ['Protein to RNA to DNA', 'RNA to DNA to protein', 'DNA to RNA to protein', 'DNA to protein to RNA'], 2,
        'Transcription comes before translation.', 'Information flows from DNA to RNA to protein.'),
      m('lab-biology.l03.q2', 1, 'How many bases make up one codon?',
        ['Three', 'One base for each amino acid', 'Two bases, read in pairs', 'Four, one for each type of base'], 0,
        'There are 64 codons from four bases.', 'A codon is a group of three bases that specifies one amino acid or a stop signal.'),
      m('lab-biology.l03.q3', 2, 'A stretch of mRNA is 9 bases long and is read codon by codon. How many amino acids does it specify?',
        ['9', '6', '27', '3'], 3,
        'Divide by the codon length.', '9 bases divided into codons of 3 gives 3 amino acids.'),
      m('lab-biology.l03.q4', 3, 'What does the near-universality of the genetic code suggest?',
        ['Different organisms evolved codes independently', 'All life shares a common ancestor', 'Proteins carry heredity', 'Codons are random'], 1,
        'The same code is used by bacteria and humans.', 'A shared code across life is strong evidence for a single common ancestor.'),
      // l04
      m('lab-biology.l04.q1', 1, 'Which organism did Mendel use for his famous experiments?',
        ['Fruit flies', 'Pea plants', 'Bacteria', 'Finches'], 1,
        'He worked in a monastery garden.', 'Mendel crossed true-breeding pea plants.'),
      m('lab-biology.l04.q2', 1, 'What does Mendel\'s law of segregation say?',
        ['Different traits are always inherited together', 'The two copies of a gene separate into different gametes', 'Genes are made of protein', 'Mutations are always harmful'], 1,
        'Think about gamete formation.', 'The paired factors separate cleanly when gametes form.'),
      m('lab-biology.l04.q3', 2, 'Two heterozygous parents (Aa x Aa) produce 400 offspring. About how many are expected to be homozygous recessive (aa)?',
        ['200', '300', '100', '25'], 2,
        'One quarter of offspring are aa.', 'The cross gives 1 AA : 2 Aa : 1 aa, so about 1/4 of 400 = 100 are aa.'),
      m('lab-biology.l04.q4', 3, 'Why did the Sutton-Boveri chromosome theory matter for Mendel\'s work?',
        ['It linked Mendel\'s factors to the behaviour of chromosomes in meiosis', 'It proved Mendel\'s ratios were wrong', 'It showed genes are made of RNA', 'It discovered the cell'], 0,
        'It gave the abstract factors a physical home.', 'It showed Mendelian factors are carried on chromosomes, which separate during meiosis.'),
      // l05
      m('lab-biology.l05.q1', 1, 'Which is NOT one of the three ingredients of natural selection?',
        ['Variation among individuals', 'Heritability of that variation', 'Differences in survival or reproduction', 'Individuals deliberately acquiring useful traits'], 3,
        'Selection works on inherited variation.', 'Natural selection needs variation, heritability and differential reproduction, not deliberate acquisition of traits.'),
      m('lab-biology.l05.q2', 1, 'What did the Grants observe in Galapagos finches?',
        ['Beak size shifting within a generation when drought changed available seeds', 'Finches turning into a different genus', 'No variation in beak size', 'Beaks growing because finches used them more'], 0,
        'Seed types changed during a drought.', 'They measured beak size changing in response to drought-driven changes in seeds.'),
      m('lab-biology.l05.q3', 2, 'A bacterial population meets an antibiotic and a few resistant cells survive and reproduce. What is the likely outcome over generations?',
        ['Resistance becomes more common', 'Resistance fades because it is costly to keep', 'All of the bacteria in the population die out', 'Nothing changes because survivors cannot pass on traits'], 0,
        'Think about who leaves more descendants.', 'Resistant bacteria leave more descendants, so the trait increases in frequency.'),
      m('lab-biology.l05.q4', 3, 'Why is it wrong to say natural selection is just random chance?',
        ['Mutation is directed by what the organism needs to survive', 'Selection non-randomly filters random variation', 'Selection has no effect', 'Variation is always caused by the environment'], 1,
        'Distinguish the source of variation from the filter.', 'Mutation supplies random variation, but which variants survive and reproduce is non-random.'),
      // l06
      m('lab-biology.l06.q1', 1, 'In the Hardy-Weinberg equation p^2 + 2pq + q^2 = 1, what does 2pq represent?',
        ['The frequency of heterozygotes', 'The frequency of the dominant allele', 'The frequency of aa individuals', 'The mutation rate'], 0,
        'It is the middle term, with two ways to get one of each allele.', '2pq is the frequency of the heterozygous genotype.'),
      m('lab-biology.l06.q2', 1, 'Which of these is an assumption of Hardy-Weinberg equilibrium?',
        ['Strong natural selection acting on the gene', 'Frequent migration between populations', 'Random mating in a large population', 'Small population size with strong drift'], 2,
        'The baseline assumes no evolutionary forces.', 'The equilibrium assumes a large, randomly mating population with no selection, mutation, migration or drift.'),
      m('lab-biology.l06.q3', 2, 'The recessive allele has frequency q = 0.3. What fraction of the population is expected to be homozygous recessive?',
        ['0.30', '0.60', '0.49', '0.09'], 3,
        'Square q.', 'q squared = 0.3 x 0.3 = 0.09.'),
      m('lab-biology.l06.q4', 3, 'If 16 percent of a population shows a recessive trait, what proportion are heterozygous carriers, assuming equilibrium?',
        ['48 percent', '24 percent', '40 percent', '36 percent'], 0,
        'Find q first, then p, then 2pq.', 'q squared = 0.16, so q = 0.4 and p = 0.6; 2pq = 2 x 0.6 x 0.4 = 0.48.'),
      // l07
      m('lab-biology.l07.q1', 1, 'What does narrow-sense heritability (h squared) measure?',
        ['The fraction of any single individual\'s trait that is caused by its genes rather than its environment', 'The proportion of phenotypic variance due to additive genetic effects', 'The mutation rate', 'The number of genes for a trait'], 1,
        'It is a ratio of variances.', 'h squared = V_A / V_P, the share of total variation due to additive genetic variance.'),
      m('lab-biology.l07.q2', 1, 'In the breeder\'s equation R = h^2 S, what is R?',
        ['The response to selection', 'The recombination rate', 'The selection differential', 'The population size'], 0,
        'It is how much the next generation shifts.', 'R is the change in the mean trait value in one generation.'),
      m('lab-biology.l07.q3', 2, 'Breeders choose parents averaging 10 g above the population mean for a trait with h squared = 0.4. By how much is the offspring mean expected to rise?',
        ['10 g', '2.5 g', '25 g', '4 g'], 3,
        'Multiply h squared by S.', 'R = 0.4 x 10 g = 4 g.'),
      m('lab-biology.l07.q4', 3, 'A trait has heritability near zero. What happens if breeders select only the largest individuals?',
        ['The trait changes very little in the next generation', 'The trait changes by the full selection differential', 'The trait disappears', 'The trait doubles'], 0,
        'R = h squared times S.', 'With h squared near 0, R is near 0 however strong the selection, because differences are not passed on.'),
      // l08
      m('lab-biology.l08.q1', 1, 'What is the key requirement for speciation?',
        ['Reproductive isolation', 'A change in climate', 'Increased population size', 'Extinction of the parent species'], 0,
        'Two groups must stop exchanging genes.', 'Reproductive isolation splits one lineage into two.'),
      m('lab-biology.l08.q2', 1, 'What is an adaptive radiation?',
        ['A population becoming extinct', 'Rapid diversification of a lineage into many niches', 'Hybridisation of two species', 'A change in the number of chromosomes only'], 1,
        'Darwin\'s finches are an example.', 'An adaptive radiation is a burst of speciation into many ecological niches.'),
      m('lab-biology.l08.q3', 2, 'A new river splits a population of squirrels into two groups that evolve separately and eventually cannot interbreed. What is this kind of speciation called?',
        ['Allopatric speciation', 'Sympatric speciation within one range', 'Artificial selection by breeders', 'Genetic drift acting alone with no isolation'], 0,
        'It starts with geographic isolation.', 'Speciation following geographic separation is allopatric speciation.'),
      m('lab-biology.l08.q4', 3, 'Why is the Rhagoletis apple maggot fly an important example?',
        ['It shows speciation can begin without a geographic barrier', 'It shows species never change', 'It proves allopatric speciation is impossible', 'It shows flies evolved from fish'], 0,
        'Hawthorn and apple trees grow in the same place.', 'A host shift is producing incipient species in the same area, so a physical barrier is not required.'),
      // l09
      m('lab-biology.l09.q1', 1, 'What is homeostasis?',
        ['Maintenance of a stable internal environment through feedback', 'The process of evolution', 'The copying of DNA', 'The movement of energy through ecosystems'], 0,
        'Think of body temperature staying steady.', 'Organisms keep temperature, pH, ions and fuels within narrow ranges using feedback regulation.'),
      m('lab-biology.l09.q2', 1, 'What does a Q10 of 2 mean?',
        ['The rate halves for each 10 degree rise in temperature', 'The rate doubles for each 10 degree rise', 'The rate is independent of temperature within a living range', 'The rate doubles for each single degree of rise'], 1,
        'The 10 refers to degrees Celsius.', 'Q10 is the factor by which a rate changes for a 10 degree Celsius rise.'),
      m('lab-biology.l09.q3', 2, 'According to Kleiber\'s law, B is proportional to M^(3/4). By what factor does metabolic rate increase when body mass is 16 times larger?',
        ['12', '4', '16', '8'], 3,
        '16 to the power 3/4 equals (16 to the 1/4) cubed.', 'The fourth root of 16 is 2, and 2 cubed is 8.'),
      m('lab-biology.l09.q4', 3, 'Because the exponent in Kleiber\'s law is less than 1, how does metabolic rate per kilogram compare between a mouse and a whale?',
        ['Equal', 'Lower in the mouse', 'Higher in the mouse', 'Cannot be determined'], 2,
        'Divide B by M.', 'B/M is proportional to M^(-1/4), so smaller animals have higher mass-specific metabolic rates.'),
      // l10
      m('lab-biology.l10.q1', 1, 'What is Vmax in Michaelis-Menten kinetics?',
        ['The substrate concentration at half-maximum rate', 'The maximum reaction rate', 'The enzyme size', 'The temperature optimum'], 1,
        'The curve levels off at this value.', 'Vmax is the maximum rate the enzyme can reach when saturated.'),
      m('lab-biology.l10.q2', 1, 'What is the role of an enzyme?',
        ['It is a biological catalyst that speeds up reactions', 'It stores genetic information', 'It forms the cell wall', 'It carries oxygen'], 0,
        'Think about speeding up chemistry.', 'Enzymes are biological catalysts.'),
      m('lab-biology.l10.q3', 2, 'An enzyme has Vmax = 100 and Km = 2 (same concentration units). What is the rate when [S] = 2?',
        ['25', '75', '100', '50'], 3,
        'Use v = Vmax[S]/(Km + [S]).', 'v = 100 x 2 / (2 + 2) = 50, which is half of Vmax.'),
      m('lab-biology.l10.q4', 3, 'Why does the rate stop increasing at very high substrate concentration?',
        ['The substrate is destroyed', 'The enzyme molecules are all occupied, so the system saturates', 'The temperature falls', 'The enzyme becomes a substrate'], 1,
        'Think of a fixed number of waiters.', 'When nearly all enzyme molecules are busy, more substrate cannot raise the rate above Vmax.'),
      // l11
      m('lab-biology.l11.q1', 1, 'What shape is the logistic growth curve?',
        ['A straight line', 'S-shaped', 'A downward parabola only', 'A sudden spike'], 1,
        'Growth slows near the limit.', 'Logistic growth is S-shaped, levelling off at carrying capacity.'),
      m('lab-biology.l11.q2', 1, 'What do the Lotka-Volterra equations describe?',
        ['Predator and prey populations that oscillate', 'Enzyme saturation as substrate concentration rises', 'Genotype frequencies in a large randomly mating gene pool', 'Metabolic scaling with body mass across species'], 0,
        'Two coupled species.', 'They model coupled predator-prey cycles in abundance.'),
      m('lab-biology.l11.q3', 2, 'A population of 100 grows with lambda = 1.5 per generation. How large is it after two generations?',
        ['200', '225', '250', '300'], 1,
        'Multiply by 1.5 twice.', '100 x 1.5 = 150, then 150 x 1.5 = 225.'),
      m('lab-biology.l11.q4', 3, 'In the logistic model, why does growth slow as N approaches K?',
        ['The factor (1 - N/K) approaches zero', 'The growth rate r becomes negative', 'The population is too large to count', 'Predators always appear'], 0,
        'Look at the term in brackets.', 'As N approaches K, (1 - N/K) approaches zero so dN/dt approaches zero.'),
      // l12
      m('lab-biology.l12.q1', 1, 'What is the role of decomposers in an ecosystem?',
        ['Capturing sunlight and turning it into sugars in leaves', 'Returning nutrients from dead material to the soil', 'Hunting prey', 'Producing ATP in plants'], 1,
        'Fungi and bacteria are examples.', 'Decomposers break down dead matter and recycle nutrients.'),
      m('lab-biology.l12.q2', 1, 'What does the species-area relationship say?',
        ['Species richness falls as area increases', 'Species richness rises with habitat area', 'Area has no effect on richness', 'Only one species lives in each area'], 1,
        'The law is S = c A^z.', 'Species richness rises with habitat area following a power law.'),
      m('lab-biology.l12.q3', 2, 'With S = c A^z and z = 0.25, by roughly what factor does species richness change if the area is 16 times larger?',
        ['4', '16', '2', '8'], 2,
        'Take the fourth root of 16.', '16 to the power 0.25 is 2, so richness roughly doubles.'),
      m('lab-biology.l12.q4', 3, 'Community A has four species at 25 percent each. Community B has four species but one makes up 97 percent. Which has the higher Simpson diversity?',
        ['Community B', 'They are equal', 'Community A', 'Cannot be compared'], 2,
        'Evenness matters as well as richness.', 'D = 1 - sum of p squared is higher when individuals are spread evenly, as in community A.'),
      // l13
      m('lab-biology.l13.q1', 1, 'What was CRISPR originally in bacteria?',
        ['A digestive enzyme for breaking down food', 'An immune defence against viruses', 'A structural cell wall component of bacteria', 'A source of energy for the bacterial cell'], 1,
        'Bacteria store snippets of viral DNA.', 'CRISPR-Cas is a bacterial immune system against viruses.'),
      m('lab-biology.l13.q2', 1, 'Who showed in 2012 that Cas9 could be programmed to cut chosen DNA sequences?',
        ['Watson, Crick and Wilkins', 'Mendel, Morgan and Sturtevant', 'Doudna and Charpentier', 'Sanger, Nirenberg and Khorana'], 2,
        'They shared the 2020 Nobel Prize in Chemistry.', 'Jennifer Doudna and Emmanuelle Charpentier reprogrammed the guide RNA.'),
      m('lab-biology.l13.q3', 2, 'A researcher wants Cas9 to cut a different gene. What should be changed?',
        ['The guide RNA sequence', 'The Cas9 enzyme itself, rebuilt for each target', 'The temperature of the reaction mixture', 'The cell membrane around the target cell'], 0,
        'The RNA tells the enzyme where to cut.', 'Changing the guide RNA to match another sequence redirects Cas9.'),
      m('lab-biology.l13.q4', 3, 'Why does the bacterial system store snippets of viral DNA?',
        ['They give the guide RNA a match to recognise and cut the same virus later', 'They are used as food', 'They repair the cell wall', 'They make the bacteria glow'], 0,
        'Think about how a repeat attack is recognised.', 'The stored snippets provide guide RNAs that direct Cas9 to cut matching invading DNA.'),
      // l14
      m('lab-biology.l14.q1', 1, 'What did Linnaeus provide for classifying life?',
        ['Natural selection as the mechanism of evolution', 'Binomial nomenclature and ranked hierarchy', 'The double helix model of DNA structure in 1953', 'The cell theory stating all life is made of cells'], 1,
        'He gave organisms two-part names.', 'Linnaeus introduced binomial names and a nested hierarchy of ranks.'),
      m('lab-biology.l14.q2', 1, 'Which project produced a draft of the human genome between 2001 and 2003?',
        ['The Modern Synthesis project of the 1940s', 'The Human Genome Project', 'The Lenski long-term E. coli experiment', 'The Hubble deep-field survey'], 1,
        'It is named after what it mapped.', 'The Human Genome Project completed a draft in the early 2000s.'),
      m('lab-biology.l14.q3', 2, 'Which of the following is a correctly formed binomial scientific name?',
        ['Homo sapiens', 'sapiens Homo', 'Human being', 'Homo'], 0,
        'It has a genus and a species part.', 'A binomial name has two parts, genus then species, as in Homo sapiens.'),
      m('lab-biology.l14.q4', 3, 'What problem did the Modern Synthesis solve?',
        ['It reconciled Mendelian inheritance with Darwinian selection', 'It proved that cells come from cells', 'It cracked the genetic code', 'It invented the microscope'], 0,
        'Think of Fisher, Haldane and Wright.', 'It fused genetics and natural selection using mathematical population genetics.'),
    ],
  },
};
