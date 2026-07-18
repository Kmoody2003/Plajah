// ─────────────────────────────────────────────────────────────────────────────
// Mathematics discipline data — the seed for the Plajah Academia / Labs
// Mathematics studio. Accuracy-first: every figure carries a real Wikipedia
// slug, every result's `latex` is verified KaTeX, and every tool is a real,
// free/open resource with a genuine URL.
// ─────────────────────────────────────────────────────────────────────────────
import type { ScienceDisciplineData } from './types';

const DATA: ScienceDisciplineData = {
  id: 'mathematics',
  label: 'Mathematics',
  icon: 'Sigma',
  accent: '#F06595',
  accent2: '#C2255C',
  tagline: 'The language of pattern, proof and structure — the most certain knowledge humans possess.',
  heroBlurb:
    'From counting stones to the shape of infinity, mathematics is the art of exact reasoning. Meet its architects, trace its great theorems, and explore the tools that let you compute, plot and prove.',
  openStaxSubject: 'mathematics',
  arXivCategory: 'math',
  arXivQuery: 'theorem algebra topology number',
  simulators: ['function-plotter', 'prime-sieve'],

  // ── Figure halls ───────────────────────────────────────────────────────────
  figureHalls: [
    { id: 'ancient', label: 'Ancient & Classical', blurb: 'The geometers and number theorists of antiquity who founded proof itself.' },
    { id: 'classical', label: 'Analysis & Calculus', blurb: 'The inventors of calculus, analysis and the mathematics of change.' },
    { id: 'modern', label: 'Modern Foundations', blurb: 'Those who forged abstract algebra, set theory, logic and rigour.' },
    { id: 'contemporary', label: 'Twentieth Century & Beyond', blurb: 'Topologists, logicians and problem-solvers of the modern era.' },
  ],

  // ── Figures (15) ────────────────────────────────────────────────────────────
  figures: [
    {
      id: 'euclid', name: 'Euclid', wikiSlug: 'Euclid', hall: 'ancient',
      role: 'Geometer', era: 'Hellenistic Greece', nationality: 'Greek', years: 'fl. c.300 BCE',
      tagline: 'Father of geometry; author of the most influential textbook in history.',
      works: ['Elements', 'Optics', 'Data'],
      techniques: ['Organised geometry into an axiomatic deductive system', 'Proved the infinitude of primes', 'Codified the Euclidean algorithm'],
    },
    {
      id: 'archimedes', name: 'Archimedes', wikiSlug: 'Archimedes', hall: 'ancient',
      role: 'Mathematician & Engineer', era: 'Hellenistic Greece', nationality: 'Greek', years: 'c.287–212 BCE',
      tagline: 'The greatest mathematician of antiquity.',
      works: ['On the Sphere and Cylinder', 'Measurement of a Circle', 'The Method'],
      techniques: ['Anticipated integral calculus with the method of exhaustion', 'Estimated π with remarkable precision', 'Derived areas and volumes of curved solids'],
    },
    {
      id: 'alkhwarizmi', name: 'Al-Khwarizmi', wikiSlug: 'Al-Khwarizmi', hall: 'ancient',
      role: 'Mathematician', era: 'Islamic Golden Age', nationality: 'Persian', years: 'c.780–850',
      tagline: 'Father of algebra; his name gave us "algorithm".',
      works: ['The Compendious Book on Calculation by Completion and Balancing', 'On the Hindu Art of Reckoning'],
      techniques: ['Founded algebra as a systematic discipline', 'Introduced the Hindu–Arabic decimal system to the West', 'His name latinised into "algorithm"'],
    },
    {
      id: 'newton', name: 'Isaac Newton', wikiSlug: 'Isaac_Newton', hall: 'classical',
      role: 'Mathematician & Physicist', era: 'Scientific Revolution', nationality: 'English', years: '1643–1727',
      tagline: 'Co-inventor of calculus.',
      works: ['Method of Fluxions', 'Principia Mathematica', 'Generalised binomial theorem'],
      techniques: ['Developed calculus (fluxions) to describe change', 'Generalised the binomial theorem', 'Unified mathematics with physical law'],
    },
    {
      id: 'leibniz', name: 'Gottfried Leibniz', wikiSlug: 'Gottfried_Wilhelm_Leibniz', hall: 'classical',
      role: 'Mathematician & Philosopher', era: 'Enlightenment', nationality: 'German', years: '1646–1716',
      tagline: 'Co-inventor of calculus and its modern notation.',
      works: ['Nova Methodus (calculus)', 'Binary arithmetic', 'Formal logic foundations'],
      techniques: ['Independently invented the calculus with its integral and differential notation', 'Developed the binary number system', 'Pioneered symbolic logic and the calculating machine'],
    },
    {
      id: 'euler', name: 'Leonhard Euler', wikiSlug: 'Leonhard_Euler', hall: 'classical',
      role: 'Mathematician', era: 'Enlightenment', nationality: 'Swiss', years: '1707–1783',
      tagline: 'The most prolific mathematician in history.',
      works: ['Introductio in analysin infinitorum', 'Euler’s identity', 'Foundations of graph theory'],
      techniques: ['Founded graph theory and topology (Seven Bridges of Königsberg)', 'Introduced much modern notation (e, i, f(x), Σ)', 'Made vast contributions to analysis and number theory'],
    },
    {
      id: 'gauss', name: 'Carl Friedrich Gauss', wikiSlug: 'Carl_Friedrich_Gauss', hall: 'modern',
      role: 'Mathematician', era: '19th Century', nationality: 'German', years: '1777–1855',
      tagline: 'The "Prince of Mathematicians".',
      works: ['Disquisitiones Arithmeticae', 'Fundamental theorem of algebra', 'Theorema Egregium'],
      techniques: ['Proved the fundamental theorem of algebra', 'Founded modern number theory', 'Advanced differential geometry, statistics and astronomy'],
    },
    {
      id: 'riemann', name: 'Bernhard Riemann', wikiSlug: 'Bernhard_Riemann', hall: 'modern',
      role: 'Mathematician', era: '19th Century', nationality: 'German', years: '1826–1866',
      tagline: 'Reshaped geometry, analysis and number theory.',
      works: ['Riemannian geometry', 'Riemann hypothesis', 'Riemann integral'],
      techniques: ['Founded the geometry underlying general relativity', 'Posed the Riemann hypothesis on the primes', 'Rigorously defined the integral and complex analysis'],
    },
    {
      id: 'cantor', name: 'Georg Cantor', wikiSlug: 'Georg_Cantor', hall: 'modern',
      role: 'Mathematician', era: 'Set Theory', nationality: 'German', years: '1845–1918',
      tagline: 'Founder of set theory and the mathematics of infinity.',
      works: ['Set theory', 'Cantor’s diagonal argument', 'Theory of transfinite numbers'],
      techniques: ['Proved that some infinities are larger than others', 'Founded set theory as a mathematical discipline', 'Introduced cardinal and ordinal numbers'],
    },
    {
      id: 'noether', name: 'Emmy Noether', wikiSlug: 'Emmy_Noether', hall: 'modern',
      role: 'Mathematician', era: 'Abstract Algebra', nationality: 'German', years: '1882–1935',
      tagline: 'Mother of modern abstract algebra.',
      works: ['Noether’s theorem', 'Theory of ideals in rings', 'Noetherian rings'],
      techniques: ['Revolutionised ring and ideal theory', 'Linked symmetry to conservation laws in physics', 'Shaped the axiomatic approach to algebra'],
    },
    {
      id: 'hilbert', name: 'David Hilbert', wikiSlug: 'David_Hilbert', hall: 'modern',
      role: 'Mathematician', era: 'Foundations', nationality: 'German', years: '1862–1943',
      tagline: 'Set the agenda for 20th-century mathematics.',
      works: ['Hilbert’s 23 problems', 'Hilbert spaces', 'Foundations of Geometry'],
      techniques: ['Posed 23 problems that steered a century of research', 'Founded the formalist programme in logic', 'Introduced Hilbert spaces central to quantum theory'],
    },
    {
      id: 'ramanujan', name: 'Srinivasa Ramanujan', wikiSlug: 'Srinivasa_Ramanujan', hall: 'contemporary',
      role: 'Mathematician', era: '20th Century', nationality: 'Indian', years: '1887–1920',
      tagline: 'A self-taught genius of number theory and infinite series.',
      works: ['Ramanujan’s notebooks', 'Partition function results', 'Mock theta functions'],
      techniques: ['Discovered thousands of identities in analysis and number theory', 'Advanced the theory of partitions and modular forms', 'Produced formulas still fuelling research today'],
    },
    {
      id: 'godel', name: 'Kurt Gödel', wikiSlug: 'Kurt_G%C3%B6del', hall: 'contemporary',
      role: 'Logician & Mathematician', era: 'Mathematical Logic', nationality: 'Austrian-American', years: '1906–1978',
      tagline: 'Proved the limits of formal systems.',
      works: ['Incompleteness theorems', 'Consistency of the continuum hypothesis'],
      techniques: ['Showed no consistent formal system can prove all truths', 'Transformed logic and the foundations of mathematics', 'Advanced set theory and computability'],
    },
    {
      id: 'turing', name: 'Alan Turing', wikiSlug: 'Alan_Turing', hall: 'contemporary',
      role: 'Mathematician & Logician', era: 'Computation', nationality: 'British', years: '1912–1954',
      tagline: 'Founder of theoretical computer science.',
      works: ['On Computable Numbers (Turing machine)', 'The Turing test', 'Codebreaking at Bletchley Park'],
      techniques: ['Defined computation with the Turing machine', 'Proved the undecidability of the halting problem', 'Laid the theoretical foundations of the computer'],
    },
    {
      id: 'mirzakhani', name: 'Maryam Mirzakhani', wikiSlug: 'Maryam_Mirzakhani', hall: 'contemporary',
      role: 'Mathematician', era: '21st Century', nationality: 'Iranian', years: '1977–2017',
      tagline: 'First woman to win the Fields Medal.',
      works: ['Dynamics on moduli spaces', 'Geometry of Riemann surfaces'],
      techniques: ['Advanced the geometry and dynamics of curved surfaces', 'Solved deep problems on moduli spaces', 'First woman and first Iranian to win the Fields Medal'],
    },
  ],

  // ── Concepts (10) ───────────────────────────────────────────────────────────
  concepts: [
    { id: 'number', name: 'Number Systems', blurb: 'From naturals to reals and complex numbers — the widening universe of quantity.', wikiSlug: 'Number', tags: ['foundations', 'number-theory'] },
    { id: 'proof', name: 'Mathematical Proof', blurb: 'The deductive argument that turns a conjecture into certain, permanent knowledge.', wikiSlug: 'Mathematical_proof', tags: ['logic', 'foundations'],
      deepDive: "A proof is a chain of deductions from axioms and definitions that establishes a statement beyond doubt. Euclid's Elements set the template; modern logic formalised exactly what a valid proof is. Gödel then showed that any consistent system rich enough for arithmetic contains true statements it cannot prove, and computers now assist proofs too large for a human to check by hand.",
      videoIds: ['HeQX2HjkcNo'],
      evidence: [
        { label: "Euclid's Elements (c.300 BCE)", detail: 'The founding model of axiomatic, deductive proof.', url: 'https://en.wikipedia.org/wiki/Euclid%27s_Elements', kind: 'document' },
        { label: "Gödel's incompleteness theorems (1931)", detail: 'Showed no consistent formal system can prove all arithmetical truths.', url: 'https://en.wikipedia.org/wiki/G%C3%B6del%27s_incompleteness_theorems', kind: 'proof' },
        { label: 'Four colour theorem by computer (1976)', detail: 'The first major theorem whose proof required a computer to check thousands of cases.', url: 'https://en.wikipedia.org/wiki/Four_color_theorem', kind: 'proof' },
      ] },
    { id: 'geometry', name: 'Geometry', blurb: 'The study of shape, space and their transformations, from Euclid to Riemann.', wikiSlug: 'Geometry', tags: ['geometry', 'space'],
      deepDive: "Euclid built geometry from five postulates; for two millennia the fifth (parallel) postulate resisted proof until Gauss, Bolyai and Lobachevsky discovered consistent non-Euclidean geometries where it fails. Riemann then generalised geometry to curved spaces of any dimension, providing the very language Einstein needed for general relativity.",
      simulatorId: 'function-plotter', lawIds: ['pythagoras', 'euler-characteristic'], videoIds: ['GNcFjFmqEc8'],
      evidence: [
        { label: "Euclid's Elements and the parallel postulate", detail: 'Axiomatised plane geometry; its fifth postulate seeded centuries of inquiry.', url: 'https://en.wikipedia.org/wiki/Parallel_postulate', kind: 'document' },
        { label: 'Non-Euclidean geometry (Gauss, Bolyai, Lobachevsky, 1820s–30s)', detail: 'Consistent geometries in which parallel lines behave differently.', url: 'https://en.wikipedia.org/wiki/Non-Euclidean_geometry', kind: 'proof' },
        { label: "Gauss's Theorema Egregium (1827)", detail: 'Curvature is intrinsic to a surface, independent of how it sits in space.', url: 'https://en.wikipedia.org/wiki/Theorema_Egregium', kind: 'proof' },
      ] },
    { id: 'algebra', name: 'Algebra', blurb: 'Reasoning with symbols and structure — equations, groups, rings and fields.', wikiSlug: 'Algebra', tags: ['algebra', 'structure'],
      deepDive: "Al-Khwarizmi turned equation-solving into a systematic art, and Renaissance mathematicians cracked the cubic and quartic. The search for a quintic formula ended when Abel and Galois proved none exists, and Galois's insight — that the symmetries of the roots form a group — launched abstract algebra, the study of structures like groups, rings and fields.",
      lawIds: ['quadratic', 'binomial', 'ftalg'], videoIds: [],
      evidence: [
        { label: "Al-Khwarizmi's Al-Jabr (c.820)", detail: 'Founded algebra as a systematic method and gave the discipline its name.', url: 'https://en.wikipedia.org/wiki/The_Compendious_Book_on_Calculation_by_Completion_and_Balancing', kind: 'document' },
        { label: "Cardano's Ars Magna (1545)", detail: 'Published general solutions to cubic and quartic equations.', url: 'https://en.wikipedia.org/wiki/Ars_Magna_(Cardano_book)', kind: 'document' },
        { label: 'Abel–Ruffini theorem & Galois theory (1820s–30s)', detail: 'Proved the general quintic has no radical solution, birthing group theory.', url: 'https://en.wikipedia.org/wiki/Abel%E2%80%93Ruffini_theorem', kind: 'proof' },
      ] },
    { id: 'calculus', name: 'Calculus', blurb: 'The mathematics of continuous change: limits, derivatives and integrals.', wikiSlug: 'Calculus', tags: ['analysis', 'change'],
      deepDive: "Newton and Leibniz independently forged calculus to describe motion and area: the derivative measures instantaneous rate of change, the integral accumulates it, and the fundamental theorem shows the two are inverse operations. Early reliance on infinitesimals drew sharp criticism until Cauchy and Weierstrass rebuilt the subject rigorously on limits.",
      simulatorId: 'function-plotter', lawIds: ['ftc', 'derivative'], videoIds: ['WUvTyaaNkzM'],
      evidence: [
        { label: "Newton's fluxions & Leibniz's calculus (1660s–1680s)", detail: 'Two independent inventions gave the derivative, integral and modern notation.', url: 'https://en.wikipedia.org/wiki/History_of_calculus', kind: 'document' },
        { label: "Berkeley's The Analyst (1734)", detail: 'Attacked infinitesimals as "ghosts of departed quantities", spurring the drive for rigour.', url: 'https://en.wikipedia.org/wiki/The_Analyst', kind: 'document' },
        { label: 'Cauchy and Weierstrass ε–δ limits (19th c.)', detail: 'Placed calculus on a rigorous foundation of limits and continuity.', kind: 'proof' },
      ] },
    { id: 'analysis', name: 'Mathematical Analysis', blurb: 'The rigorous theory of limits, continuity, series and functions.', wikiSlug: 'Mathematical_analysis', tags: ['analysis', 'rigour'],
      deepDive: "Analysis makes the intuitions of calculus rigorous, defining limits, continuity and convergence with precision. Euler's daring evaluations of infinite series gave way to Cauchy and Weierstrass's careful foundations, which even produced pathological objects like a function that is continuous everywhere yet differentiable nowhere.",
      lawIds: ['basel', 'gaussian', 'euler-formula'], videoIds: ['r6sGWTCMz2k', 'mvmuCPvRoWQ'],
      evidence: [
        { label: 'Euler solves the Basel problem (1735)', detail: 'Summed the reciprocals of the squares to π²/6, a triumph of early analysis.', url: 'https://en.wikipedia.org/wiki/Basel_problem', kind: 'proof' },
        { label: "Cauchy's Cours d'analyse (1821)", detail: 'Grounded calculus in a rigorous theory of limits and continuity.', url: 'https://en.wikipedia.org/wiki/Cours_d%27Analyse', kind: 'document' },
        { label: 'Weierstrass function (1872)', detail: 'A curve continuous everywhere but differentiable nowhere, forcing new rigour.', url: 'https://en.wikipedia.org/wiki/Weierstrass_function', kind: 'proof' },
      ] },
    { id: 'number-theory', name: 'Number Theory', blurb: 'The deep study of the integers, primes and their hidden patterns.', wikiSlug: 'Number_theory', tags: ['number-theory', 'primes'],
      deepDive: "Number theory studies the integers and especially the primes, the multiplicative atoms of arithmetic. Euclid proved the primes are infinite; Gauss and Legendre conjectured how they thin out, and the prime number theorem confirmed it. Riemann's zeta function tied prime distribution to complex analysis, and the Riemann hypothesis remains its greatest open question.",
      simulatorId: 'prime-sieve', lawIds: ['euler-primes', 'prime-number'], videoIds: ['sD0NjbwqlYw', 'NaL_Cb42WyY'],
      evidence: [
        { label: "Euclid's proof of infinitely many primes (c.300 BCE)", detail: 'A classic proof by contradiction, still taught today.', url: 'https://en.wikipedia.org/wiki/Euclid%27s_theorem', kind: 'proof' },
        { label: "Riemann's On the Number of Primes (1859)", detail: 'Linked the counting of primes to the zeros of the zeta function.', url: 'https://en.wikipedia.org/wiki/On_the_Number_of_Primes_Less_Than_a_Given_Magnitude', kind: 'document' },
        { label: 'Prime number theorem proved (1896)', detail: 'Hadamard and de la Vallée Poussin proved primes near x thin out like 1/ln x.', url: 'https://en.wikipedia.org/wiki/Prime_number_theorem', kind: 'proof' },
      ] },
    { id: 'topology', name: 'Topology', blurb: 'The study of properties preserved under continuous deformation — "rubber-sheet geometry".', wikiSlug: 'Topology', tags: ['topology', 'geometry'] },
    { id: 'probability', name: 'Probability', blurb: 'The mathematics of chance, uncertainty and random processes.', wikiSlug: 'Probability_theory', tags: ['probability', 'statistics'] },
    { id: 'set-theory', name: 'Set Theory & Logic', blurb: 'The foundational language of collections, infinity and formal reasoning.', wikiSlug: 'Set_theory', tags: ['logic', 'foundations'],
      deepDive: "Cantor showed that infinities come in different sizes — the real numbers outnumber the integers — using his diagonal argument. Paradoxes like Russell's forced a rigorous axiomatisation (ZFC), and Gödel and Cohen later proved that the continuum hypothesis can be neither proved nor disproved from those axioms, revealing deep limits to set theory itself.",
      videoIds: ['OxGsU8oIWjY'],
      evidence: [
        { label: "Cantor's diagonal argument (1891)", detail: 'Proved the real numbers are uncountable — a strictly larger infinity than the integers.', url: 'https://en.wikipedia.org/wiki/Cantor%27s_diagonal_argument', kind: 'proof' },
        { label: "Russell's paradox (1901)", detail: 'The set of all sets that do not contain themselves exposed a flaw in naive set theory.', url: 'https://en.wikipedia.org/wiki/Russell%27s_paradox', kind: 'proof' },
        { label: 'Independence of the continuum hypothesis (Gödel 1940, Cohen 1963)', detail: 'Showed CH is undecidable from the standard ZFC axioms.', url: 'https://en.wikipedia.org/wiki/Continuum_hypothesis', kind: 'proof' },
      ] },
  ],

  // ── Eras (7) ─────────────────────────────────────────────────────────────────
  eras: [
    {
      id: 'ancient', title: 'Ancient Mathematics', span: 'Antiquity–500 CE',
      essay: 'Babylonian and Egyptian scribes computed for trade and building, but it was the Greeks — Thales, Pythagoras, Euclid and Archimedes — who invented the idea of proof, turning arithmetic and geometry into a deductive science.',
      developments: ['Babylonian sexagesimal arithmetic', 'Euclidean axiomatic geometry', 'The method of exhaustion', 'Early number theory and the Pythagorean theorem'],
      turningPoints: ["Euclid's Elements (c.300 BCE)", 'Archimedes anticipates the integral'],
    },
    {
      id: 'medieval', title: 'Algebra & the Medieval World', span: '500–1400',
      essay: 'While Europe slept, mathematicians in the Islamic world, India and China advanced arithmetic, algebra and trigonometry. Al-Khwarizmi systematised algebra, Indian scholars invented zero and the decimal system, and this knowledge slowly flowed westward.',
      developments: ['Invention of algebra', 'The Hindu–Arabic numeral system and zero', 'Advances in trigonometry', 'The Fibonacci sequence introduced to Europe'],
      turningPoints: ["Al-Khwarizmi's Al-Jabr (c.820)", "Fibonacci's Liber Abaci (1202)"],
    },
    {
      id: 'renaissance', title: 'Renaissance & the Rise of Analysis', span: '1400–1700',
      essay: 'Algebraic notation matured, cubic and quartic equations fell, and coordinate geometry united algebra with geometry. The century closed with Newton and Leibniz independently inventing the calculus, the most powerful tool in mathematics.',
      developments: ['Solution of cubic and quartic equations', 'Symbolic algebraic notation', 'Cartesian coordinate geometry', 'The invention of calculus'],
      turningPoints: ["Descartes' La Géométrie (1637)", 'Newton and Leibniz create calculus (1660s–1680s)'],
    },
    {
      id: 'enlightenment', title: 'The Age of Euler', span: '1700–1800',
      essay: 'The 18th century developed calculus into a vast edifice of analysis, differential equations and the calculus of variations, dominated by the prodigious Euler, who reshaped notation and opened graph theory and analytic number theory.',
      developments: ['Mathematical analysis and infinite series', 'Differential equations', 'Graph theory and topology begin', 'Analytic number theory'],
      turningPoints: ["Euler's Introductio (1748)", 'The Seven Bridges of Königsberg (1736)'],
    },
    {
      id: 'rigour', title: 'The Age of Rigour', span: '1800–1900',
      essay: 'Mathematics turned inward to secure its foundations: Cauchy and Weierstrass made analysis rigorous, Gauss and Riemann transformed geometry and number theory, and Cantor’s set theory revealed the shocking structure of infinity.',
      developments: ['Rigorous foundations of analysis (ε–δ)', 'Non-Euclidean and Riemannian geometry', 'Group theory and abstract algebra', 'Cantor’s theory of infinite sets'],
      turningPoints: ['Non-Euclidean geometry accepted (1830s)', "Cantor founds set theory (1874)"],
    },
    {
      id: 'foundations', title: 'Foundations & Abstraction', span: '1900–1950',
      essay: 'Hilbert’s programme sought to place all mathematics on unshakeable axioms, but Gödel proved that any such system is incomplete, and Turing formalised computation — reshaping logic, algebra and the very idea of what can be proved or computed.',
      developments: ['Axiomatic set theory', 'Abstract algebra (Noether)', 'Gödel’s incompleteness theorems', 'The theory of computation (Turing)'],
      turningPoints: ["Hilbert's 23 problems (1900)", "Gödel's incompleteness (1931)", 'The Turing machine (1936)'],
    },
    {
      id: 'modern', title: 'Modern & Computational Mathematics', span: '1950–present',
      essay: 'Post-war mathematics grew explosively abstract and interconnected, with computers becoming both a subject and a tool. Landmark proofs — the four-colour theorem, Fermat’s Last Theorem, the Poincaré conjecture — showcase a discipline richer and more collaborative than ever.',
      developments: ['Computer-assisted proof', 'Grothendieck’s reinvention of algebraic geometry', 'Resolution of Fermat’s Last Theorem and the Poincaré conjecture', 'Deep links between number theory, geometry and physics'],
      turningPoints: ['Four-colour theorem proved by computer (1976)', "Wiles proves Fermat's Last Theorem (1994)", 'Perelman proves the Poincaré conjecture (2003)'],
    },
  ],

  // ── Laws / theorems (15) ─────────────────────────────────────────────────────
  laws: [
    {
      id: 'pythagoras', category: 'Geometry', name: 'Pythagorean Theorem',
      latex: 'a^2 + b^2 = c^2',
      variables: [
        { sym: 'a, b', name: 'Legs of a right triangle' },
        { sym: 'c', name: 'Hypotenuse' },
      ],
      description: 'In a right triangle, the square of the hypotenuse equals the sum of the squares of the other two sides.',
      reference: 'https://en.wikipedia.org/wiki/Pythagorean_theorem',
    },
    {
      id: 'euler-identity', category: 'Analysis', name: "Euler's Identity",
      latex: 'e^{i\\pi} + 1 = 0',
      variables: [
        { sym: 'e', name: "Euler's number" },
        { sym: 'i', name: 'Imaginary unit' },
        { sym: '\\pi', name: 'Ratio of circumference to diameter' },
      ],
      description: 'Links five fundamental constants in a single equation, often called the most beautiful in mathematics.',
      reference: 'https://en.wikipedia.org/wiki/Euler%27s_identity',
    },
    {
      id: 'ftc', category: 'Calculus', name: 'Fundamental Theorem of Calculus',
      latex: '\\int_a^b f(x)\\,dx = F(b) - F(a)',
      variables: [
        { sym: 'f', name: 'Integrand' },
        { sym: 'F', name: 'Antiderivative of f' },
        { sym: 'a, b', name: 'Limits of integration' },
      ],
      description: 'Integration and differentiation are inverse operations — the definite integral is evaluated via an antiderivative.',
      reference: 'https://en.wikipedia.org/wiki/Fundamental_theorem_of_calculus',
    },
    {
      id: 'derivative', category: 'Calculus', name: 'The Derivative',
      latex: "f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}",
      variables: [
        { sym: "f'(x)", name: 'Derivative (instantaneous rate of change)' },
        { sym: 'h', name: 'Vanishing increment' },
      ],
      description: 'The derivative is the limit of the average rate of change as the interval shrinks to zero.',
      reference: 'https://en.wikipedia.org/wiki/Derivative',
    },
    {
      id: 'binomial', category: 'Algebra', name: 'Binomial Theorem',
      latex: '(x+y)^n = \\sum_{k=0}^{n} \\binom{n}{k} x^{n-k} y^k',
      variables: [
        { sym: 'n', name: 'Exponent (non-negative integer)' },
        { sym: '\\binom{n}{k}', name: 'Binomial coefficient' },
      ],
      description: 'Expands a power of a binomial as a sum of terms weighted by binomial coefficients.',
      reference: 'https://en.wikipedia.org/wiki/Binomial_theorem',
    },
    {
      id: 'quadratic', category: 'Algebra', name: 'Quadratic Formula',
      latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
      variables: [
        { sym: 'a, b, c', name: 'Coefficients of ax²+bx+c=0' },
        { sym: 'x', name: 'Roots' },
      ],
      description: 'Gives the two roots of any quadratic equation in terms of its coefficients.',
      reference: 'https://en.wikipedia.org/wiki/Quadratic_formula',
    },
    {
      id: 'ftalg', category: 'Algebra', name: 'Fundamental Theorem of Algebra',
      latex: 'p(z) = a_n \\prod_{k=1}^{n}(z - z_k)',
      variables: [
        { sym: 'p(z)', name: 'Polynomial of degree n' },
        { sym: 'z_k', name: 'Complex roots' },
      ],
      description: 'Every non-constant polynomial with complex coefficients has exactly n complex roots counted with multiplicity.',
      reference: 'https://en.wikipedia.org/wiki/Fundamental_theorem_of_algebra',
    },
    {
      id: 'euler-formula', category: 'Analysis', name: "Euler's Formula",
      latex: 'e^{i\\theta} = \\cos\\theta + i\\sin\\theta',
      variables: [
        { sym: '\\theta', name: 'Angle', unit: 'rad' },
        { sym: 'i', name: 'Imaginary unit' },
      ],
      description: 'Connects the exponential function to trigonometry, foundational to complex analysis and signal processing.',
      reference: 'https://en.wikipedia.org/wiki/Euler%27s_formula',
    },
    {
      id: 'basel', category: 'Analysis', name: 'The Basel Problem',
      latex: '\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}',
      variables: [
        { sym: 'n', name: 'Positive integers' },
      ],
      description: 'Euler’s celebrated evaluation of the sum of reciprocal squares, linking the integers to π.',
      reference: 'https://en.wikipedia.org/wiki/Basel_problem',
    },
    {
      id: 'gaussian', category: 'Analysis', name: 'The Gaussian Integral',
      latex: '\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}',
      variables: [
        { sym: 'x', name: 'Real variable' },
      ],
      description: 'The area under the bell curve equals the square root of π — central to probability and physics.',
      reference: 'https://en.wikipedia.org/wiki/Gaussian_integral',
    },
    {
      id: 'euler-primes', category: 'Number Theory', name: 'Euler Product',
      latex: '\\zeta(s) = \\sum_{n=1}^{\\infty} \\frac{1}{n^s} = \\prod_{p\\,\\text{prime}} \\frac{1}{1 - p^{-s}}',
      variables: [
        { sym: '\\zeta(s)', name: 'Riemann zeta function' },
        { sym: 's', name: 'Complex argument' },
        { sym: 'p', name: 'Prime numbers' },
      ],
      description: 'Euler’s product formula ties the zeta function to the primes, opening analytic number theory.',
      reference: 'https://en.wikipedia.org/wiki/Euler_product',
    },
    {
      id: 'prime-number', category: 'Number Theory', name: 'Prime Number Theorem',
      latex: '\\pi(x) \\sim \\frac{x}{\\ln x}',
      variables: [
        { sym: '\\pi(x)', name: 'Number of primes ≤ x' },
        { sym: 'x', name: 'Bound' },
      ],
      description: 'The density of primes near a large number x is approximately 1 / ln x.',
      reference: 'https://en.wikipedia.org/wiki/Prime_number_theorem',
    },
    {
      id: 'bayes', category: 'Probability', name: "Bayes' Theorem",
      latex: 'P(A \\mid B) = \\frac{P(B \\mid A)\\,P(A)}{P(B)}',
      variables: [
        { sym: 'P(A\\mid B)', name: 'Posterior probability' },
        { sym: 'P(B\\mid A)', name: 'Likelihood' },
        { sym: 'P(A)', name: 'Prior probability' },
      ],
      description: 'Updates the probability of a hypothesis given new evidence — the engine of statistical inference.',
      reference: 'https://en.wikipedia.org/wiki/Bayes%27_theorem',
    },
    {
      id: 'euler-characteristic', category: 'Topology', name: 'Euler Characteristic',
      latex: 'V - E + F = 2',
      variables: [
        { sym: 'V', name: 'Vertices' },
        { sym: 'E', name: 'Edges' },
        { sym: 'F', name: 'Faces' },
      ],
      description: 'For any convex polyhedron (a sphere topologically), vertices minus edges plus faces equals two.',
      reference: 'https://en.wikipedia.org/wiki/Euler_characteristic',
    },
    {
      id: 'harmonic', category: 'Analysis', name: 'Divergence of the Harmonic Series',
      latex: '\\sum_{n=1}^{\\infty} \\frac{1}{n} = \\infty',
      variables: [
        { sym: 'n', name: 'Positive integers' },
      ],
      description: 'The sum of reciprocals of the integers grows without bound, despite its terms shrinking to zero.',
      reference: 'https://en.wikipedia.org/wiki/Harmonic_series_(mathematics)',
    },
  ],

  // ── Tools (12) ───────────────────────────────────────────────────────────────
  tools: [
    { name: 'Wolfram Alpha', org: 'Wolfram Research', url: 'https://www.wolframalpha.com/', desc: 'Computational engine that solves equations, integrals and symbolic problems step by step.', kind: 'software', access: 'Freemium' },
    { name: 'GeoGebra', org: 'GeoGebra', url: 'https://www.geogebra.org/', desc: 'Free dynamic geometry, algebra, calculus and 3-D visualisation software.', kind: 'software', access: 'Open' },
    { name: 'SageMath', org: 'SageMath', url: 'https://www.sagemath.org/', desc: 'Open-source mathematics system unifying many packages under a Python interface.', kind: 'software', access: 'Open' },
    { name: 'OEIS', org: 'OEIS Foundation', url: 'https://oeis.org/', desc: 'The Online Encyclopedia of Integer Sequences — search any sequence to identify it.', kind: 'dataset', access: 'Open' },
    { name: 'Desmos Graphing Calculator', org: 'Desmos', url: 'https://www.desmos.com/calculator', desc: 'Free browser graphing calculator for functions, data and interactive sliders.', kind: 'software', access: 'Open' },
    { name: 'SymPy', org: 'SymPy Development Team', url: 'https://www.sympy.org/', desc: 'Open-source Python library for symbolic mathematics and computer algebra.', kind: 'software', access: 'Open' },
    { name: 'arXiv Mathematics', org: 'Cornell University', url: 'https://arxiv.org/archive/math', desc: 'Open-access preprint archive spanning every branch of research mathematics.', kind: 'dataset', access: 'Open' },
    { name: 'PARI/GP', org: 'PARI Group', url: 'https://pari.math.u-bordeaux.fr/', desc: 'Fast open-source computer algebra system specialised for number theory.', kind: 'software', access: 'Open' },
    { name: 'Wolfram MathWorld', org: 'Wolfram Research', url: 'https://mathworld.wolfram.com/', desc: 'Extensive free encyclopedia of mathematical definitions and theorems.', kind: 'community', access: 'Open' },
    { name: 'Lean & mathlib', org: 'Lean Community', url: 'https://leanprover-community.github.io/', desc: 'Open interactive theorem prover and its vast library of formalised mathematics.', kind: 'software', access: 'Open' },
    { name: 'nLab', org: 'nLab Community', url: 'https://ncatlab.org/nlab/show/HomePage', desc: 'Collaborative wiki for category theory and higher mathematics.', kind: 'community', access: 'Open' },
    { name: 'Numberphile', org: 'Brady Haran', url: 'https://www.numberphile.com/', desc: 'Free video library exploring famous problems, numbers and theorems.', kind: 'community', access: 'Open' },
  ],

  // ── Videos (14) ──────────────────────────────────────────────────────────────
  videos: [
    { id: 'OmJ-4B-mS-Y', title: 'The Map of Mathematics', channel: 'Domain of Science', topic: 'Foundations', blurb: 'A single animated map of the whole of mathematics.', query: 'The Map of Mathematics Domain of Science' },
    { id: 'WUvTyaaNkzM', title: 'The Essence of Calculus, chapter 1', channel: '3Blue1Brown', topic: 'Analysis', blurb: 'Reinventing calculus from its core geometric idea.', query: 'Essence of calculus chapter 1 3Blue1Brown' },
    { id: 'OxGsU8oIWjY', title: 'How An Infinite Hotel Ran Out Of Room', channel: 'Veritasium', topic: 'Foundations', blurb: "Hilbert's hotel and the surprising sizes of infinity.", query: 'How An Infinite Hotel Ran Out Of Room Veritasium' },
    { id: 'HEfHFsfGXjs', title: 'The most unexpected answer to a counting puzzle', channel: '3Blue1Brown', topic: 'Foundations', blurb: 'Colliding blocks secretly compute the digits of pi.', query: 'The most unexpected answer to a counting puzzle 3Blue1Brown' },
    { id: 'r6sGWTCMz2k', title: 'But what is a Fourier series?', channel: '3Blue1Brown', topic: 'Analysis', blurb: 'Building any periodic shape from rotating circles.', query: 'But what is a Fourier series 3Blue1Brown' },
    { id: 'mvmuCPvRoWQ', title: "Euler's formula with introductory group theory", channel: '3Blue1Brown', topic: 'Analysis', blurb: 'Why e^(iπ) = -1, understood through symmetry.', query: "Euler's formula introductory group theory 3Blue1Brown" },
    { id: 'sD0NjbwqlYw', title: 'But what is the Riemann zeta function?', channel: '3Blue1Brown', topic: 'Number Theory', blurb: 'Analytic continuation and the most famous open problem.', query: 'Riemann zeta function analytic continuation 3Blue1Brown' },
    { id: 'NaL_Cb42WyY', title: 'Pi hiding in prime regularities', channel: '3Blue1Brown', topic: 'Number Theory', blurb: 'A surprising bridge from the primes to pi.', query: 'Pi hiding in prime regularities 3Blue1Brown' },
    { id: 'XTeJ64KD5cg', title: "Graham's Number", channel: 'Numberphile', topic: 'Number Theory', blurb: 'A number so vast it barely fits inside the universe.', query: "Graham's Number Numberphile" },
    { id: 'CaasbfdJdJg', title: 'The Golden Ratio (why it is so irrational)', channel: 'Numberphile', topic: 'Number Theory', blurb: 'Why phi is, in a precise sense, the most irrational number.', query: 'The Golden Ratio why it is so irrational Numberphile' },
    { id: 'qiNcEguuFSA', title: "Fermat's Last Theorem", channel: 'Numberphile', topic: 'Number Theory', blurb: 'The margin note that took 358 years to prove.', query: "Fermat's Last Theorem Numberphile" },
    { id: 'GNcFjFmqEc8', title: "But why is a sphere's surface area four times its shadow?", channel: '3Blue1Brown', topic: 'Geometry', blurb: 'An elegant geometric proof of the sphere-area formula.', query: "sphere surface area four times its shadow 3Blue1Brown" },
    { id: 'NYK0GBQVngs', title: 'The Four Colour Map Theorem', channel: 'Numberphile', topic: 'Geometry', blurb: 'Why four colours always suffice to colour any map.', query: 'Four Colour Map Theorem Numberphile' },
    { id: 'HeQX2HjkcNo', title: "Math's Fundamental Flaw", channel: 'Veritasium', topic: 'Foundations', blurb: "Gödel's incompleteness and the limits of what can be proved.", query: "Math's Fundamental Flaw Veritasium" },
  ],
};

export default DATA;
