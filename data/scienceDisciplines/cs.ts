// ─────────────────────────────────────────────────────────────────────────────
// Computer Science discipline data for Plajah Academia's science studios.
// Accuracy-first: every figure carries a real Wikipedia slug (final path segment
// of en.wikipedia.org/wiki/<slug>) so portraits + biographies enrich live at
// runtime; every law is KaTeX-ready; every tool URL points at a real, free
// resource. Conforms to ScienceDisciplineData (./types).
// ─────────────────────────────────────────────────────────────────────────────
import type { ScienceDisciplineData } from './types';

const DATA: ScienceDisciplineData = {
  id: 'cs',
  label: 'Computer Science',
  icon: 'Binary',
  accent: '#748FFC',
  accent2: '#4263EB',
  tagline: 'The science of computation, algorithms, and the machines that run them.',
  heroBlurb:
    'From Turing machines and lambda calculus to compilers, distributed systems and the deep neural networks behind modern AI — computer science is the study of what can be computed, how efficiently, and by what means. Meet the pioneers, master the core ideas, and read the results as they publish.',
  openStaxSubject: 'computer-science',
  arXivCategory: 'cs.LG',
  arXivQuery: 'machine learning neural network LLM',
  simulators: ['sorting', 'big-o'],

  figureHalls: [
    { id: 'foundations', label: 'Foundations', blurb: 'The logicians and theorists who defined computation itself — Turing machines, information, and the limits of what a machine can decide.' },
    { id: 'systems', label: 'Systems & Languages', blurb: 'Architects of the operating systems, programming languages and networks that turned theory into working machines.' },
    { id: 'algorithms', label: 'Algorithms & Theory', blurb: 'Those who formalised complexity, cryptography and the art of computer programming.' },
    { id: 'ai', label: 'Artificial Intelligence', blurb: 'Pioneers of machine learning and neural networks who taught computers to perceive, reason and generate.' },
  ],

  figures: [
    // ── Foundations
    {
      id: 'turing', name: 'Alan Turing', wikiSlug: 'Alan_Turing', hall: 'foundations',
      role: 'Logician & computer scientist', era: 'Foundations', nationality: 'British', years: '1912–1954',
      tagline: 'Father of theoretical computer science and artificial intelligence.',
      works: ['On Computable Numbers (1936)', 'The Turing machine', 'Bombe / Enigma cryptanalysis', 'Turing test (1950)'],
      techniques: ['Defined the universal Turing machine and computability', 'Proved the undecidability of the halting problem', 'Founded the field of AI with the "imitation game"'],
    },
    {
      id: 'church', name: 'Alonzo Church', wikiSlug: 'Alonzo_Church', hall: 'foundations',
      role: 'Mathematician & logician', era: 'Foundations', nationality: 'American', years: '1903–1995',
      tagline: 'Inventor of the lambda calculus.',
      works: ['Lambda calculus', 'Church–Turing thesis', 'Church encoding'],
      techniques: ['Formalised computation as function abstraction and application', 'Proved the Entscheidungsproblem undecidable', 'His lambda calculus underlies all functional programming'],
    },
    {
      id: 'shannon', name: 'Claude Shannon', wikiSlug: 'Claude_Shannon', hall: 'foundations',
      role: 'Mathematician & engineer', era: 'Foundations', nationality: 'American', years: '1916–2001',
      tagline: 'Father of information theory.',
      works: ['A Mathematical Theory of Communication (1948)', 'Boolean-algebra circuit design', 'Shannon entropy'],
      techniques: ['Defined the bit and channel capacity', 'Showed switching circuits implement Boolean logic', 'Established the mathematical limits of data compression and transmission'],
    },
    {
      id: 'vonneumann', name: 'John von Neumann', wikiSlug: 'John_von_Neumann', hall: 'foundations',
      role: 'Mathematician & polymath', era: 'Foundations', nationality: 'Hungarian-American', years: '1903–1957',
      tagline: 'Architect of the stored-program computer.',
      works: ['First Draft of a Report on the EDVAC (1945)', 'Von Neumann architecture', 'Self-replicating automata'],
      techniques: ['Unified code and data in a single addressable memory', 'Defined the fetch–decode–execute cycle still used today', 'Founded cellular automata and game theory'],
    },
    {
      id: 'lovelace', name: 'Ada Lovelace', wikiSlug: 'Ada_Lovelace', hall: 'foundations',
      role: 'Mathematician', era: 'Foundations', nationality: 'British', years: '1815–1852',
      tagline: 'The first computer programmer.',
      works: ['Notes on the Analytical Engine (1843)', 'Algorithm for Bernoulli numbers'],
      techniques: ['Wrote the first published algorithm intended for a machine', 'Foresaw that computers could manipulate symbols, not just numbers', 'Described loops and the concept of a general-purpose machine'],
    },

    // ── Systems & Languages
    {
      id: 'hopper', name: 'Grace Hopper', wikiSlug: 'Grace_Hopper', hall: 'systems',
      role: 'Computer scientist & Rear Admiral', era: 'Systems', nationality: 'American', years: '1906–1992',
      tagline: 'Pioneer of the compiler and machine-independent languages.',
      works: ['A-0 compiler (1952)', 'FLOW-MATIC', 'COBOL (design influence)'],
      techniques: ['Built the first compiler, translating symbolic code to machine code', 'Championed English-like programming languages', 'Popularised the term "debugging"'],
    },
    {
      id: 'ritchie', name: 'Dennis Ritchie', wikiSlug: 'Dennis_Ritchie', hall: 'systems',
      role: 'Computer scientist', era: 'Systems', nationality: 'American', years: '1941–2011',
      tagline: 'Creator of C and co-creator of Unix.',
      works: ['The C programming language', 'Unix operating system', 'The C Programming Language (with Kernighan)'],
      techniques: ['Designed C, the substrate of modern systems software', 'Co-authored Unix, the ancestor of Linux and macOS', 'Established portable, hardware-independent systems programming'],
    },
    {
      id: 'thompson', name: 'Ken Thompson', wikiSlug: 'Ken_Thompson', hall: 'systems',
      role: 'Computer scientist', era: 'Systems', nationality: 'American', years: 'b. 1943',
      tagline: 'Co-creator of Unix and the Go language.',
      works: ['Unix', 'B programming language', 'UTF-8 (with Pike)', 'Go language (co-designer)'],
      techniques: ['Designed the original Unix kernel and shell', 'Invented regular-expression search (grep, ed)', 'Co-designed UTF-8 encoding on a diner placemat'],
    },
    {
      id: 'berners-lee', name: 'Tim Berners-Lee', wikiSlug: 'Tim_Berners-Lee', hall: 'systems',
      role: 'Computer scientist', era: 'Web', nationality: 'British', years: 'b. 1955',
      tagline: 'Inventor of the World Wide Web.',
      works: ['HTTP', 'HTML', 'The first web browser & server (1990)', 'URI/URL'],
      techniques: ['Unified hypertext, HTTP and URLs into the Web', 'Founded the W3C to keep web standards open', 'Advocated an open, royalty-free web'],
    },
    {
      id: 'stroustrup', name: 'Bjarne Stroustrup', wikiSlug: 'Bjarne_Stroustrup', hall: 'systems',
      role: 'Computer scientist', era: 'Systems', nationality: 'Danish', years: 'b. 1950',
      tagline: 'Designer of the C++ programming language.',
      works: ['C++', 'The C++ Programming Language', 'RAII idiom'],
      techniques: ['Added object-oriented and generic programming to C', 'Championed zero-overhead abstraction', 'Shaped modern systems and application software'],
    },

    // ── Algorithms & Theory
    {
      id: 'knuth', name: 'Donald Knuth', wikiSlug: 'Donald_Knuth', hall: 'algorithms',
      role: 'Computer scientist', era: 'Algorithms', nationality: 'American', years: 'b. 1938',
      tagline: 'Author of The Art of Computer Programming.',
      works: ['The Art of Computer Programming', 'TeX typesetting system', 'Knuth–Morris–Pratt algorithm'],
      techniques: ['Formalised the rigorous analysis of algorithms', 'Popularised asymptotic (big-O) analysis', 'Created TeX, the standard for mathematical typesetting'],
    },
    {
      id: 'dijkstra', name: 'Edsger W. Dijkstra', wikiSlug: 'Edsger_W._Dijkstra', hall: 'algorithms',
      role: 'Computer scientist', era: 'Algorithms', nationality: 'Dutch', years: '1930–2002',
      tagline: 'Pioneer of structured programming and graph algorithms.',
      works: ['Dijkstra’s shortest-path algorithm', 'Semaphores', '"Go To Statement Considered Harmful" (1968)'],
      techniques: ['Invented the shortest-path algorithm used in routing and maps', 'Introduced semaphores for concurrency control', 'Championed program correctness and structured programming'],
    },
    {
      id: 'cook', name: 'Stephen Cook', wikiSlug: 'Stephen_Cook', hall: 'algorithms',
      role: 'Computer scientist', era: 'Complexity', nationality: 'American-Canadian', years: 'b. 1939',
      tagline: 'Founder of computational complexity and NP-completeness.',
      works: ['The Complexity of Theorem-Proving Procedures (1971)', 'Cook–Levin theorem'],
      techniques: ['Defined NP-completeness and proved SAT is NP-complete', 'Framed the P vs NP problem', 'Established the theory of intractability'],
    },
    {
      id: 'diffie', name: 'Whitfield Diffie', wikiSlug: 'Whitfield_Diffie', hall: 'algorithms',
      role: 'Cryptographer', era: 'Cryptography', nationality: 'American', years: 'b. 1944',
      tagline: 'Co-inventor of public-key cryptography.',
      works: ['New Directions in Cryptography (1976)', 'Diffie–Hellman key exchange'],
      techniques: ['Invented public-key cryptography with Martin Hellman', 'Enabled secure key exchange over open channels', 'Laid the groundwork for TLS and modern secure communication'],
    },
    {
      id: 'lamport', name: 'Leslie Lamport', wikiSlug: 'Leslie_Lamport', hall: 'algorithms',
      role: 'Computer scientist', era: 'Distributed systems', nationality: 'American', years: 'b. 1941',
      tagline: 'Founder of the theory of distributed systems.',
      works: ['Time, Clocks, and the Ordering of Events (1978)', 'Paxos consensus', 'LaTeX'],
      techniques: ['Defined logical clocks and event ordering in distributed systems', 'Created the Paxos consensus algorithm', 'Authored LaTeX, the standard for scientific writing'],
    },

    // ── Artificial Intelligence
    {
      id: 'mccarthy', name: 'John McCarthy', wikiSlug: 'John_McCarthy_(computer_scientist)', hall: 'ai',
      role: 'Computer scientist', era: 'AI', nationality: 'American', years: '1927–2011',
      tagline: 'Coined "artificial intelligence" and created Lisp.',
      works: ['Lisp programming language', 'Dartmouth workshop (1956)', 'Garbage collection', 'Time-sharing'],
      techniques: ['Named the field of artificial intelligence', 'Designed Lisp, the language of early AI', 'Invented automatic garbage collection'],
    },
    {
      id: 'hinton', name: 'Geoffrey Hinton', wikiSlug: 'Geoffrey_Hinton', hall: 'ai',
      role: 'Cognitive scientist', era: 'Deep learning', nationality: 'British-Canadian', years: 'b. 1947',
      tagline: 'The "Godfather of deep learning".',
      works: ['Backpropagation (popularisation)', 'Boltzmann machines', 'AlexNet (2012)', 'Capsule networks'],
      techniques: ['Championed backpropagation for training deep networks', 'Co-created AlexNet, sparking the deep-learning revolution', '2018 Turing Award; 2024 Nobel Prize in Physics'],
    },
    {
      id: 'lecun', name: 'Yann LeCun', wikiSlug: 'Yann_LeCun', hall: 'ai',
      role: 'Computer scientist', era: 'Deep learning', nationality: 'French-American', years: 'b. 1960',
      tagline: 'Pioneer of convolutional neural networks.',
      works: ['LeNet (1989)', 'Convolutional neural networks', 'MNIST dataset'],
      techniques: ['Invented CNNs for image recognition', 'Applied deep learning to handwriting and vision', '2018 Turing Award with Hinton and Bengio'],
    },
    {
      id: 'bengio', name: 'Yoshua Bengio', wikiSlug: 'Yoshua_Bengio', hall: 'ai',
      role: 'Computer scientist', era: 'Deep learning', nationality: 'Canadian', years: 'b. 1964',
      tagline: 'Architect of modern neural language models.',
      works: ['Neural probabilistic language model (2003)', 'Attention mechanisms', 'GANs (co-advised)'],
      techniques: ['Pioneered neural network language modelling', 'Advanced attention and sequence models', '2018 Turing Award with Hinton and LeCun'],
    },
    {
      id: 'li', name: 'Fei-Fei Li', wikiSlug: 'Fei-Fei_Li', hall: 'ai',
      role: 'Computer scientist', era: 'Computer vision', nationality: 'Chinese-American', years: 'b. 1976',
      tagline: 'Creator of ImageNet.',
      works: ['ImageNet (2009)', 'ImageNet Large Scale Visual Recognition Challenge'],
      techniques: ['Built ImageNet, the dataset that catalysed deep learning', 'Advanced large-scale computer vision benchmarks', 'Champion of human-centred and responsible AI'],
    },
  ],

  concepts: [
    { id: 'turing-machine', name: 'Turing Machine', blurb: 'An abstract machine that reads and writes symbols on an infinite tape according to a rule table — the formal model of computation.', wikiSlug: 'Turing_machine', tags: ['theory', 'computability'] },
    { id: 'algorithm', name: 'Algorithm', blurb: 'A finite, unambiguous sequence of steps that solves a class of problems or performs a computation.', wikiSlug: 'Algorithm', tags: ['algorithms'] },
    { id: 'complexity', name: 'Computational Complexity', blurb: 'The study of the resources — time and space — required to solve problems, and the classes P, NP and beyond.', wikiSlug: 'Computational_complexity_theory', tags: ['theory', 'complexity'] },
    { id: 'data-structure', name: 'Data Structures', blurb: 'Ways of organising data — arrays, trees, hash tables, graphs — chosen to make operations efficient.', wikiSlug: 'Data_structure', tags: ['algorithms', 'data-structures'] },
    { id: 'recursion', name: 'Recursion', blurb: 'Defining a solution in terms of smaller instances of the same problem; the backbone of divide-and-conquer.', wikiSlug: 'Recursion_(computer_science)', tags: ['programming'] },
    { id: 'compiler', name: 'Compilers', blurb: 'Programs that translate source code into machine code through lexing, parsing, optimisation and code generation.', wikiSlug: 'Compiler', tags: ['languages', 'systems'] },
    { id: 'operating-system', name: 'Operating Systems', blurb: 'The software layer that manages hardware, schedules processes and mediates access to memory, files and devices.', wikiSlug: 'Operating_system', tags: ['systems'] },
    { id: 'machine-learning', name: 'Machine Learning', blurb: 'Algorithms that improve at a task by learning statistical patterns from data rather than explicit programming.', wikiSlug: 'Machine_learning', tags: ['ai', 'ml'] },
    { id: 'neural-network', name: 'Neural Networks', blurb: 'Layered networks of weighted connections trained by gradient descent to approximate complex functions.', wikiSlug: 'Artificial_neural_network', tags: ['ai', 'ml', 'deep-learning'] },
    { id: 'cryptography', name: 'Cryptography', blurb: 'The mathematics of secure communication: encryption, key exchange, hashing and digital signatures.', wikiSlug: 'Cryptography', tags: ['security', 'theory'] },
    { id: 'concurrency', name: 'Concurrency', blurb: 'Structuring programs as independently executing parts, coordinating shared state with locks, semaphores and message passing.', wikiSlug: 'Concurrency_(computer_science)', tags: ['systems'] },
    { id: 'formal-language', name: 'Formal Languages & Automata', blurb: 'The hierarchy of grammars and machines — regular, context-free, recursive — underpinning parsing and computability.', wikiSlug: 'Automata_theory', tags: ['theory', 'languages'] },
  ],

  eras: [
    {
      id: 'proto', title: 'Mechanical & Analytical', span: '1820s–1930s',
      essay: 'Before electronics, computation was mechanical. Babbage designed the Difference and Analytical Engines, and Ada Lovelace wrote the first algorithm for a machine. Boolean algebra and mathematical logic quietly assembled the theoretical toolkit that electronic computing would later need.',
      developments: ['Babbage’s Difference and Analytical Engines', 'Boolean algebra (Boole, 1854)', 'Lovelace’s first published algorithm', 'Hollerith punched-card tabulation'],
      turningPoints: ['Lovelace foresees general-purpose symbol manipulation', 'Boolean logic formalised as an algebra'],
    },
    {
      id: 'theory', title: 'The Theoretical Foundations', span: '1930s–1940s',
      essay: 'In the 1930s Turing, Church and Gödel pinned down exactly what "computable" means. Turing machines, the lambda calculus and the halting problem defined both the power and the hard limits of mechanical computation, years before a working electronic computer existed.',
      developments: ['Turing machine and the halting problem (1936)', 'Church’s lambda calculus', 'Church–Turing thesis', 'Gödel’s incompleteness theorems'],
      turningPoints: ['Computation given a precise mathematical definition', 'Undecidability proven — some problems no machine can solve'],
    },
    {
      id: 'electronic', title: 'Electronic & Stored-Program', span: '1940s–1950s',
      essay: 'War-driven engineering produced the first electronic computers — Colossus, ENIAC — and von Neumann’s EDVAC report crystallised the stored-program architecture. Shannon’s information theory gave the field its unit, the bit, and Grace Hopper built the first compiler.',
      developments: ['Colossus and ENIAC', 'Von Neumann architecture (1945)', 'Shannon’s information theory (1948)', 'First compiler (Hopper, 1952)'],
      turningPoints: ['Code and data share one memory', 'Information becomes a measurable quantity'],
    },
    {
      id: 'languages', title: 'Languages & Software', span: '1950s–1970s',
      essay: 'Programming rose above raw machine code. FORTRAN, LISP, COBOL and later C and Unix made software portable and expressive. Structured programming, algorithms and the first databases turned computing into a professional engineering discipline.',
      developments: ['FORTRAN, LISP, COBOL', 'Unix and C (early 1970s)', 'Structured programming', 'Relational databases (Codd, 1970)'],
      turningPoints: ['High-level languages free programmers from hardware', 'Unix + C establish portable systems software'],
    },
    {
      id: 'complexity', title: 'Complexity & Networks', span: '1970s–1990s',
      essay: 'Cook and Karp founded complexity theory and the P vs NP question. Public-key cryptography made secure open communication possible, and the ARPANET grew into the Internet. The personal computer and the graphical interface brought computing to everyone.',
      developments: ['NP-completeness (Cook, 1971)', 'Public-key cryptography (1976)', 'TCP/IP and the Internet', 'Personal computers and GUIs'],
      turningPoints: ['P vs NP framed as the central open problem', 'Networking connects the world’s machines'],
    },
    {
      id: 'web', title: 'The Web & Open Source', span: '1990s–2000s',
      essay: 'Berners-Lee’s World Wide Web layered hypertext over the Internet, and search, e-commerce and social platforms followed. Open-source software — Linux, the LAMP stack — and cheap, scalable data centres reshaped how software was built and delivered.',
      developments: ['World Wide Web (1990)', 'Linux and open source', 'Search engines and web-scale data', 'Cloud computing emerges'],
      turningPoints: ['Information becomes universally hyperlinked', 'Software distribution goes open and global'],
    },
    {
      id: 'deep-learning', title: 'The Deep-Learning Era', span: '2010s–present',
      essay: 'Abundant data, GPUs and deep neural networks transformed AI. AlexNet (2012) proved deep learning at scale, and the Transformer (2017) enabled large language models that write, code and converse. Computer science now grapples with alignment, scale and the societal impact of AI.',
      developments: ['AlexNet and the deep-learning boom (2012)', 'The Transformer architecture (2017)', 'Large language models (GPT, etc.)', 'Generative AI across text, image and code'],
      turningPoints: ['Neural networks surpass hand-engineered features', 'Attention and scale unlock general-purpose language models'],
    },
  ],

  laws: [
    {
      id: 'shannon-entropy', category: 'Information Theory', name: 'Shannon Entropy',
      latex: 'H(X) = -\\sum_i p_i \\log_2 p_i',
      variables: [
        { sym: 'H', name: 'Entropy of the source', unit: 'bits' },
        { sym: 'p_i', name: 'Probability of symbol i' },
      ],
      description: 'The average information content, in bits, of a random variable — and the theoretical lower bound on lossless compression.',
      reference: 'Shannon, A Mathematical Theory of Communication (1948)',
    },
    {
      id: 'channel-capacity', category: 'Information Theory', name: 'Shannon–Hartley Channel Capacity',
      latex: 'C = B \\log_2\\!\\left(1 + \\dfrac{S}{N}\\right)',
      variables: [
        { sym: 'C', name: 'Channel capacity', unit: 'bits/s' },
        { sym: 'B', name: 'Bandwidth', unit: 'Hz' },
        { sym: 'S/N', name: 'Signal-to-noise ratio' },
      ],
      description: 'The maximum error-free data rate of a communication channel given its bandwidth and noise level.',
      reference: 'Shannon–Hartley theorem',
    },
    {
      id: 'big-o', category: 'Complexity', name: 'Asymptotic Growth (Big-O)',
      latex: 'f(n) = O\\big(g(n)\\big) \\iff \\exists\\, c, n_0:\\ f(n) \\le c\\,g(n)\\ \\forall\\, n \\ge n_0',
      variables: [
        { sym: 'f(n)', name: 'Running time or space of an algorithm' },
        { sym: 'g(n)', name: 'Bounding growth function' },
        { sym: 'c, n_0', name: 'Positive constants' },
      ],
      description: 'An upper bound on how an algorithm’s cost grows with input size, ignoring constant factors and lower-order terms.',
      reference: 'Knuth, The Art of Computer Programming',
    },
    {
      id: 'comparison-sort', category: 'Complexity', name: 'Comparison-Sort Lower Bound',
      latex: 'T(n) = \\Omega(n \\log n)',
      variables: [
        { sym: 'T(n)', name: 'Comparisons required to sort n items' },
        { sym: 'n', name: 'Number of elements' },
      ],
      description: 'Any sorting algorithm based only on pairwise comparisons must make at least on the order of n·log n comparisons in the worst case.',
      reference: 'Decision-tree argument, log₂(n!)',
    },
    {
      id: 'masters-theorem', category: 'Algorithms', name: 'Master Theorem',
      latex: 'T(n) = a\\,T\\!\\left(\\dfrac{n}{b}\\right) + f(n)',
      variables: [
        { sym: 'a', name: 'Number of subproblems' },
        { sym: 'b', name: 'Factor by which n shrinks' },
        { sym: 'f(n)', name: 'Cost of divide and combine' },
      ],
      description: 'Solves the running-time recurrences of divide-and-conquer algorithms by comparing f(n) with n^(log_b a).',
      reference: 'Cormen, Leiserson, Rivest, Stein (CLRS)',
    },
    {
      id: 'p-vs-np', category: 'Complexity', name: 'P versus NP',
      latex: '\\mathsf{P} \\stackrel{?}{=} \\mathsf{NP}',
      variables: [
        { sym: 'P', name: 'Problems solvable in polynomial time' },
        { sym: 'NP', name: 'Problems verifiable in polynomial time' },
      ],
      description: 'The central open question of computer science: can every problem whose solution is quickly checkable also be quickly solved?',
      reference: 'Cook–Levin theorem (1971); Clay Millennium Prize',
    },
    {
      id: 'sigmoid', category: 'Machine Learning', name: 'Sigmoid Activation',
      latex: '\\sigma(z) = \\dfrac{1}{1 + e^{-z}}',
      variables: [
        { sym: '\\sigma', name: 'Activation output in (0,1)' },
        { sym: 'z', name: 'Weighted input (logit)' },
      ],
      description: 'A smooth, differentiable squashing function that maps any real value into the interval (0,1); classic neuron activation and logistic-regression link.',
    },
    {
      id: 'relu', category: 'Machine Learning', name: 'ReLU Activation',
      latex: '\\mathrm{ReLU}(z) = \\max(0, z)',
      variables: [
        { sym: 'z', name: 'Weighted input to the neuron' },
      ],
      description: 'The rectified linear unit — the dominant activation in deep networks — passing positives unchanged and zeroing negatives, which mitigates vanishing gradients.',
    },
    {
      id: 'softmax', category: 'Machine Learning', name: 'Softmax',
      latex: '\\mathrm{softmax}(z)_i = \\dfrac{e^{z_i}}{\\sum_j e^{z_j}}',
      variables: [
        { sym: 'z_i', name: 'Logit for class i' },
        { sym: 'i, j', name: 'Class indices' },
      ],
      description: 'Converts a vector of logits into a probability distribution over classes; the output layer of most classifiers and language models.',
    },
    {
      id: 'gradient-descent', category: 'Machine Learning', name: 'Gradient Descent Update',
      latex: '\\theta_{t+1} = \\theta_t - \\eta\\, \\nabla_\\theta J(\\theta_t)',
      variables: [
        { sym: '\\theta', name: 'Model parameters' },
        { sym: '\\eta', name: 'Learning rate' },
        { sym: '\\nabla_\\theta J', name: 'Gradient of the loss' },
      ],
      description: 'Iteratively adjusts parameters in the direction that most decreases the loss; the workhorse optimiser of machine learning.',
    },
    {
      id: 'cross-entropy', category: 'Machine Learning', name: 'Cross-Entropy Loss',
      latex: 'L = -\\sum_i y_i \\log \\hat{y}_i',
      variables: [
        { sym: 'y_i', name: 'True label (one-hot)' },
        { sym: '\\hat{y}_i', name: 'Predicted probability for class i' },
      ],
      description: 'Measures the divergence between predicted and true class distributions; the standard classification loss.',
    },
    {
      id: 'attention', category: 'Deep Learning', name: 'Scaled Dot-Product Attention',
      latex: '\\mathrm{Attention}(Q,K,V) = \\mathrm{softmax}\\!\\left(\\dfrac{QK^{\\top}}{\\sqrt{d_k}}\\right)V',
      variables: [
        { sym: 'Q, K, V', name: 'Query, key and value matrices' },
        { sym: 'd_k', name: 'Key dimension (scaling)' },
      ],
      description: 'The core operation of the Transformer: each token attends to others weighted by scaled query–key similarity.',
      reference: 'Vaswani et al., Attention Is All You Need (2017)',
    },
    {
      id: 'amdahl', category: 'Systems', name: 'Amdahl’s Law',
      latex: 'S(n) = \\dfrac{1}{(1 - p) + \\dfrac{p}{n}}',
      variables: [
        { sym: 'S', name: 'Overall speed-up' },
        { sym: 'p', name: 'Parallelisable fraction of work' },
        { sym: 'n', name: 'Number of processors' },
      ],
      description: 'Caps the speed-up from parallelism: the serial fraction (1−p) fundamentally limits how much extra cores can help.',
      reference: 'Amdahl (1967)',
    },
    {
      id: 'moore', category: 'Systems', name: 'Moore’s Law',
      latex: 'N(t) = N_0 \\cdot 2^{\\,t/2}',
      variables: [
        { sym: 'N', name: 'Transistors per chip' },
        { sym: 't', name: 'Years elapsed' },
        { sym: 'N_0', name: 'Initial transistor count' },
      ],
      description: 'The empirical observation that transistor density roughly doubles every two years, driving decades of exponential computing growth.',
      reference: 'Moore (1965)',
    },
    {
      id: 'huffman', category: 'Information Theory', name: 'Kraft–McMillan Inequality',
      latex: '\\sum_i 2^{-\\ell_i} \\le 1',
      variables: [
        { sym: '\\ell_i', name: 'Code-word length for symbol i', unit: 'bits' },
      ],
      description: 'The condition for the existence of a uniquely decodable prefix code — the constraint that optimal (Huffman) compression satisfies with equality.',
    },
    {
      id: 'hamming', category: 'Information Theory', name: 'Hamming Distance',
      latex: 'd_H(x, y) = \\sum_{i=1}^{n} [\\,x_i \\ne y_i\\,]',
      variables: [
        { sym: 'x, y', name: 'Equal-length code words' },
        { sym: 'n', name: 'Word length', unit: 'bits' },
      ],
      description: 'The number of positions at which two strings differ; foundational to error-detecting and error-correcting codes.',
      reference: 'Hamming (1950)',
    },
  ],

  tools: [
    { name: 'GitHub', org: 'GitHub (Microsoft)', url: 'https://github.com', desc: 'The world’s largest host of open-source code, version control and collaboration.', kind: 'software', access: 'Freemium' },
    { name: 'Hugging Face', org: 'Hugging Face', url: 'https://huggingface.co', desc: 'Hub for open machine-learning models, datasets and the Transformers library.', kind: 'community', access: 'Freemium' },
    { name: 'Compiler Explorer (Godbolt)', org: 'Matt Godbolt', url: 'https://godbolt.org', desc: 'See the assembly your C/C++/Rust/Go source compiles to, live in the browser.', kind: 'software', access: 'Open' },
    { name: 'LeetCode', org: 'LeetCode', url: 'https://leetcode.com', desc: 'Algorithm and data-structure practice problems with an online judge.', kind: 'software', access: 'Freemium' },
    { name: 'Project Euler', org: 'Project Euler', url: 'https://projecteuler.net', desc: 'Mathematical and computational problems that reward efficient algorithms.', kind: 'community', access: 'Open' },
    { name: 'Jupyter', org: 'Project Jupyter', url: 'https://jupyter.org', desc: 'Interactive notebooks for code, math, visualisation and narrative in one document.', kind: 'software', access: 'Open' },
    { name: 'scikit-learn', org: 'scikit-learn', url: 'https://scikit-learn.org', desc: 'The reference open-source library for classical machine learning in Python.', kind: 'software', access: 'Open' },
    { name: 'PyTorch', org: 'PyTorch Foundation', url: 'https://pytorch.org', desc: 'Open-source deep-learning framework with dynamic computation graphs.', kind: 'software', access: 'Open' },
    { name: 'Visual Studio Code', org: 'Microsoft', url: 'https://code.visualstudio.com', desc: 'Free, extensible source-code editor for nearly every language.', kind: 'software', access: 'Open' },
    { name: 'arXiv cs', org: 'Cornell University', url: 'https://arxiv.org/list/cs.LG/recent', desc: 'Open-access preprints across every subfield of computer science.', kind: 'dataset', access: 'Open' },
    { name: 'Papers With Code', org: 'Papers With Code', url: 'https://paperswithcode.com', desc: 'Machine-learning papers linked to their open-source implementations and benchmarks.', kind: 'community', access: 'Open' },
    { name: 'Google Colab', org: 'Google', url: 'https://colab.research.google.com', desc: 'Free cloud Jupyter notebooks with GPU/TPU access for ML experiments.', kind: 'software', access: 'Freemium' },
    { name: 'Replit', org: 'Replit', url: 'https://replit.com', desc: 'Browser-based IDE for prototyping and running code in dozens of languages.', kind: 'software', access: 'Freemium' },
    { name: 'The Algorithms', org: 'The Algorithms', url: 'https://the-algorithms.com', desc: 'Open-source reference implementations of classic algorithms in many languages.', kind: 'community', access: 'Open' },
  ],
};

export default DATA;
