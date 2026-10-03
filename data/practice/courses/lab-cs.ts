import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

// Rotate the choices (keeping their cyclic order) so the correct answer lands on a spread-out index.
const mc = (l: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], answer: number, hint: string, explanation: string): Question => {
  const target = (parseInt(l.slice(l.lastIndexOf('.l') + 2), 10) * 3 + n * 5) % 4;
  const shift = (target - answer + 4) % 4;
  const rotated = choices.map((_, i) => choices[(i - shift + 4) % 4]);
  return { id: `${l}.q${n}`, lessonId: l, kind: 'mcq', prompt, choices: rotated, answer: target, hint, explanation, level };
};
const tf = (l: string, n: number, level: 1 | 2 | 3, prompt: string, answer: number, hint: string, explanation: string): Question =>
  ({ id: `${l}.q${n}`, lessonId: l, kind: 'tf', prompt, answer, hint, explanation, level });

const L01 = 'lab-cs.l01';
const L02 = 'lab-cs.l02';
const L03 = 'lab-cs.l03';
const L04 = 'lab-cs.l04';
const L05 = 'lab-cs.l05';
const L06 = 'lab-cs.l06';
const L07 = 'lab-cs.l07';
const L08 = 'lab-cs.l08';
const L09 = 'lab-cs.l09';
const L10 = 'lab-cs.l10';
const L11 = 'lab-cs.l11';
const L12 = 'lab-cs.l12';
const L13 = 'lab-cs.l13';

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'lab-cs',
    label: 'Computer Science',
    blurb: 'From algorithms and Turing machines to complexity, information, cryptography and machine learning.',
    accent: '#748FFC',
    framework: 'csta',
    tracks: [
      {
        id: 'lab-cs.t1',
        title: 'What Is Computation?',
        blurb: 'Algorithms, Turing machines, their limits and the architecture of real computers.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: L01,
            title: 'Algorithms',
            blurb: 'A finite, unambiguous recipe that always terminates with the right answer.',
            minutes: 6,
            body: `An algorithm is a finite, unambiguous sequence of steps that solves a class of problems. Two words carry the weight. Unambiguous means each step is precise enough for a machine, or a careful person, to carry out without guessing. Finite means the procedure must end for every valid input and deliver the correct answer.

The oldest non-trivial algorithm still in daily use is Euclid's method for the greatest common divisor, from around 300 BC. To find the GCD of 48 and 18, divide 48 by 18 and keep the remainder, 12. Then divide 18 by 12, remainder 6. Then divide 12 by 6, remainder 0. The last non-zero remainder, 6, is the answer.

The word itself comes from the name of the mathematician Al-Khwarizmi. Later, Donald Knuth showed how to analyse algorithms rigorously, by counting the steps they take as the input grows. That lets us compare methods independently of any particular hardware.

Landmark algorithms such as Euclid's GCD, quicksort and Dijkstra's shortest path show how clever ordering of steps can turn an impractical brute-force search into something fast enough for a phone map to use. Choosing the right algorithm often matters more than buying a faster machine.`,
          },
          {
            id: L02,
            title: 'The Turing Machine',
            blurb: 'A tape, a head and a rule table define what it means to compute.',
            minutes: 7,
            body: `In 1936 Alan Turing described an abstract machine so simple it seems almost useless. It has an unbounded tape of cells holding symbols, a head that reads and writes one cell at a time and moves left or right, and a finite table of rules that says, for each state and symbol, what to write, which way to move and which state to enter next.

Despite this minimalism, the Turing machine captures everything we mean by effective computation. Alonzo Church independently defined computation with the lambda calculus, and other formal models appeared too. All were shown to define the same class of computable functions. The Church-Turing thesis says that anything a human could compute by rote, a Turing machine can compute.

A tiny example: a machine that starts at the left end of a binary string, flips each 0 to 1 and each 1 to 0, moves right, and halts at the first blank cell. Given 1011 it leaves 0100 on the tape.

The machine matters because it is a yardstick. If something cannot be done by a Turing machine, no ordinary computer can do it either, however fast. Turing used this model to prove that some problems have no algorithmic solution at all.`,
          },
          {
            id: L03,
            title: 'The Halting Problem',
            blurb: 'Some questions about programs can never be answered by any algorithm.',
            minutes: 7,
            body: `Can we write a program that looks at any other program and its input and says whether it will eventually halt or run forever? Such a checker would be extremely useful for finding infinite loops. In 1936 Turing proved that no such general program can exist. The halting problem is undecidable.

The proof is an argument by contradiction. Suppose a perfect halting-decider existed. Build a new program that runs the decider on itself and then does the opposite: if the decider says it halts, loop forever; if the decider says it loops, halt immediately. Asking what this program does produces a contradiction, so the decider cannot exist.

Notice what the result does not say. It does not say that every program is impossible to analyse. A program with no loops obviously halts, and many specific programs can be proven to halt or loop. What is impossible is a single method that gives the right answer for every program and input.

Church reached a related conclusion, showing the Entscheidungsproblem undecidable. Together these results established that computation has hard limits, discovered before any electronic computer was built.

Everyday consequence: no tool can promise to find all infinite loops in all software.`,
          },
          {
            id: L04,
            title: 'The Stored-Program Computer',
            blurb: 'Code and data share one memory under the fetch-decode-execute cycle.',
            minutes: 6,
            body: `Early electronic machines such as ENIAC were rewired by hand for each new task. John von Neumann's 1945 First Draft of a Report on the EDVAC described a better idea: store the program in the same addressable memory as the data it works on. Instructions become just numbers in memory.

The processor then repeats a simple cycle forever. It fetches the next instruction from memory, decodes it to see what it asks for, and executes it, perhaps reading or writing data, before moving on to the next instruction. That fetch-decode-execute cycle is still how processors work today.

Putting code and data in one memory has a profound consequence. Because a program is just data, one program can read, create or modify another. A compiler is a program whose output is another program. Grace Hopper built the first compiler in 1952, translating symbolic code into machine code, which opened the way for high-level languages.

Claude Shannon contributed the other basic ingredient of this era. His 1948 theory gave the field its unit of information, the bit, and showed that switching circuits implement Boolean logic.

Everyday example: when you install an app, your computer copies the program into memory as data and then runs it.`,
          },
        ],
      },
      {
        id: 'lab-cs.t2',
        title: 'Algorithms and Complexity',
        blurb: 'How cost grows with input size, and which problems appear to be intrinsically hard.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L05,
            title: 'Big-O Growth',
            blurb: 'Describe how running time scales with input size, ignoring constants.',
            minutes: 7,
            body: `To compare algorithms without depending on any specific computer, computer scientists ask how the number of steps grows as the input size n increases. Big-O notation gives an upper bound on that growth. Formally, f(n) is O(g(n)) if f(n) is at most a constant times g(n) for all n beyond some threshold.

In practice this means ignoring constant factors and lower-order terms. An algorithm that takes 3n^2 + 5n + 2 steps is O(n^2), because for large n the n^2 term dominates everything else.

Common growth rates, from gentle to severe, are constant, logarithmic, linear, n log n, quadratic and exponential. The differences are dramatic. If an O(n^2) algorithm handles 1,000 items in a second, doubling the input to 2,000 items takes about four seconds, because (2n)^2 is 4n^2. An O(n) method would only double.

Constants still matter at small sizes. Suppose algorithm A takes 100n steps and algorithm B takes n^2 steps. At n = 50, B needs 2,500 steps and A needs 5,000, so B wins. They are equal at n = 100, and beyond that A is faster and keeps getting relatively faster as n grows.

Big-O is the shared language for talking about algorithm cost, popularised by Knuth's analysis of algorithms.`,
          },
          {
            id: L06,
            title: 'Recursion and Divide-and-Conquer',
            blurb: 'Solve a problem by solving smaller copies of it, with a base case to stop.',
            minutes: 7,
            body: `Recursion defines a solution in terms of smaller instances of the same problem. Every recursive method needs at least one base case, a tiny instance answered directly, so that the descent eventually stops. Without a base case a recursive function calls itself forever, until the system runs out of memory for the call stack.

Recursion is the natural way to express divide-and-conquer algorithms such as mergesort and quicksort. Split the problem into pieces, solve each piece recursively, and combine the results. It also mirrors mathematical induction, where a base case plus a step from smaller to larger proves a claim for all sizes.

The running time of such algorithms is described by a recurrence: T(n) = a x T(n/b) + f(n), where a is the number of subproblems, b is the factor by which the size shrinks and f(n) is the cost of dividing and combining. The Master Theorem solves these by comparing f(n) with n raised to log base b of a. Mergesort has a = 2, b = 2 and f(n) proportional to n, giving O(n log n).

Halving also gives logarithmic behaviour: starting at 1,024 items and halving until one remains takes 10 steps, since 2 to the 10th is 1,024.

Church's lambda calculus showed that recursion alone is enough to express every computable function.`,
          },
          {
            id: L07,
            title: 'The Cost of Sorting',
            blurb: 'Any comparison sort needs on the order of n log n comparisons.',
            minutes: 7,
            body: `Sorting is one of the most studied problems in computing, and we can prove a limit on how fast any comparison-based method can be. A comparison sort learns about the data only by asking whether one item is smaller than another. The decision-tree argument shows such an algorithm needs at least on the order of n log n comparisons in the worst case.

Here is the idea. Every comparison has two outcomes, so after k comparisons the algorithm can distinguish at most 2^k situations. But the correct output depends on which of the n! possible orderings of the input actually occurred, and the algorithm must be able to produce the right answer for each. So we need 2^k to be at least n!, which means k is at least log2(n!). That quantity grows like n log n.

Small cases show this. Three items have 6 possible orderings. Two comparisons give at most 4 outcomes, which is not enough, but three comparisons give 8, which suffices. So sorting three items needs 3 comparisons in the worst case.

Mergesort achieves O(n log n), so it is asymptotically as good as any comparison sort can be. This is a rare, satisfying result: an algorithm matched by a proof that nothing in its class can do better.`,
          },
          {
            id: L08,
            title: 'P versus NP',
            blurb: 'Fast to check does not obviously mean fast to solve.',
            minutes: 8,
            body: `Complexity theory sorts problems by the resources, mainly time, that any algorithm must use. The class P contains problems that can be solved in polynomial time. The class NP contains problems whose proposed solutions can be checked in polynomial time. Every problem in P is also in NP, because if you can solve a problem quickly you can certainly check an answer quickly.

The great open question is whether P equals NP: can every problem whose solution is quickly checkable also be quickly solved? Many problems, such as a large Sudoku or scheduling puzzle, look easy to verify and hard to solve, but nobody has proven they are genuinely hard. The question is one of the seven Clay Millennium Prize Problems.

In 1971 Stephen Cook proved that Boolean satisfiability, SAT, is NP-complete, meaning every problem in NP can be translated into SAT efficiently. A fast algorithm for SAT would therefore make every NP problem fast. In 1972 Richard Karp showed 21 classic problems are NP-complete too, revealing how common intractability is.

Most researchers suspect P is not equal to NP, but the proof remains unknown.

Everyday example: finding a schedule that satisfies hundreds of constraints may be very slow, yet checking a proposed schedule against the constraints is quick.`,
          },
        ],
      },
      {
        id: 'lab-cs.t3',
        title: 'Information and Systems',
        blurb: 'Measuring information, keeping secrets and understanding the limits of hardware.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: L09,
            title: 'Information, Entropy and Error Codes',
            blurb: 'Shannon defined the bit; Hamming distance measures how far apart codewords are.',
            minutes: 8,
            body: `Claude Shannon's 1948 paper A Mathematical Theory of Communication made information measurable. The unit is the bit. The entropy of a source is H = minus the sum of p_i x log2(p_i), summed over its possible symbols. It is the average information per symbol, and also the theoretical lower bound for lossless compression.

A fair coin has two equally likely outcomes, so its entropy is 1 bit per flip. A coin that lands heads 99 percent of the time is far more predictable, so its entropy is much lower, and its output can be compressed more heavily. Predictable data carries less information.

Real channels are noisy, so messages need error-detecting and error-correcting codes. The Hamming distance between two equal-length words is the number of positions where they differ. For 10110 and 11100 the words differ at positions 2 and 4, so the distance is 2. If every pair of valid codewords is far apart, a few flipped bits still leave the received word closest to the correct codeword, so errors can be detected or corrected.

The Shannon-Hartley formula then caps the error-free data rate of a channel at C = B x log2(1 + S/N).

Together these ideas underlie compression, storage and every network link.`,
          },
          {
            id: L10,
            title: 'Cryptography and Public Keys',
            blurb: 'Security rests on problems that are easy to do and hard to undo.',
            minutes: 7,
            body: `Modern cryptography is built on computational hardness. A scheme is secure not because its method is secret, but because breaking it would require solving a problem for which no efficient algorithm is known, such as factoring a very large integer or computing a discrete logarithm.

For centuries, secret communication required the two parties to share a secret key first, which meant meeting in person or trusting a courier. In 1976 Whitfield Diffie and Martin Hellman published New Directions in Cryptography, introducing public-key ideas. Their key-exchange method lets two parties who have never met agree on a shared secret over an open channel, even if an eavesdropper hears everything they say.

In 1978 Rivest, Shamir and Adleman published RSA, the first practical public-key cryptosystem, based on the difficulty of integer factorisation. Multiplying two huge primes is easy, but recovering them from the product is believed to be infeasible.

Claude Shannon had earlier placed cryptography on an information-theoretic footing in 1949 and defined perfect secrecy.

These ideas underpin TLS, the padlock in your browser. When you connect to a shop, public-key methods establish the shared key that then protects your traffic, even though no secret was ever exchanged beforehand.`,
          },
          {
            id: L11,
            title: 'Parallelism and Moore\'s Law',
            blurb: 'Hardware scaled exponentially, but serial work limits parallel speed-up.',
            minutes: 7,
            body: `For decades, computers improved on a steady schedule. Moore's observation, from 1965, is that the number of transistors on a chip roughly doubles every two years: N(t) = N0 x 2^(t/2). Over 10 years that is 2^5 = 32 times as many transistors. This empirical trend drove exponential gains in computing power.

When single processors stopped getting faster at the same pace, designers added more cores. But extra processors cannot speed up work that must happen in sequence. Amdahl's law (1967) quantifies this. If a fraction p of a task can be parallelised across n processors, the overall speed-up is S = 1 / ((1 - p) + p/n).

Suppose 80 percent of a job can be parallelised and you use 4 processors. Then S = 1 / (0.2 + 0.8/4) = 1 / 0.4 = 2.5. Four processors give only 2.5 times the speed, not 4.

The serial fraction (1 - p) sets a hard ceiling. Even with unlimited processors, the term p/n shrinks to zero, leaving S = 1 / (1 - p). If 90 percent is parallel, the maximum possible speed-up is 10, no matter how many cores you add.

This is why software design for parallelism matters as much as buying hardware.`,
          },
        ],
      },
      {
        id: 'lab-cs.t4',
        title: 'Learning Machines',
        blurb: 'How models learn from data: gradient descent, neural networks and attention.',
        level: 'ADVANCED',
        lessons: [
          {
            id: L12,
            title: 'Machine Learning and Gradient Descent',
            blurb: 'Models infer their parameters by minimising a loss on data.',
            minutes: 8,
            body: `Machine learning replaces hand-written rules with models that learn their own parameters from data. The model makes predictions, a loss function measures how wrong they are, and an optimisation procedure adjusts the parameters to reduce the loss. For classification, the standard loss is cross-entropy, which compares the predicted probability for each class with the true label.

The workhorse optimiser is gradient descent. The gradient of the loss points in the direction of steepest increase, so we move the parameters a small step the opposite way: theta_new = theta - eta x gradient, where eta is the learning rate. If a parameter is 5, the learning rate is 0.1 and the gradient is 4, the new value is 5 - 0.1 x 4 = 4.6.

The learning rate matters. Too small and training crawls; too large and the steps overshoot the minimum, bouncing back and forth or even diverging.

The central tension of machine learning is generalisation. A model must fit its training data and also work on examples it has never seen. A model that memorises the training set can score perfectly there yet fail on new data, which is why practitioners hold out validation data and use regularisation.

Arthur Samuel coined the term machine learning in 1959 with a checkers program that improved by playing itself.`,
          },
          {
            id: L13,
            title: 'Neural Networks and Attention',
            blurb: 'Stacked nonlinear layers, softmax outputs and the Transformer.',
            minutes: 8,
            body: `A neural network stacks layers of simple units. Each unit takes a weighted sum of its inputs and passes it through a nonlinear activation function. The sigmoid, 1 / (1 + e^-z), squashes any value into the range between 0 and 1. The ReLU, max(0, z), passes positive values unchanged and sets negatives to zero, and it dominates deep networks because it helps avoid vanishing gradients.

The nonlinearity is essential. Without it, stacking layers would collapse into a single linear function, however many layers you used. With it, a large enough network can approximate any continuous function, according to the universal approximation theorem.

The output layer of a classifier often uses softmax, which turns raw scores into probabilities: each score is exponentiated and divided by the sum of all the exponentials. If four scores are equal, each class gets probability 0.25.

Training uses backpropagation, which applies the chain rule to send the loss gradient backward through every layer so gradient descent can update all the weights. Hinton, Rumelhart and Williams popularised this in 1986.

In 2012 AlexNet, a deep convolutional network trained on GPUs, won the ImageNet challenge by a wide margin and launched the deep-learning era. In 2017 the Transformer, built on attention, enabled today's large language models.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'lab-cs',
    questions: [
      // L01
      mc(L01, 1, 1, 'Which pair of properties is essential for an algorithm?',
        ['Fast and written in code', 'Finite and unambiguous', 'Recursive and parallel', 'Short and elegant'], 1,
        'The definition needs it to end and to be precise.',
        'An algorithm is a finite, unambiguous sequence of steps that terminates with the correct answer.'),
      mc(L01, 2, 1, 'What does Euclid\'s algorithm compute?',
        ['The largest prime number lying below a given number', 'The greatest common divisor of two numbers', 'The square root of a number', 'The sum of divisors'], 1,
        'It uses repeated remainders.',
        'Euclid\'s method, from around 300 BC, finds the greatest common divisor using repeated division with remainder.'),
      mc(L01, 3, 2, 'Using Euclid\'s algorithm, what is the GCD of 48 and 18?',
        ['3', '9', '12', '6'], 3,
        '48 mod 18, then 18 mod that remainder, and so on.',
        '48 mod 18 = 12; 18 mod 12 = 6; 12 mod 6 = 0, so the GCD is 6.'),
      mc(L01, 4, 3, 'A procedure is precise at every step but, for some valid inputs, never stops. Is it an algorithm in the usual sense?',
        ['Yes, because being precise at every single step is all that is required', 'No, it must terminate on every valid input with the right answer', 'Yes, if it is written in a modern language', 'Only if it runs on a fast computer'], 1,
        'Recall the word finite.',
        'An algorithm must be finite, so a procedure that fails to halt on valid inputs does not qualify.'),

      // L02
      mc(L02, 1, 1, 'Which set of components defines a Turing machine?',
        ['A tape, a read/write head and a finite rule table', 'A central processor, main memory and a disk drive', 'A call stack, a heap and a full compiler toolchain', 'A keyboard, a monitor, a mouse and a printer attached'], 0,
        'Think abstract, not hardware.',
        'A Turing machine has an unbounded tape, a head that reads and writes symbols, and a finite table of rules.'),
      mc(L02, 2, 1, 'The Church-Turing thesis says that',
        ['Every function is computable', 'Anything effectively computable by rote can be computed by a Turing machine', 'Computers are faster than humans', 'Turing machines need infinite time'], 1,
        'Several different formal models turned out to be equivalent.',
        'Lambda calculus, recursive functions and Turing machines define the same class of computable functions, matching the intuitive notion of effective computation.'),
      mc(L02, 3, 2, 'A machine starts at the left end of the tape 1011, flips each bit (0 to 1, 1 to 0), moving right until it reaches a blank. What is on the tape when it halts?',
        ['1011', '0100', '1100', '0010'], 1,
        'Flip every symbol independently.',
        'Flipping 1,0,1,1 gives 0,1,0,0, so the tape reads 0100.'),
      mc(L02, 4, 3, 'Why is the Turing machine\'s extreme simplicity not a limitation as a model of computation?',
        ['Because its simple design runs faster than any modern real computer', 'Because other formal models of computation turned out to be equivalent in power', 'Because the tape and head operate at unlimited speed, so running time never matters in practice', 'Because real computers have been proven unable to exceed human ability'], 1,
        'Consider the equivalence results of the 1930s.',
        'Lambda calculus and other models define the same computable functions, so the simple machine loses no generality.'),

      // L03
      mc(L03, 1, 1, 'What does the halting problem ask?',
        ['Whether a program has been written without any syntax or logic errors at all', 'Whether an arbitrary program will eventually stop on a given input', 'How fast a program runs', 'How much memory a program needs'], 1,
        'It is about stopping versus running forever.',
        'The halting problem asks for a general method to decide, for any program and input, whether the program eventually halts.'),
      mc(L03, 2, 1, 'Who proved the halting problem undecidable, and when?',
        ['Claude Shannon, 1948', 'Turing, 1936', 'Stephen Cook, 1971', 'Grace Hopper, 1952'], 1,
        'It was in his paper On Computable Numbers.',
        'Alan Turing proved this in 1936 in On Computable Numbers.'),
      mc(L03, 3, 2, 'A company advertises a tool that can examine any program and always correctly report whether it will loop forever. What is the best response?',
        ['Believe it if it is fast enough', 'Doubt it: no program can solve the halting problem for all programs and inputs', 'Believe it if it is written in C', 'Doubt it only for programs longer than a million lines'], 1,
        'The result applies to all programs in general.',
        'Turing\'s theorem shows no general halting-decider exists, so such a claim cannot be fully true.'),
      mc(L03, 4, 3, 'Which statement correctly describes what undecidability of the halting problem implies?',
        ['No individual program can ever be proven to halt, however simple it is, since the proof of undecidability applies to each one separately', 'There is no single algorithm that correctly decides halting for every program, though many specific programs can be analysed', 'All programs eventually halt', 'Only very short programs can be analysed'], 1,
        'The result is about a universal method, not every individual case.',
        'The theorem rules out one method that works on all programs; specific programs, such as ones without loops, can still be shown to halt.'),

      // L04
      mc(L04, 1, 1, 'What is the central idea of the stored-program (von Neumann) architecture?',
        ['Instructions and data share one addressable memory', 'Programs run only on special hardware', 'Memory is read-only', 'The processor has no cycle'], 0,
        'Where do the instructions live?',
        'Von Neumann\'s 1945 report placed program and data in a single addressable memory.'),
      mc(L04, 2, 1, 'Which document of 1945 described the stored-program design?',
        ['On Computable Numbers, with an Application', 'First Draft of a Report on the EDVAC', 'The C Programming Language, second edition', 'Reflections on the Motive Power of Fire and on Machines'], 1,
        'It concerns the EDVAC.',
        'Von Neumann\'s First Draft of a Report on the EDVAC set out the stored-program architecture.'),
      mc(L04, 3, 2, 'In which order does the processor repeat its basic cycle?',
        ['Execute, fetch, decode', 'Decode, execute, fetch', 'Fetch, decode, execute', 'Fetch, execute, decode'], 2,
        'You must get the instruction before you can interpret it.',
        'The cycle is fetch the instruction, decode it, execute it, then repeat.'),
      mc(L04, 4, 3, 'Because code and data share memory, which important kind of software becomes possible?',
        ['Programs that read or produce other programs, such as compilers', 'Programs that never need to use any memory while they are running on the machine', 'Hardware without any instructions', 'Programs that cannot be changed'], 0,
        'If a program is just data, what else can handle it?',
        'A program stored as data can be created or transformed by another program, which is exactly what a compiler does.'),

      // L05
      mc(L05, 1, 1, 'Big-O notation describes',
        ['The exact running time measured in seconds on one machine', 'An upper bound on how cost grows with input size', 'The exact amount of memory a program uses, counted in bytes', 'The number of lines of source code in the whole program'], 1,
        'It ignores constants.',
        'Big-O bounds growth of running time or space as the input size increases.'),
      mc(L05, 2, 1, 'An algorithm takes 3n^2 + 5n + 2 steps. Its growth is',
        ['O(n)', 'O(n^2)', 'O(2^n)', 'O(log n)'], 1,
        'Keep only the dominant term and drop constants.',
        'For large n the n^2 term dominates, so the cost is O(n^2).'),
      mc(L05, 3, 2, 'An O(n^2) algorithm takes 1 second for 1,000 items. Roughly how long for 2,000 items?',
        ['2 seconds', '4 seconds', '8 seconds', '1 second'], 1,
        'Doubling n squares the factor of two.',
        'Cost scales with n^2, and (2n)^2 = 4n^2, so about 4 seconds.'),
      mc(L05, 4, 3, 'Algorithm A takes 100n steps and algorithm B takes n^2 steps. Which statement is correct?',
        ['A is faster for every n', 'B is faster for n below 100, and A is faster for n above 100', 'B is faster for every n', 'They always take the same number of steps'], 1,
        'Find where 100n equals n^2.',
        'They are equal at n = 100; below that n^2 is smaller, above that 100n is smaller.'),

      // L06
      mc(L06, 1, 1, 'What is the purpose of a base case in a recursive function?',
        ['To make the function run faster by caching every earlier result in a table', 'To stop the recursion by answering the smallest instance directly', 'To store results in memory', 'To call the function twice'], 1,
        'What happens without one?',
        'The base case ends the descent; without it, the function calls itself forever.'),
      mc(L06, 2, 1, 'The Master Theorem is used to',
        ['Prove programs halt', 'Solve running-time recurrences of divide-and-conquer algorithms', 'Compress data', 'Encrypt messages'], 1,
        'Think of T(n) = a T(n/b) + f(n).',
        'It solves recurrences of the form T(n) = a T(n/b) + f(n).'),
      mc(L06, 3, 2, 'A recursive search halves the number of items each call and stops at 1 item. Starting with 1,024 items, how many halvings are needed?',
        ['8', '9', '11', '10'], 3,
        'How many times must you divide 1,024 by 2 to reach 1?',
        '1,024 = 2^10, so 10 halvings reach 1.'),
      mc(L06, 4, 3, 'For mergesort, a = 2 subproblems, each of size n/2, with f(n) proportional to n to merge. What running time does the Master Theorem give?',
        ['O(n)', 'O(n^2)', 'O(n log n)', 'O(log n)'], 2,
        'Compare f(n) with n raised to log base 2 of 2.',
        'Here n^(log2 2) = n, which matches f(n), giving O(n log n).'),

      // L07
      mc(L07, 1, 1, 'What is the worst-case lower bound for comparison-based sorting of n items?',
        ['Order n', 'Order n log n', 'Order log n', 'Order 2^n'], 1,
        'It is a decision-tree result.',
        'Any comparison sort needs on the order of n log n comparisons in the worst case.'),
      mc(L07, 2, 1, 'How many possible orderings (permutations) do n distinct items have?',
        ['n squared, one for each pair of items', '2n, one for each item in each direction', 'n factorial', 'n log n, the cost of sorting them'], 2,
        'Choose the first item in n ways, then n-1, and so on.',
        'There are n! orderings, and the sorting algorithm must be able to output the right one for each.'),
      mc(L07, 3, 2, 'Three distinct items have 6 possible orderings. What is the minimum number of comparisons that guarantees sorting them in the worst case?',
        ['2', '3', '4', '6'], 1,
        'k comparisons distinguish at most 2^k outcomes.',
        'Two comparisons give at most 4 outcomes, which is less than 6, but three give 8, which is enough.'),
      mc(L07, 4, 3, 'Why must the decision tree of a correct comparison sort have at least n! leaves?',
        ['Each comparison creates n! branches, so after one comparison the tree already has n! leaves', 'Each distinct input ordering needs its own distinct result, and there are n! of them', 'Sorting requires n! swaps', 'Because trees always have n! leaves'], 1,
        'Think about what different inputs require of the output.',
        'Different input orderings need different rearrangements, so the tree needs a separate leaf for each of the n! possibilities.'),

      // L08
      mc(L08, 1, 1, 'The class P contains problems that',
        ['Have no algorithm that can solve them', 'Can be solved in polynomial time', 'Can be verified quickly but never solved', 'Require a quantum computer to solve them'], 1,
        'P stands for polynomial.',
        'P is the class of problems solvable in polynomial time.'),
      mc(L08, 2, 1, 'The class NP contains problems whose solutions',
        ['Can be checked in polynomial time', 'Cannot be checked by any efficient method', 'Are always impossible to find by any algorithm', 'Need exponential memory to represent them'], 0,
        'It is about verification.',
        'NP means a proposed solution can be verified in polynomial time.'),
      mc(L08, 3, 2, 'A problem has the property that any proposed answer can be checked quickly, but no one knows a fast way to find an answer. Which class is it certainly in?',
        ['P', 'NP', 'Neither', 'Undecidable problems only'], 1,
        'Look at what is quick: checking.',
        'Quickly checkable solutions are exactly the definition of NP.'),
      mc(L08, 4, 3, 'Stephen Cook proved SAT is NP-complete. What would a fast (polynomial-time) algorithm for SAT imply?',
        ['Only SAT is easy', 'Every problem in NP could be solved in polynomial time', 'All problems become undecidable', 'P would be empty'], 1,
        'NP-complete means every NP problem reduces to it.',
        'Since every NP problem can be translated into SAT efficiently, a fast SAT solver would solve all of NP quickly.'),

      // L09
      mc(L09, 1, 1, 'What is the entropy of a fair coin flip?',
        ['0 bits', '1 bit', '2 bits', '0.5 bits'], 1,
        'Two equally likely outcomes.',
        'H = -(0.5 log2 0.5 + 0.5 log2 0.5) = 1 bit.'),
      mc(L09, 2, 1, 'Hamming distance between two equal-length words is',
        ['The number of positions where they differ', 'The sum of the numerical values of both words', 'The difference in length between the words', 'The count of symbols that match, position by position'], 0,
        'Count differences, not matches.',
        'It counts the positions at which the two words differ.'),
      mc(L09, 3, 2, 'What is the Hamming distance between 10110 and 11100?',
        ['1', '2', '3', '4'], 1,
        'Compare the two words position by position.',
        'The words differ at positions 2 and 4 (0 vs 1, and 1 vs 0), so the distance is 2.'),
      mc(L09, 4, 3, 'A coin lands heads 99 percent of the time. Compared with a fair coin, its output should be',
        ['Less compressible, since it has higher entropy', 'More compressible, since its entropy is lower', 'Exactly as compressible', 'Impossible to encode'], 1,
        'Predictable data carries less information.',
        'A biased source has lower entropy, so lossless compression can shrink its output further.'),

      // L10
      mc(L10, 1, 1, 'Who published the first public-key key-exchange idea in 1976?',
        ['Diffie and Hellman', 'Alan Turing and Alonzo Church', 'Donald Knuth and Edsger Dijkstra', 'Stephen Cook and Richard Karp'], 0,
        'New Directions in Cryptography.',
        'Whitfield Diffie and Martin Hellman introduced public-key cryptography in 1976.'),
      mc(L10, 2, 1, 'RSA\'s security is based on the difficulty of',
        ['Sorting very large lists of numbers', 'Factoring large integers', 'Compressing large files without any loss', 'Compiling source code into machine code'], 1,
        'It is easy to multiply primes but hard to undo.',
        'RSA relies on the believed difficulty of factoring the product of two large primes.'),
      mc(L10, 3, 2, 'Two people who have never met want to agree on a secret over an open channel that an eavesdropper can read. Which technique solves this?',
        ['Sending the key in plain text', 'Public-key key exchange such as Diffie-Hellman', 'Using Hamming codes', 'Sorting the message'], 1,
        'The need is to establish a secret without prior sharing.',
        'Diffie-Hellman key exchange lets them derive a shared secret even though everything exchanged is public.'),
      mc(L10, 4, 3, 'RSA\'s algorithm is public, yet it is still considered secure. Why?',
        ['Because attackers are unable to obtain the specification of the algorithm from any public source', 'Because its security rests on the hardness of a problem, not on keeping the method secret', 'Because the algorithm changes daily', 'Because it only works on small numbers'], 1,
        'What exactly must an attacker solve?',
        'Modern cryptography relies on computational hardness: breaking the scheme requires solving a problem with no known efficient algorithm.'),

      // L11
      mc(L11, 1, 1, 'Amdahl\'s law shows that parallel speed-up is limited by',
        ['The clock frequency of a single core', 'The serial fraction of the work', 'The total number of transistors on the chip', 'The size of the cache on each core'], 1,
        'Some work cannot be split.',
        'The part of the task that must run serially sets a hard cap on overall speed-up.'),
      mc(L11, 2, 1, 'Moore\'s observation says transistor density roughly',
        ['Falls by half about every year', 'Doubles about every two years', 'Stays roughly constant over the decades', 'Triples roughly every month or so'], 1,
        'N(t) = N0 x 2^(t/2).',
        'The empirical trend is a doubling roughly every two years.'),
      mc(L11, 3, 2, 'A job is 80 percent parallelisable and runs on 4 processors. What is the Amdahl speed-up?',
        ['1.6', '2.0', '3.2', '2.5'], 3,
        'S = 1 / ((1 - p) + p/n).',
        'S = 1 / (0.2 + 0.8/4) = 1 / 0.4 = 2.5.'),
      mc(L11, 4, 3, 'If 90 percent of a task is parallelisable, what is the maximum possible speed-up however many processors you add?',
        ['9', '10', '90', 'Unlimited'], 1,
        'Let n become very large and see what remains.',
        'As n grows, p/n tends to zero, leaving S = 1 / (1 - 0.9) = 10.'),

      // L12
      mc(L12, 1, 1, 'What does gradient descent do?',
        ['Randomly guesses parameters', 'Moves parameters a small step opposite the gradient to reduce the loss', 'Sorts the training data', 'Increases the loss to speed learning'], 1,
        'The gradient points uphill.',
        'Gradient descent updates parameters in the direction that most decreases the loss.'),
      mc(L12, 2, 1, 'The central tension in machine learning is',
        ['Speed versus memory', 'Fitting the training data while generalising to unseen examples', 'Python versus C', 'Hardware versus software'], 1,
        'A model that memorises the training set can fail elsewhere.',
        'A useful model must perform well on new examples, not just the data it trained on.'),
      mc(L12, 3, 2, 'A parameter is 5, the learning rate is 0.1 and the gradient of the loss is 4. What is the parameter after one gradient-descent step?',
        ['4.6', '5.4', '4.0', '0.4'], 0,
        'theta_new = theta - eta x gradient.',
        '5 - 0.1 x 4 = 5 - 0.4 = 4.6.'),
      mc(L12, 4, 3, 'What typically goes wrong if the learning rate is set far too large?',
        ['Training becomes more accurate because every step covers far more ground towards the minimum', 'Steps overshoot the minimum and the loss may oscillate or diverge', 'The gradient becomes zero', 'The model stops needing data'], 1,
        'Imagine overshooting a valley again and again.',
        'Overly large steps jump past the minimum, so training can bounce around or diverge.'),

      // L13
      mc(L13, 1, 1, 'The sigmoid activation maps any real input to',
        ['The range between 0 and 1', 'The range between -1 and 0', 'Any positive number, with no upper limit', 'Exactly 0 or exactly 1, nothing else'], 0,
        '1 / (1 + e^-z).',
        'The sigmoid squashes values smoothly into the interval (0, 1).'),
      mc(L13, 2, 1, 'What does the ReLU activation do?',
        ['Squares its input and then adds a constant bias term to the result each time', 'Passes positive values unchanged and sets negative values to zero', 'Maps inputs into (0, 1)', 'Always outputs 1'], 1,
        'max(0, z).',
        'ReLU(z) = max(0, z).'),
      mc(L13, 3, 2, 'A classifier\'s four output scores are all equal. After softmax, what probability does each class get?',
        ['0.10', '0.20', '0.25', '0.50'], 2,
        'Probabilities must sum to 1.',
        'Equal scores give equal probabilities that sum to 1, so each is 1/4 = 0.25.'),
      mc(L13, 4, 3, 'Why are nonlinear activation functions essential in a multi-layer network?',
        ['Without them, stacked layers collapse into a single linear function', 'They make the network smaller', 'They remove the need for training', 'They convert probabilities to labels'], 0,
        'Compose two linear functions: what do you get?',
        'Composing linear layers yields another linear function, so nonlinearity is what lets depth add expressive power.'),
    ],
  },
};
