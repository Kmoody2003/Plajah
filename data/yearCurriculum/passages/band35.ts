// Reading passages, band 3–5 (Grades 3–5). 36 passages on a length ladder:
//   35-01..35-12 Grade 3 (180–300 words) · 35-13..35-24 Grade 4 (250–380) · 35-25..35-36 Grade 5 (320–450).
// All original writing; folktales and myths are retold in our own words.

import type { Passage, PassageQuestion } from '../../../services/yearCurriculum/types';

const ORIG = 'Original — Plajah Academia';
const Q = (q: string, choices: string[], type: PassageQuestion['type'], level: 1 | 2 | 3): PassageQuestion => ({ q, choices, type, level });

export const PASSAGES_35: Passage[] = [
  // ── Grade 3 ────────────────────────────────────────────────────────────────
  {
    id: '35-01',
    band: '35',
    genre: 'fiction',
    title: "Amara's Sky Garden",
    origin: ORIG,
    text: `Amara lived on the fourth floor of a tall apartment building in Lagos, Nigeria. There was no yard, only a narrow balcony with a rusty railing. Still, Amara wanted a garden more than anything.

"Where will you plant it?" asked her brother Tunde. "In the sky?"

Amara did not answer. She collected old paint buckets from her uncle's shop and washed them until they shone. She poked holes in the bottom of each one so extra water could drain out. Then she filled them with soil from the market and pressed tiny tomato seeds into the dirt.

Every morning before school, Amara watered the buckets. For a week, nothing happened. Tunde laughed. "Your sky garden is just a sky mud pile."

Amara felt her face grow hot, but she kept watering. On the ninth day, she spotted a tiny green loop pushing up through the soil. By the end of the month, the balcony was crowded with leaves. Amara tied the stems to the railing with strips of cloth so they would not droop.

When the first tomatoes turned red, Mama sliced them into the evening stew. Tunde took a big spoonful and closed his eyes.

"These are the best tomatoes I have ever tasted," he admitted.

Amara grinned. "That is because they were grown in the sky."

The next week, Tunde showed up at the balcony door holding an empty bucket. "Can you show me how to plant peppers?" he asked.`,
    focus: ['character', 'theme', 'plot'],
    vocab: [
      ['railing', 'a bar or fence along the edge of a balcony or stairs'],
      ['drain', 'to flow away'],
      ['spotted', 'saw or noticed'],
      ['droop', 'to hang down loosely'],
      ['admitted', 'said something was true, even though it was hard to say'],
    ],
    questions: [
      Q('Why did Amara poke holes in the bottom of the buckets?', ['So extra water could drain out', 'So the seeds could breathe', 'So she could hang them on the railing', 'So the buckets would be lighter to carry'], 'detail', 1),
      Q("What does the word 'droop' mean in the story?", ['To hang down loosely', 'To grow taller', 'To turn red', 'To dry out'], 'vocab', 2),
      Q('Which event happened FIRST?', ['Amara washed the old paint buckets', 'Amara spotted a green loop in the soil', 'Mama sliced the tomatoes into the stew', 'Tunde asked how to plant peppers'], 'sequence', 2),
      Q("How does Tunde's attitude change from the beginning to the end?", ['He goes from teasing Amara to wanting to learn from her', 'He goes from helping Amara to ignoring her', 'He goes from loving tomatoes to disliking them', 'He goes from being shy to being bossy'], 'inference', 3),
      Q('Which lesson does the story teach best?', ['Patience and hard work can make something grow, even in a small space', 'You need a big yard to grow food', 'Older brothers are always right', 'Tomatoes only grow in paint buckets'], 'theme', 3),
    ],
    writePrompt: 'Continue the story: write what happens when Amara teaches Tunde to plant peppers. Use details from the story about how Amara made her own garden.',
  },
  {
    id: '35-02',
    band: '35',
    genre: 'informational',
    title: 'How Bees Make Honey',
    origin: ORIG,
    text: `## Busy Workers
A honeybee hive can be home to tens of thousands of bees. Most of them are worker bees. Worker bees are all female, and they have many jobs, from cleaning the hive to guarding the door. One of their most important jobs is making honey.

## From Flower to Hive
Honey begins as nectar, a sweet liquid found inside flowers. A worker bee lands on a flower and sips the nectar through her long, straw-like tongue. She stores it in a special pouch called a honey stomach. A bee may visit hundreds of flowers before her honey stomach is full. Then she flies home.

## Turning Nectar into Honey
Back at the hive, the forager bee passes the nectar to younger house bees. The house bees pass it from bee to bee, mixing in substances from their bodies that change the nectar. Next, they spread it into tiny six-sided wax rooms called cells. Nectar is very watery, so the bees fan their wings over the cells. The moving air helps the extra water evaporate. Slowly, the nectar thickens into honey. When it is ready, the bees seal each cell with a cap of wax.

## Small Bee, Big Job
One worker bee makes only about one-twelfth of a teaspoon of honey in her whole life. That is why a hive needs so many bees working together. As they fly from flower to flower, bees also carry pollen, which helps plants make seeds and fruit.`,
    focus: ['main-idea', 'text-features', 'text-structure'],
    vocab: [
      ['nectar', 'a sweet liquid found inside flowers'],
      ['forager', 'a bee that flies out to collect food'],
      ['evaporate', 'to change from a liquid into a gas and go into the air'],
      ['thickens', 'becomes less runny'],
      ['pollen', 'a fine yellow powder that helps plants make seeds'],
    ],
    questions: [
      Q('Where does a worker bee store nectar while she is flying?', ['In her honey stomach', 'In her wings', 'In a wax cell on the flower', 'On her back legs'], 'detail', 1),
      Q("In the section 'Turning Nectar into Honey,' what does 'evaporate' mean?", ['To change from a liquid into a gas and go into the air', 'To freeze into ice', 'To turn sweet', 'To mix with wax'], 'vocab', 2),
      Q('Which heading would help you find out how much honey one bee makes?', ['Small Bee, Big Job', 'Busy Workers', 'From Flower to Hive', 'Turning Nectar into Honey'], 'craft', 2),
      Q('What happens right AFTER the house bees spread nectar into the cells?', ['They fan their wings to dry it out', 'The forager sips nectar from a flower', 'The forager flies back to the hive', 'The house bees pass it from bee to bee'], 'sequence', 3),
      Q('What is the main idea of the whole text?', ['Worker bees turn flower nectar into honey through many steps and lots of teamwork', 'Bees are dangerous insects that guard their hives', 'Honey tastes sweet because flowers are sweet', 'A hive has only a few bees in it'], 'main-idea', 3),
    ],
    writePrompt: 'Explain, in your own words, the steps bees take to turn nectar into honey. Use at least three details from the text and words like first, next and finally.',
  },
  {
    id: '35-03',
    band: '35',
    genre: 'folktale',
    title: 'Anansi and the Pot of Wisdom',
    origin: 'Folktale retold — Ashanti, Ghana',
    text: `Long ago in the land of the Ashanti, Kwaku Anansi the spider decided he wanted to be the wisest creature in the world. So he went around gathering every bit of wisdom he could find. He collected the wisdom of the farmers, the weavers, the healers and the storytellers, and he sealed it all inside a large clay pot.

"Now all the wisdom belongs to me," Anansi said with a sly smile. "No one else will ever be clever again."

But Anansi worried that someone might steal his treasure. He decided to hide the pot at the very top of the tallest tree in the forest. He tied the pot to his belly with a vine and began to climb.

The pot bumped against the trunk. It swung against his legs. Anansi slipped and slid, again and again, but he could not climb any higher.

His young son, Ntikuma, had been watching from below. "Father," he called, "why don't you tie the pot on your back? Then you could hold the tree with all your legs."

Anansi stopped. His face grew warm. He had gathered all the wisdom in the world, yet a small child had just solved his problem!

In his surprise, Anansi let go of the pot. It tumbled down and smashed on a rock. The wind carried the wisdom away, scattering tiny pieces across the land.

That is why, the Ashanti say, no one person owns all the wisdom in the world. Everyone has a little, and we share it when we listen to one another.`,
    focus: ['theme', 'character', 'cause-effect'],
    vocab: [
      ['gathering', 'collecting things together'],
      ['sly', 'sneaky and tricky'],
      ['treasure', 'something very valuable'],
      ['tumbled', 'fell over and over'],
      ['scattering', 'spreading things in many directions'],
    ],
    questions: [
      Q('Where did Anansi try to hide the pot?', ['At the top of the tallest tree', 'Under a big rock', 'At the bottom of a river', 'Inside his house'], 'detail', 1),
      Q('Which sentence shows that Anansi wanted to keep the wisdom for himself?', ['"No one else will ever be clever again."', 'His young son, Ntikuma, had been watching from below.', 'The pot bumped against the trunk.', 'Everyone has a little.'], 'evidence', 2),
      Q("The word 'sly' describes Anansi's smile. What does 'sly' mean?", ['Sneaky and tricky', 'Sad and tired', 'Kind and gentle', 'Scared and nervous'], 'vocab', 2),
      Q("Why did Anansi's face grow warm when Ntikuma spoke?", ['He felt embarrassed that a child solved a problem he could not', 'He was tired from climbing', 'The sun was very hot in the tree', 'He was angry that his son was awake'], 'inference', 3),
      Q('What is the lesson of this folktale?', ['No one has all the wisdom, so we should share and listen to others', 'Spiders are the best climbers', 'Always hide your treasures in tall trees', 'Children should not give advice to adults'], 'theme', 3),
    ],
    writePrompt: 'Do you think Anansi learned his lesson? Write your opinion and support it with two details from the folktale.',
  },
  {
    id: '35-04',
    band: '35',
    genre: 'fiction',
    title: 'The Case of the Missing Bird Book',
    origin: ORIG,
    text: `On Monday morning, the bird book was missing from the shelf in Room 12.

"Who took it?" asked Mateo. He was the class librarian, and it was his job to keep track of every book. He checked the sign-out sheet on the clipboard. No one had written down the bird book.

Mateo pulled out his notebook and became a detective. He found three clues. First, there were seeds scattered on the floor near the window. Second, the window blinds were open, even though they were always closed on weekends. Third, the new girl, Lucía, kept staring out that window.

"Lucía took it," whispered his friend Diego. "She's always looking outside."

Mateo frowned. A good detective does not guess. He needed proof.

At recess, Mateo walked over to Lucía. She was kneeling under the window, holding the bird book open on her lap.

"There's a nest on the ledge," she said quietly, pointing. "Two little hummingbirds. I put seeds out, but the book says hummingbirds drink nectar, not seeds. I wanted to find out what kind they are."

"But you didn't sign the book out," Mateo said.

Lucía looked confused. "I did, on Friday."

Mateo checked the clipboard again. Then he looked behind the desk. There, on the floor, was a fallen page of the sign-out sheet with Lucía's neat handwriting at the top.

Mateo smiled and closed his notebook. "Case solved," he said. "Can I see the hummingbirds too?"`,
    focus: ['plot', 'inference', 'character'],
    vocab: [
      ['detective', 'a person who solves mysteries by looking for clues'],
      ['scattered', 'spread around in different places'],
      ['proof', 'facts that show something is true'],
      ['ledge', 'a narrow, flat shelf on the outside of a window or wall'],
      ['confused', 'not able to understand what is happening'],
    ],
    questions: [
      Q('What was missing from Room 12?', ['The bird book', 'The clipboard', "Mateo's notebook", 'A hummingbird nest'], 'detail', 1),
      Q('Which clue made Diego blame Lucía?', ['She was always looking out the window', 'She had seeds in her pocket', 'She told him she took the book', 'Her name was missing from the clipboard'], 'evidence', 2),
      Q("Mateo needed 'proof.' What does proof mean?", ['Facts that show something is true', 'A guess about what happened', 'A list of library books', 'A secret message'], 'vocab', 2),
      Q("Why does Mateo think, 'A good detective does not guess'?", ['He wants real evidence before he blames someone', 'He does not like Diego', 'He already knows where the book is', 'He thinks detectives should be quiet'], 'inference', 3),
      Q("What lesson does Mateo's investigation show?", ['Find out the facts before you blame someone', 'New students cause problems', 'Books should never leave the shelf', 'Hummingbirds like to eat seeds'], 'theme', 3),
    ],
    writePrompt: 'Was Mateo a good detective? Write your opinion and use at least two details from the story to support it.',
  },
  {
    id: '35-05',
    band: '35',
    genre: 'informational',
    title: 'The Amazing Amazon River',
    origin: ORIG,
    text: `## A Giant of South America
The Amazon River flows across the continent of South America. It begins as tiny streams high in the Andes Mountains of Peru. From there, it travels east for about 4,000 miles (6,400 kilometers) until it reaches the Atlantic Ocean in Brazil. It is one of the two longest rivers in the world, along with the Nile River in Africa.

## More Water Than Any Other River
The Amazon carries more water than any other river on Earth. More than a thousand smaller rivers, called tributaries, flow into it. About one-fifth of all the river water that pours into the world's oceans comes from the Amazon. During the rainy season, the river spills over its banks and floods the forest for miles.

## Life in the River
The Amazon is home to amazing animals. Pink river dolphins hunt for fish in the muddy water. Giant otters, as long as a grown-up person, swim in family groups. Piranhas with sharp teeth dart between the roots of flooded trees.

## The Rainforest Around It
The river runs through the Amazon rainforest, the largest tropical rainforest in the world. Huge numbers of different insects, plants and animals live there. Many people live along the river, too. For them, the river is a road. Boats carry people, food and goods from town to town, because there are no bridges across the main river.`,
    focus: ['main-idea', 'key-details', 'text-features'],
    vocab: [
      ['continent', 'one of the seven very large areas of land on Earth'],
      ['tributaries', 'smaller rivers that flow into a bigger river'],
      ['spills', 'flows over the edge'],
      ['tropical', 'from the hot, rainy part of the world near the equator'],
      ['goods', 'things that people buy, sell or trade'],
    ],
    questions: [
      Q('Where does the Amazon River begin?', ['In the Andes Mountains of Peru', 'In the Atlantic Ocean', 'In the Nile River', 'In the middle of Brazil'], 'detail', 1),
      Q("What are 'tributaries'?", ['Smaller rivers that flow into a bigger river', 'Bridges across a river', 'Fish that live in rivers', 'Floods in the rainy season'], 'vocab', 2),
      Q('Under which heading would you read about pink river dolphins?', ['Life in the River', 'A Giant of South America', 'More Water Than Any Other River', 'The Rainforest Around It'], 'craft', 2),
      Q("Why is the river like a 'road' for the people who live along it?", ['There are no bridges across the main river, so boats carry people and goods', 'Cars are not allowed in Brazil', 'The river freezes so people can walk on it', 'Boats are faster than airplanes'], 'inference', 3),
      Q('Which sentence best states the main idea of the text?', ['The Amazon is a huge river full of water and life that is important to the people and animals around it', 'Pink dolphins live in the Amazon', 'The Amazon floods during the rainy season', 'The Nile River is in Africa'], 'main-idea', 3),
    ],
    writePrompt: 'Write a short informative paragraph explaining why the Amazon River is important. Use at least three facts from different sections of the text.',
  },
  {
    id: '35-06',
    band: '35',
    genre: 'poetry',
    title: 'A Year of Haiku',
    origin: ORIG,
    text: `A haiku is a short poem that first came from Japan. A traditional haiku has three lines. The first line has five syllables, the second has seven, and the third has five. Haiku poets often write about nature and the seasons, and they try to capture one small moment, like a photograph made of words. Read these haiku slowly, one season at a time. Picture each moment in your mind.

## Spring
Cherry petals fall
onto Grandma's umbrella
pink rain without sound

Mud puddle mirror
a robin bends down to drink
and drinks the whole sky

## Summer
Hot sidewalk at noon
my ice pop races the sun
the sun is winning

Tiny green lanterns
blinking over the rice field
the night is talking

## Autumn
One red maple leaf
rides the wind like a small kite
then lands on my shoe

Geese write a long V
across the gray chalkboard sky
I read it: goodbye

## Winter
First snow on the roof
our whole street is a blank page
waiting for footprints

Breath clouds in the cold
my little brother pretends
he is a dragon`,
    focus: ['figurative-language', 'text-structure', 'compare'],
    vocab: [
      ['syllables', 'the beats or parts of a word you hear when you say it'],
      ['capture', 'to catch and hold on to'],
      ['mirror', 'a smooth surface that shows a reflection'],
      ['lanterns', 'lights that are carried or hung up'],
      ['pretends', 'acts as if something is true when it is not'],
    ],
    questions: [
      Q('How many syllables are in the first line of a traditional haiku?', ['Five', 'Seven', 'Three', 'Ten'], 'detail', 1),
      Q('In the second autumn haiku, what is the sky compared to?', ['A chalkboard', 'A mirror', 'A blank page', 'An umbrella'], 'craft', 2),
      Q("Why does the poet call the mud puddle a 'mirror'?", ['The sky is reflected in the water', 'The puddle is made of glass', 'The robin is looking for a friend', 'The puddle is frozen'], 'craft', 2),
      Q("In the summer haiku 'Tiny green lanterns,' what are the lanterns most likely?", ['Fireflies', 'Rice plants', 'Street lights', 'Ice pops'], 'inference', 3),
      Q('How are the winter haiku different from the summer haiku?', ['The winter haiku describe snow and cold breath, while the summer haiku describe heat and warm nights', 'The winter haiku have more syllables', 'The summer haiku are about snow', 'The winter haiku do not describe nature at all'], 'compare', 3),
    ],
    writePrompt: 'Choose a season and write your own haiku with five, seven and five syllables. Then explain which haiku in this set inspired you and why.',
  },
  {
    id: '35-07',
    band: '35',
    genre: 'fiction',
    title: 'Pip, the Smallest Cloud',
    origin: ORIG,
    text: `High above the dry fields of Rajasthan, in India, floated a cloud named Pip. Pip was the smallest cloud in the whole sky. The big storm clouds rumbled and boomed, but when Pip tried to rumble, only a tiny squeak came out.

Below Pip, a girl named Meera carried a heavy clay pot from the well to her family's field of millet. The plants were thin and brown. Every day, Meera looked up at the sky and hoped for rain.

"I want to help her," Pip told the wind.

The wind chuckled. "You? You can barely make a drizzle."

Pip squeezed as hard as it could. Three drops fell. One landed on a rock, one landed on a goat, and one landed on Meera's nose. Meera laughed, but the field stayed dry.

Pip drifted away, feeling gloomy. Then Pip noticed other small clouds dotted across the sky, each one too little to matter on its own.

"Friends!" Pip called. "If we squeeze together, maybe we can make real rain!"

One by one, the little clouds floated closer. They bumped and joined until they became one wide, gray cloud. Pip took a deep breath, and this time, instead of a squeak, there was a soft rumble.

Rain poured down on the field. Meera set down her pot and danced as the millet drank and drank.

From then on, whenever Meera saw small clouds gathering, she would wave. She was sure one of them was waving back.`,
    focus: ['theme', 'plot', 'character'],
    vocab: [
      ['rumbled', 'made a deep, rolling sound'],
      ['millet', 'a grain plant grown for food'],
      ['drizzle', 'light rain with tiny drops'],
      ['drifted', 'moved slowly, carried by air or water'],
      ['gloomy', 'sad and without hope'],
    ],
    questions: [
      Q("What problem did Meera's family have?", ['Their millet field was dry', 'Their goat was lost', 'Their well was broken', 'Their house had no roof'], 'detail', 1),
      Q("The wind says Pip can 'barely make a drizzle.' What is a drizzle?", ['Light rain with tiny drops', 'A loud thunderstorm', 'A strong wind', 'A big puddle'], 'vocab', 2),
      Q('What did Pip do right after drifting away feeling gloomy?', ['Noticed other small clouds and called to them', 'Squeezed out three drops', 'Talked to the wind', 'Rained on a goat'], 'sequence', 2),
      Q('Why was Pip able to rumble at the end of the story?', ['Pip had joined with other clouds and become bigger', 'The wind gave Pip a new voice', 'Meera sang to Pip', 'Pip waited for a storm cloud to leave'], 'inference', 3),
      Q('Which saying best fits the theme of the story?', ['Many small helpers together can do something big', 'The biggest one always wins', 'Never ask anyone for help', 'Rain only falls on lucky farms'], 'theme', 3),
    ],
    writePrompt: 'Write a new adventure for Pip and the cloud friends. What problem do they solve together? Use what you learned about Pip from the story.',
  },
  {
    id: '35-08',
    band: '35',
    genre: 'informational',
    title: 'Why Do Leaves Change Color?',
    origin: ORIG,
    text: `## Green All Summer
In spring and summer, the leaves of many trees are bright green. The green color comes from chlorophyll, a substance inside leaves. Chlorophyll helps a tree use sunlight, water and air to make its own food. This process is called photosynthesis. While a tree is busy making food, its leaves are packed with chlorophyll, so they look green.

## Shorter Days, Cooler Nights
In autumn, the days grow shorter and the nights grow cooler. Trees sense this change. Many trees slowly stop making chlorophyll and get ready to rest for the winter. As the chlorophyll breaks down, the green color fades away.

## Hidden Colors Appear
Here is the surprising part. Yellow and orange colors were inside the leaves all summer long! The strong green simply covered them up, the way a thick coat of paint hides the color beneath it. When the green disappears, the yellows and oranges finally show.

Some trees, such as many maples, also make new red and purple colors in the fall. These colors are often brightest when autumn has sunny days and cool nights.

## Letting Go
Before winter, the tree grows a thin layer of cells where each leaf stem meets the branch. This layer slowly cuts the leaf off. Soon a breeze shakes it loose, and the leaf drifts to the ground. Evergreen trees, like pines, keep their needles because the needles have a waxy coating that helps them survive the cold.`,
    focus: ['cause-effect', 'text-features', 'main-idea'],
    vocab: [
      ['chlorophyll', 'the green substance in leaves that helps plants make food'],
      ['photosynthesis', 'the way plants use sunlight, water and air to make food'],
      ['sense', 'to notice or feel'],
      ['fades', 'slowly becomes less bright'],
      ['coating', 'a thin layer that covers something'],
    ],
    questions: [
      Q('What gives leaves their green color?', ['Chlorophyll', 'Sunlight', 'Rain', 'Wax'], 'detail', 1),
      Q("The text says the green color 'fades away.' What does fades mean?", ['Slowly becomes less bright', 'Grows much stronger', 'Turns into water', 'Falls off the tree'], 'vocab', 2),
      Q("Why does the author compare chlorophyll to 'a thick coat of paint'?", ['To show how the green hides the yellow and orange colors underneath', 'To explain how people paint leaves', 'To show that leaves are made of paint', 'To describe how leaves feel'], 'craft', 2),
      Q('Which detail best explains WHY yellow leaves appear in autumn?', ['As the chlorophyll breaks down, the green color fades away', 'Evergreen trees keep their needles', 'Chlorophyll helps a tree use sunlight', 'A breeze shakes the leaf loose'], 'evidence', 3),
      Q('What is the main idea of the text?', ['Leaves change color because trees stop making green chlorophyll in autumn, letting other colors show', 'Maple trees are the most colorful trees', 'All trees lose their leaves in winter', 'Photosynthesis only happens at night'], 'main-idea', 3),
    ],
    writePrompt: 'Explain to a younger child why leaves change color in autumn. Use the words chlorophyll and photosynthesis and at least two details from the text.',
  },
  {
    id: '35-09',
    band: '35',
    genre: 'biography',
    title: 'Wangari Maathai: The Woman Who Planted Trees',
    origin: ORIG,
    text: `Wangari Maathai was born in 1940 in a small village in the green hills of central Kenya. As a girl, she loved to sit by a stream near her home. Her mother told her that a large fig tree nearby was special and must never be cut down. The roots of the tree held the soil together, and clear water bubbled up nearby.

Wangari was a curious student who worked hard. She earned a scholarship to study science in the United States. Later, she returned to Kenya and became the first woman in East and Central Africa to earn a doctorate, the highest degree a university gives.

When Wangari visited the countryside, she was troubled by what she saw. Many forests had been cut down. Streams were drying up, and families had to walk farther and farther to find firewood and clean water. Wangari believed that planting trees could help.

In 1977, she started the Green Belt Movement. She taught women in villages how to grow tree seedlings and plant them. The women were paid a small amount for each young tree that survived. Over the years, the movement planted millions of trees across Kenya.

The work was not always easy. Some powerful people did not like Wangari speaking up, but she kept going.

In 2004, Wangari Maathai won the Nobel Peace Prize. She was the first African woman ever to receive it. She showed the world that one small seed, and one brave person, can make a big difference.`,
    focus: ['main-idea', 'key-details', 'text-structure'],
    vocab: [
      ['scholarship', 'money given to a student to help pay for school'],
      ['doctorate', 'the highest degree a university gives'],
      ['troubled', 'worried or upset'],
      ['seedlings', 'very young plants grown from seeds'],
      ['movement', 'a group of people working together for a cause'],
    ],
    questions: [
      Q('What did Wangari Maathai start in 1977?', ['The Green Belt Movement', 'A new university', 'A science museum', 'A farm for fig trees'], 'detail', 1),
      Q("Which happened FIRST in Wangari's life?", ['She studied science in the United States', 'She won the Nobel Peace Prize', 'She started the Green Belt Movement', 'She taught women to plant seedlings'], 'sequence', 2),
      Q("What are 'seedlings'?", ['Very young plants grown from seeds', 'Bags for carrying seeds', 'Old trees in a forest', 'Farmers who sell seeds'], 'vocab', 2),
      Q("How might Wangari's childhood memory of the fig tree have shaped her later work?", ['It taught her that trees protect soil and water, so she wanted to plant more', 'It made her want to sell figs', 'It made her afraid of forests', 'It taught her to cut down old trees'], 'inference', 3),
      Q('Which sentence best tells the main idea of the biography?', ['Wangari Maathai protected Kenya\'s land by planting trees and inspired the world', 'Wangari Maathai liked sitting by streams', 'The Nobel Peace Prize is given every year', 'Fig trees grow in Kenya'], 'main-idea', 3),
    ],
    writePrompt: 'The biography says that "one small seed, and one brave person, can make a big difference." Write an informative paragraph explaining how Wangari Maathai made a difference, using at least three facts from the text.',
  },
  {
    id: '35-10',
    band: '35',
    genre: 'folktale',
    title: 'The Stonecutter',
    origin: 'Folktale retold — told in Japan and Java',
    text: `Long ago, a stonecutter worked at the foot of a great mountain. Every day he chipped away at the rock with his hammer and chisel. He was strong, but he was not content.

One day, he watched a rich merchant pass by. "If only I were rich," the stonecutter sighed. A spirit who lived in the mountain heard him. "Your wish is granted," it whispered. Suddenly the stonecutter was a wealthy man living in a fine house.

He was happy until a prince rode by under a silk umbrella, with servants all around him. "A prince is more powerful than I am," he grumbled. "I wish to be a prince." And so he was.

But the hot sun beat down on him, even under the umbrella. "The sun is more powerful than a prince," he said. "I wish to be the sun." At once, he blazed in the sky. Then a dark cloud floated in front of him and blocked his light. "I wish to be a cloud!"

As a cloud, he poured rain on the land, but the great mountain stood firm and did not move. "The mountain is the most powerful of all," he declared. "I wish to be the mountain."

Now he was the mountain, tall and proud. Then he felt a tap, tap, tap at his feet. A tiny stonecutter was chipping away at his rock!

"I wish to be a stonecutter again," he said softly. The spirit granted his last wish, and from that day on, the stonecutter worked happily with his hammer, content at last.`,
    focus: ['theme', 'plot', 'text-structure'],
    vocab: [
      ['chisel', 'a metal tool with a sharp edge for cutting stone or wood'],
      ['content', 'happy with what you have'],
      ['granted', 'given or allowed'],
      ['grumbled', 'complained in a low, unhappy voice'],
      ['declared', 'said something firmly and clearly'],
    ],
    questions: [
      Q("Who granted the stonecutter's wishes?", ['A spirit who lived in the mountain', 'The prince', 'The sun', 'A rich merchant'], 'detail', 1),
      Q('What did the stonecutter wish to become right after being the sun?', ['A cloud', 'A prince', 'A mountain', 'A rich man'], 'sequence', 2),
      Q("At the start, the stonecutter 'was not content.' What does content mean?", ['Happy with what you have', 'Strong and powerful', 'Tired from working', 'Rich and famous'], 'vocab', 2),
      Q('Why does the story repeat the pattern of the stonecutter seeing something stronger and wishing to be it?', ['To show that the stonecutter is never satisfied, no matter what he becomes', 'To teach facts about the weather', 'To make the story shorter', 'To show that the spirit is getting tired'], 'craft', 3),
      Q('What is the theme of this folktale?', ['Being content with who you are brings more happiness than always wanting more', 'The sun is the most powerful thing of all', 'Hard work always makes you rich', 'Mountains can be broken easily'], 'theme', 3),
    ],
    writePrompt: 'Was the stonecutter happier at the beginning or at the end of the story? Write your opinion, using details from the text to support it.',
  },
  {
    id: '35-11',
    band: '35',
    genre: 'fiction',
    title: 'Lost in the Mist',
    origin: ORIG,
    text: `Isla and her grandfather started up the hill path just after breakfast. The sky over the Scottish Highlands was clear and blue, and purple heather covered the slopes like a blanket.

"We'll have lunch at the top," Grandpa said, patting his backpack. "Then we'll see all the way to the sea."

They climbed for two hours. Isla spotted a red deer watching them from behind a boulder. She found a tiny frog in a puddle. Then, just as they neared the top, a strange thing happened. A gray mist rolled over the hill, thick and cold. In minutes, Isla could barely see her own boots.

"Grandpa, which way do we go?" Isla asked. Her voice sounded small in the fog.

Grandpa did not panic. "Do you remember the piles of stones we passed?" he asked. "They're called cairns. Walkers build them to mark the path. If we go from one cairn to the next, we'll find our way."

They walked slowly, side by side. Isla squinted into the gray. "There!" she shouted, pointing at a dark shape. It was a cairn. Then another. Then another.

Step by step, the cairns led them down the hill. At last the mist thinned, and Isla could see the car park and the little stone bridge below.

Before they left, Isla picked up a flat stone and placed it carefully on top of the last cairn.

"For the next walkers," she said. Grandpa smiled proudly.`,
    focus: ['setting', 'plot', 'character'],
    vocab: [
      ['heather', 'a low plant with tiny purple flowers that grows on hills'],
      ['boulder', 'a very large rock'],
      ['mist', 'a thin cloud of tiny water drops near the ground'],
      ['panic', 'to suddenly feel so scared you cannot think clearly'],
      ['cairns', 'piles of stones that mark a path'],
      ['squinted', 'looked with eyes partly closed to see better'],
    ],
    questions: [
      Q('What are cairns?', ['Piles of stones that mark a path', 'Small red deer', 'Purple flowers on the hills', 'Stone bridges'], 'detail', 1),
      Q('How does the setting change during the story?', ['It goes from clear and sunny to thick with fog', 'It goes from snowy to rainy', 'It goes from a city to a forest', 'It stays the same the whole time'], 'craft', 2),
      Q("'Grandpa did not panic.' What does panic mean?", ['To suddenly feel so scared you cannot think clearly', 'To walk very slowly', 'To eat lunch quickly', 'To climb to the top'], 'vocab', 2),
      Q('Why did Isla place a stone on the last cairn?', ['To help future walkers find the path, the way the cairns helped her', 'Because Grandpa told her to clean the path', 'To mark where she ate lunch', 'Because the stone was too heavy to carry'], 'inference', 3),
      Q('Which sentence best shows that Grandpa stayed calm?', ['Grandpa did not panic.', 'Isla spotted a red deer watching them.', 'Her voice sounded small in the fog.', 'They climbed for two hours.'], 'evidence', 3),
    ],
    writePrompt: "Imagine you are writing a sign for walkers on Isla's hill. Using details from the story, explain what walkers should do if fog rolls in.",
  },
  {
    id: '35-12',
    band: '35',
    genre: 'informational',
    title: 'The Great Wall of China',
    origin: ORIG,
    text: `## A Wall Built Over Centuries
The Great Wall of China is not one single wall. It is a long chain of walls, towers and forts that stretches across northern China. Different rulers built and rebuilt parts of it over more than two thousand years. Much of the wall that visitors see today was built during the Ming dynasty, which ruled China from 1368 to 1644.

## Why Was It Built?
The wall was built mainly for protection. Rulers wanted to keep out raiders who rode in on horseback from the north. Soldiers stood guard in watchtowers along the wall. If they spotted danger, they lit fires or sent up smoke signals so that soldiers in the next tower would know to get ready.

## How Was It Built?
Builders used whatever materials were nearby. In some places, they packed layers of earth tightly between wooden boards. In the mountains, they used stone. The Ming builders used millions of bricks. Hundreds of thousands of workers, including soldiers and farmers, helped build the wall, often in hard conditions.

## The Wall Today
If you added up all its sections, the Great Wall would stretch for thousands of miles. Some parts have crumbled away, but others have been repaired. Today, millions of visitors from around the world walk along its paths each year. In 1987, the Great Wall was named a World Heritage Site, a place considered important to all people.`,
    focus: ['text-features', 'main-idea', 'key-details'],
    vocab: [
      ['dynasty', 'a family of rulers who rule a country for a long time'],
      ['raiders', 'people who attack a place suddenly to take things'],
      ['signals', 'signs used to send a message'],
      ['crumbled', 'broke into small pieces'],
      ['heritage', 'the history and traditions passed down from the past'],
    ],
    questions: [
      Q('Why did soldiers light fires in the watchtowers?', ['To warn soldiers in the next tower about danger', 'To cook their dinner', 'To keep the bricks dry', 'To welcome visitors'], 'detail', 1),
      Q('Which heading tells you that the section will explain the materials used?', ['How Was It Built?', 'Why Was It Built?', 'The Wall Today', 'A Wall Built Over Centuries'], 'craft', 2),
      Q("Some parts of the wall 'have crumbled away.' What does crumbled mean?", ['Broke into small pieces', 'Grew taller', 'Were painted', 'Were moved to a museum'], 'vocab', 2),
      Q('Why do you think builders used different materials in different places?', ['It was easier to use materials found nearby than to carry them far', 'They wanted the wall to be many colors', 'Each soldier liked a different material', 'Bricks were not allowed in the mountains'], 'inference', 3),
      Q('What is the main idea of the whole text?', ['The Great Wall is a huge set of walls built over many centuries to protect China, and people still visit it today', 'The Great Wall is made only of bricks', 'Soldiers liked to light fires', 'The Great Wall was finished in 1987'], 'main-idea', 3),
    ],
    writePrompt: 'Using facts from the text, write an informative paragraph explaining why the Great Wall of China was built and how people built it.',
  },

  // ── Grade 4 ────────────────────────────────────────────────────────────────
  {
    id: '35-13',
    band: '35',
    genre: 'fiction',
    title: 'Play for One',
    origin: ORIG,
    text: `Priya had practiced "Autumn Song" on her violin every day for two months. She knew every note. She could play it with her eyes closed. But as she stood backstage at the community center in Toronto, peeking through the curtain at rows and rows of folding chairs, her fingers felt like frozen fish sticks.

"I can't do it," she whispered to her grandmother, Paati. "What if I mess up in front of everyone?"

Paati had flown all the way from Chennai to hear her play. She took Priya's cold hands in her warm ones. "When I was your age, I sang at the temple festival," Paati said. "I was so nervous that my knees knocked together like coconuts. Do you know what my teacher told me?"

Priya shook her head.

"She said, 'Don't sing for everyone. Sing for one person.' So I picked one face in the crowd, my little brother's, and I sang only to him. The crowd disappeared."

Before Priya could answer, the announcer called her name. Her heart thumped as she walked onto the stage. The lights were bright and hot. She lifted her violin, placed the bow on the string, and searched the audience.

There, in the third row, was Paati, wearing her bright orange shawl. Paati gave a tiny nod.

Priya began to play. The first notes were wobbly, but she kept her eyes on the orange shawl. Slowly, her fingers loosened. The music grew stronger, rising and falling like leaves drifting in the wind. When the last note faded, there was a moment of silence. Then the room burst into applause.

Backstage, Priya threw her arms around Paati. "I played for you," she said.

Paati laughed. "Next time," she said, "you may have to share."`,
    focus: ['character', 'figurative-language', 'theme'],
    vocab: [
      ['backstage', 'the area behind a stage, out of the audience\'s view'],
      ['announcer', 'a person who tells the audience what is happening'],
      ['shawl', 'a large piece of cloth worn over the shoulders'],
      ['wobbly', 'shaky and unsteady'],
      ['applause', 'clapping to show you liked something'],
    ],
    questions: [
      Q('Where had Paati traveled from to hear Priya play?', ['Chennai', 'Toronto', 'London', 'The temple festival'], 'detail', 1),
      Q("Priya's fingers 'felt like frozen fish sticks.' What does this simile show?", ['Her fingers felt stiff and cold from nerves', 'She was hungry before the recital', 'She had been playing in the snow', 'Her fingers smelled like fish'], 'craft', 2),
      Q("When the room 'burst into applause,' what did the audience do?", ['Clapped to show they liked the music', 'Left their seats quickly', 'Sat in silence', 'Sang along with the violin'], 'vocab', 2),
      Q('Why did Priya look for the orange shawl while she played?', ["She was following Paati's advice to play for one person", 'She liked the color orange best', 'She wanted to see if Paati had fallen asleep', 'The shawl was part of the stage lights'], 'inference', 3),
      Q('Which theme does the story show best?', ['Advice from someone who loves you can help you face your fears', 'Practice is a waste of time', 'Only grown-ups get nervous', 'It is better never to perform in public'], 'theme', 3),
    ],
    writePrompt: "Paati's advice helped Priya. Write a narrative about Priya's next performance, showing how she uses what she learned in this story. Include her thoughts and feelings.",
  },
  {
    id: '35-14',
    band: '35',
    genre: 'informational',
    title: 'The Never-Ending Water Cycle',
    origin: ORIG,
    text: `## Water on the Move
The water you drank today may once have been part of an ocean, a cloud or even a glacier. That's because Earth's water is always moving in a never-ending loop called the water cycle. The amount of water on Earth stays about the same. It just keeps changing form and moving from place to place.

## Evaporation: Up into the Air
The sun drives the water cycle. When sunlight warms oceans, lakes and rivers, some of the water turns into an invisible gas called water vapor. This process is called evaporation. The water vapor rises into the air. Plants add water vapor, too, releasing it through tiny openings in their leaves.

## Condensation: Making Clouds
High in the sky, the air is cooler. As water vapor rises and cools, it turns back into tiny droplets of liquid water. This change is called condensation. Billions of droplets gather around specks of dust, and together they form clouds. You can see condensation at home, too, when drops form on the outside of a cold glass on a hot day.

## Precipitation: Falling Back Down
Inside a cloud, droplets bump into each other and join together. When they grow too heavy to float, they fall to the ground as precipitation. Precipitation can be rain, snow or sleet, depending on how cold the air is. Strong thunderstorms can also make hail.

## Collection: Back to the Start
When precipitation reaches the ground, it collects in oceans, lakes and rivers. Some soaks into the soil and becomes groundwater, which can stay underground for a long time. Some freezes into ice and snow on mountaintops. Sooner or later, the sun warms the water again, and the cycle starts over.`,
    focus: ['text-structure', 'text-features', 'cause-effect'],
    vocab: [
      ['glacier', 'a huge, slow-moving sheet of ice'],
      ['invisible', 'not able to be seen'],
      ['droplets', 'very small drops of liquid'],
      ['specks', 'tiny bits'],
      ['precipitation', 'water that falls from clouds, such as rain or snow'],
      ['groundwater', 'water that is stored under the ground'],
    ],
    questions: [
      Q('What drives the water cycle?', ['The sun', 'The wind', 'The moon', 'Plants'], 'detail', 1),
      Q("What is 'precipitation'?", ['Water that falls from clouds, such as rain or snow', 'Water stored under the ground', 'Dust that floats in the air', 'Water vapor rising from a lake'], 'vocab', 2),
      Q('How is this text mainly organized?', ['In the order of the steps of the water cycle', 'As a list of the biggest oceans', "As a story about one raindrop's family", 'By comparing Earth to other planets'], 'craft', 2),
      Q('How is evaporation different from condensation?', ['Evaporation turns liquid water into gas; condensation turns gas back into liquid droplets', 'Evaporation happens in clouds; condensation happens in oceans', 'Evaporation makes snow; condensation makes hail', 'They are two names for the same thing'], 'compare', 3),
      Q('Which example from the text shows condensation you could see at home?', ['Drops forming on the outside of a cold glass on a hot day', 'Water soaking into the soil', 'Snow falling on a mountaintop', 'Plants releasing water through their leaves'], 'evidence', 3),
    ],
    writePrompt: 'Write a narrative from the point of view of a water drop traveling through the water cycle. Include all four stages and at least three facts from the text.',
  },
  {
    id: '35-15',
    band: '35',
    genre: 'opinion',
    title: 'Recess Should Come Before Lunch',
    origin: ORIG,
    text: `My name is Jada, and I am in fourth grade. Every day at our school, we eat lunch first and then go outside for recess. I think we should switch the order. Recess should come before lunch, and here is why.

First, kids would eat better. Right now, lots of my friends gobble down a few bites and throw the rest of their food away so they can rush outside. I have seen whole apples and untouched sandwiches go into the trash. If we played first, we would come inside hungry and ready to eat. We wouldn't have a reason to hurry.

Second, kids would be calmer in the afternoon. When we come in from recess, we are sweaty and wiggly. Then we go straight back to class, and it takes a long time for everyone to settle down. If we ate lunch after recess, we would have a quiet time to cool off and relax before math.

Third, some schools have already tried this, and they liked it. My aunt is a teacher at a school that switched. She told me that her students waste less food now and that the lunchroom is less noisy.

Some people might say that changing the schedule would be too hard. They might worry about kids washing their hands or forgetting their lunches outside. But those problems are easy to solve. We could line up at the sinks on the way in from the playground, and lunch boxes could wait in a basket by the door.

Recess before lunch would mean less waste, calmer classrooms and happier kids. I hope our principal will give it a try. If you agree, please sign our class petition!`,
    focus: ['author-purpose', 'point-of-view', 'key-details'],
    vocab: [
      ['gobble', 'to eat very quickly'],
      ['untouched', 'not used or eaten at all'],
      ['settle', 'to become calm and still'],
      ['schedule', 'a plan that shows when things happen'],
      ['petition', 'a written request signed by many people asking for a change'],
    ],
    questions: [
      Q('What change does Jada want?', ['To have recess before lunch', 'To have a longer lunch', 'To get rid of recess', 'To eat lunch in the classroom'], 'detail', 1),
      Q("What is Jada's main purpose for writing?", ['To persuade readers to support recess before lunch', 'To explain how to make a sandwich', 'To tell a funny story about recess', "To describe her school's playground"], 'craft', 2),
      Q("Jada asks readers to sign a 'petition.' What is a petition?", ['A written request signed by many people asking for a change', 'A lunch menu', 'A note to a friend', 'A list of recess games'], 'vocab', 2),
      Q('Which reason does Jada support with information from someone she knows?', ['Some schools have tried it and liked it', 'Kids would be calmer in the afternoon', 'Lunch boxes could wait in a basket', 'Kids are sweaty after recess'], 'evidence', 3),
      Q("Why does Jada include the paragraph that begins 'Some people might say'?", ['To answer a possible argument against her idea', 'To change her mind and agree with the other side', 'To tell a story about her aunt', 'To list the foods kids throw away'], 'craft', 3),
    ],
    writePrompt: "Do you agree or disagree with Jada? Write an opinion piece that responds to her argument, using at least two of her reasons as evidence or as points you argue against.",
  },
  {
    id: '35-16',
    band: '35',
    genre: 'fiction',
    title: 'The Midnight Footprints',
    origin: ORIG,
    text: `In the town of Tromsø, far in the north of Norway, winter nights are long and dark. One January morning, Ingrid stepped outside and gasped. A line of small footprints circled her family's wooden shed and disappeared into the trees behind it.

That was not all. Her father's work gloves, which he had left on the porch, were gone. So was one of her little brother's red wool socks, hung out to dry.

"A thief!" said her brother, Lars, wide-eyed.

Ingrid knelt beside the tracks. Each print was small and oval, with four toe marks and tiny points at the tips, like claws. The prints did not wander back and forth. They ran in a neat, straight line, one directly in front of the other.

"These aren't human footprints," Ingrid said. "And I don't think they're from a dog. Dog tracks usually wander, and the prints are rounder."

Lars frowned. "Then who takes socks?"

Ingrid looked up animal tracks on her tablet. Then she found a clump of orange-red fur caught on a nail by the fence. She held it up to the gray morning light and smiled.

That night, the family turned off the lights and waited by the window. The northern lights shimmered green above the snow. Then a slim shape trotted out of the trees, its bushy tail held low. It sniffed the porch, grabbed one of Lars's boots in its mouth and dashed away.

"A fox!" Lars whispered.

The next day, Ingrid followed the straight line of tracks to a hollow under an old spruce tree. Inside lay the gloves, the sock and a collection of other treasures: a ball, a dog toy and three mittens.

"Some thief," Lars said, laughing. "It just wanted toys."`,
    focus: ['plot', 'inference', 'key-details'],
    vocab: [
      ['circled', 'went all the way around'],
      ['oval', 'shaped like an egg'],
      ['clump', 'a small bunch stuck together'],
      ['shimmered', 'shone with a soft, flickering light'],
      ['trotted', 'moved at a quick, bouncy pace'],
      ['hollow', 'a small empty space inside or under something'],
    ],
    questions: [
      Q('Which items went missing from the porch first?', ["Her father's work gloves and her brother's sock", 'A ball and three mittens', "Ingrid's tablet and boots", 'A dog toy and a spruce branch'], 'detail', 1),
      Q("Ingrid found the items in 'a hollow under an old spruce tree.' What is a hollow?", ['A small empty space inside or under something', 'A tall pile of snow', 'A kind of bird', 'A wooden shed'], 'vocab', 2),
      Q('Which clue helped Ingrid decide the animal was probably not a dog?', ['The prints ran in a neat, straight line', 'The prints were near the shed', 'The sock was red', 'The northern lights were green'], 'evidence', 2),
      Q('Why did Ingrid smile when she found the orange-red fur?', ['The color matched a fox, which supported her idea', 'She liked the color orange', "She thought it came from Lars's sock", 'She knew the thief was a person in a fur coat'], 'inference', 3),
      Q('Which event happens LAST?', ['Ingrid finds the hidden treasures under the spruce tree', 'The family watches a fox take a boot', 'Ingrid finds fur on the fence', 'Lars says there is a thief'], 'sequence', 3),
    ],
    writePrompt: 'Write a short detective report explaining how Ingrid solved the mystery. List her clues in order and explain what each clue told her.',
  },
  {
    id: '35-17',
    band: '35',
    genre: 'informational',
    title: 'How a Bicycle Works',
    origin: ORIG,
    text: `## A Team of Simple Machines
A bicycle may look simple, but it is really a team of simple machines working together. Wheels, levers and gears all help turn the push of your legs into fast, smooth motion.

## Pedals and Cranks
When you push down on a pedal, you are pushing on a crank, a metal arm attached to the pedal. The crank works like a lever. It turns the large gear in the middle of the bike, called the chainring. Because the crank is fairly long, your push turns the chainring with a lot of force.

## The Chain
A chain loops around the teeth of the chainring and around a smaller gear on the back wheel. As the chainring turns, it pulls the chain, and the chain turns the back gear. The back gear is connected to the back wheel, so the wheel spins and the bike rolls forward.

## Gears: Easy or Fast?
Many bikes have several gears of different sizes on the back wheel. When the chain is on a large back gear, pedaling feels easy, which is helpful for climbing hills. However, the bike moves more slowly. When the chain is on a small back gear, each push of the pedals turns the back wheel more times. Pedaling feels harder, but the bike goes faster on flat ground. Riders shift gears to choose what they need.

## Brakes: Stopping Safely
On many bikes, when you squeeze a brake lever on the handlebars, a cable pulls rubber brake pads against the wheel. The rubbing creates friction, a force that slows things down. The more firmly you squeeze, the faster you stop.

## Keeping Your Balance
A bike stays balanced best when it is moving. Riders steer with the handlebars and shift their weight to stay upright. And always remember to wear a helmet!`,
    focus: ['text-structure', 'text-features', 'cause-effect'],
    vocab: [
      ['crank', 'a metal arm that turns when you push the pedal'],
      ['lever', 'a bar that moves around a fixed point to help lift or move things'],
      ['chainring', 'the large gear in the middle of a bike that the pedals turn'],
      ['shift', 'to change from one position to another'],
      ['friction', 'a force that slows things down when they rub together'],
      ['upright', 'standing or sitting straight up'],
    ],
    questions: [
      Q('What connects the chainring to the gear on the back wheel?', ['The chain', 'The brake cable', 'The handlebars', 'The crank'], 'detail', 1),
      Q("Brake pads rubbing on the wheel create 'friction.' What is friction?", ['A force that slows things down when they rub together', 'A kind of gear', 'The air inside a tire', 'A way to steer'], 'vocab', 2),
      Q('Which section would help a rider who wants to climb a steep hill more easily?', ['Gears: Easy or Fast?', 'Brakes: Stopping Safely', 'The Chain', 'A Team of Simple Machines'], 'craft', 2),
      Q('Put the steps in order. What happens right after you push down on a pedal?', ['The crank turns the chainring', 'The brake pads squeeze the wheel', 'The back wheel stops', 'The handlebars turn'], 'sequence', 3),
      Q('A rider on flat ground wants to go as fast as possible. Based on the text, which back gear should she choose?', ['A small back gear', 'A large back gear', 'No gear at all', 'The brake lever'], 'inference', 3),
    ],
    writePrompt: 'Explain how a bicycle turns your leg power into motion. Describe at least four steps from the text and use the words crank, chain and gear.',
  },
  {
    id: '35-18',
    band: '35',
    genre: 'folktale',
    title: 'The Hummingbird and the Fire',
    origin: 'Folktale retold — Quechua, Andes of South America',
    text: `Long ago, high in the Andes Mountains of South America, there was a great forest full of animals. One dry afternoon, a spark from a lightning storm landed in the grass. Soon, flames were racing through the trees.

The animals fled. The jaguar bounded away on his strong legs. The llamas and the vicuñas ran down the mountainside. The great condor spread his wings and soared high above the smoke. At the edge of the forest, beside a cool stream, they all stopped and turned to watch their home burn.

"There is nothing we can do," said the jaguar sadly. "The fire is too big."

Then the animals noticed a tiny flash of green. It was Quinde, the hummingbird. Quinde dipped her needle-thin beak into the stream, filled it with a single drop of water and zoomed toward the fire. She let the drop fall onto the flames. Then she flew back to the stream for another drop, and another, and another.

The condor laughed. "Little bird, what do you think you are doing? Your drops are so small. You cannot put out a whole fire!"

Quinde did not stop. As she zipped past, she called out, "I am doing the best I can."

The animals fell silent. They looked at one another, and they felt ashamed. Then the jaguar waded into the stream and splashed water with his paws. The llamas stamped out sparks with their hooves. The condor beat his giant wings to push the smoke away. Even the tiny ants carried grains of wet soil.

Little by little, the fire grew smaller. By nightfall, the last flames were gone. Part of the forest was black, but much of it was saved.

From that day on, the people of the Andes told the story of Quinde, the bird who reminded everyone that no effort is too small.`,
    focus: ['theme', 'character', 'compare'],
    vocab: [
      ['fled', 'ran away quickly from danger'],
      ['bounded', 'moved with long, leaping steps'],
      ['soared', 'flew high in the air'],
      ['ashamed', 'feeling bad about something you did or did not do'],
      ['effort', 'hard work and trying'],
    ],
    questions: [
      Q('How did Quinde try to fight the fire?', ['She carried drops of water in her beak', 'She beat her wings to blow out the flames', 'She stamped out sparks with her feet', 'She asked the clouds to rain'], 'detail', 1),
      Q("After Quinde spoke, the animals 'felt ashamed.' What does ashamed mean?", ['Feeling bad about something you did or did not do', 'Feeling proud and happy', 'Feeling sleepy', 'Feeling hungry'], 'vocab', 2),
      Q('How is Quinde different from the other animals at the beginning?', ['She tries to help while the others only watch', 'She is the fastest runner', 'She is afraid of the fire while the others are brave', 'She laughs at the others'], 'compare', 2),
      Q('Why did the animals feel ashamed?', ['They had given up while a tiny bird kept trying', 'They had started the fire', 'They were too small to help', 'They had laughed at the jaguar'], 'inference', 3),
      Q('What is the theme of this folktale?', ["Every effort counts, and one person's example can inspire others", 'Big animals are always the strongest', 'Fires can never be stopped', 'Hummingbirds are the fastest birds'], 'theme', 3),
    ],
    writePrompt: "Quinde said, \"I am doing the best I can.\" Write about how her words and actions changed the other animals. Use at least three details from the folktale.",
  },
  {
    id: '35-19',
    band: '35',
    genre: 'fiction',
    title: 'The Map That Drew Itself',
    origin: ORIG,
    text: `Zainab found the map in a dusty wooden box in her grandfather's bookshop in Cairo. It was rolled up and tied with a faded blue ribbon. When she unrolled it on the counter, it was completely blank.

"That map is very old," said her grandfather, peering over his glasses. "It belonged to my grandmother. She used to say it only works for people who are paying attention."

Zainab shrugged and was about to roll it up again when a thin line of ink appeared on the paper, all by itself. It wiggled across the page, drawing a street, then a corner, then a tiny picture of a fruit stand.

"Grandfather, look!" Zainab gasped.

He only smiled. "Then you had better follow it."

Zainab tucked the map under her arm and stepped out into the busy street. Cars honked. A man pushed a cart of round loaves of bread. She followed the line to a fruit stand at the corner, where an old woman was trying to pick up dozens of oranges that had spilled across the sidewalk.

Zainab knelt and helped gather every one. The woman thanked her and pressed a warm orange into her hand. When Zainab looked at the map, a new line had appeared, leading toward the river.

By the Nile, she found a small boy crying because he had lost sight of his mother. Zainab held his hand and walked with him along the riverbank until they heard a woman calling his name. As the mother hugged him, more ink swirled across the map.

All afternoon, the map led Zainab from one person to the next: a cat stuck on a wall, a tourist who couldn't find the museum, a neighbor carrying heavy groceries.

At sunset, the ink drew one final picture: a small bookshop with a blue door. Zainab ran home. Her grandfather was waiting with two cups of mint tea.

"Well?" he asked. "Where did it take you?"

Zainab thought for a moment. "Everywhere I was needed," she said.`,
    focus: ['theme', 'plot', 'character'],
    vocab: [
      ['blank', 'empty, with nothing written or drawn on it'],
      ['peering', 'looking closely and carefully'],
      ['tucked', 'put into a safe or snug place'],
      ['swirled', 'moved in twisting, curving shapes'],
      ['tourist', 'a person who travels to visit a place'],
    ],
    questions: [
      Q('Where did Zainab find the map?', ["In a wooden box in her grandfather's bookshop", 'At a fruit stand', 'By the Nile River', 'In a museum'], 'detail', 1),
      Q('Whom did Zainab help right after the woman with the oranges?', ['A small boy who had lost sight of his mother', 'A tourist looking for the museum', 'A cat stuck on a wall', 'A neighbor with groceries'], 'sequence', 2),
      Q("Her grandfather was 'peering over his glasses.' What does peering mean?", ['Looking closely and carefully', 'Laughing loudly', 'Falling asleep', 'Cleaning something'], 'vocab', 2),
      Q("What did the old saying mean, that the map 'only works for people who are paying attention'?", ['It guides people who notice others and are ready to help', 'It only works in a quiet room', 'It only works for people who wear glasses', 'It only shows streets in Cairo'], 'inference', 3),
      Q('Which statement best expresses the theme?', ['Noticing and helping others can make an ordinary day meaningful', 'Maps are the best way to find treasure', 'Old things should stay in boxes', 'Cairo is a very busy city'], 'theme', 3),
    ],
    writePrompt: "Write a new chapter in which the map leads Zainab somewhere new. Whom does she help, and how does the map show her the way? Follow the map's magic rules from the story.",
  },
  {
    id: '35-20',
    band: '35',
    genre: 'informational',
    title: 'Deserts of the World',
    origin: ORIG,
    text: `## What Makes a Desert?
When you picture a desert, you might imagine hot sand and blazing sun. But scientists define a desert by how little precipitation it gets, not by how hot it is. A desert is a place that usually receives less than 10 inches (25 centimeters) of rain or snow in a whole year. Deserts cover more than one-fifth of Earth's land.

## Hot Deserts
The Sahara in northern Africa is the largest hot desert in the world. It is almost as big as the United States. Only about a quarter of the Sahara is covered by sand dunes. Much of it is rocky plains and gravel. Days can be scorching, but nights can turn surprisingly cold, because the dry air does not hold heat well.

## Cold Deserts
Some deserts are freezing! Antarctica gets so little precipitation that it is considered the largest desert on Earth. The Gobi Desert in Mongolia and China is a cold desert, too. There, winter temperatures fall far below freezing, and snow sometimes dusts the ground.

## Surviving in the Desert
Desert plants and animals have clever adaptations. A cactus stores water in its thick stem, and its spines protect it from thirsty animals. Many desert animals, like the fennec fox of the Sahara, rest in cool burrows during the day and come out at night. The fennec fox's huge ears help release body heat. Camels can go many days without drinking, and they can drink a huge amount of water when they finally find it.

## People of the Desert
People have lived in deserts for thousands of years. Some groups travel with their herds from one water source to another. Others live near an oasis, a place where underground water comes to the surface so that plants can grow.`,
    focus: ['compare', 'text-features', 'main-idea'],
    vocab: [
      ['define', 'to explain exactly what something means'],
      ['scorching', 'extremely hot'],
      ['adaptations', 'body parts or behaviors that help a living thing survive where it lives'],
      ['burrows', 'holes or tunnels that animals dig to live in'],
      ['oasis', 'a place in a desert where water comes up and plants grow'],
    ],
    questions: [
      Q('What is the largest hot desert in the world?', ['The Sahara', 'The Gobi', 'Antarctica', 'The Amazon'], 'detail', 1),
      Q("What are 'adaptations'?", ['Body parts or behaviors that help a living thing survive where it lives', 'Maps that show where deserts are', 'Storms that bring rain to deserts', 'Tents that desert travelers use'], 'vocab', 2),
      Q('How are the Sahara and the Gobi different?', ['The Sahara is a hot desert, while the Gobi is a cold desert', 'The Sahara gets much more rain than the Gobi', 'The Gobi is in Africa and the Sahara is in Asia', 'Only the Gobi has animals'], 'compare', 2),
      Q("Which sentence best supports the idea that deserts don't have to be hot?", ['Antarctica gets so little precipitation that it is considered the largest desert on Earth.', 'The Sahara in northern Africa is the largest hot desert in the world.', 'A cactus stores water in its thick stem.', 'People have lived in deserts for thousands of years.'], 'evidence', 3),
      Q('What is the main idea of the text?', ['Deserts are very dry places, hot or cold, where living things have special ways to survive', 'The Sahara is covered entirely in sand', 'Camels are the only important desert animals', 'Deserts are always hot and empty'], 'main-idea', 3),
    ],
    writePrompt: 'Choose one plant, animal or group of people from the text. Write an informative paragraph explaining how they survive in the desert, using details from the text.',
  },
  {
    id: '35-21',
    band: '35',
    genre: 'poetry',
    title: 'The Night the Lights Went Out',
    origin: ORIG,
    text: `The storm rolled in on Tuesday night,
the rain came down in sheets,
and every lamp in Manila blinked
and darkness filled the streets.

The fan stopped spinning overhead,
the TV gave a pop,
my sister's video game went black
right at the mountaintop.

"Don't worry," Lola said, and struck
a match with steady hands.
She set three candles on the shelf
in old tin candle stands.

We sat together on the floor,
my father, Mom and me,
my sister, Lola and the cat,
as close as close could be.

At first we grumbled, bored and hot,
"There's nothing we can do!"
But Lola smiled and leaned in close:
"I'll tell you something true."

She told us of her village home,
of fishing boats at dawn,
of mango trees she climbed as a girl
with flip-flops barely on.

My father laughed and joined right in.
He told about the day
he chased a neighbor's runaway goat
through half the town that May.

Then Mom picked up the old guitar
and strummed a gentle song,
and soon the rain upon the roof
was drumming right along.

We made up shadow animals,
a rabbit, crab and bat;
my sister made a dinosaur
that tried to eat the cat.

The hours went by, we didn't know,
we didn't watch the time,
we laughed and sang and told our tales
in rhythm and in rhyme.

At last the lights came buzzing back,
the fan began to spin,
the TV flashed, the fridge hummed on,
the world came rushing in.

My sister looked at all of us
and didn't grab her game.
"Can we leave the lights off for a while?"
And all of us said the same.`,
    focus: ['plot', 'theme', 'figurative-language'],
    vocab: [
      ['sheets', 'large, heavy amounts falling at once (rain in sheets)'],
      ['steady', 'firm and not shaking'],
      ['grumbled', 'complained in a low, unhappy voice'],
      ['strummed', 'played a guitar by brushing fingers across the strings'],
      ['rhythm', 'a regular, repeated pattern of sounds or beats'],
    ],
    questions: [
      Q('What caused the lights to go out?', ['A storm', 'A broken fan', 'Lola blew them out', 'The cat knocked over a lamp'], 'detail', 1),
      Q("What do the lines 'the rain upon the roof / was drumming right along' mean?", ['The rain made a beating sound that seemed to go with the song', 'Someone was playing drums on the roof', 'The rain stopped when the song began', 'The roof was leaking'], 'craft', 2),
      Q('What did the family do right after Lola told about her village?', ['Father told a story about chasing a goat', 'Mom played the guitar', 'The lights came back on', 'They made shadow animals'], 'sequence', 2),
      Q('Why does the sister not grab her game when the lights come back?', ['She enjoyed the family time and wanted it to last', 'Her game was broken', 'She was too tired to play', 'Lola told her she could not play'], 'inference', 3),
      Q('What is the theme of the poem?', ['Unplugging can bring a family closer together', 'Storms are always dangerous and scary', 'Video games are the best way to pass time', 'Candles are better than lamps'], 'theme', 3),
    ],
    writePrompt: 'Write a narrative about a time when something unexpected brought people together. Then explain how your experience is like or unlike the family\'s night in the poem.',
  },
  {
    id: '35-22',
    band: '35',
    genre: 'biography',
    title: 'Roberto Clemente: More Than a Ballplayer',
    origin: ORIG,
    text: `Roberto Clemente was born in 1934 in Carolina, Puerto Rico, the youngest of seven children. His family did not have much money, but Roberto had a big love for baseball. As a boy, he practiced for hours, often hitting balls made of tied-up rags with a stick.

His hard work paid off. By the time he was a teenager, scouts were watching him play. In 1955, Roberto joined the Pittsburgh Pirates, a Major League Baseball team in the United States. He would play for them for eighteen seasons.

Life in the United States was not always easy for Roberto. He was still learning English, and some reporters made fun of the way he spoke. As a Black Latino player, he also faced unfair treatment because of the color of his skin. Roberto refused to stay quiet. He spoke up for respect for Latin American and Black players.

On the field, Roberto was amazing. He had a powerful throwing arm and could make catches that seemed impossible. He won twelve Gold Glove awards for his fielding. He helped the Pirates win the World Series in 1960 and again in 1971. In 1972, he became one of the few players in history to reach 3,000 hits.

Roberto believed that helping others mattered even more than baseball. He visited children in hospitals and ran free baseball clinics for kids. In December 1972, a terrible earthquake struck Nicaragua. Roberto gathered supplies and decided to fly there himself to make sure the help reached the people who needed it. Sadly, his plane crashed into the sea shortly after takeoff, and he died.

The next year, Roberto Clemente became the first Latin American player elected to the Baseball Hall of Fame. Today, Major League Baseball gives the Roberto Clemente Award each year to a player who shows great character and helps the community.`,
    focus: ['main-idea', 'key-details', 'inference'],
    vocab: [
      ['scouts', 'people whose job is to find talented players'],
      ['treatment', 'the way someone is acted toward'],
      ['refused', 'would not do something'],
      ['clinics', 'classes where people learn a skill'],
      ['supplies', 'food, water and other things people need'],
      ['elected', 'chosen by a vote'],
    ],
    questions: [
      Q('Which Major League team did Roberto Clemente play for?', ['The Pittsburgh Pirates', 'The New York Yankees', 'The Carolina Stars', 'The Nicaragua Lions'], 'detail', 1),
      Q("Roberto 'refused to stay quiet.' What does refused mean?", ['Would not do something', 'Wanted very much to do something', 'Forgot to do something', 'Asked someone else to do something'], 'vocab', 2),
      Q('Which event happened LAST?', ['Roberto was elected to the Hall of Fame', 'Roberto reached 3,000 hits', 'Roberto joined the Pirates', 'The Pirates won the World Series in 1960'], 'sequence', 2),
      Q('Why did Roberto decide to fly to Nicaragua himself?', ['He wanted to make sure the supplies reached the people who needed them', 'He was going to play in a baseball game there', 'He wanted to write a newspaper story about the earthquake', 'He was moving to Nicaragua'], 'inference', 3),
      Q('Which sentence best states the main idea?', ['Roberto Clemente was a great baseball player who also fought for respect and helped others', 'Roberto Clemente grew up in Puerto Rico', 'Roberto Clemente won twelve Gold Glove awards', 'Baseball is popular in Puerto Rico'], 'main-idea', 3),
    ],
    writePrompt: "Major League Baseball's Roberto Clemente Award honors players who show great character. Using evidence from the biography, write an opinion paragraph explaining why Clemente is a good person to name this award after.",
  },
  {
    id: '35-23',
    band: '35',
    genre: 'drama',
    title: 'The Sandcastle Contest',
    origin: ORIG,
    text: `NARRATOR: It is the morning of the Sunny Bay Sandcastle Contest. Cousins Ana and Kofi kneel in the sand with two buckets and one shovel.

ANA: I've got the perfect plan. We build the tallest tower on the whole beach. Five levels high, with a flag on top!

KOFI: Towers are boring. We should dig a giant moat all the way around, with a bridge made of driftwood.

ANA: A moat? Nobody wins with a hole in the ground.

KOFI: (crossing his arms) Nobody wins with a tower that falls over, either.

NARRATOR: The cousins turn their backs on each other. Ana starts packing wet sand into her bucket. Kofi starts digging. Neither of them notices the waves creeping closer.

MS. TANAKA: (calling through a megaphone) Thirty minutes left, builders! And remember, the tide is coming in!

ANA: (looking up) Oh no. Kofi, the water's coming. It's going to knock down my tower!

KOFI: (pausing, then grinning) Not if the water has somewhere else to go.

ANA: What do you mean?

KOFI: A moat catches the water before it reaches the castle. Your tower stays safe in the middle.

ANA: (slowly smiling) So your moat protects my tower.

KOFI: And your tower makes my moat look like it's guarding something important.

NARRATOR: The cousins work faster than ever. Ana shapes the tower. Kofi digs the moat deeper and lays the driftwood bridge. A wave rushes up the beach, swirls into the moat and slides back out. The tower stands tall.

MS. TANAKA: (walking over) Well! I've judged this contest for ten years, and I have never seen a castle survive the tide. This one wins the prize for Best Teamwork.

ANA AND KOFI: (together) Teamwork?

KOFI: (laughing) I guess two ideas really are better than one.

ANA: Next year, let's bring two shovels.`,
    focus: ['character', 'plot', 'theme'],
    vocab: [
      ['moat', 'a deep ditch filled with water around a castle'],
      ['driftwood', 'wood that has floated onto the shore'],
      ['creeping', 'moving slowly and quietly'],
      ['megaphone', 'a cone-shaped tool that makes your voice louder'],
      ['tide', 'the regular rising and falling of the ocean'],
    ],
    questions: [
      Q('What did Ana want to build at first?', ['The tallest tower on the beach', 'A giant moat', 'A driftwood boat', 'A sand dragon'], 'detail', 1),
      Q("What is the job of the words in parentheses, like '(crossing his arms)'?", ['They tell how the characters act or speak', 'They are lines the narrator reads aloud', 'They give the title of the play', 'They show what the judge writes down'], 'craft', 2),
      Q("The waves were 'creeping closer.' What does creeping mean?", ['Moving slowly and quietly', 'Crashing loudly', 'Freezing into ice', 'Disappearing'], 'vocab', 2),
      Q('Why did the cousins decide to work together?', ['They realized each idea could help protect the castle from the tide', 'Ms. Tanaka told them they had to share', "Ana's tower had already fallen down", 'Kofi lost his shovel'], 'inference', 3),
      Q('What is the theme of the play?', ['Combining different ideas can solve a problem better than working alone', 'The tallest castle always wins', 'The ocean ruins everything', 'Cousins should never build together'], 'theme', 3),
    ],
    writePrompt: 'Write a new short scene for the play that takes place at next year\'s contest. Use drama format: a NARRATOR, character names before each line, and stage directions in parentheses.',
  },
  {
    id: '35-24',
    band: '35',
    genre: 'informational',
    title: 'The Story of the Printing Press',
    origin: ORIG,
    text: `## Before Printing
Long ago, every book had to be copied by hand. In Europe, monks and scribes spent months, sometimes years, copying a single book with pens and ink. Because books took so long to make, they were rare and expensive. Most people never owned one, and few people learned to read.

## Early Printing in Asia
Printing began in East Asia. By the 800s, printers in China were carving whole pages into wooden blocks, inking the blocks and pressing paper onto them. Around the 1040s, a Chinese inventor named Bi Sheng created movable type: small, separate characters made of baked clay that could be arranged and rearranged. Later, printers in Korea made movable type from metal. One of the oldest surviving books printed with metal type was made in Korea in 1377.

## Gutenberg's Press
In the mid-1400s in Germany, a metalworker named Johannes Gutenberg developed his own printing system. He made metal letters that could be cast quickly in a mold, an oil-based ink that stuck well to metal, and a press based on machines used to squeeze grapes for wine. Workers set the letters into lines, inked them and pressed them onto paper again and again. Around 1455, Gutenberg's workshop finished printing a famous Bible.

## A World of Books
Printing presses spread quickly across Europe. By the year 1500, millions of books had been printed. Books became cheaper, and more people learned to read. Ideas about science, history and religion could travel farther and faster than ever before. Many historians say the printing press was one of the most important inventions in human history.`,
    focus: ['text-structure', 'cause-effect', 'text-features'],
    vocab: [
      ['scribes', 'people whose job was to copy writing by hand'],
      ['rare', 'not found or seen very often'],
      ['movable', 'able to be moved'],
      ['cast', 'made by pouring hot liquid metal into a shape'],
      ['mold', 'a hollow shape that liquid is poured into so it hardens in that shape'],
      ['historians', 'people who study and write about the past'],
    ],
    questions: [
      Q('What did Bi Sheng use to make his movable type?', ['Baked clay', 'Metal', 'Wood', 'Paper'], 'detail', 1),
      Q('How is this text mostly organized?', ['In time order, from handwritten books to printing presses', 'As a problem with no solution', 'By comparing two kinds of ink', 'As a list of famous books'], 'craft', 2),
      Q("Before printing, books were 'rare.' What does rare mean?", ['Not found or seen very often', 'Very large and heavy', 'Easy to buy', 'Written in many languages'], 'vocab', 2),
      Q('Which detail shows an EFFECT of the printing press?', ['Books became cheaper, and more people learned to read.', 'Monks copied books with pens and ink.', 'Gutenberg used a mold to cast letters.', 'Printers carved pages into wooden blocks.'], 'evidence', 3),
      Q("How was Gutenberg's work similar to Bi Sheng's?", ['Both used movable type that could be arranged and reused', 'Both carved whole pages into wood', 'Both lived in Korea', 'Both printed only one book'], 'compare', 3),
    ],
    writePrompt: 'Write an informative paragraph explaining how the printing press changed the world. Include at least one fact from each section of the text.',
  },

  // ── Grade 5 ────────────────────────────────────────────────────────────────
  {
    id: '35-25',
    band: '35',
    genre: 'fiction',
    title: 'The Fishpond Wall',
    origin: ORIG,
    text: `Every Saturday morning, Lani's tūtū woke her before the sun came up. "The fishpond doesn't wait," Tūtū would say, handing her a pair of rubber boots.

Lani did not love Saturdays. Her friends spent them at the beach or sleeping late. Lani spent hers hauling stones and pulling slimy mangrove seedlings out of the mud at the edge of the old fishpond on the island of Molokaʻi.

The fishpond, or loko iʻa, had been built by Hawaiians hundreds of years ago. A low wall of lava rock curved out into the shallow ocean, making a calm pool where fish could grow. Tūtū said their ancestors had moved every one of those stones by hand, passing them from person to person in a long line. But over the years, storms had knocked holes in the wall, and mangroves had crept in, choking the water.

"Why do we have to fix it?" Lani grumbled one morning, wiping mud off her cheek. "Nobody even uses it anymore."

Tūtū set down the stone she was carrying. She pointed to a wooden gate in the wall, made of thin slats. "Watch," she said.

Lani crouched beside the gate. The tide was coming in, and through the narrow gaps she saw tiny silver fish slipping into the pond. "They're so small," she said.

"That's the clever part," said Tūtū. "The little ones swim in to eat and grow. Once they're fat, they're too big to swim back out. Our ancestors fed whole villages this way, and they never took more than the pond could give."

Lani watched the fish for a long time. She imagined people long ago standing where she stood, their hands on the same cool stones. For the first time, the wall did not look like a pile of chores. It looked like a gift that had been passed down, waiting for someone to catch it.

She stood up, picked up a heavy stone and fitted it carefully into a gap in the wall.

"Tūtū," she said, "can I bring my friends next Saturday? I think they would want to see this."

Tūtū smiled so wide that her eyes nearly disappeared. "The fishpond," she said, "would like that very much."`,
    focus: ['character', 'theme', 'setting'],
    vocab: [
      ['hauling', 'pulling or carrying something heavy'],
      ['ancestors', 'family members who lived long before you'],
      ['choking', 'crowding or blocking so something cannot live or breathe well'],
      ['slats', 'thin, flat strips of wood'],
      ['crouched', 'bent down low with knees bent'],
      ['chores', 'regular jobs that need to be done'],
    ],
    questions: [
      Q('What had damaged the fishpond?', ['Storms had knocked holes in the wall, and mangroves had crept in', 'Fishermen had taken all the fish', 'The ocean had dried up', 'Tourists had moved the stones'], 'detail', 1),
      Q("Tūtū says their 'ancestors' built the wall. Who are ancestors?", ['Family members who lived long before you', 'Neighbors who live nearby', 'Scientists who study fish', 'Friends from school'], 'vocab', 2),
      Q("The wall 'looked like a gift that had been passed down.' What does this show about Lani?", ["She now sees the fishpond as something valuable from her family's past", 'She thinks the wall should be wrapped in paper', 'She wants to give the wall away', 'She thinks someone bought her a present'], 'craft', 2),
      Q("Why does Tūtū show Lani the gate instead of just answering her question?", ['She wants Lani to see for herself how clever and useful the fishpond is', 'She is too tired to talk', 'She wants Lani to repair the gate alone', 'She is looking for her lost boots'], 'inference', 3),
      Q('Which theme does the story develop?', ['Caring for what our ancestors built connects us to the past and the future', 'Saturday mornings should be for sleeping late', 'Old things are not worth fixing', 'Fish are hard to catch'], 'theme', 3),
    ],
    writePrompt: "How does Lani's attitude toward the fishpond change from the beginning to the end of the story? Write an essay that traces the change, using at least three quotations or details as evidence.",
  },
  {
    id: '35-26',
    band: '35',
    genre: 'informational',
    title: 'Volcanoes: Windows into the Earth',
    origin: ORIG,
    text: `## Earth's Hidden Heat
Deep beneath your feet, Earth is extremely hot. In some places far underground, rock melts into a thick, glowing liquid called magma. Magma is lighter than the solid rock around it, so it slowly pushes upward. When magma breaks through Earth's surface, it is called lava, and the opening it escapes from is a volcano.

## Plates on the Move
Earth's outer shell is broken into giant pieces called tectonic plates. These plates move very slowly, only a few centimeters a year, about as fast as your fingernails grow. Most volcanoes form near the edges of plates, where plates pull apart or push together. Where one plate slides beneath another, rock melts and magma rises. Many of Earth's active volcanoes circle the Pacific Ocean in a horseshoe-shaped zone called the Ring of Fire.

Some volcanoes form in the middle of a plate, over a "hot spot" where extra-hot material rises from deep inside Earth. The Hawaiian Islands were built this way, one volcano at a time.

## Different Shapes, Different Eruptions
Not all volcanoes look or act the same. Shield volcanoes, like Mauna Loa in Hawaiʻi, have wide, gentle slopes. Their runny lava flows out steadily and can travel long distances. Mauna Loa is the largest active volcano on Earth. Stratovolcanoes, such as Mount Fuji in Japan, are tall and cone-shaped. They are built from layers of hardened lava and ash. Their magma is thick and sticky, which traps gas inside. When the pressure grows too great, these volcanoes can erupt explosively, blasting ash high into the sky.

## Gifts from Volcanoes
Volcanoes can be dangerous, but they also help life on Earth. Volcanic ash breaks down into rich soil, which is why farms often thrive on the slopes of old volcanoes. Volcanoes have also built entire islands. Iceland, Hawaiʻi and many other islands exist because volcanoes piled up layer after layer of rock from the ocean floor.

## Watching and Warning
Scientists called volcanologists study volcanoes to help keep people safe. They measure small earthquakes, changes in the shape of the ground and gases escaping from vents. These clues can warn people that an eruption may be coming, so they have time to leave.`,
    focus: ['text-structure', 'compare', 'cause-effect'],
    vocab: [
      ['magma', 'melted rock beneath Earth\'s surface'],
      ['tectonic', 'having to do with the huge moving pieces of Earth\'s outer shell'],
      ['pressure', 'a pushing force'],
      ['explosively', 'in a sudden, violent, bursting way'],
      ['thrive', 'to grow strong and healthy'],
      ['vents', 'openings that let gas or liquid escape'],
    ],
    questions: [
      Q('What is magma called once it reaches Earth\'s surface?', ['Lava', 'Ash', 'Plates', 'Vents'], 'detail', 1),
      Q("Farms often 'thrive' on old volcanoes. What does thrive mean?", ['To grow strong and healthy', 'To dry up', 'To be destroyed', 'To move away'], 'vocab', 2),
      Q('How are shield volcanoes different from stratovolcanoes?', ['Shield volcanoes have gentle slopes and runny lava; stratovolcanoes are steep, with thick, sticky magma', 'Shield volcanoes are found only in Japan', 'Stratovolcanoes never erupt', 'Shield volcanoes are made of ice'], 'compare', 2),
      Q('According to the text, why can stratovolcanoes erupt explosively?', ['Their thick, sticky magma traps gas until the pressure grows too great', 'They form over hot spots in the middle of plates', 'Their lava is runny and flows long distances', 'They are found only on islands'], 'evidence', 3),
      Q("Why did the author include the section 'Gifts from Volcanoes'?", ['To show that volcanoes are not only dangerous but also helpful', 'To explain how to climb a volcano', 'To describe the Ring of Fire', 'To list every volcano in the world'], 'craft', 3),
    ],
    writePrompt: 'Using information from at least three sections, write an informative essay explaining how volcanoes form and why scientists watch them closely.',
  },
  {
    id: '35-27',
    band: '35',
    genre: 'folktale',
    title: 'The Six Friends and the Elephant',
    origin: 'Parable retold — India (Buddhist and Jain tradition)',
    text: `Long ago, in a village in India, there lived six friends who were blind. They were known throughout the land for their wisdom, and they loved nothing more than a good discussion about the nature of things.

One day, news spread through the village that a traveling merchant had arrived with an elephant. None of the six friends had ever met an elephant. "We must learn what this creature is like," said the eldest. So they asked a boy to lead them to the market square.

The first friend stepped forward and wrapped his arms around one of the elephant's legs. It was round, rough and sturdy. "Why, an elephant is like a pillar that holds up a temple roof!" he announced.

The second friend caught hold of the elephant's tail as it swished past. "Nonsense," he said. "An elephant is like a broom for sweeping the floor."

The third friend reached up and felt the elephant's wide, flat ear flapping back and forth. "You are both mistaken," he laughed. "An elephant is like a big basket for sifting rice."

The fourth friend touched one of the elephant's tusks. It was smooth, hard and curved. "Clearly," he said, "an elephant is like the blade of a plow."

The fifth friend took hold of the trunk as it swung and curled. "An elephant is like a thick, wriggling snake," he declared.

The sixth friend patted the elephant's broad forehead. "You are all wrong. An elephant is like a giant clay pot!"

The six friends began to argue. Their voices grew louder and louder. Each was certain that he alone was right and that the others were foolish.

The merchant, who had been watching, finally spoke. "Friends," he said kindly, "each of you is right, and each of you is wrong. You have each touched only one part of the elephant. If you put together what all of you know, you will understand the whole animal."

The six friends fell quiet. Then, one by one, they began to share. The pillar, the broom, the basket, the plow, the snake and the pot came together in their minds, and at last they understood.

Since that day, people in India and around the world have told this story to remind us that each person may hold only part of the truth, and that we see more clearly when we listen to one another.`,
    focus: ['theme', 'compare', 'text-structure'],
    vocab: [
      ['sturdy', 'strong and solid'],
      ['announced', 'said something out loud for others to hear'],
      ['mistaken', 'wrong about something'],
      ['certain', 'completely sure'],
      ['foolish', 'silly or not wise'],
    ],
    questions: [
      Q('What did the friend who touched the tusk think an elephant was like?', ['The blade of a plow', 'A pillar', 'A broom', 'A clay pot'], 'detail', 1),
      Q("Each friend 'was certain that he alone was right.' What does certain mean?", ['Completely sure', 'Very confused', 'A little worried', 'Quite angry'], 'vocab', 2),
      Q('How does the author organize the middle of the story?', ['Each friend touches a different part and makes a comparison, one after another', 'The story jumps back and forth in time', 'The merchant tells his life story', 'The friends travel to six different villages'], 'craft', 2),
      Q('Why did each friend believe he alone was right?', ['Each trusted only the part he had touched himself', 'The merchant tricked them', 'They could not hear each other', 'The elephant kept changing shape'], 'inference', 3),
      Q('Which statement best expresses the theme?', ['People understand more of the truth when they combine their different points of view', 'Elephants are dangerous animals', 'Merchants are wiser than other people', 'Discussions are always a waste of time'], 'theme', 3),
    ],
    writePrompt: 'Describe a real-life situation in which people might act like the six friends, each seeing only part of a problem. Explain how the lesson of the folktale could help them, using details from the story.',
  },
  {
    id: '35-28',
    band: '35',
    genre: 'fiction',
    title: "The Clockmaker's Riddle",
    origin: ORIG,
    text: `Tomáš and his sister Eliška had visited their grandfather's clock shop in Prague a hundred times, but they had never seen it like this. The door was unlocked, the lights were on, and Grandpa Jiří was nowhere to be found. On the counter lay an envelope with their names on it.

Eliška tore it open and read aloud: "Happy birthday, twins! Your present is hidden in the shop. To find it, listen for the things that have stopped talking. Love, Grandpa."

Tomáš groaned. "There must be fifty clocks in here."

He was right. Clocks covered every wall: cuckoo clocks with carved birds, tall clocks with swinging pendulums, tiny clocks under glass domes. Together they made a constant chorus of ticks and tocks.

"'Stopped talking,'" Eliška repeated slowly. "Clocks talk by ticking. We need to find the ones that are silent."

They closed their eyes and moved from wall to wall, listening. It was harder than it sounded. The ticking blended together like rain on a roof. But after several minutes, Tomáš pressed his ear to a green clock near the window. "This one's quiet," he whispered.

Eliška found a second silent clock above the workbench, a third behind a stack of boxes and a fourth high on a shelf. On each brass pendulum, someone had scratched a single letter.

"B," Tomáš read from the green clock.

"E," said Eliška at the workbench. Then "L," and another "L."

"Bell?" Tomáš said. "But there's no bell in a clock shop."

Eliška frowned. Then she spun around to face the front door. Every time someone entered, a little brass bell above the door jingled. But when they had walked in that morning, it had made no sound at all.

She dragged over a stool, climbed up and peered inside the bell. Someone had stuffed it with a soft cloth to keep it quiet. Tucked inside the cloth were two small velvet boxes.

Just then, the back door creaked open, and Grandpa Jiří stepped in, grinning. "I see my two detectives have cracked the case," he said.

The twins opened their boxes. Inside each was a pocket watch, ticking softly, engraved with their names.

"Every good detective," said Grandpa, "needs to keep track of time."`,
    focus: ['plot', 'inference', 'key-details'],
    vocab: [
      ['pendulums', 'weights that swing back and forth to keep a clock\'s time'],
      ['constant', 'going on all the time without stopping'],
      ['chorus', 'many sounds heard together at once'],
      ['blended', 'mixed together so the parts are hard to tell apart'],
      ['engraved', 'with words or designs cut into the surface'],
    ],
    questions: [
      Q('Where were the letters hidden?', ['Scratched on the pendulums of the silent clocks', 'Inside the cuckoo birds', 'On the back of the envelope', 'Under the workbench'], 'detail', 1),
      Q("The ticking 'blended together like rain on a roof.' What does blended mean?", ['Mixed together so the parts are hard to tell apart', 'Stopped suddenly', 'Grew very loud', 'Broke into pieces'], 'vocab', 2),
      Q('What did Eliška do right after the twins spelled BELL?', ['She remembered that the door bell had not rung that morning', 'She opened the velvet boxes', 'She found the green clock', 'She read the envelope aloud'], 'sequence', 2),
      Q('Why had Grandpa stuffed cloth inside the door bell?', ['So the bell would be silent like the clocks, fitting his clue about things that stopped talking', 'To protect it from the rain', 'To make it ring louder', 'To hide his shop keys'], 'inference', 3),
      Q('Which detail best shows that Eliška solves problems by thinking carefully about words?', ["She says, 'Clocks talk by ticking. We need to find the ones that are silent.'", 'She tore the envelope open.', 'She found a clock above the workbench.', 'She dragged over a stool.'], 'evidence', 3),
    ],
    writePrompt: 'Grandpa Jiří planned the clue hunt carefully. Explain how each clue led the twins to the present, and tell whether you think the riddle was fair, using evidence from the story.',
  },
  {
    id: '35-29',
    band: '35',
    genre: 'biography',
    title: 'Srinivasa Ramanujan: The Man Who Knew Numbers',
    origin: ORIG,
    text: `In 1887, in the town of Erode in southern India, a boy named Srinivasa Ramanujan was born. His family was poor, but his mind was rich with numbers. As a schoolboy in the town of Kumbakonam, he solved problems that puzzled older students, and he loved to recite long strings of digits.

When Ramanujan was about fifteen, he found an old math book that listed thousands of formulas with very few explanations. For most students, the book would have been dull. For Ramanujan, it was a doorway. He worked through the formulas and then began inventing new ones of his own, filling notebooks with ideas.

His love of math caused problems, too. Ramanujan was so focused on numbers that he neglected his other subjects. He failed his college exams and lost his scholarship. For years, he struggled to find work. Finally, he took a job as a clerk in an office in the city of Madras, now called Chennai, where he kept working on math in every spare moment.

In 1913, Ramanujan took a bold step. He wrote a letter to G. H. Hardy, a famous mathematician at Cambridge University in England, and included pages of his results. At first, Hardy was not sure what to think. Some of the formulas seemed impossible. But the more he studied them, the more amazed he became. Hardy later said they had to be true, because no one would have had the imagination to invent them.

Hardy invited Ramanujan to Cambridge. In 1914, Ramanujan sailed to England. The two men worked together for five years and published many important papers. In 1918, Ramanujan was elected a Fellow of the Royal Society, one of the highest honors a scientist in Britain can receive.

Life in England was hard. The weather was cold and gray, and Ramanujan, a strict vegetarian, found it difficult to get the foods he needed. He became very ill. In 1919, he returned to India, where he died the next year. He was only thirty-two.

Ramanujan left behind notebooks full of thousands of results. Mathematicians are still studying them today, and some of his ideas are now used in areas of science he never could have imagined. His story shows that talent can come from anywhere and that curiosity can carry a person across the world.`,
    focus: ['main-idea', 'text-structure', 'inference'],
    vocab: [
      ['recite', 'to say something aloud from memory'],
      ['formulas', 'math rules written with numbers and symbols'],
      ['neglected', 'did not give enough care or attention to'],
      ['clerk', 'an office worker who keeps records'],
      ['imagination', 'the ability to think up new ideas'],
      ['elected', 'chosen by a vote'],
    ],
    questions: [
      Q('To whom did Ramanujan write his famous letter in 1913?', ['G. H. Hardy', 'A teacher in Kumbakonam', 'The king of England', 'An office manager in Madras'], 'detail', 1),
      Q("Ramanujan 'neglected his other subjects.' What does neglected mean?", ['Did not give enough care or attention to', 'Studied very hard', 'Taught to other students', 'Wrote books about'], 'vocab', 2),
      Q('Which event happened right after Ramanujan sailed to England?', ['He worked with Hardy and published important papers', 'He found an old math book', 'He failed his college exams', 'He took a job as a clerk'], 'sequence', 2),
      Q("Why did Hardy decide the formulas 'had to be true'?", ['They were so surprising that no one could have simply made them up', 'Ramanujan promised they were true', 'Another mathematician checked them first', 'They were copied from a famous book'], 'inference', 3),
      Q('Which sentence best states the central idea of the biography?', ["Despite poverty and hardship, Ramanujan's curiosity and talent made him one of the world's great mathematicians", 'Ramanujan did not like the weather in England', 'Ramanujan worked as a clerk in Madras', 'Cambridge University is in England'], 'main-idea', 3),
    ],
    writePrompt: "The biography says Ramanujan's story shows \"that talent can come from anywhere.\" Write an essay explaining what this means, using at least three events from his life as evidence.",
  },
  {
    id: '35-30',
    band: '35',
    genre: 'informational',
    title: 'The Silk Road',
    origin: ORIG,
    text: `## A Road That Wasn't One Road
The Silk Road was not a single paved highway. It was a huge network of trade routes that connected China with Central Asia, India, the Middle East and Europe. Some routes crossed deserts and mountains, while others traveled by sea. Traders used these routes for more than 1,500 years, beginning about 2,100 years ago, during China's Han dynasty. The name "Silk Road" came much later, in the 1800s, from a German geographer.

## Why Silk?
For centuries, only the Chinese knew how to make silk from the cocoons of silkworms, and they kept the method a closely guarded secret. Silk was soft, light and beautiful, and wealthy people far away were willing to pay enormous prices for it. But silk was only one of many goods. Traders also carried spices, tea, jade, glass, gold, horses and paper.

## Traveling the Routes
Very few traders traveled the whole Silk Road from one end to the other. Instead, goods passed from merchant to merchant, like a relay race, changing hands many times along the way. Camels were favorite animals for desert crossings because they could carry heavy loads and survive for days without water. Traders often traveled together in large groups called caravans for safety. At night, they rested at inns called caravanserais, where travelers and animals could find food, water and shelter.

## More Than Goods
Traders carried more than things to sell. They also carried ideas. Religions such as Buddhism spread along the Silk Road from India into China. Inventions moved, too. Papermaking traveled from China westward to the Middle East and eventually to Europe. Music, foods, languages and stories were shared among people who might never have met otherwise.

## The Road's Legacy
Over time, sea routes became faster and safer, and the land routes grew less important. Yet the Silk Road changed the world. It linked faraway peoples and showed how trade can spread knowledge and connect cultures.`,
    focus: ['main-idea', 'text-features', 'cause-effect'],
    vocab: [
      ['network', 'a group of connected lines, paths or things'],
      ['cocoons', 'silky cases that some insects spin around themselves'],
      ['enormous', 'very large'],
      ['caravans', 'groups of people and animals traveling together'],
      ['shelter', 'a place that protects from weather or danger'],
      ['legacy', 'something from the past that still affects the future'],
    ],
    questions: [
      Q('Why were camels useful on the Silk Road?', ['They could carry heavy loads and go for days without water', 'They could swim across seas', 'They made silk', 'They knew the way without guides'], 'detail', 1),
      Q("Traders traveled in 'caravans' for safety. What are caravans?", ['Groups of people and animals traveling together', 'Inns where travelers sleep', 'Boats that cross the sea', 'Maps of trade routes'], 'vocab', 2),
      Q("Why does the author compare Silk Road trade to 'a relay race'?", ['To show that goods were passed from one trader to the next along the way', 'To show that traders liked to race camels', 'To explain that the Silk Road was short', 'To describe how fast silk was made'], 'craft', 2),
      Q('Why did China most likely keep the method of making silk a secret?', ['Keeping the secret let China control a valuable product that others paid high prices for', 'Silk was dangerous to make', 'Silkworms could not live in other countries', 'The Chinese did not like to wear silk'], 'inference', 3),
      Q('Which statement best sums up the text?', ['The Silk Road was a network of routes that spread goods, ideas and inventions between faraway cultures', 'The Silk Road was a paved highway made of silk', 'Camels were the only animals used for trade', 'Silk was the only thing traded between China and Europe'], 'main-idea', 3),
    ],
    writePrompt: "The heading 'More Than Goods' suggests that the Silk Road shared more than things to sell. Write an informative essay explaining what else traveled along the Silk Road and why it mattered, citing details from the text.",
  },
  {
    id: '35-31',
    band: '35',
    genre: 'opinion',
    title: 'Bring the Stars Back to Riverton',
    origin: ORIG,
    text: `My name is Aarav, and I am in fifth grade. Last summer, my family went camping in the mountains, far from any city. When the campfire burned low, I looked up and gasped. The sky was crowded with more stars than I had ever seen. A pale, cloudy stripe stretched from one side of the sky to the other. My dad told me it was the Milky Way, the galaxy we live in.

When we got home to Riverton, I went outside to look for it. I could see maybe ten stars. The Milky Way was still there, of course. It was just hidden behind the glow of our town's lights. I believe Riverton should reduce light pollution so that everyone can see the stars again.

First, light pollution wastes energy and money. Many streetlights and parking lot lights shine light up into the sky, where nobody needs it. Light that shines into the sky does not help anyone see the sidewalk, but our town still pays for that electricity. If we replaced old lights with shielded ones that point downward, we could light the streets just as well while using less energy.

Second, too much light at night can harm wildlife. Scientists have found that bright lights can confuse birds that migrate at night, causing them to fly off course. On beaches, baby sea turtles that hatch at night can crawl toward bright buildings instead of the ocean. Huge numbers of insects are drawn to lights every night, too. Riverton is not near the ocean, but flocks of birds fly over our town every spring and fall.

Third, seeing the night sky is something every person deserves. For thousands of years, people everywhere used the stars to tell stories, keep calendars and find their way. Today, many kids have never seen the Milky Way. We should not have to drive for hours to see our own galaxy.

Some people worry that less light will make streets less safe. But dark-sky lighting is not about turning off all the lights. It is about using the right amount of light, aimed where people actually need it.

I am asking the town council to replace our streetlights with shielded lights and to encourage businesses to turn off their signs after closing. Let's bring the stars back to Riverton.`,
    focus: ['author-purpose', 'point-of-view', 'key-details'],
    vocab: [
      ['galaxy', 'a huge group of stars, gas and dust held together in space'],
      ['pollution', 'harmful or unwanted things added to the environment'],
      ['shielded', 'covered so that something, like light, is blocked'],
      ['migrate', 'to move from one region to another when the seasons change'],
      ['deserves', 'should have or has earned'],
      ['council', 'a group of people chosen to make decisions for a town'],
    ],
    questions: [
      Q('What did Aarav see while camping that he could not see at home?', ['The Milky Way', 'The moon', 'A campfire', 'Streetlights'], 'detail', 1),
      Q("Aarav wants 'shielded' lights. What does shielded mean?", ['Covered so that something, like light, is blocked', 'Painted a bright color', 'Turned on all night', 'Made much brighter'], 'vocab', 2),
      Q('Why does Aarav begin with a story about camping?', ['To show readers what people miss when light pollution hides the stars', 'To explain how to set up a tent', 'To prove that camping is better than living in town', "To describe his family's car"], 'craft', 2),
      Q('Which detail best supports the reason that light pollution can harm wildlife?', ['Baby sea turtles can crawl toward bright buildings instead of the ocean.', 'Our town still pays for that electricity.', 'People used the stars to keep calendars.', 'The Milky Way is the galaxy we live in.'], 'evidence', 3),
      Q('How does Aarav respond to people who worry about safety?', ['He explains that dark-sky lighting uses the right amount of light, aimed where it is needed', 'He says safety does not matter', 'He agrees that all lights should stay on', 'He ignores the worry completely'], 'craft', 3),
    ],
    writePrompt: "Is Aarav's argument convincing? Write a letter to the Riverton town council agreeing or disagreeing with him. Use at least two of his reasons and pieces of evidence as support or as points you argue against.",
  },
  {
    id: '35-32',
    band: '35',
    genre: 'fiction',
    title: 'The Library of Lost Sounds',
    origin: ORIG,
    text: `The cat had a crooked tail and one white ear, and it moved through the crowded streets of Istanbul as though it owned them. Defne followed it past spice stalls piled with red and gold powders, past a man selling roasted chestnuts and down a narrow alley she had never noticed before. At the end of the alley, the cat slipped through a tiny green door.

Defne hesitated. Then she knocked.

The door swung open on its own. Inside was a room much larger than it should have been, lined from floor to ceiling with glass jars. Each jar was labeled in neat, curling handwriting, and each one seemed to hum faintly.

"Welcome to the Library of Lost Sounds," said a woman with silver hair, setting down a feather duster. "I am the librarian. Please don't shake the jars."

Defne leaned close to read the labels. First Rain on a Tin Roof. A Baby's First Laugh. The Last Song of the Old Ferry Horn.

"What is this place?" Defne whispered.

"When people stop listening to a sound, it slowly drifts away from the world," the librarian explained. "It comes here, and I keep it safe until someone is ready to hear it again."

As Defne walked between the shelves, she noticed a small jar on a low shelf. The label said: Defne's Singing Voice, Age 9.

Her stomach dropped. Last year, she had sung a solo at the school concert. Her voice had cracked on the high note, and a few kids had laughed. Since then, she had not sung a single note, not even in the shower.

"That one arrived last spring," said the librarian gently. "It has been waiting for you."

"But what if it cracks again?" Defne asked.

The librarian smiled. "Voices crack. Voices also grow. A voice cannot grow if it is kept in a jar."

Defne picked up the jar. It was warm in her hands. Slowly, she twisted off the lid. A soft melody floated out, wrapped around her like a scarf and settled in her throat.

When she stepped back into the alley, the cat was waiting, and the green door had disappeared. Defne took a deep breath and, very quietly, began to hum. Then she sang, louder and louder, all the way home through the noisy streets.`,
    focus: ['theme', 'figurative-language', 'character'],
    vocab: [
      ['crooked', 'bent or twisted, not straight'],
      ['hesitated', 'paused because of feeling unsure'],
      ['labeled', 'marked with words that tell what something is'],
      ['faintly', 'in a weak, soft way'],
      ['solo', 'a song or piece performed by one person alone'],
      ['melody', 'a tune; a series of musical notes'],
    ],
    questions: [
      Q('What did Defne follow into the alley?', ['A cat with a crooked tail', 'A woman with silver hair', 'A man selling chestnuts', 'A floating jar'], 'detail', 1),
      Q("'Defne hesitated. Then she knocked.' What does hesitated mean?", ['Paused because of feeling unsure', 'Ran away quickly', 'Laughed out loud', 'Knocked very hard'], 'vocab', 2),
      Q("The melody 'wrapped around her like a scarf.' What does this simile suggest?", ['The song felt warm and comforting to Defne', 'The song was itchy and uncomfortable', 'Defne was cold and needed a scarf', 'The jar was made of cloth'], 'craft', 2),
      Q("Why had Defne's singing voice ended up in the library?", ['She had stopped singing after kids laughed at her', 'She lost it in the crowded market', 'The cat stole it', 'The librarian took it from the concert on purpose'], 'inference', 3),
      Q("What does the librarian's line 'A voice cannot grow if it is kept in a jar' suggest about the theme?", ['We must keep using our talents, even after mistakes, in order to grow', 'Glass jars are bad for storing things', 'Only grown-ups should sing solos', 'It is better to stay quiet so no one laughs'], 'theme', 3),
    ],
    writePrompt: "Imagine you visit the Library of Lost Sounds. Write a narrative about a jar you find that holds a sound from your own life, and explain why you choose to open it or leave it. Follow the library's rules from the story.",
  },
  {
    id: '35-33',
    band: '35',
    genre: 'folktale',
    title: 'Ma Liang and the Magic Paintbrush',
    origin: 'Retold from a modern Chinese tale (Hong Xuntao, 1955), based on folk motifs',
    text: `Long ago in China, there lived a poor boy named Ma Liang who loved to draw more than anything. He drew with a stick in the dirt, with charcoal on rocks and with his finger in the river sand. But he had no money to buy a brush.

One night, an old man with a long white beard appeared in his dream and handed him a paintbrush that shimmered like moonlight. "Use it to help others," the old man said. When Ma Liang awoke, the brush was in his hand.

He painted a bird on a wall, and it fluttered its wings and flew away. Ma Liang realized the brush was magic: whatever he painted became real.

From then on, Ma Liang used the brush to help his neighbors. He painted a water buffalo for a farmer who had to pull his own plow. He painted buckets for a family who carried water in their hands. He painted a stream that flowed through a dry village. But he never painted riches for himself.

News of the magic brush reached a greedy governor. He sent guards to bring Ma Liang to his palace. "Paint me a mountain of gold," the governor commanded.

Ma Liang refused. "This brush is for people in need," he said.

The furious governor locked him in a room. But Ma Liang painted a door on the wall, opened it and walked out.

The governor tracked him down and changed his tone. "Please," he said, smiling falsely, "just paint me a beautiful sea, with a boat to sail on." Ma Liang agreed.

He painted a calm blue sea. Then he painted a fine boat, and the governor and his guards climbed aboard. "Now paint gold on that island!" the governor shouted, pointing far out across the water.

Instead, Ma Liang painted a gentle breeze. The sails filled, and the boat glided away. Then he painted a stronger wind, and a stronger one, until the boat carried the governor to an island so distant that he was never able to bother the villagers again.

Ma Liang returned to his village. He kept painting for the rest of his life, always for those who needed help, and never for those who only wanted more.`,
    focus: ['theme', 'character', 'plot'],
    vocab: [
      ['shimmered', 'shone with a soft, flickering light'],
      ['riches', 'lots of money or valuable things'],
      ['greedy', 'wanting more than you need, especially money'],
      ['commanded', 'gave an order'],
      ['furious', 'very angry'],
      ['glided', 'moved smoothly and easily'],
    ],
    questions: [
      Q('What happened to anything Ma Liang painted with the brush?', ['It became real', 'It turned to gold', 'It disappeared', 'It began to sing'], 'detail', 1),
      Q("The governor is described as 'greedy.' What does greedy mean?", ['Wanting more than you need, especially money', 'Kind and generous', 'Shy and quiet', 'Tired and weak'], 'vocab', 2),
      Q('How is Ma Liang different from the governor?', ['Ma Liang uses the brush to help others, while the governor wants riches for himself', 'Ma Liang is rich, while the governor is poor', 'The governor loves to paint, while Ma Liang does not', 'Both of them want a mountain of gold'], 'compare', 2),
      Q("Why did the governor 'change his tone' and ask politely for a sea?", ['He was trying to trick Ma Liang after giving orders had failed', 'He had decided to become kind', 'He wanted to give the boat to the villagers', 'He was afraid of mountains'], 'inference', 3),
      Q('Which statement best expresses the theme?', ['Gifts and talents should be used to help others, not to feed greed', 'Magic always causes trouble', 'It is wise to obey every command', 'The sea is more powerful than gold'], 'theme', 3),
    ],
    writePrompt: "The old man told Ma Liang, \"Use it to help others.\" Write an essay explaining how Ma Liang followed this advice, even when it was difficult. Use at least three events from the folktale.",
  },
  {
    id: '35-34',
    band: '35',
    genre: 'poetry',
    title: 'What the River Knows',
    origin: ORIG,
    text: `Up where the mountain keeps its snow
all winter like a secret,
the river begins as almost nothing:
a drip from an icicle,
a trickle under a stone,
a whisper you could step over
without getting your sneakers wet.

But listen.
The whisper is already practicing
the long word it will say
all the way to the sea.

Down the slope it hurries,
gathering other whispers,
a spring here, a melting drift there,
until it is a stream that tumbles over rocks
and laughs like my cousins
racing down the stairs on the first day of summer.

In the valley it slows.
It widens.
It lets the willows dip their long green fingers in.
Herons stand in it on one leg,
patient as old men waiting for the bus.
Trout hang in the current
like silver thoughts that haven't decided
where to go.

The river does not argue with the boulder.
It goes around.
The river does not hurry the seasons.
It freezes when it must,
and under the ice it keeps moving,
quiet,
the way my grandmother hums
when she thinks no one can hear.

Past the farms it carries
mud from the mountain
and lays it down like a gift,
so the corn can grow taller
and the tomatoes can blush.

Through the city it wears bridges
like bracelets.
It reflects the lights at night,
shivers them into a thousand pieces,
then puts them back together.

People toss in pennies and wishes.
Sometimes they toss in things they shouldn't:
bottles, bags, the leftovers of hurry.
The river carries those, too,
but it remembers.
A river always remembers.

And at last, at the edge of everything,
the river meets the sea.
It doesn't stop.
It doesn't disappear.
It simply becomes bigger than its name,
salty and wide and breathing.

Someday the sun will lift it
back into the clouds,
and the clouds will carry it
back to the mountain,
and the mountain will keep it
all winter like a secret.

I think the river knows something
I am still learning:
that you can change your shape
a hundred times
and still be
exactly who you are.`,
    focus: ['figurative-language', 'theme', 'text-structure'],
    vocab: [
      ['trickle', 'a thin, slow flow of liquid'],
      ['widens', 'becomes wider'],
      ['patient', 'able to wait calmly'],
      ['current', 'the flow of water in one direction'],
      ['boulder', 'a very large rock'],
      ['reflects', 'shows an image back, like a mirror'],
    ],
    questions: [
      Q('Where does the river begin in the poem?', ['High on a snowy mountain', 'In the middle of a city', 'At the edge of the sea', 'On a farm'], 'detail', 1),
      Q("What does the poet mean when the river 'wears bridges / like bracelets'?", ['Bridges cross the river in many places, the way bracelets circle an arm', 'The river is covered in jewelry', 'The bridges are falling into the river', 'People sell bracelets on the bridges'], 'craft', 2),
      Q("Trout 'hang in the current.' What is a current?", ['The flow of water in one direction', 'A kind of fishing net', 'The muddy bottom of a river', 'A small wave on the shore'], 'vocab', 2),
      Q("What does 'A river always remembers' suggest about the trash people throw in?", ['Pollution has lasting effects that do not simply go away', 'The river will return the trash to its owners', 'Rivers can think exactly like people', 'The trash helps the corn grow'], 'inference', 3),
      Q("Which statement best expresses the poem's theme?", ['You can change in many ways and still stay true to who you are', 'Rivers are dangerous in winter', 'Cities are more beautiful than mountains', 'Snow always melts in spring'], 'theme', 3),
    ],
    writePrompt: 'Choose two places the river travels in the poem. Write an essay explaining how the poet uses figurative language to describe the river in each place, and how those descriptions build the poem\'s message.',
  },
  {
    id: '35-35',
    band: '35',
    genre: 'informational',
    title: 'How Airplanes Fly',
    origin: ORIG,
    text: `## Four Forces
Every airplane in the sky is part of a tug-of-war between four forces: lift, weight, thrust and drag. To fly, an airplane must balance all four. Understanding these forces explains how a machine weighing hundreds of tons can stay up in the air.

## Weight and Lift
Weight is the force of gravity pulling the airplane down toward Earth. To overcome weight, an airplane needs lift, an upward force created by its wings. An airplane wing is carefully shaped. It is usually curved on top and tilted slightly upward at the front. As the airplane speeds forward, the wing pushes air downward behind it. When the wing pushes air down, the air pushes the wing up. At the same time, air flowing over the curved top of the wing speeds up, and the air pressure above the wing becomes lower than the pressure below it. This difference in pressure also helps push the wing upward.

## Try It
Hold a flat piece of cardboard in front of you and walk quickly, tilting its front edge up slightly. You will feel the air push it upward. That push is a small taste of lift.

## Thrust and Drag
Lift only works if the wings are moving quickly through the air. The forward push that moves an airplane is called thrust. Jet engines create thrust by sucking in air, mixing it with fuel, burning it and blasting hot gases out the back. Propellers create thrust with spinning blades that pull the airplane forward. Drag is the force that pushes back against a moving airplane, like the resistance you feel when you run into a strong wind. Engineers give airplanes smooth, sleek shapes to reduce drag.

## Taking Off and Landing
At takeoff, the engines produce lots of thrust, and the plane races down the runway. When it is moving fast enough, the wings create more lift than the plane's weight, and it rises into the air. To land, the pilot reduces thrust and slows the airplane. Flaps on the wings extend to help create lift at lower speeds, and the plane gently descends to the runway.

## A Balancing Act
When an airplane is cruising at a steady height and speed, lift equals weight and thrust equals drag. Pilots adjust the engines and the moving parts on the wings and tail to keep that balance just right.`,
    focus: ['text-structure', 'cause-effect', 'text-features'],
    vocab: [
      ['overcome', 'to beat or get past something'],
      ['tilted', 'tipped so one side is higher than the other'],
      ['resistance', 'a force that works against motion'],
      ['sleek', 'smooth and shaped to move easily'],
      ['extend', 'to stretch out or make longer'],
      ['descends', 'moves downward'],
    ],
    questions: [
      Q('Which force pulls an airplane down toward Earth?', ['Weight', 'Lift', 'Thrust', 'Drag'], 'detail', 1),
      Q("Drag is like the 'resistance' you feel running into wind. What is resistance?", ['A force that works against motion', 'A force that pushes you forward', 'A kind of engine', 'The shape of a wing'], 'vocab', 2),
      Q('Which section explains what jet engines and propellers do?', ['Thrust and Drag', 'Weight and Lift', 'Taking Off and Landing', 'A Balancing Act'], 'craft', 2),
      Q('According to the text, why does an airplane rise off the runway?', ["Once it is moving fast enough, its wings make more lift than the plane's weight", 'Its flaps push it off the ground', 'Its weight disappears at high speed', 'Drag lifts it upward'], 'evidence', 3),
      Q('Which sentence best states the main idea?', ['Airplanes fly by balancing four forces: lift, weight, thrust and drag', 'Jet engines burn fuel', 'Airplane wings are curved on top', 'Pilots land planes on runways'], 'main-idea', 3),
    ],
    writePrompt: 'Explain to a younger reader how an airplane takes off, flies and lands. Use all four forces from the text, and organize your writing with at least two headings.',
  },
  {
    id: '35-36',
    band: '35',
    genre: 'fiction',
    title: 'The Banana Raft',
    origin: ORIG,
    text: `The rain had been falling for six days when Rafi woke to the sound of water lapping against the stilts beneath his family's house. He scrambled to the window. The rice fields of their village in Bangladesh had disappeared. In their place stretched a wide brown lake, dotted with the tops of palm trees and the roofs of sheds.

"The river has come to visit," said his grandmother, Nanu, tying her scarf tightly. She tried to sound calm, but Rafi saw her looking toward the low field across the water. "My goats," she whispered.

Through the gray rain, Rafi and his older sister, Nusrat, could see Nanu's four goats huddled on a small mound of higher ground. The water was rising around them, inch by inch.

"We have to get them," Nusrat said.

Their uncle Jamal shook his head. "Our boat was swept away last night."

Rafi looked at the banana trees beside the house, their thick trunks half underwater. He remembered his teacher explaining that families in their region had built rafts from banana trunks during floods for generations.

"Banana trunks float," he said. "We can make a raft."

Uncle Jamal studied the trees, then nodded slowly. Together, the family cut four trunks and lashed them side by side with rope and strips of bamboo. Nusrat found a long pole for pushing against the bottom. Uncle Jamal tested the raft first, rocking it with his weight. It held.

Wearing the orange life jackets the village school had given every family, Rafi and Nusrat climbed on beside their uncle. Jamal pushed the pole into the mud, and the raft drifted across the flooded field. The current tugged at them, but he kept them steady while Rafi watched for floating branches.

When they reached the mound, the goats bleated loudly. Nusrat coaxed them onto the raft one at a time with handfuls of grass. The smallest goat refused to move until Rafi scooped it up in his arms. It smelled like wet wool.

At last the raft bumped against the house. Nanu was waiting on the steps, laughing and crying at the same time.

That night, as rain drummed on the tin roof, the goats slept on the porch, and Nanu cooked rice and lentils for everyone. "This river is stubborn," she said, smiling at her grandchildren, "but so is this family."`,
    focus: ['setting', 'plot', 'character'],
    vocab: [
      ['stilts', 'tall posts that hold a building above the ground or water'],
      ['huddled', 'crowded closely together'],
      ['lashed', 'tied tightly with rope'],
      ['coaxed', 'gently persuaded someone to do something'],
      ['stubborn', 'not willing to change or give up'],
    ],
    questions: [
      Q('What did the family use to build the raft?', ['Banana tree trunks, rope and bamboo', 'Plastic bottles and tape', 'The roof of the shed', 'Palm leaves and mud'], 'detail', 1),
      Q("Nusrat 'coaxed' the goats onto the raft. What does coaxed mean?", ['Gently persuaded someone to do something', 'Chased away loudly', 'Tied up with rope', 'Counted carefully'], 'vocab', 2),
      Q('How does the setting create the problem in the story?', ['The flood surrounds the goats on a small mound as the water rises', 'The hot sun dries up the river', 'Snow blocks the road to the village', 'A storm knocks down the school'], 'craft', 2),
      Q("What does Nanu mean when she says, 'but so is this family'?", ['The family refuses to give up, just as the river keeps rising', 'The family does not listen to Nanu', 'The family wants to move away from the river', 'The family argues all the time'], 'inference', 3),
      Q('Which detail best shows that Rafi solved the problem by remembering what he had learned?', ['He remembered his teacher explaining that families built rafts from banana trunks during floods.', 'He scrambled to the window.', 'He scooped up the smallest goat.', 'He watched for floating branches.'], 'evidence', 3),
    ],
    writePrompt: 'Which character was most important to rescuing the goats: Rafi, Nusrat or Uncle Jamal? Write an opinion essay using at least three details from the story to support your choice.',
  },
];
