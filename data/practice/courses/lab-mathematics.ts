import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// Rotate the choices (keeping their cyclic order) so the correct answer lands on a spread-out index.
const mc = (l: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], answer: number, hint: string, explanation: string): Question => {
  const target = (parseInt(l.slice(l.lastIndexOf('.l') + 2), 10) * 3 + n * 5) % 4;
  const shift = (target - answer + 4) % 4;
  const rotated = choices.map((_, i) => choices[(i - shift + 4) % 4]);
  return { id: `${l}.q${n}`, lessonId: l, kind: 'mcq', prompt, choices: rotated, answer: target, hint, explanation, level };
};

const L01 = 'lab-mathematics.l01';
const L02 = 'lab-mathematics.l02';
const L03 = 'lab-mathematics.l03';
const L04 = 'lab-mathematics.l04';
const L05 = 'lab-mathematics.l05';
const L06 = 'lab-mathematics.l06';
const L07 = 'lab-mathematics.l07';
const L08 = 'lab-mathematics.l08';
const L09 = 'lab-mathematics.l09';
const L10 = 'lab-mathematics.l10';
const L11 = 'lab-mathematics.l11';
const L12 = 'lab-mathematics.l12';
const L13 = 'lab-mathematics.l13';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'lab-mathematics',
    label: 'Mathematics',
    blurb: 'Proof, infinity, primes, algebra, geometry and analysis, told through the theorems and the people who found them.',
    accent: '#F06595',
    framework: 'ccss',
    tracks: [
      {
        id: 'lab-mathematics.t1',
        title: 'Proof and Foundations',
        blurb: 'What counts as certain knowledge, how infinity behaves, and where formal reasoning runs out.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'What Is a Proof?',
            blurb: 'A chain of deductions from axioms and definitions that establishes a statement beyond doubt.',
            minutes: 6,
            body: `A mathematical proof is a chain of deductions, each step following from axioms, definitions or earlier results, that establishes a statement beyond doubt. This is what separates mathematics from other sciences. A physicist can only fail to find a counterexample; a mathematician can show that none can exist.

The template comes from Euclid's Elements, written around 300 BCE. Euclid started from a short list of postulates and common notions and derived hundreds of geometric facts from them. For two thousand years it was the model of rigorous reasoning. Modern logic later formalised exactly what counts as a valid proof.

Examples are not proofs. To show that the sum of two even numbers is even, checking 2 + 4, 6 + 8 and a million other pairs would still leave a doubt about the next pair. A proof works for all cases at once: write the two even numbers as 2a and 2b, where a and b are whole numbers. Their sum is 2a + 2b = 2(a + b), which is twice a whole number and so even. That argument covers every pair.

Proof is not static. In 1976 the four-colour theorem became the first major result whose proof needed a computer to check thousands of cases, forcing mathematicians to ask what it means to verify an argument.`,
          },
          {
            id: L02,
            title: 'Infinitely Many Primes',
            blurb: 'Euclid\'s proof by contradiction, still taught today.',
            minutes: 7,
            body: `A prime is a whole number greater than 1 whose only divisors are 1 and itself. The primes 2, 3, 5, 7, 11 and so on seem to thin out. Do they ever stop? Around 300 BCE Euclid proved they never do, using a proof by contradiction.

Assume, for contradiction, that there are only finitely many primes, listed as p1, p2, ... pn. Form the number N = p1 x p2 x ... x pn + 1. Dividing N by any prime on the list leaves remainder 1, because the product part is divisible by each of them. So no prime on the list divides N. But every number greater than 1 has at least one prime factor. That factor must be a prime that is not on our list, contradicting the assumption that the list was complete. So the primes are infinite.

A small example: for the primes 2, 3, 5 the construction gives N = 30 + 1 = 31, which happens to be prime and is new. N need not be prime itself, though. Using 2, 3, 5, 7, 11, 13 gives 30031, which equals 59 x 509. It is composite, but both of its prime factors are absent from the list, which is all the proof requires.

Euclid's argument is a model of mathematical beauty: short, surprising and airtight.`,
          },
          {
            id: L03,
            title: 'Cantor and the Sizes of Infinity',
            blurb: 'Some infinities are strictly larger than others.',
            minutes: 8,
            body: `Georg Cantor, who founded set theory in the 1870s, asked a startling question: do all infinite sets have the same size? Two sets have the same size if their members can be paired off one-to-one. By that test the whole numbers and the even numbers are equally numerous, which surprises many beginners. Cantor then showed that the real numbers are strictly more numerous than the whole numbers, using his diagonal argument of 1891.

Suppose someone claims to list every infinite binary sequence. Build a new sequence by going down the diagonal: take the first digit of the first sequence, the second digit of the second, and so on, and flip each digit. The new sequence differs from the first listed one in position 1, from the second in position 2, and so on, so it appears nowhere in the list. The list was incomplete, and no list can ever be complete. The real numbers are uncountable.

Naive set theory soon ran into trouble. Russell's paradox of 1901 asks about the set of all sets that do not contain themselves, which contradicts itself, forcing mathematicians to axiomatise set theory (ZFC).

Cantor also conjectured the continuum hypothesis, that no infinity lies between the whole numbers and the reals. Gödel in 1940 and Cohen in 1963 showed that this can be neither proved nor disproved from ZFC.`,
          },
          {
            id: L04,
            title: 'Gödel and the Limits of Proof',
            blurb: 'No consistent formal system captures all arithmetical truth.',
            minutes: 7,
            body: `At the start of the twentieth century David Hilbert proposed a programme: put all of mathematics on a formal footing of axioms and rules, and prove that this system is consistent and can prove every true statement. He also posed 23 problems in 1900 that steered a century of research.

In 1931 Kurt Gödel showed that the dream cannot be fully realised. His first incompleteness theorem says that any consistent formal system rich enough to express arithmetic contains true statements that it cannot prove. His method was to build a statement that, in effect, says of itself that it is unprovable in the system. If the system proves it, the system is inconsistent; if the system is consistent, it cannot prove it, and so the statement is true but unprovable.

This does not mean that mathematics is unreliable or that proofs can be doubted. Every proof in a given system remains valid. It means that no single formal system can capture all mathematical truth, and a stronger system can prove more but will always have its own blind spots.

Alan Turing's work on computation in 1936 echoed the same theme, proving that no algorithm can decide whether an arbitrary program halts. Together, the results of Gödel, Turing and Cohen revealed deep limits built into formal reasoning itself.`,
          },
        ],
      },
      {
        id: 'lab-mathematics.t2',
        title: 'Number Theory',
        blurb: 'The primes, how they are distributed and how analysis explains them.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L05,
            title: 'The Prime Number Theorem',
            blurb: 'Primes near x thin out like 1 divided by the natural logarithm of x.',
            minutes: 7,
            body: `Euclid proved that the primes never end, but how thickly do they appear? Counting primes up to x, written pi(x), shows a clear pattern. They become rarer, but slowly. Gauss and Legendre conjectured how they thin out, and in 1896 Hadamard and de la Vallee Poussin independently proved the prime number theorem: pi(x) is approximately x / ln x, where ln is the natural logarithm.

Put another way, the density of primes near a large number x is about 1 / ln x. Near e^10, which is about 22,026, roughly one number in ln(e^10) = 10 is prime. Near 1,000,000, where ln x is about 13.8, about one number in 14 is prime.

The approximation is good rather than exact. For x = 1,000,000 the formula gives 1,000,000 / 13.8155, about 72,382. The true count is 78,498, so the estimate is within about 8 percent, and the relative error shrinks as x grows.

The theorem reveals order inside what looks like randomness. Individual primes are hard to predict, but their overall density follows a smooth law. The proof relied on complex analysis and the zeta function that Riemann introduced in 1859, linking number theory to a seemingly unrelated area of mathematics.

Everyday example: modern encryption searches for huge primes by testing random numbers, and this theorem tells how many tries to expect.`,
          },
          {
            id: L06,
            title: 'Euler\'s Product and the Zeta Function',
            blurb: 'The zeta function encodes the primes, and the Riemann hypothesis remains open.',
            minutes: 8,
            body: `Euler discovered a bridge between addition and multiplication. Define the zeta function by the sum zeta(s) = 1 + 1/2^s + 1/3^s + 1/4^s + ... Euler showed that this equals a product over the primes: zeta(s) is the product, over every prime p, of 1 / (1 - p^(-s)).

The reason is that every whole number factors uniquely into primes. Expanding the product of geometric series, one for each prime, produces each term 1/n^s exactly once, because each n arises from exactly one combination of prime powers. So a statement about all integers becomes a statement about primes alone.

You can watch it work at s = 2. The prime 2 alone gives 1 / (1 - 1/4) = 4/3. Adding the prime 3 multiplies by 1 / (1 - 1/9) = 9/8, giving 4/3 x 9/8 = 3/2. Including more primes pushes the product up toward pi^2 / 6, which is about 1.645.

In 1859 Bernhard Riemann extended the zeta function to complex numbers and linked the counting of primes to its zeros. His Riemann hypothesis, which says that all the interesting zeros lie on a single line, remains the greatest open question in number theory.

It shows how a function from analysis can control the discrete world of the primes.`,
          },
        ],
      },
      {
        id: 'lab-mathematics.t3',
        title: 'Algebra and Geometry',
        blurb: 'Equations, their roots, and the shapes of space.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L07,
            title: 'Algebra and the Quadratic Formula',
            blurb: 'From Al-Khwarizmi\'s balancing method to a formula for every quadratic.',
            minutes: 7,
            body: `Around 820 the Persian mathematician Al-Khwarizmi wrote The Compendious Book on Calculation by Completion and Balancing. Its Arabic title contains the word al-jabr, the origin of the word algebra. He turned equation-solving into a systematic art. His Latinised name gave us the word algorithm.

The quadratic formula solves any equation ax^2 + bx + c = 0 where a is not zero: x = (-b plus or minus the square root of (b^2 - 4ac)) / 2a. The quantity under the square root, b^2 - 4ac, is the discriminant. If it is positive there are two real roots, if it is zero there is one repeated root, and if it is negative there are no real roots, only a pair of complex ones.

For x^2 - 5x + 6 = 0 we have a = 1, b = -5 and c = 6. The discriminant is 25 - 24 = 1, so x = (5 plus or minus 1) / 2, giving x = 3 or x = 2.

For x^2 + 2x + 5 = 0 the discriminant is 4 - 20 = -16. It is negative, so the parabola never crosses the x-axis and there are no real solutions.`,
          },
          {
            id: L08,
            title: 'Roots of Polynomials and Galois',
            blurb: 'Every polynomial has complex roots, but the quintic has no general formula.',
            minutes: 8,
            body: `The Fundamental Theorem of Algebra says that every non-constant polynomial with complex coefficients has exactly n complex roots, counted with multiplicity, where n is its degree. Equivalently, it factors completely: p(z) = a(z - z1)(z - z2)...(z - zn). Gauss gave a proof in 1799.

For example, (x - 1)^2 (x + 2)(x^2 + 1) has degree 5. Its roots are 1 (twice), -2, i and -i, five in all. Multiplicity matters: the root 1 is counted twice.

Existence of roots is not the same as a formula for them. The quadratic formula was known in antiquity and medieval times. In 1545 Cardano published general solutions to the cubic and quartic equations in Ars Magna. The natural next question was the quintic, an equation of degree five. In the 1820s Abel and Ruffini proved that no general formula using only arithmetic operations and roots exists for the quintic. Galois then showed why: the symmetries of the roots form a group, and the structure of that group determines whether the equation can be solved by radicals. This insight launched group theory and abstract algebra.

So the quintic still has five roots, as Gauss guarantees. We just cannot write them all down with a single radical formula.

The story shows mathematics changing its question from how to solve an equation to what structure makes solving possible.`,
          },
          {
            id: L09,
            title: 'Geometry: Parallel Lines and Polyhedra',
            blurb: 'From Euclid\'s fifth postulate to curved spaces and V - E + F = 2.',
            minutes: 8,
            body: `Euclid built plane geometry from five postulates. The fifth, the parallel postulate, is less obvious than the others, and for two thousand years mathematicians tried to prove it from the rest. In the 1820s and 1830s Gauss, Bolyai and Lobachevsky found that consistent geometries exist in which it fails. Parallel lines behave differently there. So the postulate cannot be proved from the other four, and geometry is not unique.

Gauss's Theorema Egregium of 1827 showed that the curvature of a surface is intrinsic, measurable by beings living on the surface without reference to the space around it. Riemann then generalised geometry to curved spaces of any dimension. This was the language Einstein later needed for general relativity.

A very different geometric fact belongs to topology. For any convex polyhedron, the number of vertices minus edges plus faces equals 2: V - E + F = 2. A cube has 8 vertices, 12 edges and 6 faces, and 8 - 12 + 6 = 2. A dodecahedron has 20 vertices and 12 faces, so its edges must satisfy 20 - E + 12 = 2, giving E = 30.

Euler's relation depends only on how the surface is connected, not on exact lengths or angles, which is the spirit of topology, the study of properties preserved under continuous deformation.`,
          },
        ],
      },
      {
        id: 'lab-mathematics.t4',
        title: 'Analysis and Modern Mathematics',
        blurb: 'Calculus made rigorous, infinite series, complex exponentials and the modern era.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L10,
            title: 'Calculus and Its Foundations',
            blurb: 'Derivatives, integrals, and the fundamental theorem that links them.',
            minutes: 8,
            body: `Calculus is the mathematics of continuous change. Newton and Leibniz forged it independently in the late seventeenth century. The derivative measures instantaneous rate of change. It is defined as a limit: f'(x) is the limit, as h approaches zero, of (f(x + h) - f(x)) / h. For f(x) = x^2 the quotient is ((x + h)^2 - x^2) / h = 2x + h, which approaches 2x.

The integral accumulates quantities, such as area under a curve. The fundamental theorem of calculus says the two are inverse operations: the definite integral of f from a to b equals F(b) - F(a), where F is any antiderivative of f. For f(x) = x^2, an antiderivative is x^3 / 3, so the integral from 0 to 3 is 27/3 - 0 = 9.

The early calculus leaned on infinitesimals, quantities smaller than any number yet not zero. In 1734 Bishop Berkeley's The Analyst attacked them as ghosts of departed quantities. The criticism was fair, and it stimulated nineteenth-century mathematicians to rebuild the subject on firm ground. Cauchy and Weierstrass replaced infinitesimals with the precise epsilon-delta definition of a limit.

Archimedes had anticipated integration with his method of exhaustion, but only calculus made these tools systematic. Everyday example: a car's speedometer shows a derivative of position, and the odometer is the integral of speed.`,
          },
          {
            id: L11,
            title: 'Infinite Series: Harmonic and Basel',
            blurb: 'Terms that shrink to zero can still add up to infinity.',
            minutes: 8,
            body: `An infinite series adds infinitely many terms. Does the total settle on a finite number? Analysis gives careful answers, and intuition can mislead. A first guess is that if the terms shrink to zero, the sum must be finite. The harmonic series 1 + 1/2 + 1/3 + 1/4 + ... shows that this is false.

The harmonic series diverges. Here is the classic grouping argument. The terms 1/3 + 1/4 are each at least 1/4, so together they exceed 1/2. The next four, 1/5 + 1/6 + 1/7 + 1/8, are each at least 1/8, so together they also exceed 1/2. The next eight exceed 1/2 again, and so on forever. Infinitely many blocks each worth at least 1/2 add up without bound.

Compare the series 1 + 1/4 + 1/9 + 1/16 + ... of reciprocal squares. Its terms shrink much faster, and the sum is finite. In 1735 Euler solved the Basel problem by finding its exact value: pi^2 / 6, about 1.645. It was a triumph of early analysis, since pi appears in a sum that contains no circles.

Euler's daring manipulations of infinite series later gave way to the careful foundations of Cauchy and Weierstrass, whose work even produced the Weierstrass function, continuous everywhere yet differentiable nowhere.

The lesson: decide convergence by rigorous argument, not by whether the terms look small.`,
          },
          {
            id: L12,
            title: 'Euler\'s Formula and Identity',
            blurb: 'The complex exponential links e, i and pi to sine and cosine.',
            minutes: 7,
            body: `Euler's formula says that e^(i theta) = cos(theta) + i sin(theta), where i is the imaginary unit, the square root of -1, and theta is an angle in radians. It connects the exponential function with trigonometry and is foundational to complex analysis and signal processing.

Geometrically, cos(theta) + i sin(theta) is a point on the unit circle in the complex plane, at angle theta from the positive real axis. As theta increases, e^(i theta) circles around at constant distance 1 from the origin. That is why complex exponentials describe rotations and waves so naturally.

Try some angles. At theta = pi/2 the formula gives cos(pi/2) + i sin(pi/2) = 0 + i x 1 = i. At theta = pi it gives cos(pi) + i sin(pi) = -1 + 0 = -1. So e^(i pi) = -1, which rearranges to Euler's identity: e^(i pi) + 1 = 0.

This single equation links five fundamental constants: e, i, pi, 1 and 0. It is often called the most beautiful equation in mathematics, not because it is a rare coincidence, but because it is a special case of a general structure.

Engineers use the same formula to describe alternating currents and radio waves as rotating points on that circle.`,
          },
          {
            id: L13,
            title: 'Modern Mathematics and Computer Proof',
            blurb: 'Landmark proofs from the twentieth century onward and a new role for computers.',
            minutes: 7,
            body: `After 1900 mathematics became more abstract, more interconnected and more collaborative. Hilbert's 23 problems of 1900 set an agenda. Emmy Noether transformed algebra with the theory of rings and ideals and, in physics, linked symmetries to conservation laws. Gödel's incompleteness theorems arrived in 1931 and Turing's theory of computation in 1936.

Then came a run of landmark proofs. In 1976 the four-colour theorem, which says that any map can be coloured with four colours so that neighbouring regions differ, was proved with the help of a computer that checked thousands of cases. In 1994 Andrew Wiles proved Fermat's Last Theorem, a problem posed centuries earlier. In 2003 Grigori Perelman proved the Poincare conjecture. Maryam Mirzakhani, working on the geometry of curved surfaces, became in 2014 the first woman to win the Fields Medal. Fermat's theorem and the conjecture needed deep links between number theory, geometry and physics that earlier mathematicians could not have imagined.

Computers now play two roles: as tools for calculation and as assistants in proof. A proof too large for a person to check by hand raises new questions about what it means to be certain, since we must trust the program as well as the argument. Interactive proof assistants such as Lean make every step machine-checkable.

Mathematics remains a living, growing subject, with each answer opening new questions.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'lab-mathematics',
    questions: [
      // L01
      mc(L01, 1, 1, 'What is a mathematical proof?',
        ['A large number of confirming examples', 'A chain of deductions from axioms and definitions that establishes a statement beyond doubt', 'An experiment repeated many times', 'A statement accepted without objection by every leading expert in the field after decades of scrutiny'], 1,
        'It is about deduction, not observation.',
        'A proof deduces a statement step by step from axioms, definitions and earlier results.'),
      mc(L01, 2, 1, 'Which ancient work set the template for axiomatic proof?',
        ['Euclid\'s Elements', 'Newton\'s Principia Mathematica of 1687', 'Cantor\'s papers founding set theory', 'Gödel\'s incompleteness theorems of 1931'], 0,
        'It dates from around 300 BCE.',
        'Euclid\'s Elements organised geometry deductively from a small set of postulates and became the model for proof.'),
      mc(L01, 3, 2, 'Which argument actually proves that the sum of any two even numbers is even?',
        ['Checking 2 + 4, 6 + 8 and 10 + 12', 'Writing them as 2a and 2b, so the sum is 2(a + b), which is even', 'Checking a million pairs of even numbers on a computer and finding no exception', 'Noting that most sums seem even'], 1,
        'The argument must cover every pair, not just samples.',
        'Writing the numbers as 2a and 2b shows the sum is 2(a + b), so it works for every pair at once.'),
      mc(L01, 4, 3, 'Why is checking a million examples not a proof that a statement is always true?',
        ['Because a million is too small a number to matter', 'Because a counterexample could still exist beyond those checked', 'Because computers make arithmetic mistakes', 'Because examples are always wrong'], 1,
        'What could happen with example number a million and one?',
        'Examples can only support a claim; a proof must exclude every possible counterexample.'),

      // L02
      mc(L02, 1, 1, 'What proof technique does Euclid use to show that the primes are infinite?',
        ['Proof by contradiction', 'Proof by exhaustive computer search', 'Proof by checking many examples', 'Proof by a single geometric diagram'], 0,
        'He assumes the opposite at the start.',
        'Euclid assumes there are finitely many primes and derives a contradiction.'),
      mc(L02, 2, 1, 'In Euclid\'s construction N = p1 x p2 x ... x pn + 1, what remainder does N leave when divided by any listed prime?',
        ['0, so every listed prime divides N', '1', 'The prime itself, which is left over as the remainder', 'It depends on the prime and cannot be stated in general'], 1,
        'The product part is divisible by every listed prime.',
        'The product is a multiple of each listed prime, so adding 1 leaves remainder 1.'),
      mc(L02, 3, 2, 'For the primes 2, 3 and 5, what is Euclid\'s number N?',
        ['10', '30', '31', '32'], 2,
        'Multiply the primes, then add 1.',
        '2 x 3 x 5 = 30, and 30 + 1 = 31.'),
      mc(L02, 4, 3, 'For the first six primes (2, 3, 5, 7, 11, 13) the number N = 30031 equals 59 x 509, so it is not prime. Does this break Euclid\'s proof?',
        ['Yes, because the proof claims that the number N built from the list must itself always be prime', 'No, N only needs a prime factor that is not on the list, and 59 and 509 are not', 'Yes, because 59 is on the list', 'No, because 30031 is even'], 1,
        'What does the proof actually need N to provide?',
        'The proof needs only that N has some prime factor outside the list, which 59 and 509 are.'),

      // L03
      mc(L03, 1, 1, 'What did Cantor\'s diagonal argument show?',
        ['The whole numbers are uncountable, since no list of them can ever be completed', 'The real numbers cannot be listed, so they form a strictly larger infinity', 'All infinite sets are the same size', 'Infinity does not exist'], 1,
        'Any claimed list can be shown to be incomplete.',
        'The diagonal construction produces a real number missing from any proposed list, so the reals are uncountable.'),
      mc(L03, 2, 1, 'Russell\'s paradox of 1901 exposed a flaw in',
        ['Euclidean geometry as set out in the Elements', 'Naive set theory', 'Calculus as developed by Newton and Leibniz', 'Number theory as developed by Gauss'], 1,
        'It concerns the set of all sets that do not contain themselves.',
        'It showed naive set theory was inconsistent, motivating axiomatic set theory such as ZFC.'),
      mc(L03, 3, 2, 'A list begins with the sequences 0110, 1010, 1111, 0001 (first four digits). Cantor\'s diagonal method flips the 1st digit of the first, the 2nd of the second, the 3rd of the third and the 4th of the fourth. What four digits does it produce?',
        ['0011', '0110', '1111', '1100'], 3,
        'Read off the diagonal digits, then flip each.',
        'The diagonal digits are 0, 0, 1, 1; flipping each gives 1, 1, 0, 0, so the new sequence starts 1100 and differs from every listed one.'),
      mc(L03, 4, 3, 'What does it mean that the continuum hypothesis is independent of ZFC?',
        ['It has been proved true', 'It has been proved false', 'It can be neither proved nor disproved from the ZFC axioms', 'It has not yet been stated precisely'], 2,
        'Think of Gödel in 1940 and Cohen in 1963.',
        'Gödel showed it cannot be disproved and Cohen showed it cannot be proved from ZFC, so the axioms do not decide it.'),

      // L04
      mc(L04, 1, 1, 'Gödel\'s first incompleteness theorem says that a consistent formal system rich enough for arithmetic',
        ['Can prove every true statement expressible in its own language', 'Contains true statements it cannot prove', 'Must be inconsistent', 'Cannot express addition'], 1,
        'The result is about unprovable truths.',
        'Any such system has true statements that it cannot prove.'),
      mc(L04, 2, 1, 'What was Hilbert\'s programme trying to achieve?',
        ['To disprove the geometry set out in Euclid\'s Elements by finding a contradiction in it', 'To put all of mathematics on a complete, consistent formal footing', 'To build the first programmable electronic computer in a university laboratory', 'To prove the Riemann hypothesis and settle every open question about the primes'], 1,
        'Think of formalism and completeness.',
        'Hilbert hoped to formalise all mathematics in a system proven consistent and complete; Gödel showed this cannot be fully achieved.'),
      mc(L04, 3, 2, 'A mathematician announces a consistent set of axioms for arithmetic that proves every true arithmetical statement. What does Gödel\'s theorem say about this claim?',
        ['It is possible if the axioms are numerous enough', 'It is impossible for a consistent system rich enough to express arithmetic', 'It is only possible in geometry', 'It is correct for finite systems only by accident'], 1,
        'Compare the claim with the theorem\'s conclusion.',
        'Gödel showed that no consistent, sufficiently rich system can prove all arithmetical truths.'),
      mc(L04, 4, 3, 'Which reading of Gödel\'s theorem is correct?',
        ['Ordinary proofs cannot be trusted', 'Mathematics is mostly false', 'Proofs within a system remain valid, but no single system captures all mathematical truth', 'Mathematical statements cannot be true or false'], 2,
        'The theorem limits systems, not individual correct proofs.',
        'Gödel did not undermine valid proofs; he showed that every sufficiently strong consistent system is incomplete.'),

      // L05
      mc(L05, 1, 1, 'The prime number theorem states that the number of primes up to x, pi(x), is approximately',
        ['x squared divided by two', 'x / ln x', 'ln x multiplied by x squared', 'x / 2, so half of all numbers are prime'], 1,
        'The approximation involves the natural logarithm.',
        'pi(x) is asymptotic to x / ln x.'),
      mc(L05, 2, 1, 'Who proved the prime number theorem, and when?',
        ['Hadamard and de la Vallee Poussin, 1896', 'Euclid, around 300 BCE, in Book IX of the Elements', 'Wiles, 1994', 'Cantor, 1891'], 0,
        'It came after Riemann\'s zeta function work.',
        'Hadamard and de la Vallee Poussin independently proved it in 1896.'),
      mc(L05, 3, 2, 'Near the number e^10 (about 22,026), roughly what fraction of numbers are prime, using the density 1 / ln x?',
        ['1 in 5', '1 in 10', '1 in 100', '1 in 22,026'], 1,
        'What is ln of e^10?',
        'ln(e^10) = 10, so about one number in 10 near that size is prime.'),
      mc(L05, 4, 3, 'The primes thin out, with density 1 / ln x tending to zero. How does this fit with there being infinitely many primes?',
        ['It contradicts Euclid\'s theorem, so one of the two statements must be mistaken', 'The density falls slowly enough that x / ln x still grows without bound', 'Primes stop at some very large number, after which every integer is composite', 'Density has no relation to counting, so it says nothing about how many primes exist'], 1,
        'Does x / ln x stay bounded?',
        'Because x / ln x grows without bound as x increases, the count of primes keeps rising even as their density falls.'),

      // L06
      mc(L06, 1, 1, 'Euler\'s product formula expresses the zeta function as',
        ['A sum of squares', 'An infinite product over the prime numbers', 'An integral of a polynomial taken over the positive real line', 'A finite sum of logarithms'], 1,
        'It links the integers to the primes.',
        'zeta(s) equals the product over all primes p of 1 / (1 - p^(-s)).'),
      mc(L06, 2, 1, 'Riemann\'s 1859 paper On the Number of Primes connected the distribution of primes to',
        ['The zeros of the zeta function', 'The Pythagorean theorem', 'Cantor\'s diagonal argument', 'Euclidean parallels'], 0,
        'It uses the zeta function extended to complex numbers.',
        'Riemann linked prime counting to the zeros of the zeta function, leading to the Riemann hypothesis.'),
      mc(L06, 3, 2, 'At s = 2, what is the product of the Euler factors 1 / (1 - p^(-2)) for the primes 2 and 3 only?',
        ['1.25', '2.0', '1.75', '1.5'], 3,
        'Compute 4/3 times 9/8.',
        '(4/3) x (9/8) = 36/24 = 3/2 = 1.5.'),
      mc(L06, 4, 3, 'Which fact about the integers is the key reason the Euler product equals the sum for zeta(s)?',
        ['Every integer is even or odd', 'Every integer factors uniquely into primes', 'There are infinitely many integers', 'Every integer is a perfect square'], 1,
        'Expand the product and ask where each term 1/n^s comes from.',
        'Unique prime factorisation means each n appears exactly once when the product of geometric series is expanded.'),

      // L07
      mc(L07, 1, 1, 'The word algebra comes from',
        ['Euclid\'s Elements, in which geometry was first set out as a deductive system', 'The title of Al-Khwarizmi\'s book containing al-jabr', 'The title of Cardano\'s Ars Magna, which printed the cubic formula', 'Descartes\' La Geometrie, which joined algebra to geometry'], 1,
        'A Persian mathematician around 820.',
        'The Arabic title of Al-Khwarizmi\'s book contains al-jabr, which gave algebra its name.'),
      mc(L07, 2, 1, 'In the quadratic formula, the expression b^2 - 4ac is called the',
        ['Numerator', 'Discriminant', 'Hypotenuse', 'Remainder'], 1,
        'Its sign tells you how many real roots exist.',
        'The discriminant b^2 - 4ac determines whether the roots are two real, one repeated or complex.'),
      mc(L07, 3, 2, 'What are the solutions of x^2 - 5x + 6 = 0?',
        ['x = 1 and x = 6', 'x = -2 and x = -3', 'x = 2 and x = 3', 'x = 5 and x = 6'], 2,
        'The discriminant is 25 - 24 = 1.',
        'x = (5 plus or minus 1) / 2, which is 3 or 2.'),
      mc(L07, 4, 3, 'The equation x^2 + 2x + 5 = 0 has discriminant -16. What does that imply?',
        ['Two distinct real roots, where the parabola crosses the x-axis twice', 'One repeated real root', 'No real roots; the parabola never crosses the x-axis', 'Infinitely many roots'], 2,
        'Can you take the real square root of a negative number?',
        'A negative discriminant means no real roots, so the graph does not meet the x-axis, and the roots are complex.'),

      // L08
      mc(L08, 1, 1, 'The fundamental theorem of algebra says a polynomial of degree n has',
        ['At most n real roots, and sometimes none at all, whatever the degree', 'Exactly n complex roots, counted with multiplicity', 'Exactly n real roots, each of which can be found by a formula', 'At least n + 1 roots, counted with multiplicity in the complex plane'], 1,
        'Complex numbers and multiplicity both matter.',
        'Every non-constant complex polynomial of degree n has exactly n complex roots counted with multiplicity.'),
      mc(L08, 2, 1, 'What did Abel and Ruffini prove in the 1820s?',
        ['There is no general formula in radicals for the quintic', 'The quintic has no roots', 'Every cubic is unsolvable', 'The quadratic formula fails for equations whose roots are complex numbers'], 0,
        'It concerns degree five.',
        'They proved that the general quintic cannot be solved by radicals.'),
      mc(L08, 3, 2, 'How many complex roots, counted with multiplicity, does (x - 1)^2 (x + 2)(x^2 + 1) have?',
        ['3', '4', '5', '6'], 2,
        'Find the degree of the polynomial.',
        'The degree is 2 + 1 + 2 = 5, so there are five roots: 1, 1, -2, i and -i.'),
      mc(L08, 4, 3, 'Does the Abel-Ruffini theorem mean that a quintic has no roots?',
        ['Yes, quintics have no solutions at all', 'No, a quintic still has five complex roots; there is just no general radical formula for them', 'Yes, only quartics have roots', 'No, because every quintic has exactly one root'], 1,
        'Combine it with the fundamental theorem of algebra.',
        'The fundamental theorem guarantees five complex roots; the Abel-Ruffini theorem only rules out a general formula using radicals.'),

      // L09
      mc(L09, 1, 1, 'Which Euclidean postulate resisted proof for about two thousand years?',
        ['The first postulate', 'The parallel postulate', 'The third postulate', 'The Pythagorean theorem'], 1,
        'It concerns lines that never meet.',
        'The fifth (parallel) postulate was long thought provable from the others until non-Euclidean geometries were found.'),
      mc(L09, 2, 1, 'What did Riemann contribute to geometry?',
        ['He generalised geometry to curved spaces of any dimension', 'He proved the parallel postulate', 'He invented the Cartesian plane', 'He measured the Earth'], 0,
        'Einstein needed his language for general relativity.',
        'Riemann\'s generalisation provided the mathematical language of general relativity.'),
      mc(L09, 3, 2, 'A dodecahedron has 20 vertices and 12 faces. Using V - E + F = 2, how many edges does it have?',
        ['20', '30', '34', '60'], 1,
        'Solve 20 - E + 12 = 2.',
        '32 - E = 2, so E = 30.'),
      mc(L09, 4, 3, 'What did the discovery of non-Euclidean geometries by Gauss, Bolyai and Lobachevsky show?',
        ['Euclid made a mistake in the Elements', 'Consistent geometries exist where the parallel postulate fails, so it cannot be proved from the other postulates', 'Geometry is only about triangles', 'Parallel lines do not exist in any space'], 1,
        'Consider what independence of an axiom means.',
        'Because a consistent geometry can deny the parallel postulate, that postulate is independent of the other four.'),

      // L10
      mc(L10, 1, 1, 'The derivative of a function at a point measures',
        ['The area under the curve', 'The instantaneous rate of change', 'The average value over an interval', 'The largest value of the function'], 1,
        'It is defined as a limit of difference quotients.',
        'The derivative is the limit of the average rate of change as the interval shrinks to zero.'),
      mc(L10, 2, 1, 'The fundamental theorem of calculus states that',
        ['Integration and differentiation are inverse operations', 'All continuous functions have derivatives at every point of their domain', 'Integrals are always positive, whatever the sign of the function integrated', 'Limits do not exist for any function that is not a polynomial'], 0,
        'The definite integral is computed with an antiderivative.',
        'The definite integral of f from a to b equals F(b) - F(a), linking integration to differentiation.'),
      mc(L10, 3, 2, 'What is the definite integral of x^2 from 0 to 3?',
        ['3', '6', '27', '9'], 3,
        'An antiderivative of x^2 is x^3 / 3.',
        '3^3 / 3 - 0 = 27 / 3 = 9.'),
      mc(L10, 4, 3, 'Why did Berkeley attack early calculus in The Analyst (1734)?',
        ['It gave wrong answers in every case', 'It relied on infinitesimals that were treated as both zero and non-zero, lacking rigorous foundation', 'It used too many symbols', 'It ignored geometry'], 1,
        'He called them ghosts of departed quantities.',
        'Berkeley criticised the logical looseness of infinitesimals, a challenge answered by Cauchy and Weierstrass with limits.'),

      // L11
      mc(L11, 1, 1, 'What is true about the harmonic series 1 + 1/2 + 1/3 + 1/4 + ...?',
        ['It converges to 2', 'It converges to pi^2 / 6', 'It diverges to infinity', 'It oscillates between two values'], 2,
        'Its terms shrink, but think about the grouping argument.',
        'The harmonic series grows without bound even though its terms tend to zero.'),
      mc(L11, 2, 1, 'The sum of the reciprocals of the squares, 1 + 1/4 + 1/9 + ..., equals',
        ['pi^2 / 6', 'pi / 2', 'infinity', 'e'], 0,
        'Euler solved the Basel problem in 1735.',
        'Euler showed the sum is pi^2 / 6, about 1.645.'),
      mc(L11, 3, 2, 'In the grouping proof of divergence, the four terms 1/5 + 1/6 + 1/7 + 1/8 add up to',
        ['Less than 1/4', 'Exactly 1/2', 'More than 1/2', 'Exactly 1'], 2,
        'Each term is at least 1/8.',
        'Each of the four terms is at least 1/8, so the sum is more than 4 x 1/8 = 1/2.'),
      mc(L11, 4, 3, 'Both 1/n and 1/n^2 have terms that tend to zero, yet only one series converges. What explains the difference?',
        ['Squares are always smaller than ordinary numbers, so any series made up of squares has to add to a finite total', 'The terms 1/n^2 shrink fast enough for the total to stay finite, while 1/n shrinks too slowly', 'The harmonic series contains negative terms that cancel the positive ones only after the first thousand terms', 'There is no difference, since both series have terms that tend to zero and so both of them must converge'], 1,
        'Terms tending to zero is necessary but not sufficient.',
        'Convergence depends on how quickly the terms fall: 1/n^2 falls fast enough to sum to a finite value, while 1/n does not.'),

      // L12
      mc(L12, 1, 1, 'Which five constants appear in Euler\'s identity e^(i pi) + 1 = 0?',
        ['e, i, pi, 1 and 0', 'e, pi, 2, 3 and 0', 'i, pi, 1, 2 and 10', 'e, phi, i, 1 and 0'], 0,
        'Read them off the equation.',
        'The identity links e, i, pi, 1 and 0.'),
      mc(L12, 2, 1, 'Euler\'s formula e^(i theta) = cos theta + i sin theta connects the exponential function to',
        ['Logarithms', 'Trigonometry', 'Primes', 'Factorials'], 1,
        'Look at the right-hand side.',
        'It expresses a complex exponential in terms of cosine and sine.'),
      mc(L12, 3, 2, 'Using Euler\'s formula, what is e^(i pi / 2)?',
        ['1 + i', '-1', '-i', 'i'], 3,
        'cos(pi/2) = 0 and sin(pi/2) = 1.',
        'e^(i pi/2) = cos(pi/2) + i sin(pi/2) = 0 + i = i.'),
      mc(L12, 4, 3, 'As theta varies over real numbers, where do the points e^(i theta) lie in the complex plane?',
        ['On a straight line', 'On the unit circle', 'On a parabola', 'Only on the real axis'], 1,
        'Each point is (cos theta, sin theta).',
        'The point (cos theta, sin theta) always has distance 1 from the origin, so it lies on the unit circle.'),

      // L13
      mc(L13, 1, 1, 'Which major theorem was the first whose proof required a computer to check thousands of cases?',
        ['The four-colour theorem', 'Fermat\'s Last Theorem', 'The prime number theorem', 'The Basel problem'], 0,
        'It was proved in 1976.',
        'The four-colour theorem (1976) was the first major result depending on computer verification.'),
      mc(L13, 2, 1, 'Who proved Fermat\'s Last Theorem, and when?',
        ['Euler, around 1748', 'Gödel, around 1931', 'Wiles, 1994', 'Perelman, around 2003'], 2,
        'A British mathematician in the 1990s.',
        'Andrew Wiles proved Fermat\'s Last Theorem in 1994.'),
      mc(L13, 3, 2, 'Which of these events happened between Gödel\'s incompleteness theorems (1931) and the four-colour proof (1976)?',
        ['Hilbert\'s 23 problems', 'Cantor founding set theory with his work on transfinite numbers', 'Turing\'s definition of computation (1936)', 'Wiles proving Fermat\'s Last Theorem'], 2,
        'Check the dates.',
        'Turing\'s 1936 paper falls between 1931 and 1976; Hilbert\'s problems and Cantor came earlier, Wiles later.'),
      mc(L13, 4, 3, 'What new question do very large computer-assisted proofs raise?',
        ['Whether mathematics can use numbers', 'Whether we can be certain of a result when no human can check every step and we must trust the software too', 'Whether theorems are no longer true', 'Whether proofs are needed at all'], 1,
        'Think about who or what verifies the argument.',
        'When a proof is too large to check by hand, certainty also depends on the correctness of the program, prompting work on formal, machine-checkable proof.'),
    ],
  },
};
