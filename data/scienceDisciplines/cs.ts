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
    {
      id: 'turing-machine', name: 'Turing Machine', blurb: 'An abstract machine that reads and writes symbols on an infinite tape according to a rule table — the formal model of computation.', wikiSlug: 'Turing_machine', tags: ['theory', 'computability'],
      deepDive: 'A Turing machine is deliberately minimal — a head that reads and writes symbols on an unbounded tape under a finite table of rules — yet it captures everything we mean by "effective computation". The Church–Turing thesis holds that any function a human could compute by rote, a Turing machine can compute too, which is why it remains the yardstick for what is computable at all. Turing used it to prove that some problems, notably the halting problem, admit no algorithmic solution.',
      videoIds: ['macM_MtS_w4', 'HeQX2HjkcNo'],
      evidence: [
        { label: 'On Computable Numbers, with an Application to the Entscheidungsproblem (Turing, 1936)', detail: 'Introduced the machine model and proved the halting problem undecidable.', url: 'https://www.cs.virginia.edu/~robins/Turing_Paper_1936.pdf', kind: 'proof' },
        { label: 'The Church–Turing thesis', detail: 'Lambda calculus, general recursive functions and Turing machines all define the same class of computable functions.', kind: 'proof' },
        { label: 'Undecidability of the halting problem', detail: 'No single program can decide, for every program and input, whether it halts.', kind: 'proof' },
      ],
    },
    {
      id: 'algorithm', name: 'Algorithm', blurb: 'A finite, unambiguous sequence of steps that solves a class of problems or performs a computation.', wikiSlug: 'Algorithm', tags: ['algorithms'],
      deepDive: 'An algorithm is a finite recipe guaranteed to terminate with the right answer for every valid input. The discipline of analysing them — counting steps as the input grows — lets us compare methods independently of hardware, and asymptotic (big-O) notation is the shared language for doing so. Landmark algorithms such as Euclid\'s GCD, quicksort and Dijkstra\'s shortest path show how a clever ordering of steps turns an intractable brute force into something practical.',
      simulatorId: 'sorting',
      lawIds: ['big-o', 'comparison-sort', 'masters-theorem'],
      videoIds: ['HtSuA80QTyo', 'ngCos392W4w'],
      evidence: [
        { label: "Euclid's algorithm (c. 300 BC)", detail: 'The oldest non-trivial algorithm still in daily use, computing the greatest common divisor.', kind: 'document' },
        { label: 'Knuth, The Art of Computer Programming', detail: 'Established the rigorous mathematical analysis of algorithms and their asymptotic cost.', kind: 'document' },
        { label: 'Comparison-sort lower bound', detail: 'A decision-tree argument proves any comparison sort needs Ω(n log n) comparisons in the worst case.', kind: 'proof' },
      ],
    },
    {
      id: 'complexity', name: 'Computational Complexity', blurb: 'The study of the resources — time and space — required to solve problems, and the classes P, NP and beyond.', wikiSlug: 'Computational_complexity_theory', tags: ['theory', 'complexity'],
      deepDive: 'Complexity theory sorts problems by the resources — chiefly time and memory — that any algorithm must spend to solve them. The class P holds problems solvable in polynomial time; NP holds those whose solutions can be checked in polynomial time, and whether P equals NP is the field\'s defining open question and a Clay Millennium Prize problem. Cook\'s proof that Boolean satisfiability is NP-complete gave us a single hardest problem whose fast solution would collapse the whole class.',
      simulatorId: 'big-o',
      lawIds: ['big-o', 'p-vs-np', 'comparison-sort'],
      evidence: [
        { label: 'The Complexity of Theorem-Proving Procedures (Cook, 1971)', detail: 'Defined NP-completeness and proved SAT is NP-complete.', url: 'https://dl.acm.org/doi/10.1145/800157.805047', kind: 'proof' },
        { label: 'Reducibility Among Combinatorial Problems (Karp, 1972)', detail: 'Showed 21 classic problems are all NP-complete, revealing how widespread intractability is.', kind: 'proof' },
        { label: 'P versus NP', detail: 'One of the seven Clay Mathematics Millennium Prize Problems, still unresolved.', url: 'https://www.claymath.org/millennium/p-vs-np/', kind: 'document' },
      ],
    },
    { id: 'data-structure', name: 'Data Structures', blurb: 'Ways of organising data — arrays, trees, hash tables, graphs — chosen to make operations efficient.', wikiSlug: 'Data_structure', tags: ['algorithms', 'data-structures'] },
    {
      id: 'recursion', name: 'Recursion', blurb: 'Defining a solution in terms of smaller instances of the same problem; the backbone of divide-and-conquer.', wikiSlug: 'Recursion_(computer_science)', tags: ['programming'],
      deepDive: 'Recursion solves a problem by reducing it to smaller instances of itself, with one or more base cases stopping the descent. It is the natural expression of divide-and-conquer algorithms — mergesort, quicksort, tree traversals — and maps directly onto the mathematical idea of induction. Church\'s lambda calculus showed that recursion alone, via fixed-point combinators, is enough to express any computable function.',
      videoIds: ['ngCos392W4w'],
      evidence: [
        { label: 'The lambda calculus (Church, 1936)', detail: 'Defines computation purely through function abstraction and recursion.', kind: 'proof' },
        { label: 'The Master Theorem', detail: 'Solves the running-time recurrences that recursive divide-and-conquer algorithms generate.', kind: 'proof' },
        { label: 'The Ackermann function', detail: 'A total recursive function that is not primitive recursive, showing the full power of recursion.', kind: 'document' },
      ],
    },
    { id: 'compiler', name: 'Compilers', blurb: 'Programs that translate source code into machine code through lexing, parsing, optimisation and code generation.', wikiSlug: 'Compiler', tags: ['languages', 'systems'] },
    { id: 'operating-system', name: 'Operating Systems', blurb: 'The software layer that manages hardware, schedules processes and mediates access to memory, files and devices.', wikiSlug: 'Operating_system', tags: ['systems'] },
    {
      id: 'machine-learning', name: 'Machine Learning', blurb: 'Algorithms that improve at a task by learning statistical patterns from data rather than explicit programming.', wikiSlug: 'Machine_learning', tags: ['ai', 'ml'],
      deepDive: 'Machine learning replaces hand-written rules with models that infer their own parameters from data, optimising a loss function that measures how wrong the predictions are. The central tension is generalisation: a model must fit the training data yet still perform on unseen examples, which is why regularisation and held-out validation matter as much as raw accuracy. Progress has come from better architectures, far larger datasets and cheap parallel compute — culminating in the Transformer, which now underpins large language models.',
      lawIds: ['gradient-descent', 'cross-entropy', 'softmax'],
      videoIds: ['CqOfi41LfDw'],
      evidence: [
        { label: 'Some Studies in Machine Learning Using the Game of Checkers (Samuel, 1959)', detail: 'Coined "machine learning" and demonstrated a program that improved with self-play.', kind: 'experiment' },
        { label: 'ImageNet (Deng et al., 2009)', detail: 'The large labelled dataset that made data-driven deep learning possible.', url: 'https://www.image-net.org', kind: 'dataset' },
        { label: 'Attention Is All You Need (Vaswani et al., 2017)', detail: 'Introduced the Transformer, the architecture behind modern LLMs.', url: 'https://arxiv.org/abs/1706.03762', kind: 'document' },
      ],
    },
    {
      id: 'neural-network', name: 'Neural Networks', blurb: 'Layered networks of weighted connections trained by gradient descent to approximate complex functions.', wikiSlug: 'Artificial_neural_network', tags: ['ai', 'ml', 'deep-learning'],
      deepDive: 'A neural network stacks layers of simple weighted units whose nonlinear activations let the whole compose arbitrarily complex functions — the universal approximation theorem guarantees a large enough network can fit any continuous function. Training adjusts the weights by backpropagation, which applies the chain rule to push the loss gradient backward through every layer. The 2012 AlexNet result, a deep convolutional network trained on GPUs, cut the ImageNet error rate dramatically and ignited the modern deep-learning era.',
      lawIds: ['sigmoid', 'relu', 'gradient-descent', 'cross-entropy'],
      videoIds: ['aircAruvnKk', 'IHZwWFHWa-w'],
      evidence: [
        { label: 'The Perceptron (Rosenblatt, 1958)', detail: 'The first trainable single-layer neural model for pattern recognition.', kind: 'experiment' },
        { label: 'Learning representations by back-propagating errors (Rumelhart, Hinton & Williams, 1986)', detail: 'Popularised backpropagation for training multi-layer networks.', url: 'https://www.nature.com/articles/323533a0', kind: 'document' },
        { label: 'ImageNet Classification with Deep CNNs / AlexNet (Krizhevsky, Sutskever & Hinton, 2012)', detail: 'Deep learning wins ILSVRC by a wide margin, launching the field.', kind: 'experiment' },
      ],
    },
    {
      id: 'cryptography', name: 'Cryptography', blurb: 'The mathematics of secure communication: encryption, key exchange, hashing and digital signatures.', wikiSlug: 'Cryptography', tags: ['security', 'theory'],
      deepDive: 'Modern cryptography rests on computational hardness: schemes are secure because breaking them would require solving a problem, such as factoring large integers or computing discrete logarithms, for which no efficient algorithm is known. Public-key cryptography, introduced by Diffie and Hellman in 1976, lets two parties agree on a secret over an open channel without ever sharing a private key first. These ideas underpin TLS, the padlock that secures essentially all web traffic today.',
      videoIds: ['GSIDS_lvRv4'],
      evidence: [
        { label: 'Communication Theory of Secrecy Systems (Shannon, 1949)', detail: 'Put cryptography on a rigorous information-theoretic footing and defined perfect secrecy.', kind: 'document' },
        { label: 'New Directions in Cryptography (Diffie & Hellman, 1976)', detail: 'Introduced public-key cryptography and secure key exchange.', url: 'https://ee.stanford.edu/~hellman/publications/24.pdf', kind: 'document' },
        { label: 'A Method for Obtaining Digital Signatures / RSA (Rivest, Shamir & Adleman, 1978)', detail: 'The first practical public-key cryptosystem, based on integer factorisation.', kind: 'document' },
      ],
    },
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

  videos: [
    // ── Foundations
    { id: 'macM_MtS_w4', title: 'Turing & The Halting Problem', channel: 'Computerphile', topic: 'Foundations', blurb: 'Why no program can decide, in general, whether another program will halt.', query: 'Turing & The Halting Problem Computerphile' },
    { id: 'HeQX2HjkcNo', title: "Math's Fundamental Flaw", channel: 'Veritasium', topic: 'Foundations', blurb: 'Gödel, Turing and the limits of what mathematics and machines can prove.', query: "Math's Fundamental Flaw Veritasium" },
    { id: 'O5nskjZ_GoI', title: 'Early Computing: Crash Course Computer Science #1', channel: 'CrashCourse', topic: 'Foundations', blurb: 'From the abacus and Babbage to the first electronic computers.', query: 'Early Computing Crash Course Computer Science #1 CrashCourse' },
    { id: 'gI-qXk7XojA', title: 'Boolean Logic & Logic Gates: Crash Course Computer Science #3', channel: 'CrashCourse', topic: 'Foundations', blurb: 'How AND, OR and NOT gates build every computation from bits.', query: 'Boolean Logic & Logic Gates Crash Course Computer Science #3 CrashCourse' },
    // ── Algorithms
    { id: 'HtSuA80QTyo', title: '1. Algorithmic Thinking, Peak Finding', channel: 'MIT OpenCourseWare', topic: 'Algorithms', blurb: 'MIT 6.006 opens with divide-and-conquer and asymptotic analysis.', query: '1. Algorithmic Thinking, Peak Finding MIT OpenCourseWare 6.006' },
    { id: 'ngCos392W4w', title: '5 Simple Steps for Solving Any Recursive Problem', channel: 'Reducible', topic: 'Algorithms', blurb: 'A practical framework for reasoning about recursion and base cases.', query: '5 Simple Steps for Solving Any Recursive Problem Reducible' },
    { id: 'GSIDS_lvRv4', title: 'Public Key Cryptography', channel: 'Computerphile', topic: 'Algorithms', blurb: 'The padlock-and-key intuition behind asymmetric encryption.', query: 'Public Key Cryptography Computerphile' },
    { id: '-uleG_Vecis', title: '100+ Computer Science Concepts Explained', channel: 'Fireship', topic: 'Algorithms', blurb: 'A rapid-fire tour of the vocabulary of computer science.', query: '100+ Computer Science Concepts Explained Fireship' },
    // ── Machine Learning
    { id: 'aircAruvnKk', title: 'But what is a neural network?', channel: '3Blue1Brown', topic: 'Machine Learning', blurb: 'The classic visual introduction to neurons, layers and weights.', query: 'But what is a neural network 3Blue1Brown' },
    { id: 'IHZwWFHWa-w', title: 'Gradient descent, how neural networks learn', channel: '3Blue1Brown', topic: 'Machine Learning', blurb: 'How a network descends a cost surface to tune its parameters.', query: 'Gradient descent how neural networks learn 3Blue1Brown' },
    { id: 'eMlx5fFNoYc', title: 'Attention in transformers, visually explained', channel: '3Blue1Brown', topic: 'Machine Learning', blurb: 'The attention mechanism at the heart of modern language models.', query: 'Attention in transformers visually explained 3Blue1Brown' },
    { id: 'fNk_zzaMoSs', title: 'Vectors | Essence of linear algebra', channel: '3Blue1Brown', topic: 'Machine Learning', blurb: 'The linear-algebra intuition that underpins all of ML.', query: 'Vectors Essence of linear algebra 3Blue1Brown' },
    { id: 'CqOfi41LfDw', title: 'Neural Networks Pt. 1: Inside the Black Box', channel: 'StatQuest with Josh Starmer', topic: 'Machine Learning', blurb: 'A gentle, step-by-step build-up of what a neural net computes.', query: 'Neural Networks Pt 1 Inside the Black Box StatQuest' },
    // ── Systems
    { id: 'QZwneRb-zqA', title: 'Exploring How Computers Work', channel: 'Sebastian Lague', topic: 'Systems', blurb: 'From transistors and logic gates up to a working CPU.', query: 'Exploring How Computers Work Sebastian Lague' },
    { id: '1I5ZMmrOfnA', title: 'How Computers Calculate - the ALU: Crash Course Computer Science #5', channel: 'CrashCourse', topic: 'Systems', blurb: 'How the arithmetic logic unit does the machine\'s actual math.', query: 'How Computers Calculate the ALU Crash Course Computer Science #5 CrashCourse' },
  ],
};

export default DATA;
