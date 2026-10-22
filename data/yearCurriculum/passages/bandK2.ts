// Reading passage library — band K2 (Kindergarten–Grade 2).
//
//   k2-01..k2-12  Kindergarten: 25–60 words, CVC + high-frequency words, short sentences
//   k2-13..k2-24  Grade 1: 60–120 words, digraphs, blends, silent-e
//   k2-25..k2-36  Grade 2: 120–220 words, paragraphs, dialogue
//
// All writing is original to Plajah Academia; folktales are retold in our own words from the named tradition.
// Questions list the correct answer first (the worksheet builder shuffles deterministically).

import type { Passage } from '../../../services/yearCurriculum/types';

const ORIGINAL = 'Original — Plajah Academia';

export const PASSAGES_K2: Passage[] = [
  // ── Kindergarten ──────────────────────────────────────────────────────────
  {
    id: 'k2-01',
    band: 'k2',
    genre: 'fiction',
    title: 'Pip the Pup',
    origin: ORIGINAL,
    text: `Ama has a pup named Pip. Pip can run. Pip can dig. Pip can sit.

One day, Pip dug in the mud. Pip got mud on his legs. He got mud on his nose!

Ama got a tub. Pip sat in the tub. Rub, rub, rub. Now Pip is wet, but he is not muddy. Pip is glad.`,
    focus: ['character', 'sequence'],
    vocab: [
      ['dig', 'to make a hole in the ground'],
      ['mud', 'wet, soft dirt'],
      ['tub', 'a big bowl of water for a bath'],
      ['glad', 'happy'],
    ],
    questions: [
      { q: 'What is the pup\'s name?', choices: ['Pip', 'Pat', 'Pom'], type: 'detail', level: 1 },
      { q: 'Where did Pip dig?', choices: ['In the mud', 'In the tub', 'In the bed'], type: 'detail', level: 1 },
      { q: 'What happened after Pip got mud on his nose?', choices: ['Ama put him in a tub', 'Pip went to sleep', 'Pip ate lunch'], type: 'sequence', level: 2 },
      { q: 'In the story, "glad" means…', choices: ['happy', 'sad', 'sleepy'], type: 'vocab', level: 2 },
      { q: 'How does Ama feel about Pip?', choices: ['She cares for him', 'She is mad at him', 'She does not like dogs'], type: 'inference', level: 3 },
    ],
    writePrompt: 'Draw Pip in the tub. Write one word that tells how Pip feels.',
  },
  {
    id: 'k2-02',
    band: 'k2',
    genre: 'informational',
    title: 'Ducks',
    origin: ORIGINAL,
    text: `Ducks live near ponds. A duck has webbed feet. Webbed feet help a duck swim fast.

A duck has a flat bill. It uses its bill to get bugs and plants to eat.

Ducks have soft feathers. Oil keeps the feathers dry. A duck can swim in the rain and still be dry!`,
    focus: ['main-idea', 'key-details'],
    vocab: [
      ['ponds', 'small, still lakes'],
      ['webbed', 'having skin between the toes'],
      ['bill', 'the hard mouth part of a bird'],
      ['feathers', 'the soft parts that cover a bird'],
    ],
    questions: [
      { q: 'Where do ducks live?', choices: ['Near ponds', 'In caves', 'In the desert'], type: 'detail', level: 1 },
      { q: 'What do webbed feet help a duck do?', choices: ['Swim fast', 'Climb trees', 'Dig holes'], type: 'detail', level: 1 },
      { q: 'What is a duck\'s bill?', choices: ['Its hard mouth part', 'Its tail', 'Its foot'], type: 'vocab', level: 2 },
      { q: 'Why can a duck stay dry in the rain?', choices: ['Oil keeps its feathers dry', 'It hides under a rock', 'It has thick fur'], type: 'inference', level: 2 },
      { q: 'What is this text mostly about?', choices: ['How a duck\'s body helps it live', 'How to build a pond', 'Why it rains'], type: 'main-idea', level: 3 },
    ],
    writePrompt: 'Draw a duck. Label its bill, feet, and feathers.',
  },
  {
    id: 'k2-03',
    band: 'k2',
    genre: 'poetry',
    title: 'The Bug on the Rug',
    origin: ORIGINAL,
    text: `I see a bug.
It is on the rug.
It is red and small.
It can climb the wall.

The bug can hop.
It hops to the top.
Then it sits in the sun,
And its day is done.`,
    focus: ['rhyme', 'sequence'],
    vocab: [
      ['rug', 'a soft cover for the floor'],
      ['climb', 'to go up'],
      ['top', 'the highest part'],
      ['done', 'finished'],
    ],
    questions: [
      { q: 'Where is the bug at first?', choices: ['On the rug', 'In a cup', 'On a bus'], type: 'detail', level: 1 },
      { q: 'What color is the bug?', choices: ['Red', 'Blue', 'Green'], type: 'detail', level: 1 },
      { q: 'What does the bug do after it hops to the top?', choices: ['It sits in the sun', 'It climbs the rug', 'It goes to bed'], type: 'sequence', level: 2 },
      { q: 'In the poem, "done" means…', choices: ['finished', 'hungry', 'wet'], type: 'vocab', level: 2 },
      { q: 'Why does the poet use words like "bug" and "rug"?', choices: ['To make the poem rhyme', 'To make it scary', 'To tell facts about bugs'], type: 'craft', level: 3 },
    ],
    writePrompt: 'Draw the bug in the sun. Write a word that rhymes with "bug."',
  },
  {
    id: 'k2-04',
    band: 'k2',
    genre: 'folktale',
    title: 'Why the Sun and Moon Live in the Sky',
    origin: 'Folktale retold — Nigeria (West Africa)',
    text: `Long ago, Sun and Moon lived on the land. Their friend was Water.

"Come to our house, Water!" said Sun. Water came in. Fish and frogs came too. Water got up to the top of the house.

Sun and Moon had to go up, up, up. Now they live in the sky.`,
    focus: ['retell', 'cause-effect'],
    vocab: [
      ['land', 'the ground, not the water'],
      ['friend', 'someone you like and spend time with'],
      ['sky', 'the space above the earth'],
    ],
    questions: [
      { q: 'Who was the friend of Sun and Moon?', choices: ['Water', 'Wind', 'Fire'], type: 'detail', level: 1 },
      { q: 'Who came in with Water?', choices: ['Fish and frogs', 'Cats and dogs', 'Birds and bees'], type: 'detail', level: 1 },
      { q: 'What happened when Water filled the house?', choices: ['Sun and Moon went up to the sky', 'Sun and Moon went to sleep', 'Water went away'], type: 'sequence', level: 2 },
      { q: 'In the story, "land" means…', choices: ['the ground', 'the sea', 'the sky'], type: 'vocab', level: 2 },
      { q: 'This story tells why…', choices: ['the Sun and Moon are in the sky', 'fish live in water', 'frogs can hop'], type: 'main-idea', level: 3 },
    ],
    writePrompt: 'Draw Sun and Moon going up to the sky. Tell what Water is doing.',
  },
  {
    id: 'k2-05',
    band: 'k2',
    genre: 'fiction',
    title: 'Kenji and the Big Box',
    origin: ORIGINAL,
    text: `Kenji has a big box. Is it a hat? No! Is it a bed? No!

Kenji cuts a hole. He adds two wings. Now the box is a jet.

"Zoom!" said Kenji. His mom got in the jet too. They went up to the sun and back, all in the den.`,
    focus: ['character', 'setting'],
    vocab: [
      ['box', 'a container with flat sides'],
      ['wings', 'the parts that help a bird or plane fly'],
      ['jet', 'a fast plane'],
      ['den', 'a cozy room in a home'],
    ],
    questions: [
      { q: 'What does Kenji have?', choices: ['A big box', 'A big ball', 'A big bus'], type: 'detail', level: 1 },
      { q: 'What does Kenji add to the box?', choices: ['Two wings', 'Two wheels', 'Two hats'], type: 'detail', level: 1 },
      { q: 'What did Kenji do before he added the wings?', choices: ['He cut a hole', 'He said "Zoom!"', 'He got in with Mom'], type: 'sequence', level: 2 },
      { q: 'In the story, a "den" is…', choices: ['a cozy room in a home', 'a big plane', 'a hole in a box'], type: 'vocab', level: 2 },
      { q: 'Did Kenji really fly to the sun?', choices: ['No, he was pretending in the den', 'Yes, in a real jet', 'Yes, on a bird'], type: 'inference', level: 3 },
    ],
    writePrompt: 'What could you make from a big box? Draw it and write its name.',
  },
  {
    id: 'k2-06',
    band: 'k2',
    genre: 'informational',
    title: 'Rain',
    origin: ORIGINAL,
    text: `Rain comes from clouds. Clouds are made of tiny drops of water. When the drops get big and heavy, they fall. That is rain!

Rain fills ponds and puddles. Plants drink rain. Animals drink it too.

When it rains, you can use a hat, a coat, and boots. Then you can jump in a puddle!`,
    focus: ['key-details', 'cause-effect'],
    vocab: [
      ['clouds', 'white or gray shapes in the sky made of water drops'],
      ['tiny', 'very small'],
      ['heavy', 'hard to lift'],
      ['puddle', 'a small pool of water on the ground'],
    ],
    questions: [
      { q: 'Where does rain come from?', choices: ['Clouds', 'The sun', 'The grass'], type: 'detail', level: 1 },
      { q: 'Who drinks rain?', choices: ['Plants and animals', 'Only cars', 'Only rocks'], type: 'detail', level: 1 },
      { q: 'In the text, "heavy" means…', choices: ['hard to lift', 'very light', 'very hot'], type: 'vocab', level: 2 },
      { q: 'Why do the drops fall from the clouds?', choices: ['They get big and heavy', 'The wind is warm', 'A bird drops them'], type: 'inference', level: 2 },
      { q: 'Why did the author write this?', choices: ['To teach about rain', 'To tell a funny story', 'To sell boots'], type: 'craft', level: 3 },
    ],
    writePrompt: 'Draw what you wear on a rainy day. Write one rain word.',
  },
  {
    id: 'k2-07',
    band: 'k2',
    genre: 'fiction',
    title: 'Lola Can Not Wait',
    origin: ORIGINAL,
    text: `Lola and her abuela make bread. They mix and mix. They put the pan in the hot oven.

"Is it done?" asks Lola. "Not yet," says Abuela.

Lola sits. Lola hops. Lola sings a song.

Ding! The bread is done. It is hot and yum. It was good to wait.`,
    focus: ['feelings', 'lesson'],
    vocab: [
      ['abuela', 'the Spanish word for grandma'],
      ['mix', 'to stir things together'],
      ['oven', 'a hot box in the kitchen for baking'],
      ['wait', 'to stay until something happens'],
    ],
    questions: [
      { q: 'What do Lola and Abuela make?', choices: ['Bread', 'Soup', 'Tacos'], type: 'detail', level: 1 },
      { q: 'What does Lola do while she waits?', choices: ['She sits, hops, and sings', 'She takes a nap', 'She goes to the park'], type: 'detail', level: 1 },
      { q: 'Who is Abuela?', choices: ['Lola\'s grandma', 'Lola\'s dog', 'Lola\'s teacher'], type: 'vocab', level: 2 },
      { q: 'How does Lola feel while she waits?', choices: ['Eager for the bread', 'Scared of the oven', 'Mad at Abuela'], type: 'inference', level: 2 },
      { q: 'What lesson does Lola learn?', choices: ['Good things can be worth the wait', 'Never bake bread', 'Always sing loud'], type: 'theme', level: 3 },
    ],
    writePrompt: 'What is hard for you to wait for? Draw it and write about it.',
  },
  {
    id: 'k2-08',
    band: 'k2',
    genre: 'informational',
    title: 'A Seed Can Grow',
    origin: ORIGINAL,
    text: `A seed is small. But a big plant can grow from a seed!

Put a seed in soil. Give it water and sun. A root grows down. A stem grows up. Then leaves pop out.

Some seeds grow into flowers. Some grow into trees. An apple tree can grow from a tiny seed.`,
    focus: ['sequence', 'main-idea'],
    vocab: [
      ['seed', 'a small part that a new plant grows from'],
      ['soil', 'dirt that plants grow in'],
      ['root', 'the part of a plant that grows down into the soil'],
      ['stem', 'the part of a plant that holds it up'],
    ],
    questions: [
      { q: 'What does a seed need to grow?', choices: ['Water and sun', 'Milk and bread', 'Snow and ice'], type: 'detail', level: 1 },
      { q: 'Which way does a root grow?', choices: ['Down', 'Up', 'Into the sky'], type: 'detail', level: 1 },
      { q: 'What pops out after the stem grows up?', choices: ['Leaves', 'Seeds', 'Soil'], type: 'sequence', level: 2 },
      { q: 'In the text, "soil" means…', choices: ['dirt that plants grow in', 'a kind of drink', 'a part of a leaf'], type: 'vocab', level: 2 },
      { q: 'What is the main idea?', choices: ['A big plant can grow from a small seed', 'Apples are red', 'Rain is wet'], type: 'main-idea', level: 3 },
    ],
    writePrompt: 'Draw a seed, then a root, a stem, and leaves. Number your pictures 1, 2, 3, 4.',
  },
  {
    id: 'k2-09',
    band: 'k2',
    genre: 'poetry',
    title: 'Snow Day',
    origin: ORIGINAL,
    text: `Snow on the hill,
Snow on the sill,
Snow on my nose,
Snow on my toes.

We make a man,
As tall as we can.
He has a hat,
And that is that!`,
    focus: ['rhyme', 'setting'],
    vocab: [
      ['hill', 'a high bump of land'],
      ['sill', 'the ledge at the bottom of a window'],
      ['tall', 'high from top to bottom'],
    ],
    questions: [
      { q: 'Where is the snow in the poem?', choices: ['On the hill', 'In a box', 'In the bath'], type: 'detail', level: 1 },
      { q: 'What do they make?', choices: ['A snowman', 'A cake', 'A boat'], type: 'detail', level: 1 },
      { q: 'Which word rhymes with "nose"?', choices: ['toes', 'hat', 'hill'], type: 'craft', level: 2 },
      { q: 'In the poem, a "sill" is…', choices: ['the ledge at the bottom of a window', 'a kind of hat', 'a big hill'], type: 'vocab', level: 2 },
      { q: 'What season is it in the poem?', choices: ['Winter', 'Summer', 'Spring'], type: 'inference', level: 3 },
    ],
    writePrompt: 'Draw your own snowman. Give it a name.',
  },
  {
    id: 'k2-10',
    band: 'k2',
    genre: 'folktale',
    title: 'The Rabbit in the Moon',
    origin: 'Folktale retold — Mexico (Aztec)',
    text: `Long ago, a god named Quetzalcoatl walked a long way. He was tired and hungry.

A rabbit had only grass. "You may have my grass," said Rabbit. "I will help you."

The god was glad. He held Rabbit up to the moon so all could see how kind Rabbit was. Look up! Can you see the rabbit?`,
    focus: ['character', 'lesson'],
    vocab: [
      ['tired', 'needing rest'],
      ['hungry', 'wanting food'],
      ['kind', 'nice and caring to others'],
      ['moon', 'the bright round light in the night sky'],
    ],
    questions: [
      { q: 'What did Rabbit offer to share?', choices: ['His grass', 'A cake', 'A hat'], type: 'detail', level: 1 },
      { q: 'Where did the god put Rabbit?', choices: ['Up on the moon', 'In a tree', 'In a hole'], type: 'detail', level: 1 },
      { q: 'In the story, "hungry" means…', choices: ['wanting food', 'wanting sleep', 'wanting to play'], type: 'vocab', level: 2 },
      { q: 'Why did the god hold Rabbit up to the moon?', choices: ['To show how kind Rabbit was', 'Because Rabbit was bad', 'To keep Rabbit cold'], type: 'inference', level: 2 },
      { q: 'What is the lesson of the story?', choices: ['Kindness is remembered', 'Grass is yummy', 'Rabbits can fly'], type: 'theme', level: 3 },
    ],
    writePrompt: 'Draw the moon with a rabbit in it. Write one kind thing you can do.',
  },
  {
    id: 'k2-11',
    band: 'k2',
    genre: 'fiction',
    title: 'Zara and the Big Wind',
    origin: ORIGINAL,
    text: `Zara has a red kite. "Go up, kite!" she says. But the kite will not go up.

Then a big wind comes. Whoosh! The kite zips up, up, up. It is in the sky!

Zara runs and grins. Her kite looks like a red bird.`,
    focus: ['sequence', 'feelings'],
    vocab: [
      ['kite', 'a toy that flies in the wind on a string'],
      ['wind', 'moving air'],
      ['zips', 'moves very fast'],
      ['grins', 'smiles big'],
    ],
    questions: [
      { q: 'What color is Zara\'s kite?', choices: ['Red', 'Blue', 'Green'], type: 'detail', level: 1 },
      { q: 'What makes the kite go up?', choices: ['A big wind', 'A bird', 'Zara\'s dog'], type: 'detail', level: 1 },
      { q: 'What happens first in the story?', choices: ['The kite will not go up', 'The kite zips up', 'Zara grins'], type: 'sequence', level: 2 },
      { q: 'In the story, "grins" means…', choices: ['smiles big', 'cries', 'sleeps'], type: 'vocab', level: 2 },
      { q: 'Why does the author say the kite looks like a red bird?', choices: ['To help us picture the kite flying', 'To say the kite is a real bird', 'To tell us Zara has a pet'], type: 'craft', level: 3 },
    ],
    writePrompt: 'Draw a kite in the sky. What does your kite look like?',
  },
  {
    id: 'k2-12',
    band: 'k2',
    genre: 'informational',
    title: 'The Mail Carrier',
    origin: ORIGINAL,
    text: `A mail carrier brings mail to homes. Mail can be a letter, a card, or a box.

The mail carrier walks or drives a truck. Rain or sun, the mail must get there!

Each home has a number. The number helps the mail carrier know where to go. Is there mail for you today?`,
    focus: ['main-idea', 'key-details'],
    vocab: [
      ['mail', 'letters and packages sent to people'],
      ['letter', 'a note you send to someone'],
      ['truck', 'a big car that carries things'],
      ['number', 'a sign that tells how many or which one'],
    ],
    questions: [
      { q: 'What does a mail carrier bring?', choices: ['Mail', 'Pizza', 'Milk'], type: 'detail', level: 1 },
      { q: 'How does a mail carrier get around?', choices: ['Walks or drives a truck', 'Flies a jet', 'Rides a horse'], type: 'detail', level: 1 },
      { q: 'In the text, a "letter" is…', choices: ['a note you send to someone', 'a kind of truck', 'a number on a home'], type: 'vocab', level: 2 },
      { q: 'Why does each home have a number?', choices: ['So the mail carrier knows where to go', 'So kids can count', 'To make the home pretty'], type: 'inference', level: 2 },
      { q: 'What is this text mostly about?', choices: ['How a mail carrier brings mail to homes', 'Why trucks are big', 'Why rain is wet'], type: 'main-idea', level: 3 },
    ],
    writePrompt: 'Draw a letter you would send to a friend. Who is it for?',
  },

  // ── Grade 1 ──────────────────────────────────────────────────────────────
  {
    id: 'k2-13',
    band: 'k2',
    genre: 'fiction',
    title: 'Chidi\'s Wiggly Tooth',
    origin: ORIGINAL,
    text: `Chidi had a wiggly tooth. It wiggled when he ate. It wiggled when he spoke. It even wiggled when he smiled.

At lunch, Chidi bit into a crunchy green apple. Crunch! He felt a gap in his mouth. Where was the tooth?

Chidi checked his lunch box. He checked the floor. Then his friend Mina pointed and giggled. The tooth was stuck in the apple!

Chidi wrapped the tooth in a napkin. That night, he set it by his bed. He grinned a big, gappy grin.`,
    focus: ['sequence', 'feelings'],
    vocab: [
      ['wiggly', 'moving back and forth a little'],
      ['crunchy', 'making a loud sound when you bite it'],
      ['gap', 'an empty space'],
      ['giggled', 'laughed in a quick, silly way'],
    ],
    questions: [
      { q: 'What did Chidi bite into?', choices: ['A green apple', 'A sandwich', 'A carrot'], type: 'detail', level: 1 },
      { q: 'Where was the tooth?', choices: ['Stuck in the apple', 'On the floor', 'In the lunch box'], type: 'detail', level: 1 },
      { q: 'What did Chidi do right after he felt the gap?', choices: ['He checked his lunch box and the floor', 'He went home', 'He ate a cookie'], type: 'sequence', level: 2 },
      { q: 'In the story, a "gap" is…', choices: ['an empty space', 'a kind of fruit', 'a loud sound'], type: 'vocab', level: 2 },
      { q: 'How did Chidi feel at the end?', choices: ['Happy and proud', 'Sad and lonely', 'Angry'], type: 'inference', level: 3 },
    ],
    writePrompt: 'Have you ever lost a tooth or something else? Draw and write what happened.',
  },
  {
    id: 'k2-14',
    band: 'k2',
    genre: 'informational',
    title: 'Your Amazing Bones',
    origin: ORIGINAL,
    text: `Did you know you have more than two hundred bones? Bones are hard and strong. They hold your body up. Without bones, you would flop like a wet noodle!

Some bones keep soft parts safe. Your skull is a bone helmet for your brain. Your ribs make a cage that guards your heart and lungs.

Bones meet at joints. Your knees, elbows, and fingers have joints. Joints let you bend, kick, and wave.

To keep your bones strong, drink milk, eat greens, and play outside every day.`,
    focus: ['main-idea', 'key-details', 'vocabulary'],
    vocab: [
      ['skull', 'the bone that covers your brain'],
      ['ribs', 'curved bones around your chest'],
      ['joints', 'places where two bones meet'],
      ['strong', 'hard to break'],
    ],
    questions: [
      { q: 'How many bones do you have?', choices: ['More than two hundred', 'Ten', 'Fifty'], type: 'detail', level: 1 },
      { q: 'What does your skull keep safe?', choices: ['Your brain', 'Your toes', 'Your tummy'], type: 'detail', level: 1 },
      { q: 'In the text, "joints" are…', choices: ['places where bones meet', 'kinds of food', 'soft parts inside'], type: 'vocab', level: 2 },
      { q: 'What would happen if you had no bones?', choices: ['You would flop', 'You would run faster', 'You would grow taller'], type: 'inference', level: 2 },
      { q: 'What is the main idea?', choices: ['Bones hold you up, keep you safe, and help you move', 'Milk is a drink', 'Noodles are soft'], type: 'main-idea', level: 3 },
    ],
    writePrompt: 'Draw yourself bending, kicking, or waving. Label one joint you are using.',
  },
  {
    id: 'k2-15',
    band: 'k2',
    genre: 'folktale',
    title: 'The Monkey and the Crocodile',
    origin: 'Folktale retold — India (Panchatantra)',
    text: `A monkey lived in a rose apple tree by a river. Each day, he shared sweet fruit with his friend Crocodile.

Crocodile's wife had a plan. "That monkey eats sweet fruit all day. His heart must be sweet too. Bring him to me!"

So Crocodile said, "Ride on my back to my home for lunch." In the middle of the river, he told the monkey the plan.

The monkey thought fast. "Oh dear! I left my heart up in the tree. Swim back, and I will get it."

Crocodile swam back. The monkey jumped high into his tree. "Nobody leaves a heart in a tree!" he called. "Good-bye!"`,
    focus: ['character', 'lesson', 'sequence'],
    vocab: [
      ['shared', 'gave some of what he had to others'],
      ['plan', 'an idea about what to do'],
      ['middle', 'the center of something'],
    ],
    questions: [
      { q: 'Where did the monkey live?', choices: ['In a rose apple tree by a river', 'In a cave', 'In a house'], type: 'detail', level: 1 },
      { q: 'What did the monkey share with Crocodile?', choices: ['Sweet fruit', 'Fish', 'Rice'], type: 'detail', level: 1 },
      { q: 'What happened right after Crocodile told the plan?', choices: ['The monkey said he left his heart in the tree', 'The monkey fell in the water', 'Crocodile ate lunch'], type: 'sequence', level: 2 },
      { q: 'In the story, "middle" means…', choices: ['the center', 'the top', 'the end'], type: 'vocab', level: 2 },
      { q: 'What lesson does the story teach?', choices: ['Thinking fast can keep you safe', 'Never eat fruit', 'Crocodiles are good swimmers'], type: 'theme', level: 3 },
    ],
    writePrompt: 'Draw the monkey safe in his tree. Write what he might say to Crocodile next.',
  },
  {
    id: 'k2-16',
    band: 'k2',
    genre: 'poetry',
    title: 'Sliding Down',
    origin: ORIGINAL,
    text: `Up the steps, one, two, three,
Grab the rail, and look at me!
At the top I see the trees,
And feel the breeze upon my knees.

Sit down flat and hold on tight,
Wave hello, then what a flight!
Whoosh! I zoom with a happy sound,
Then I bump down on the ground.

Back I race and climb once more,
Up the steps, one, two, three, four!
Slides are fun from start to end,
Best of all with my best friend.`,
    focus: ['rhyme', 'feelings'],
    vocab: [
      ['rail', 'a bar you hold on to'],
      ['breeze', 'a soft wind'],
      ['tight', 'firmly, without letting go'],
      ['flight', 'a trip through the air'],
    ],
    questions: [
      { q: 'What does the child climb?', choices: ['The steps of a slide', 'A tree', 'A hill'], type: 'detail', level: 1 },
      { q: 'What does the child feel at the top?', choices: ['The breeze', 'The rain', 'The snow'], type: 'detail', level: 1 },
      { q: 'Which word rhymes with "tight"?', choices: ['flight', 'ground', 'trees'], type: 'craft', level: 2 },
      { q: 'In the poem, a "breeze" is…', choices: ['a soft wind', 'a big tree', 'a loud sound'], type: 'vocab', level: 2 },
      { q: 'How does the child feel about the slide?', choices: ['Loves it and wants to go again', 'Is scared and wants to go home', 'Is bored'], type: 'inference', level: 3 },
    ],
    writePrompt: 'Write two rhyming lines about your favorite thing to do at the park.',
  },
  {
    id: 'k2-17',
    band: 'k2',
    genre: 'fiction',
    title: 'The Snack Swap',
    origin: ORIGINAL,
    text: `Priya opened her lunch box. Inside was a dosa, crisp and golden, with a cup of chutney. Lucas peeked at it. "What is that?" he asked.

"It's a dosa. It's like a thin pancake made from rice and lentils," said Priya. "Want to try a bite?"

Lucas made a face. Then he took a tiny bite. His eyes got wide. "That's great!" he said.

Lucas held out his lunch. "Try my arepa. It's a corn cake with cheese inside."

Priya took a bite and smiled. "Let's swap snacks every Friday!"`,
    focus: ['character', 'feelings', 'lesson'],
    vocab: [
      ['crisp', 'dry and crunchy'],
      ['peeked', 'looked quickly'],
      ['lentils', 'small, flat beans'],
      ['swap', 'to trade'],
    ],
    questions: [
      { q: 'What was in Priya\'s lunch box?', choices: ['A dosa', 'An arepa', 'A sandwich'], type: 'detail', level: 1 },
      { q: 'What is an arepa?', choices: ['A corn cake with cheese', 'A rice drink', 'A kind of fruit'], type: 'detail', level: 1 },
      { q: 'In the story, "peeked" means…', choices: ['looked quickly', 'ran fast', 'shouted'], type: 'vocab', level: 2 },
      { q: 'How did Lucas feel before his first bite?', choices: ['Unsure', 'Excited', 'Angry'], type: 'inference', level: 2 },
      { q: 'What is the big idea of the story?', choices: ['Trying new things can be fun', 'Never share food', 'Pancakes are the best food'], type: 'theme', level: 3 },
    ],
    writePrompt: 'Draw a food from your family you would like to share. Write what it tastes like.',
  },
  {
    id: 'k2-18',
    band: 'k2',
    genre: 'biography',
    title: 'Wangari Maathai Plants a Forest',
    origin: ORIGINAL,
    text: `Wangari Maathai was born in Kenya in 1940. As a girl, she loved the green hills and clean streams near her home.

When she grew up, Wangari saw that many trees had been cut down. The land was dry, and the streams were drying up.

Wangari had an idea. She asked women to plant trees. One tree became ten. Ten became a hundred. In time, people planted millions of trees! Her group was called the Green Belt Movement.

In 2004, Wangari won the Nobel Peace Prize. She showed that one person can help the whole planet.`,
    focus: ['main-idea', 'sequence', 'key-details'],
    vocab: [
      ['streams', 'small rivers'],
      ['idea', 'a thought or a plan'],
      ['planted', 'put in the ground to grow'],
      ['planet', 'a big world like Earth'],
    ],
    questions: [
      { q: 'Where was Wangari born?', choices: ['Kenya', 'Japan', 'Mexico'], type: 'detail', level: 1 },
      { q: 'What did Wangari ask women to do?', choices: ['Plant trees', 'Build roads', 'Cut down trees'], type: 'detail', level: 1 },
      { q: 'What happened after Wangari saw that trees had been cut down?', choices: ['She had an idea to plant trees', 'She moved away', 'She won a race'], type: 'sequence', level: 2 },
      { q: 'In the text, "streams" are…', choices: ['small rivers', 'tall trees', 'big cities'], type: 'vocab', level: 2 },
      { q: 'What is the main idea?', choices: ['Wangari helped the land by getting people to plant trees', 'Kenya has hills', 'Trees are tall'], type: 'main-idea', level: 3 },
    ],
    writePrompt: 'Wangari helped her land. Draw one way you can help nature and write about it.',
  },
  {
    id: 'k2-19',
    band: 'k2',
    genre: 'informational',
    title: 'Seasons Around the World',
    origin: ORIGINAL,
    text: `When it is winter in Canada, it is summer in Australia! How can that be?

Earth is tilted. As it travels around the sun, one half leans toward the sun and gets more light. That half has summer. The other half leans away and has winter.

So in December, kids in Canada might build snow forts. At the same time, kids in Australia might swim at the beach.

Some places near the middle of Earth stay warm all year. They have a rainy season and a dry season instead.`,
    focus: ['compare', 'cause-effect', 'main-idea'],
    vocab: [
      ['tilted', 'leaning to one side'],
      ['leans', 'tips toward something'],
      ['beach', 'sandy land next to the sea'],
      ['season', 'a part of the year with its own weather'],
    ],
    questions: [
      { q: 'When it is winter in Canada, what season is it in Australia?', choices: ['Summer', 'Winter', 'Fall'], type: 'detail', level: 1 },
      { q: 'What might kids in Australia do in December?', choices: ['Swim at the beach', 'Build snow forts', 'Rake leaves'], type: 'detail', level: 1 },
      { q: 'In the text, "tilted" means…', choices: ['leaning to one side', 'very hot', 'round'], type: 'vocab', level: 2 },
      { q: 'Why does one half of Earth have summer?', choices: ['It leans toward the sun', 'It is closer to the moon', 'It has more water'], type: 'inference', level: 2 },
      { q: 'What is the main idea?', choices: ['Different places can have different seasons at the same time', 'Canada is cold', 'Kids like the beach'], type: 'main-idea', level: 3 },
    ],
    writePrompt: 'Draw a kid in Canada and a kid in Australia in December. Write what each one is doing.',
  },
  {
    id: 'k2-20',
    band: 'k2',
    genre: 'fiction',
    title: 'Chomp the Goat',
    origin: ORIGINAL,
    text: `On Grandpa's farm in Peru, there lived a goat named Chomp. Chomp ate grass. Chomp ate weeds. Chomp ate things he should not eat!

One morning, Grandpa Luis could not find his straw hat. Nina looked in the shed. She looked by the gate. Then she heard a munch, munch, munch.

There was Chomp, chewing on the hat brim!

"Chomp!" cried Nina. Chomp just blinked and kept chewing.

Grandpa laughed. "I guess my hat was his snack. Next time, I will hang it up high." He patted Chomp, and Chomp nibbled his sleeve.`,
    focus: ['character', 'setting', 'sequence'],
    vocab: [
      ['weeds', 'wild plants that grow where you do not want them'],
      ['shed', 'a small building for tools'],
      ['brim', 'the edge of a hat'],
      ['nibbled', 'took small bites'],
    ],
    questions: [
      { q: 'Where is Grandpa\'s farm?', choices: ['Peru', 'Japan', 'Canada'], type: 'detail', level: 1 },
      { q: 'What was missing?', choices: ['Grandpa\'s straw hat', 'Nina\'s shoe', 'The goat'], type: 'detail', level: 1 },
      { q: 'Where did Nina look first?', choices: ['In the shed', 'By the gate', 'In the house'], type: 'sequence', level: 2 },
      { q: 'In the story, a "brim" is…', choices: ['the edge of a hat', 'a kind of grass', 'a loud noise'], type: 'vocab', level: 2 },
      { q: 'Why is the goat named Chomp?', choices: ['He chews and eats everything', 'He is very fast', 'He is very sleepy'], type: 'inference', level: 3 },
    ],
    writePrompt: 'What else might Chomp try to eat? Draw it and write a funny sentence.',
  },
  {
    id: 'k2-21',
    band: 'k2',
    genre: 'folktale',
    title: 'The Straw Hats',
    origin: 'Folktale retold — Japan (Kasa Jizo)',
    text: `Long ago in snowy Japan, a kind old man and woman were very poor. On the last day of the year, the old man made five straw hats to sell in town.

But no one bought a hat. On the way home, he passed six stone statues called Jizo. Snow was piled on their heads.

"You must be cold," he said. He put a straw hat on five statues. He gave the last one his own hat.

That night, there was a thump at the door. Outside sat a pile of rice, fruit, and gifts for the new year. Far off in the snow, six statues were walking home.`,
    focus: ['lesson', 'cause-effect', 'retell'],
    vocab: [
      ['poor', 'having very little money'],
      ['statues', 'shapes of people made from stone or metal'],
      ['piled', 'stacked up high'],
      ['thump', 'a dull, heavy sound'],
    ],
    questions: [
      { q: 'What did the old man make to sell?', choices: ['Straw hats', 'Rice cakes', 'Baskets'], type: 'detail', level: 1 },
      { q: 'How many statues did he pass?', choices: ['Six', 'Five', 'Two'], type: 'detail', level: 1 },
      { q: 'In the story, "piled" means…', choices: ['stacked up high', 'melted away', 'thrown far'], type: 'vocab', level: 2 },
      { q: 'Who left the gifts at the door?', choices: ['The statues', 'The old woman', 'A shopkeeper'], type: 'inference', level: 2 },
      { q: 'What is the lesson of the story?', choices: ['Kindness comes back to you', 'Hats are hard to sell', 'Snow is cold'], type: 'theme', level: 3 },
    ],
    writePrompt: 'Draw the old man giving the hats. Write how the statues might feel.',
  },
  {
    id: 'k2-22',
    band: 'k2',
    genre: 'fiction',
    title: 'Fatima\'s Big Splash',
    origin: ORIGINAL,
    text: `Fatima stood at the edge of the pool. Her toes curled. The water looked so deep.

"You can do it," said Coach Dee. "Kick your legs and reach with your arms."

Fatima took a breath. She held her nose and jumped. Splash! For a second, she was under. Then she kicked and kicked. Her face popped up.

"I'm swimming!" she shouted. She paddled to the wall and grabbed it.

Coach Dee clapped. Fatima grinned. "Can I do that again?"`,
    focus: ['feelings', 'character', 'sequence'],
    vocab: [
      ['edge', 'the side or end of something'],
      ['curled', 'bent into a curve'],
      ['breath', 'air you take into your body'],
      ['paddled', 'moved through water with arms and legs'],
    ],
    questions: [
      { q: 'Where was Fatima?', choices: ['At the pool', 'At the beach', 'In the bath'], type: 'detail', level: 1 },
      { q: 'Who helped Fatima?', choices: ['Coach Dee', 'Her mom', 'Her big brother'], type: 'detail', level: 1 },
      { q: 'What did Fatima do right before she jumped?', choices: ['Took a breath and held her nose', 'Grabbed the wall', 'Clapped her hands'], type: 'sequence', level: 2 },
      { q: 'In the story, the "edge" of the pool is…', choices: ['the side of it', 'the deep middle', 'a swim cap'], type: 'vocab', level: 2 },
      { q: 'How did Fatima\'s feelings change?', choices: ['From nervous to proud', 'From happy to sad', 'From sleepy to mad'], type: 'inference', level: 3 },
    ],
    writePrompt: 'Write about a time you tried something new. How did you feel before and after?',
  },
  {
    id: 'k2-23',
    band: 'k2',
    genre: 'informational',
    title: 'Magnets',
    origin: ORIGINAL,
    text: `A magnet can pull some things toward it without even touching them! This pull is called a force.

Magnets pull on things made of iron, like nails, paper clips, and some spoons. They do not pull on paper, wood, glass, or plastic.

Every magnet has two ends called poles. One is the north pole and one is the south pole. If you put a north pole next to a south pole, they snap together. Two north poles push each other away!

You may have magnets on your fridge. They hold up pictures and notes.`,
    focus: ['key-details', 'cause-effect', 'author-purpose'],
    vocab: [
      ['force', 'a push or a pull'],
      ['iron', 'a strong, gray metal'],
      ['poles', 'the two ends of a magnet'],
      ['fridge', 'a cold box that keeps food fresh'],
    ],
    questions: [
      { q: 'What do magnets pull on?', choices: ['Things made of iron', 'Paper', 'Wood'], type: 'detail', level: 1 },
      { q: 'What are the two ends of a magnet called?', choices: ['Poles', 'Tips', 'Tails'], type: 'detail', level: 1 },
      { q: 'In the text, a "force" is…', choices: ['a push or a pull', 'a kind of metal', 'a picture'], type: 'vocab', level: 2 },
      { q: 'What would happen if you held two south poles together?', choices: ['They would push away', 'They would snap together', 'They would melt'], type: 'inference', level: 2 },
      { q: 'Why did the author write this text?', choices: ['To teach how magnets work', 'To tell a story about a fridge', 'To get you to buy magnets'], type: 'craft', level: 3 },
    ],
    writePrompt: 'List three things in your classroom a magnet might pick up. Draw one.',
  },
  {
    id: 'k2-24',
    band: 'k2',
    genre: 'fiction',
    title: 'Grandma Ahn\'s Garden',
    origin: ORIGINAL,
    text: `Min-jun helped Grandma Ahn plant a garden. They dug rows in the dirt. They dropped in seeds for peppers, cabbage, and green onions.

Every day, Min-jun checked. Nothing. He sighed. "Will they ever grow?"

"Plants take time," said Grandma Ahn. "Just like you."

Then one morning, Min-jun spotted tiny green shoots poking up! By summer, the garden was full. Min-jun and Grandma picked the cabbage and made kimchi together. It was spicy and crunchy.

"I grew this," Min-jun said proudly.`,
    focus: ['feelings', 'lesson', 'sequence'],
    vocab: [
      ['rows', 'lines of things side by side'],
      ['sighed', 'let out a long breath because he was sad or tired'],
      ['shoots', 'new little plants'],
      ['spicy', 'hot and full of flavor'],
    ],
    questions: [
      { q: 'Who helped Min-jun plant the garden?', choices: ['Grandma Ahn', 'His teacher', 'His sister'], type: 'detail', level: 1 },
      { q: 'What did they make with the cabbage?', choices: ['Kimchi', 'Soup', 'Salad'], type: 'detail', level: 1 },
      { q: 'In the story, "shoots" are…', choices: ['new little plants', 'big trees', 'loud sounds'], type: 'vocab', level: 2 },
      { q: 'Why did Min-jun sigh?', choices: ['Nothing had grown yet', 'He was too hot', 'He lost his shovel'], type: 'inference', level: 2 },
      { q: 'What is the lesson of the story?', choices: ['Good things take time and care', 'Gardens are messy', 'Spicy food is bad'], type: 'theme', level: 3 },
    ],
    writePrompt: 'Draw a garden you would plant. Label three things growing in it.',
  },

  // ── Grade 2 ──────────────────────────────────────────────────────────────
  {
    id: 'k2-25',
    band: 'k2',
    genre: 'fiction',
    title: 'The Rainy Day Band',
    origin: ORIGINAL,
    text: `Rain drummed on the window. Ravi pressed his nose to the glass and groaned. "No park today," he said. His little sister, Asha, flopped on the rug beside him.

Then Ravi heard it. Plink. Plunk. Plink. Water was dripping from the roof into a metal bucket on the porch.

"That sounds like music!" Ravi said. He grabbed two wooden spoons from the kitchen. He tapped a pot. Bong! He tapped a pan. Bang! Asha shook a jar of dried beans. Shh-shh-shh.

"We need a name," said Asha.

Ravi thought for a moment. "The Rainy Day Band!"

They marched through the house, banging and shaking. Dad came out of his office holding his ears, but he was smiling. He picked up a cardboard box and drummed on it with his hands.

By the time the rain stopped, the band had played six songs. Ravi looked out at the bright sky. Then he looked at his pots and pans.

"Maybe," he said, "we can play one more."`,
    focus: ['character', 'sequence', 'feelings'],
    vocab: [
      ['groaned', 'made a low, unhappy sound'],
      ['dripping', 'falling in small drops'],
      ['marched', 'walked with strong, even steps'],
      ['cardboard', 'thick, stiff paper used to make boxes'],
    ],
    questions: [
      { q: 'Why couldn\'t Ravi go to the park?', choices: ['It was raining', 'He was sick', 'The park was closed', 'It was too dark'], type: 'detail', level: 1 },
      { q: 'What gave Ravi the idea for a band?', choices: ['Water dripping into a bucket', 'A song on the radio', 'His dad\'s drum', 'A band on TV'], type: 'detail', level: 1 },
      { q: 'What happened right after Asha said they needed a name?', choices: ['Ravi named it the Rainy Day Band', 'Dad came out of his office', 'The rain stopped', 'Ravi grabbed two spoons'], type: 'sequence', level: 2 },
      { q: 'In the story, "groaned" means…', choices: ['made a low, unhappy sound', 'laughed loudly', 'whispered a secret', 'sang a song'], type: 'vocab', level: 2 },
      { q: 'What does the ending show about Ravi?', choices: ['He is having so much fun he wants to keep playing', 'He wants to go to the park right away', 'He is tired of music', 'He is upset with Asha'], type: 'inference', level: 3 },
    ],
    writePrompt: 'Invent your own band using things from your home. Write its name and what each instrument sounds like.',
  },
  {
    id: 'k2-26',
    band: 'k2',
    genre: 'informational',
    title: 'The Clever Octopus',
    origin: ORIGINAL,
    text: `An octopus is a sea animal with eight arms and no bones at all. Because its body is soft, an octopus can squeeze through a tiny gap between rocks.

Each arm is covered with suckers. The suckers can grip rocks and grab food like crabs and clams. They can even taste what they touch!

An octopus is a master of disguise. Special cells in its skin let it change color in less than a second. It can look like sand, a rock, or seaweed. This helps it hide from hungry fish.

If an octopus is in danger, it can squirt a cloud of dark ink and zoom away.

Scientists think octopuses are very smart. Some have learned to open jars to get a snack inside. An octopus also has three hearts and blue blood!

Next time you visit an aquarium, look closely. An octopus might be hiding right in front of you.`,
    focus: ['main-idea', 'key-details', 'vocabulary'],
    vocab: [
      ['squeeze', 'to push through a small space'],
      ['suckers', 'round parts that stick to things'],
      ['disguise', 'a way to look like something else so you can hide'],
      ['ink', 'a dark liquid'],
      ['aquarium', 'a place with tanks where people can see water animals'],
    ],
    questions: [
      { q: 'How many arms does an octopus have?', choices: ['Eight', 'Six', 'Ten', 'Four'], type: 'detail', level: 1 },
      { q: 'What can an octopus\'s suckers do?', choices: ['Grip, grab, and taste', 'See in the dark', 'Make ink', 'Turn into fins'], type: 'detail', level: 1 },
      { q: 'In the text, "disguise" means…', choices: ['a way to look like something else so you can hide', 'a loud warning sound', 'a kind of food', 'a fast swim'], type: 'vocab', level: 2 },
      { q: 'Why might an octopus squirt ink?', choices: ['To hide and get away from danger', 'To find food', 'To make friends', 'To build a home'], type: 'inference', level: 2 },
      { q: 'What is the main idea of this text?', choices: ['An octopus has amazing body parts and skills', 'Octopuses live in jars', 'Fish are hungry', 'Aquariums are fun to visit'], type: 'main-idea', level: 3 },
    ],
    writePrompt: 'Which octopus fact surprised you most? Write it and draw an octopus using that skill.',
  },
  {
    id: 'k2-27',
    band: 'k2',
    genre: 'folktale',
    title: 'Grandmother Spider Brings the Light',
    origin: 'Folktale retold — Cherokee (Indigenous North America)',
    text: `Long ago, the world was dark. The animals bumped into each other and could not find their food. "On the other side of the world, there is light," said Fox. "But the people there will not share it."

"I will get some," said Possum. "I can hide it in my bushy tail." Possum crept to the light and tucked a piece into his tail. But the light was too hot! It burned the fur off his tail, and he dropped it. That is why a possum's tail is bare today.

Next, Buzzard tried. He carried the light on his head, but it singed his feathers. That is why buzzards have bare heads.

Then a small voice spoke. "Let me try," said Grandmother Spider. The others laughed, but she did not give up. She shaped a little pot from wet clay. She spun a web all the way to the light. She tucked the light inside her pot and followed her web home.

The animals cheered. They lifted the light high into the sky, and it became the sun.

To this day, a spider's web is shaped like the sun's rays.`,
    focus: ['character', 'lesson', 'sequence'],
    vocab: [
      ['crept', 'moved slowly and quietly'],
      ['singed', 'burned a little'],
      ['clay', 'soft, wet earth that can be shaped and dried'],
      ['rays', 'thin lines of light'],
    ],
    questions: [
      { q: 'Why were the animals bumping into each other?', choices: ['The world was dark', 'They were playing a game', 'They were very sleepy', 'They were running too fast'], type: 'detail', level: 1 },
      { q: 'What did Grandmother Spider make to carry the light?', choices: ['A pot made of clay', 'A basket of leaves', 'A bag of fur', 'A box of wood'], type: 'detail', level: 1 },
      { q: 'Who tried to get the light first?', choices: ['Possum', 'Buzzard', 'Grandmother Spider', 'Fox'], type: 'sequence', level: 2 },
      { q: 'In the story, "singed" means…', choices: ['burned a little', 'washed', 'colored', 'stretched'], type: 'vocab', level: 2 },
      { q: 'What is the lesson of the story?', choices: ['Even the smallest helper can do something big', 'Fox is the bravest animal', 'Light is cold', 'Never share with friends'], type: 'theme', level: 3 },
    ],
    writePrompt: 'Retell the story in three pictures: Possum, Buzzard, and Grandmother Spider. Write one sentence under each.',
  },
  {
    id: 'k2-28',
    band: 'k2',
    genre: 'poetry',
    title: 'What the Moon Sees',
    origin: ORIGINAL,
    text: `The moon peeks down on Tokyo,
Where trains go humming by.
It peeks on Lagos, warm and loud,
Beneath the purple sky.

It sees a girl in Mexico
Who waves from her front door,
A boy in Cairo counting stars,
He reaches forty-four!

It sees a grandma in Peru
Who sings her baby sweet,
A puppy in a London flat
Asleep on someone's feet.

It sees a farmer in Ghana
Who stops to rest his hoe,
And sailors near the Sydney shore
Who row and row and row.

It sees the polar bears in snow,
The camels in the sand,
The fishing boats that bob and rock
Beside the quiet land.

The moon looks down on all of us,
On every roof and tree,
And somewhere, someone looks right back,
And that someone is me!`,
    focus: ['rhyme', 'setting', 'main-idea'],
    vocab: [
      ['peeks', 'takes a quick look'],
      ['humming', 'making a low, steady sound'],
      ['beneath', 'under'],
      ['bob', 'to move gently up and down'],
    ],
    questions: [
      { q: 'What does the boy in Cairo do?', choices: ['Counts stars', 'Rides a train', 'Sings to a baby', 'Waves from a door'], type: 'detail', level: 1 },
      { q: 'Which animals does the moon see in the sand?', choices: ['Camels', 'Polar bears', 'Puppies', 'Fish'], type: 'detail', level: 1 },
      { q: 'Which word rhymes with "door"?', choices: ['four', 'stars', 'Mexico', 'moon'], type: 'craft', level: 2 },
      { q: 'In the poem, "beneath" means…', choices: ['under', 'above', 'beside', 'inside'], type: 'vocab', level: 2 },
      { q: 'What is the big idea of the poem?', choices: ['The same moon shines on people all over the world', 'The moon only shines on Tokyo', 'Trains are loud at night', 'Camels live in the snow'], type: 'theme', level: 3 },
    ],
    writePrompt: 'Write a new stanza: what does the moon see where you live?',
  },
  {
    id: 'k2-29',
    band: 'k2',
    genre: 'fiction',
    title: 'Peanut\'s Big Weekend',
    origin: ORIGINAL,
    text: `On Friday, Ms. Okafor handed Yuki a small cage. Inside, a round brown hamster blinked at her. "Peanut is yours for the weekend," said Ms. Okafor. "Take good care of him."

Yuki felt proud. At home, she gave Peanut fresh water, sunflower seeds, and a tiny slice of carrot. She even made him a tunnel out of a paper towel tube.

On Saturday morning, Yuki ran to say hello. The cage door was open. Peanut was gone!

"Mom!" Yuki cried. They searched under the couch, behind the bookshelf, and inside the toy box. No Peanut.

Yuki sat down on her bed, feeling awful. Then she heard a tiny rustle. It came from her fuzzy pink slipper. She peeked inside. There was Peanut, curled up in a ball, snoring softly.

Yuki laughed with relief. She checked the cage latch twice and clicked it shut.

On Monday, she told the class the whole story. "Peanut didn't run away," she said. "He just wanted a cozier bed!"`,
    focus: ['sequence', 'feelings', 'retell'],
    vocab: [
      ['proud', 'happy about something you did or were trusted to do'],
      ['searched', 'looked carefully for something'],
      ['rustle', 'a soft, crinkly sound'],
      ['relief', 'a calm, happy feeling after a worry ends'],
      ['latch', 'a small lock that keeps a door shut'],
    ],
    questions: [
      { q: 'Who is Peanut?', choices: ['The class hamster', 'Yuki\'s dog', 'Yuki\'s brother', 'A stuffed toy'], type: 'detail', level: 1 },
      { q: 'Where did Yuki find Peanut?', choices: ['In her slipper', 'Under the couch', 'In the toy box', 'Behind the bookshelf'], type: 'detail', level: 1 },
      { q: 'What did Yuki do after she found Peanut?', choices: ['Checked the cage latch twice', 'Called Ms. Okafor', 'Went to the park', 'Made a paper towel tunnel'], type: 'sequence', level: 2 },
      { q: 'In the story, "relief" means…', choices: ['a calm, happy feeling after a worry ends', 'a kind of snack', 'a loud noise', 'a cage door'], type: 'vocab', level: 2 },
      { q: 'Why did Yuki check the latch twice?', choices: ['She wanted to be sure Peanut could not get out again', 'She liked the clicking sound', 'Her mom was asleep', 'The latch was made of candy'], type: 'inference', level: 3 },
    ],
    writePrompt: 'Imagine you took Peanut home. Write what might happen at your house.',
  },
  {
    id: 'k2-30',
    band: 'k2',
    genre: 'informational',
    title: 'The Water Cycle',
    origin: ORIGINAL,
    text: `The water you drink today might once have been part of a cloud, an ocean, or even a dinosaur's puddle! That is because Earth's water moves in a never-ending loop called the water cycle.

It starts with the sun. The sun warms water in oceans, lakes, and rivers. Some of the water turns into a gas called water vapor and rises into the air. This step is called evaporation.

High in the sky, the air is cool. The water vapor cools and turns back into tiny drops. The drops gather together to make clouds. This step is called condensation.

When the drops in a cloud grow too big and heavy, they fall back to Earth as rain. If the air is very cold, they fall as snow, sleet, or hail. This step is called precipitation.

The water lands on the ground and flows into rivers, lakes, and oceans. Then the sun warms it again, and the cycle starts over.

You can see condensation at home. Fill a glass with ice water and wait. Tiny drops will form on the outside of the glass!`,
    focus: ['sequence', 'text-features', 'vocabulary'],
    vocab: [
      ['cycle', 'something that happens over and over in a loop'],
      ['vapor', 'water in the form of a gas you cannot see'],
      ['evaporation', 'when water warms up and turns into a gas'],
      ['condensation', 'when water vapor cools and turns into drops'],
      ['precipitation', 'water falling from clouds as rain, snow, sleet, or hail'],
    ],
    questions: [
      { q: 'What starts the water cycle?', choices: ['The sun warming water', 'Snow melting', 'Wind blowing', 'Rocks breaking'], type: 'detail', level: 1 },
      { q: 'What is it called when water falls from clouds?', choices: ['Precipitation', 'Evaporation', 'Condensation', 'Vapor'], type: 'detail', level: 1 },
      { q: 'What happens right after water vapor rises and cools?', choices: ['It turns into tiny drops and makes clouds', 'It falls as snow', 'It flows into rivers', 'It turns into ice cubes'], type: 'sequence', level: 2 },
      { q: 'In the text, a "cycle" is…', choices: ['something that happens over and over in a loop', 'a type of cloud', 'a big storm', 'a bicycle'], type: 'vocab', level: 2 },
      { q: 'Why does the author tell you about a glass of ice water?', choices: ['To show a way to see condensation at home', 'To tell you to drink more water', 'To explain how ice is made', 'To show how hail falls'], type: 'craft', level: 3 },
    ],
    writePrompt: 'Draw the water cycle as a circle with arrows. Label evaporation, condensation, and precipitation.',
  },
  {
    id: 'k2-31',
    band: 'k2',
    genre: 'biography',
    title: 'Mae Jemison Reaches for the Stars',
    origin: ORIGINAL,
    text: `When Mae Jemison was a little girl in Chicago, she loved to look up at the night sky. She wondered what it would be like to travel among the stars. Back then, she did not see any astronauts who looked like her. But Mae believed she could be one anyway.

Mae loved to learn. She read books about science and space. She also loved to dance. When she was only sixteen, she went to college at Stanford University.

Later, Mae became a doctor. She worked as a doctor in West Africa, helping people in Sierra Leone and Liberia stay healthy.

Then Mae followed her biggest dream. In 1987, she joined NASA and trained to be an astronaut. In 1992, she flew into space on the space shuttle Endeavour. She became the first African American woman to travel to space. During the trip, she did science experiments as the shuttle circled Earth.

Today, Mae Jemison encourages kids, especially girls, to study science. She wants every child to know that their dreams matter.`,
    focus: ['sequence', 'main-idea', 'key-details'],
    vocab: [
      ['astronauts', 'people who travel into space'],
      ['trained', 'practiced to get ready for a job'],
      ['shuttle', 'a spaceship that could fly to space and come back many times'],
      ['experiments', 'tests scientists do to learn something'],
      ['encourages', 'gives someone hope and support to try'],
    ],
    questions: [
      { q: 'Where did Mae grow up?', choices: ['Chicago', 'Kenya', 'Tokyo', 'Mexico City'], type: 'detail', level: 1 },
      { q: 'What did Mae fly into space on?', choices: ['The space shuttle Endeavour', 'A hot air balloon', 'A jet plane', 'A rocket to the moon'], type: 'detail', level: 1 },
      { q: 'What did Mae do before she became an astronaut?', choices: ['She worked as a doctor', 'She walked on the moon', 'She built a shuttle', 'She flew planes for an airline'], type: 'sequence', level: 2 },
      { q: 'In the text, "encourages" means…', choices: ['gives someone hope and support to try', 'stops someone from trying', 'laughs at someone', 'hides from someone'], type: 'vocab', level: 2 },
      { q: 'What is the main idea of this text?', choices: ['Mae worked hard and reached her dream of going to space', 'Chicago has a dark night sky', 'Dancing is fun', 'Space shuttles are very big'], type: 'main-idea', level: 3 },
    ],
    writePrompt: 'What is a big dream you have? Write two steps you could take to reach it.',
  },
  {
    id: 'k2-32',
    band: 'k2',
    genre: 'fiction',
    title: 'Change the Plan',
    origin: ORIGINAL,
    text: `Diego and Amara had a plan. They would sell lemonade and use the money to buy a new soccer ball for the park.

They made a sign with big yellow letters: LEMONADE, 50 CENTS. They squeezed twenty lemons and stirred in sugar. Then they set up a table on the corner.

There was just one problem. It was chilly and windy, and people hurried past in thick coats.

"Nobody wants a cold drink today," Amara sighed, rubbing her hands together.

Diego looked at the gray sky. Then he grinned. "What if we sell something warm?"

They raced inside. With help from Diego's dad, they heated milk and stirred in cocoa. Amara flipped the sign over and wrote: HOT COCOA, 50 CENTS.

Soon a line stretched down the sidewalk. Mrs. Patel bought two cups. The mail carrier bought one. Even a jogger stopped to warm up.

By the end of the day, they had enough for the soccer ball, with a little left over.

"Good thinking," said Amara.

Diego smiled. "Sometimes you change the plan, not the goal."`,
    focus: ['lesson', 'cause-effect', 'character'],
    vocab: [
      ['chilly', 'a little cold'],
      ['hurried', 'moved quickly'],
      ['stretched', 'reached out long'],
      ['goal', 'something you want to get or do'],
    ],
    questions: [
      { q: 'Why did Diego and Amara want to make money?', choices: ['To buy a new soccer ball for the park', 'To buy a bike', 'To go to the movies', 'To buy more lemons'], type: 'detail', level: 1 },
      { q: 'What did they sell in the end?', choices: ['Hot cocoa', 'Lemonade', 'Cookies', 'Ice cream'], type: 'detail', level: 1 },
      { q: 'What did they do right after Diego had his idea?', choices: ['Raced inside to make hot cocoa', 'Went home to sleep', 'Bought the soccer ball', 'Made a lemonade sign'], type: 'sequence', level: 2 },
      { q: 'In the story, "chilly" means…', choices: ['a little cold', 'very hot', 'very loud', 'very wet'], type: 'vocab', level: 2 },
      { q: 'What lesson does the story teach?', choices: ['When something isn\'t working, try a new way to reach your goal', 'Lemonade is better than cocoa', 'Never sell things outside', 'Soccer is the best sport'], type: 'theme', level: 3 },
    ],
    writePrompt: 'Write about a time your plan did not work. What did you try instead?',
  },
  {
    id: 'k2-33',
    band: 'k2',
    genre: 'folktale',
    title: 'Fionn and the Giant\'s Causeway',
    origin: 'Folktale retold — Ireland',
    text: `Long ago in Ireland lived a giant named Fionn mac Cumhaill. Fionn was big and strong, but across the sea in Scotland lived a giant who was even bigger. His name was Benandonner.

The two giants shouted rude names across the water. Fionn grew so cross that he tore up rocks and tossed them into the sea, making a stone path all the way to Scotland. "Come over and face me!" he bellowed.

But when Fionn saw Benandonner stomping across the path, his knees shook. That giant was enormous!

Fionn ran home to his clever wife, Oonagh. "Quick," she said. "Get into this cradle." She dressed Fionn in a baby's bonnet and tucked a blanket around him.

Benandonner pounded on the door. "Where is Fionn?"

"He is out," said Oonagh sweetly. "But come meet our baby."

Benandonner peered into the cradle at the giant baby. His eyes grew wide. "If the baby is this big," he gasped, "how big is the father?"

Benandonner ran back to Scotland, tearing up the stone path behind him.

Today, you can still see the leftover stones along the coast of Northern Ireland. People call them the Giant's Causeway.`,
    focus: ['character', 'cause-effect', 'retell'],
    vocab: [
      ['bellowed', 'shouted in a deep, loud voice'],
      ['enormous', 'very, very big'],
      ['cradle', 'a small bed for a baby'],
      ['peered', 'looked closely'],
      ['coast', 'the land along the edge of the sea'],
    ],
    questions: [
      { q: 'Who was Fionn\'s wife?', choices: ['Oonagh', 'Benandonner', 'Brigid', 'Saoirse'], type: 'detail', level: 1 },
      { q: 'Where did Benandonner live?', choices: ['Scotland', 'Ireland', 'Wales', 'Japan'], type: 'detail', level: 1 },
      { q: 'What did Oonagh do after Fionn ran home?', choices: ['Dressed him as a baby in a cradle', 'Sent him to Scotland', 'Hid him under the bed', 'Called the other giants'], type: 'sequence', level: 2 },
      { q: 'In the story, "enormous" means…', choices: ['very, very big', 'very tiny', 'very fast', 'very quiet'], type: 'vocab', level: 2 },
      { q: 'Why did Benandonner run away?', choices: ['He thought Fionn must be huge if his baby was that big', 'He was hungry', 'Oonagh chased him', 'The path was sinking'], type: 'inference', level: 3 },
    ],
    writePrompt: 'Oonagh solved the problem with a clever trick. Draw the trick and write how it worked.',
  },
  {
    id: 'k2-34',
    band: 'k2',
    genre: 'informational',
    title: 'Sunflowers Follow the Sun',
    origin: ORIGINAL,
    text: `Sunflowers can grow taller than a grown-up. Some reach more than ten feet high! But what makes these plants really special is the way they move.

Young sunflowers follow the sun. In the morning, their buds face east, where the sun rises. All day, they slowly turn to follow it across the sky. By evening, they face west. At night, they turn back east to wait for the sunrise.

When a sunflower is fully grown, it stops moving. Most grown sunflowers face east, toward the morning sun.

Here is a surprise: a sunflower head is not just one flower. It is made of hundreds of tiny flowers packed together. Each tiny flower in the middle can become a seed. The seeds grow in spiral patterns, like swirls.

Sunflowers first grew in North America. Native American people grew them for food thousands of years ago. Today, people still eat sunflower seeds and press them to make oil. Birds and bees love sunflowers too!`,
    focus: ['main-idea', 'key-details', 'sequence'],
    vocab: [
      ['buds', 'flowers that have not opened yet'],
      ['sunrise', 'the time when the sun comes up'],
      ['packed', 'pressed close together'],
      ['spiral', 'a curving shape that winds around and around'],
    ],
    questions: [
      { q: 'Which way do young sunflowers face in the morning?', choices: ['East', 'West', 'North', 'Down at the ground'], type: 'detail', level: 1 },
      { q: 'What is a sunflower head made of?', choices: ['Hundreds of tiny flowers', 'One big petal', 'Leaves', 'Roots'], type: 'detail', level: 1 },
      { q: 'In the text, "spiral" means…', choices: ['a curving shape that winds around and around', 'a straight line', 'a square box', 'a tall stem'], type: 'vocab', level: 2 },
      { q: 'What happens when a sunflower is fully grown?', choices: ['It stops moving', 'It turns all night long', 'It gets shorter', 'It turns into a tree'], type: 'inference', level: 2 },
      { q: 'What is the main idea of this text?', choices: ['Sunflowers are special plants that move and hold many seeds', 'Birds eat seeds', 'The sun rises in the east', 'Oil comes from plants'], type: 'main-idea', level: 3 },
    ],
    writePrompt: 'Draw a young sunflower in the morning and in the evening. Use arrows to show which way it faces.',
  },
  {
    id: 'k2-35',
    band: 'k2',
    genre: 'fiction',
    title: 'A Ball and a Smile',
    origin: ORIGINAL,
    text: `On Monday, a new girl named Lin joined Room 12. She had just moved from China, and she did not speak much English yet. At recess, she sat alone on the bench, swinging her feet.

Amira remembered her own first day. She had moved from Egypt last year, and the words around her had sounded like a fast, buzzing radio. She remembered how lonely that felt.

Amira walked over and sat down. She smiled and pointed to herself. "Amira," she said.

The girl smiled back. "Lin."

Amira pulled out a notebook and drew a ball. Then she drew two stick girls kicking it. She raised her eyebrows, like a question.

Lin's face lit up. She nodded fast. They raced to the field and kicked the ball back and forth until the bell rang.

Each day, they traded words. Amira taught Lin "goal" and "pass." Lin taught Amira how to say "friend" in Chinese: péngyou.

By Friday, Lin was laughing with the whole class. Amira knew that a ball and a smile can say a lot, even before you have all the words.`,
    focus: ['character', 'feelings', 'lesson'],
    vocab: [
      ['recess', 'a break in the school day for play'],
      ['lonely', 'sad because you are alone'],
      ['eyebrows', 'the lines of hair above your eyes'],
      ['traded', 'gave something and got something back'],
    ],
    questions: [
      { q: 'Where did Lin move from?', choices: ['China', 'Egypt', 'Mexico', 'Kenya'], type: 'detail', level: 1 },
      { q: 'How did Amira ask Lin to play?', choices: ['She drew a picture in her notebook', 'She shouted across the field', 'She asked the teacher', 'She sent a letter'], type: 'detail', level: 1 },
      { q: 'Why did Amira go sit with Lin?', choices: ['She remembered how lonely her own first day felt', 'The teacher told her to', 'She wanted Lin\'s notebook', 'She did not like recess'], type: 'inference', level: 2 },
      { q: 'In the story, "traded" means…', choices: ['gave something and got something back', 'lost', 'threw away', 'hid'], type: 'vocab', level: 2 },
      { q: 'What is the theme of the story?', choices: ['Kindness and play can bring people together, even without many words', 'Recess is too short', 'Notebooks are only for drawing', 'Moving is always easy'], type: 'theme', level: 3 },
    ],
    writePrompt: 'How could you help a new student feel welcome? Write three ideas.',
  },
  {
    id: 'k2-36',
    band: 'k2',
    genre: 'informational',
    title: 'How Shadows Work',
    origin: ORIGINAL,
    text: `Go outside on a sunny day and look down. A dark shape follows you everywhere. It is your shadow!

A shadow forms when something blocks light. Light travels in straight lines. When light hits your body, it cannot pass through you, so a dark area forms on the other side. That dark area is your shadow.

Things that block light, like people, trees, and rocks, are called opaque. Clear things, like a window, let most light pass through, so they make only faint shadows.

Shadows change during the day. In the morning and evening, the sun is low in the sky, so shadows are long and stretched. At noon, the sun is high overhead, so shadows are short. Long ago, people used these changing shadows to tell time with a tool called a sundial.

You can make shadows indoors too. Shine a flashlight at a wall and hold your hands in front of it. Can you make a bird, a dog, or a bunny? The closer your hands get to the light, the bigger the shadow grows!`,
    focus: ['cause-effect', 'key-details', 'author-purpose'],
    vocab: [
      ['blocks', 'stops something from getting through'],
      ['opaque', 'not letting light pass through'],
      ['faint', 'very light and hard to see'],
      ['overhead', 'up above your head'],
      ['sundial', 'a tool that uses a shadow to tell time'],
    ],
    questions: [
      { q: 'What makes a shadow?', choices: ['Something blocking light', 'Rain falling', 'Wind blowing', 'Water drying'], type: 'detail', level: 1 },
      { q: 'When are shadows shortest?', choices: ['At noon', 'In the morning', 'In the evening', 'At sunrise'], type: 'detail', level: 1 },
      { q: 'In the text, "opaque" means…', choices: ['not letting light pass through', 'very shiny', 'see-through', 'very soft'], type: 'vocab', level: 2 },
      { q: 'Why are shadows long in the evening?', choices: ['The sun is low in the sky', 'The sun is high overhead', 'People grow taller at night', 'Clouds stretch them'], type: 'inference', level: 2 },
      { q: 'Why does the author tell you to shine a flashlight at a wall?', choices: ['To give you a way to test shadows yourself', 'To tell a story about animals', 'To show that flashlights are better than the sun', 'To explain how a sundial works'], type: 'craft', level: 3 },
    ],
    writePrompt: 'Trace your shadow or a friend\'s with chalk at two times of day. Write how it changed.',
  },
];
