// Grades 6–8 reading passage library for the Year Curriculum (band '68').
// 36 passages on a length ladder: 01–12 Grade 6, 13–24 Grade 7, 25–36 Grade 8, genres interleaved.
// Original writing by Plajah Academia except myths retold in our own words.

import type { Passage, PassageQuestion } from '../../../services/yearCurriculum/types';

const ORIG = 'Original — Plajah Academia';

/** Question helper: correct choice first. */
const Q = (q: string, type: PassageQuestion['type'], level: 1 | 2 | 3, ...choices: string[]): PassageQuestion => ({ q, choices, type, level });

export const PASSAGES_68: Passage[] = [
  // ── Grade 6 ────────────────────────────────────────────────────────────────
  {
    id: '68-01',
    band: '68',
    genre: 'fiction',
    title: 'The Second Lane',
    origin: ORIG,
    text: `Maya Okafor had been swimming laps since she was seven, and for four years she had wanted one thing: a spot on the Riverside relay team. Tryouts were Saturday morning. Only four swimmers would make it, and everyone knew three of the spots already belonged to the eighth graders.

That left one spot, and two swimmers who wanted it. Maya was one. The other was Priya Nair, who had moved from Chicago in October and who swam the way some people breathe, without seeming to think about it.

On Friday afternoon, Maya stayed late to practice her turns. The pool was nearly empty, and the water lay flat and blue under the humming lights. She was pulling herself out at the far wall when she noticed Priya sitting on the bleachers, her goggles in her lap, staring at nothing.

"You okay?" Maya asked, before she could decide whether she wanted to.

Priya shrugged. "My flip turns are a disaster. In my old pool the walls had a black line two feet earlier. Here I keep misjudging and hitting my heels." She laughed, but it came out thin. "Coach says the turn is where I lose it."

Maya knew exactly what she meant. She had struggled with the same wall for a whole summer until her old coach taught her a trick: count strokes from the flags, not from the wall. Three strokes from the flags, tuck, and roll.

For a moment she said nothing. The trick was hers. It was the one advantage she had. If Priya kept clipping the wall tomorrow, the last spot would almost certainly be Maya's.

The lights hummed. Somewhere a door slammed.

"Count from the flags," Maya heard herself say. "Not the wall. Three strokes from the flags, then tuck. Your body learns it faster than your eyes do."

Priya looked up. "Seriously?"

"Try it."

They swam together for twenty minutes. By the end, Priya's turns were clean, quick, and close to perfect. Maya's stomach sank a little with every one.

On Saturday, Priya beat her by four-tenths of a second.

Maya sat on the bench afterward with a towel over her head, waiting for the disappointment to crush her. It did, a little. But underneath it was something steadier, something she hadn't expected. She had swum her best race. She had lost to someone who swam hers. Neither of them had needed luck.

Priya dropped down beside her, dripping. "Coach says there's an alternate spot," she said. "He wants you. And, Maya, thanks. I mean it."

Maya pulled the towel off and grinned. "Next year," she said, "I'm keeping my secrets."

They both knew she was lying.`,
    focus: ['character', 'theme', 'inference'],
    vocab: [
      ['misjudging', 'guessing wrong about a distance, amount, or situation'],
      ['advantage', 'something that puts you in a better position than others'],
      ['alternate', 'a backup person who can step in if needed'],
      ['disaster', 'something that goes very badly'],
      ['steadier', 'calmer and more stable'],
    ],
    questions: [
      Q("What problem does Priya describe to Maya?", 'detail', 2,
        "She keeps misjudging the wall on her flip turns because the markings differ from her old pool.",
        "She cannot breathe properly during long races.",
        "She is nervous about swimming in front of the eighth graders.",
        "Her goggles keep leaking during practice."),
      Q("In the sentence 'She laughed, but it came out thin,' the word thin suggests that Priya's laugh was—", 'vocab', 2,
        "weak and forced",
        "loud and cheerful",
        "quiet because the pool was empty",
        "sarcastic and unkind"),
      Q("Why does Maya hesitate before sharing the trick?", 'inference', 3,
        "She realizes that helping Priya could cost her the last spot on the team.",
        "She is not sure the trick will work in this pool.",
        "She is still angry that Priya ignored her in October.",
        "Her coach told her to keep the trick a secret."),
      Q("Which statement best expresses a theme of the story?", 'theme', 3,
        "Winning fairly can matter more than winning at any cost.",
        "Hard work always leads to victory.",
        "Newcomers should earn respect before asking for help.",
        "Keeping secrets is the key to success in sports."),
      Q("The final line, 'They both knew she was lying,' mainly shows that—", 'craft', 3,
        "Maya would help Priya again because generosity is part of who she is.",
        "Maya is still bitter about losing the race.",
        "Priya no longer trusts Maya.",
        "Maya plans to quit the relay team next year."),
    ],
    writePrompt: "Maya's choice costs her the spot she wanted. Was helping Priya the right decision? Use at least two details from the story to explain how Maya's feelings change from Friday to Saturday and what that change reveals about her.",
  },
  {
    id: '68-02',
    band: '68',
    genre: 'informational',
    title: 'Pulled by the Moon: How Tides Work',
    origin: ORIG,
    text: `## An Ocean That Breathes

If you spend a day at the beach, you may notice that the ocean seems to move in slow motion. In the morning, waves may crash high on the sand. By afternoon, the water may have pulled back, revealing wet rocks, seaweed, and tiny pools full of life. This regular rise and fall of the sea is called the tide, and its main cause is about 384,000 kilometers away: the Moon.

## The Pull of Gravity

Every object with mass pulls on every other object. This pull is called gravity. Earth's gravity keeps the Moon in orbit, but the Moon pulls back on Earth too. Solid rock barely responds, but the oceans can flow. The side of Earth facing the Moon is pulled most strongly, so water there heaps up into a bulge.

Surprisingly, a second bulge forms on the opposite side of Earth, the side facing away from the Moon. There, the Moon's pull is weakest, so the water is, in a sense, left behind as Earth is tugged toward the Moon. As Earth spins, each coastline passes through both bulges. That is why most beaches have two high tides and two low tides about every 24 hours and 50 minutes. The extra 50 minutes comes from the Moon moving along its orbit while Earth turns.

## The Sun Joins In

The Sun is far larger than the Moon, but it is also much farther away, so its effect on tides is less than half as strong. Still, it matters. When the Sun, Moon, and Earth line up during a new moon or full moon, their pulls combine. The result is a spring tide, with especially high highs and low lows. The name has nothing to do with the season; it comes from the idea of water springing up. When the Sun and Moon pull at right angles, during quarter moons, their effects partly cancel, creating milder neap tides.

## Shape Matters

The shape of a coastline can magnify the tide. In Canada's Bay of Fundy, the funnel-shaped bay squeezes incoming water, and the difference between high and low tide can reach about 16 meters, taller than a four-story building. In the open ocean, by contrast, the tide may change the water level by less than a meter.

## Why Tides Matter

Tides shape life along the shore. Crabs, sea stars, and snails in tide pools must survive hours of sun and air between floods. Sailors plan departures around the tide so ships don't scrape bottom. Engineers have even built power plants, such as one on the Rance River in France, that turn the flow of tidal water into electricity. Twice a day, the Moon's quiet pull reaches across space and moves an entire ocean.`,
    focus: ['central-idea', 'text-structure', 'vocabulary'],
    vocab: [
      ['gravity', 'the force that pulls objects with mass toward each other'],
      ['orbit', 'the curved path one object takes around another in space'],
      ['bulge', 'a part that swells or sticks out'],
      ['magnify', 'to make something larger or stronger'],
      ['revealing', 'showing something that was hidden'],
      ['departures', 'times when people or vehicles leave'],
    ],
    questions: [
      Q("According to the passage, why do most coasts have two high tides each day?", 'detail', 2,
        "Earth spins through two bulges of water, one facing the Moon and one on the opposite side.",
        "The Sun and Moon take turns pulling on the ocean.",
        "Winds push water toward shore twice a day.",
        "The Moon circles Earth twice every 24 hours."),
      Q("In the 'Shape Matters' section, magnify most nearly means—", 'vocab', 2,
        "make larger",
        "make clearer",
        "slow down",
        "reverse"),
      Q("How does the author mainly organize the information?", 'craft', 3,
        "By explaining a main cause and then showing how other factors change its effects",
        "By comparing tides on Earth with tides on other planets",
        "By telling the story of a scientist's discovery in time order",
        "By arguing for one theory and rejecting another"),
      Q("Based on the passage, a spring tide would most likely happen during—", 'inference', 3,
        "a full moon",
        "a quarter moon",
        "the spring season only",
        "any day with strong winds"),
      Q("Which detail best supports the idea that tides affect human activity?", 'evidence', 3,
        "Sailors plan departures around the tide so ships don't scrape bottom.",
        "Solid rock barely responds, but the oceans can flow.",
        "The Sun is far larger than the Moon.",
        "Crabs, sea stars, and snails in tide pools must survive hours of sun and air."),
    ],
    writePrompt: "Explain to a younger student why there are two high tides each day and why some tides are higher than others. Use at least three facts from the passage, including one from the section about the Sun.",
  },
  {
    id: '68-03',
    band: '68',
    genre: 'poetry',
    title: 'Inventory of a Thunderstorm',
    origin: ORIG,
    text: `First, the air goes quiet,
the way a classroom does
when the principal walks in.
The maple leaves turn their pale sides up
like palms asking a question.

Then the sky rearranges its furniture:
a long, low scraping
from somewhere past the water tower,
chairs of cloud dragged across a floor of cloud,
a table tipped, a cabinet slammed.

My little brother counts out loud
between the flash and the rumble,
one Mississippi, two Mississippi,
as if numbers were a fence
the storm could not climb over.

Here is what the rain takes with it:
the chalk hopscotch on the driveway,
yesterday's heat, the dust on the car,
the smell of cut grass, which it trades
for the smell of pennies and wet stone.

Here is what the rain leaves behind:
worms stretched like commas across the sidewalk,
a gutter singing in a voice too big for it,
puddles holding small pieces of sky
upside down and trembling.

Mom stands at the screen door
with her coffee going cold,
and for once she does not tell us
to come away from the window.
She watches too.
I think she is counting.

Lightning writes a word I almost read,
a jagged signature across the dark,
gone before I can sound it out.
The thunder follows, slower,
like a teacher repeating the lesson
for the kids in the back row.

The power flickers once, twice,
and the refrigerator stops humming,
and for a moment the whole house
holds its breath with us,
listening to the roof
drum its fingers in the dark.

And then, as suddenly as it arrived,
the storm packs its bags.
The rumble moves on toward the next town,
grumbling about the weather there.
The clouds tear open at one edge
and the late sun spills through,
gold and embarrassed,
as if it had been hiding all along
and hoped no one noticed.

We go outside barefoot.
The street steams.
Every leaf is dripping, every railing
strung with beads of light.
My brother stomps the biggest puddle
and the sky in it shatters
and then, patiently, puts itself back together.

I add it to the list:
one storm, one afternoon,
one brother, one mother at the door,
nothing broken
that couldn't mend.`,
    focus: ['figurative-language', 'word-choice', 'theme'],
    vocab: [
      ['rearranges', 'moves things into a new order or position'],
      ['jagged', 'having sharp, uneven points or edges'],
      ['signature', 'a person\'s name written in their own special way'],
      ['trembling', 'shaking slightly'],
      ['embarrassed', 'feeling awkward or shy about being noticed'],
      ['shatters', 'breaks suddenly into many pieces'],
    ],
    questions: [
      Q("In stanza 2, the sky 'rearranges its furniture.' This metaphor compares—", 'craft', 2,
        "the sound of thunder to heavy furniture being dragged and slammed",
        "the clouds to a messy bedroom",
        "the storm to a family moving into a new house",
        "lightning to a lamp being switched on"),
      Q("According to the poem, how does counting 'one Mississippi, two Mississippi' seem to make the brother feel?", 'detail', 2,
        "As if the numbers could protect him like a fence the storm could not climb",
        "As if he were measuring how much rain had fallen",
        "As if he were practicing for a math test",
        "As if he could tell exactly when the storm would end"),
      Q("What can the reader infer from the lines 'for once she does not tell us / to come away from the window'?", 'inference', 3,
        "The mother is as fascinated by the storm as her children are.",
        "The mother is too angry to speak.",
        "The storm is not dangerous at all.",
        "The children have already left the window."),
      Q("How do the two stanzas beginning 'Here is what the rain takes' and 'Here is what the rain leaves behind' work together?", 'craft', 3,
        "They balance loss and gain, showing that the storm both removes and gives.",
        "They show that the rain only causes damage.",
        "They describe two different storms on two different days.",
        "They list the chores the family must do afterward."),
      Q("Which line best supports the theme that hard moments can pass and leave things whole?", 'theme', 3,
        "nothing broken / that couldn't mend",
        "The street steams.",
        "My little brother counts out loud",
        "Lightning writes a word I almost read"),
    ],
    writePrompt: "The poet makes the storm seem like a living visitor that arrives, acts, and leaves. Analyze how personification creates this effect. Quote at least two lines and explain what each one adds to the poem's mood.",
  },
  {
    id: '68-04',
    band: '68',
    genre: 'folktale',
    title: 'Anansi Sells Wisdom',
    origin: 'Folktale retold — Akan (Ghana)',
    text: `Kwaku Anansi had never doubted that he was the cleverest being in creation, but cleverness, he had noticed, was a slippery thing. Others had it too, in small and irritating amounts. The tortoise could untangle riddles. Even the hare occasionally managed to outwit him. Anansi resolved to put an end to this. Some tellers say the sky god Nyame handed him a clay pot of wisdom; others insist Anansi crept from village to village by night, skimming off every clever thought he overheard. However it happened, he ended up crouched in his web beside a pot so heavy with knowledge that it seemed to glow.

"When the farmers need to know when to plant, they will come to me," he mused. "When the chief must settle a quarrel, he will come to me. And every one of them will pay."

First, though, the pot had to disappear. He considered burying it, but the aardvark dug everywhere. He considered sinking it in the river, but the crocodile never slept. At last he chose the silk-cotton tree that towered over the forest, a crown no animal had ever reached.

He waited for darkness, knotted a cord around his middle, and slung the pot in front of him. The climb was a disaster from the first stride. The pot wedged itself between his chest and the bark, jammed under his chin, and knocked his knees loose. His legs scrabbled for a grip. Three times he gained a body's length; three times he slid back to the roots. By the time the eastern sky paled, he was scraped, sweating, and furious.

From the ferns came a small voice. Ntikuma, his youngest, had followed him out.

"Father," the boy said, "wouldn't it be easier if the pot were behind you? Then nothing would be between you and the tree."

Anansi froze, astonished. He, the keeper of all wisdom, had been beaten for an entire night by a problem a child had solved at a glance. His pride burned hotter than the sun now lifting over the hills.

With a shriek he flung the pot away. It dropped through the leaves and shattered against a root. The dawn wind scooped up what spilled and scattered it over fields and markets, cooking fires and sleeping children, so that everyone woke with a share.

For a while Anansi sulked among the shards. Then, being Anansi, he began to laugh, for even a proud spider can recognize when he has been taught something.

The Akan still tell this story when someone believes they hold every answer. Wisdom, they say, is like water spilled on the ground: everyone has a little, and no one can gather it all back.`,
    focus: ['theme', 'character', 'plot'],
    vocab: [
      ['outwit', 'to beat someone by being more clever'],
      ['scrabbled', 'scratched or clawed quickly to get a grip'],
      ['furious', 'extremely angry'],
      ['astonished', 'very surprised'],
      ['shattered', 'broke into many pieces'],
      ['recognize', 'to see and understand something for what it is'],
    ],
    questions: [
      Q("Why does Anansi want to hide the pot at the top of the tree?", 'detail', 2,
        "He wants to keep all the wisdom for himself so others must come to him.",
        "He wants to protect it from a coming storm.",
        "Nyame ordered him to return it to the sky.",
        "He plans to share it with the tortoise later."),
      Q("What happens immediately after Ntikuma gives his advice?", 'sequence', 2,
        "Anansi, angry and embarrassed, flings the pot away.",
        "Anansi ties the pot to his back and reaches the top.",
        "The tortoise steals the pot.",
        "Nyame takes the wisdom back to the sky."),
      Q("Why does Anansi's pride 'burn hotter than the sun'?", 'inference', 3,
        "He cannot accept that a small child understood something he did not.",
        "He is sunburned from climbing all morning.",
        "He is jealous that Ntikuma is stronger than he is.",
        "He believes Ntikuma is trying to steal the pot."),
      Q("Which sentence best states the lesson of the tale?", 'theme', 3,
        "Wisdom is spread among many people, so we should learn from one another.",
        "Clever creatures always end up alone.",
        "Children should not give advice to adults.",
        "Treasures should be hidden in high places."),
      Q("What is the purpose of the final paragraph?", 'craft', 3,
        "It connects the story's events to a lesson the Akan people still share.",
        "It introduces a new character for the next story.",
        "It explains how clay pots were made in Akan villages.",
        "It proves that the events in the tale really happened."),
    ],
    writePrompt: "Many folktales explain why something is the way it is. Explain how this tale accounts for why wisdom is found everywhere, and analyze how Anansi's character flaw causes that outcome. Use evidence from the text.",
  },
  {
    id: '68-05',
    band: '68',
    genre: 'fiction',
    title: 'Greenhouse Seven',
    origin: ORIG,
    text: `The dust storm arrived on the colony's 412th day, and by noon the sky over Greenhouse Seven had turned the color of old rust.

Tavi Mendes pressed her palm against the curved window and watched the light drain out of the afternoon. She was twelve, the youngest certified grower in Arcadia Base, and she knew exactly what a storm like this meant. The solar fields would be buried. Power would drop. And every greenhouse would have to survive on batteries until the sky cleared, maybe three days, maybe thirty.

Her wristband chimed. "Power rationing in effect," said the base computer in its calm, maddening voice. "Greenhouse Seven allocated forty percent."

Forty percent. Tavi did the math in her head and felt sick. Forty percent would keep only two of the five growing racks warm through the Martian night, when temperatures outside fell to eighty below.

She walked the rows. Rack one: lettuce, fast-growing, ready in three weeks. Rack two: beans, which fed nitrogen back into the soil. Rack three: the strawberries everyone loved, the only sweet thing most people tasted in a month. Rack four: potatoes, the colony's real food, slow and heavy and dull. Rack five: the seed vault trays, tiny sprouts of every crop they had brought from Earth, kept alive so they could replant if anything failed.

Her friend Jun's voice crackled over the comm. "Everybody's saving their strawberries," he said. "My mom says morale matters as much as calories."

Tavi looked at the strawberries, red and glossy under the dimming lamps. She thought about the little kids in the dining hall, how they cheered when berries appeared on the table. Then she looked at the seed trays, plain green threads in wet foam. No one cheered for those.

She thought about what her grandmother, a farmer in Brazil before the launch, used to say: Feed today, but plant for tomorrow.

Tavi powered down racks one, two, and three. She whispered an apology to the strawberries as their lamps went dark. She kept the potatoes and the seed vault running, then wrapped the lettuce in thermal blankets in case some survived.

The storm lasted nineteen days.

When the sky finally cleared, three of the base's five greenhouses had lost their seed trays. Every strawberry in the colony was dead. But in Greenhouse Seven, the potatoes were thick and healthy, and the seed vault was alive.

Within a month, Tavi's sprouts had replanted the whole base, strawberries included.

At the celebration dinner, Jun handed her the first ripe berry. "Morale," he said, grinning.

"Tomorrow," Tavi corrected, and ate it.`,
    focus: ['character', 'theme', 'plot'],
    vocab: [
      ['certified', 'officially approved as trained and able'],
      ['rationing', 'limiting how much of something each person or place gets'],
      ['maddening', 'extremely annoying'],
      ['allocated', 'given out as a share for a purpose'],
      ['morale', 'the confidence and spirit of a group of people'],
      ['thermal', 'designed to hold in heat'],
    ],
    questions: [
      Q("Why can Tavi keep only two racks warm?", 'detail', 2,
        "The storm has cut solar power, and her greenhouse was given only forty percent.",
        "Jun took her extra batteries.",
        "Two racks were already damaged by dust.",
        "The base computer forbids growing more than two crops."),
      Q("The word morale, as Jun's mother uses it, means—", 'vocab', 2,
        "people's spirits and sense of hope",
        "the amount of food people eat",
        "the rules of the colony",
        "the health of the plants"),
      Q("What does Tavi's decision reveal about her?", 'inference', 3,
        "She thinks about long-term survival even when it means giving up something people love.",
        "She dislikes strawberries and wants them gone.",
        "She follows whatever her friends decide.",
        "She does not trust the base computer's math."),
      Q("Which line best expresses the story's theme?", 'theme', 3,
        "Feed today, but plant for tomorrow.",
        "Power rationing in effect.",
        "Everybody's saving their strawberries.",
        "The storm lasted nineteen days."),
      Q("The author places 'The storm lasted nineteen days.' in its own one-sentence paragraph mainly to—", 'craft', 3,
        "emphasize how long and serious the storm was before revealing the results of Tavi's choice",
        "show that Tavi slept through the storm",
        "introduce a flashback to Earth",
        "suggest that the storm was shorter than expected"),
    ],
    writePrompt: "Jun believes morale matters as much as food, while Tavi plans for the future. Whose reasoning is stronger? Write a response that uses evidence from the story to support your view and that addresses the other character's point.",
  },
  {
    id: '68-06',
    band: '68',
    genre: 'informational',
    title: 'Threads Across a Continent: The Silk Road',
    origin: ORIG,
    text: `## More Than a Road

The name "Silk Road" makes it sound like a single highway paved with fabric. In reality, it was a vast network of trade routes, some over land and some over sea, that connected China with Central Asia, India, Persia, Arabia, Africa, and Europe. For more than 1,500 years, from around the second century BCE to the fifteenth century CE, these routes carried goods, people, and ideas across thousands of kilometers. The name itself is fairly new: a German geographer, Ferdinand von Richthofen, coined it in 1877.

## Passing Goods Hand to Hand

Few merchants traveled the entire route. Instead, goods moved in stages, like a relay race. A trader from Chang'an, China's capital, might carry bolts of silk west to an oasis city such as Dunhuang. There, the silk might be sold to a Sogdian merchant from Central Asia, who carried it on to Samarkand. From there it could pass to Persian traders and eventually reach markets around the Mediterranean. Each time goods changed hands, their price rose.

Silk was prized in Rome, where it was so expensive that some Roman writers complained about the amount of wealth flowing east. But silk was only one product. China also exported porcelain, paper, and later tea. Moving east came horses from Central Asia, glassware from the Mediterranean, cotton and spices from India, and silver from many lands.

## Surviving the Journey

Travel was dangerous. Caravans crossed the Taklamakan Desert, climbed the Pamir Mountains, and faced bandits, sandstorms, and freezing nights. Two-humped Bactrian camels, which can go long periods without water and tolerate both heat and cold, carried much of the load. Along the way, travelers rested at caravanserais, roadside inns built around courtyards where people and animals could find shelter, water, and food.

## Ideas on the Move

The most lasting cargo was not carried in saddlebags. Buddhism spread from India into Central Asia and China along these routes, and Buddhist cave temples near Dunhuang still hold thousands of paintings and manuscripts. Papermaking, invented in China, gradually traveled west, reached the Islamic world by the eighth century, and later spread to Europe. Foods, music, and artistic styles were also shared. Not everything that traveled was welcome, however. Historians believe the plague known as the Black Death spread along trade routes in the 1300s.

## A Lasting Connection

Today, historians see the Silk Road as an early example of how connected the world can be. When people trade, they exchange more than objects. They exchange stories, beliefs, and inventions, and each culture changes a little in the process.`,
    focus: ['central-idea', 'text-structure', 'summarize'],
    vocab: [
      ['network', 'a large system of connected parts, such as routes'],
      ['merchants', 'people who buy and sell goods to make money'],
      ['oasis', 'a place in a desert with water where plants grow'],
      ['exported', 'sent goods to another country to sell'],
      ['tolerate', 'to put up with something difficult without being harmed'],
      ['caravanserais', 'roadside inns where traveling traders and animals rested'],
    ],
    questions: [
      Q("What is the central idea of the passage?", 'main-idea', 2,
        "The Silk Road was a network of routes that spread goods, ideas, and even disease across many cultures.",
        "The Silk Road was a single paved highway built by Rome.",
        "Silk was the only valuable product traded between China and Europe.",
        "Bactrian camels made long-distance trade possible for the first time."),
      Q("Why did the price of goods rise as they traveled?", 'detail', 2,
        "They changed hands many times, and each trader charged more.",
        "Rome placed a heavy tax on all silk.",
        "Bandits stole most shipments.",
        "Camels could carry only small loads."),
      Q("Which phrase from the passage helps the reader understand the meaning of caravanserais?", 'vocab', 3,
        "roadside inns built around courtyards",
        "two-humped Bactrian camels",
        "faced bandits, sandstorms, and freezing nights",
        "like a relay race"),
      Q("Why does the author say 'the most lasting cargo was not carried in saddlebags'?", 'inference', 3,
        "Ideas and beliefs, like Buddhism and papermaking, had longer-lasting effects than physical goods.",
        "Most goods were carried by ships instead of animals.",
        "Saddlebags often broke during long journeys.",
        "The most valuable goods were hidden from bandits."),
      Q("How does the section 'Passing Goods Hand to Hand' help the reader understand trade?", 'craft', 3,
        "It compares trade to a relay race and follows one product's journey step by step.",
        "It argues that the silk trade harmed China.",
        "It lists the dates of important battles.",
        "It describes the daily life of a camel driver."),
    ],
    writePrompt: "The author claims that when people trade, 'they exchange more than objects.' Write a paragraph explaining this idea, using at least three examples from the passage.",
  },
  {
    id: '68-07',
    band: '68',
    genre: 'opinion',
    title: 'Let Middle Schoolers Sleep',
    origin: ORIG,
    text: `At 6:15 on a school morning, thousands of sixth graders are being shaken awake, stumbling toward the bathroom with their eyes half shut. Many of them will sit in first period before 8:00, trying to solve equations while their brains are still, in a real sense, asleep. Middle schools should start no earlier than 8:30 a.m., because a later start supports students' health, learning, and safety.

## Bodies on a Different Clock

The first reason is biology. Around the start of puberty, the body begins releasing melatonin, the hormone that makes us sleepy, later in the evening. This shift means that many young adolescents truly cannot fall asleep at 9:00 p.m., no matter how hard they try. Yet health experts recommend that children ages 6 to 12 get 9 to 12 hours of sleep each night, and that teens get 8 to 10. A student who cannot fall asleep until 10:30 and must wake at 6:15 is losing sleep every single night. In 2014, the American Academy of Pediatrics recommended that middle and high schools start at 8:30 or later for exactly this reason.

## Rested Students Learn More

Second, sleep is not wasted time; it is when the brain stores what it learned during the day. Tired students have trouble focusing, remembering, and controlling their moods. Teachers notice it in first period: heads on desks, yawning, and blank stares. When students are rested, they are more ready to participate, ask questions, and stay patient with classmates.

## Safety and Well-Being

Finally, sleep affects safety and mental health. Students who are chronically short on sleep are more likely to feel anxious or irritable and more likely to get hurt in sports. A later bell will not solve every problem, but it removes one that adults create.

## Answering the Concerns

Some people argue that later start times are impractical. Buses often serve several schools on staggered schedules, and changing one school's time affects the others. Families with parents who leave early for work may struggle with a later drop-off, and after-school sports and jobs would end later in the evening. These concerns are real and deserve careful planning. However, communities have solved them before. California passed a law in 2019 requiring most middle schools to start no earlier than 8:00 a.m. and most high schools no earlier than 8:30, and districts there adjusted bus routes and schedules. Schools can also offer supervised early-arrival programs for families who need them.

Schedules are built by people, and people can rebuild them. Our school day should be designed around how growing bodies actually work. Let middle schoolers sleep, and they will show up ready to learn.`,
    focus: ['argument', 'claim-evidence', 'author-purpose'],
    vocab: [
      ['melatonin', 'a hormone the body makes that helps cause sleepiness'],
      ['adolescents', 'young people who are growing from children into adults'],
      ['chronically', 'happening again and again over a long time'],
      ['irritable', 'easily annoyed or upset'],
      ['impractical', 'not sensible or easy to do in real life'],
      ['staggered', 'arranged so that things begin at different times'],
    ],
    questions: [
      Q("What is the author's main claim?", 'main-idea', 2,
        "Middle schools should start no earlier than 8:30 a.m.",
        "Students should go to bed by 9:00 p.m.",
        "School buses should be eliminated.",
        "First period should be cancelled."),
      Q("In the phrase 'staggered schedules,' staggered means—", 'vocab', 2,
        "arranged so that start times are spread out",
        "unsteady and about to fall",
        "extremely crowded",
        "printed on paper"),
      Q("Which evidence most directly supports the claim that young adolescents have trouble falling asleep early?", 'evidence', 3,
        "Around the start of puberty, the body releases melatonin later in the evening.",
        "Teachers notice heads on desks in first period.",
        "California passed a law in 2019.",
        "Buses often serve several schools."),
      Q("How does the author respond to the counterclaim about buses and family schedules?", 'craft', 3,
        "The author admits the concerns are real but gives an example of a state that adjusted successfully.",
        "The author ignores the concerns completely.",
        "The author agrees that schools should not change start times.",
        "The author says parents should drive their children instead of using buses."),
      Q("Why does the author begin with a description of a sixth grader at 6:15 a.m.?", 'craft', 3,
        "To help readers picture the problem before presenting the claim",
        "To prove that every student wakes up at the same time",
        "To tell a story about the author's own childhood",
        "To argue that alarm clocks should be banned"),
    ],
    writePrompt: "Evaluate the author's argument. Which reason is supported by the strongest evidence, and which is weakest? Then explain whether the response to the counterclaim is convincing, citing the text.",
  },
  {
    id: '68-08',
    band: '68',
    genre: 'biography',
    title: 'Wangari Maathai: Planting a Movement',
    origin: ORIG,
    text: `When Wangari Maathai was a girl in the highlands of central Kenya, her mother told her never to cut the wild fig tree near their home or gather its branches for firewood. The fig tree was sacred to her community, the Kikuyu, and Wangari noticed that a clear stream bubbled up near its roots. She spent hours there, watching frogs' eggs that looked like strings of beads. Years later, that memory would grow into a movement that planted tens of millions of trees.

## A Path Few Had Walked

Maathai was born in 1940 in the village of Ihithe. At a time when few girls in rural Kenya went to school, her older brother asked their mother why Wangari didn't attend, and her mother sent her. She excelled. In 1960 she was one of about 300 Kenyan students chosen to study at universities in the United States. She studied biology in Kansas and Pittsburgh, then returned home. In 1971 she earned a doctorate from the University of Nairobi, becoming the first woman in East and Central Africa to earn that degree.

## Seeds of Change

When Maathai talked with rural women in the 1970s, she heard the same troubles again and again. Streams were drying up. Firewood was harder to find, so women walked farther each day. Food supplies were shrinking. Maathai saw the connection: forests had been cleared, and without trees, soil washed away and water disappeared.

Her solution was simple and practical. In 1977 she founded the Green Belt Movement, which paid women a small amount for each seedling they planted that survived. Women learned to collect seeds, run tree nurseries, and restore the land around them. Over the following decades, the movement planted tens of millions of trees across Kenya.

## Standing Her Ground

Maathai's work was not always welcome. When she opposed a government plan to build a huge skyscraper in Nairobi's Uhuru Park in 1989, officials mocked her, and over the years she was arrested and even beaten during protests. She refused to back down, and the skyscraper was never built. She later served in Kenya's parliament.

In 2004, Wangari Maathai became the first African woman to receive the Nobel Peace Prize. The committee recognized that caring for the environment, building democracy, and keeping peace are connected.

She often told a story about a hummingbird that carried drops of water, one at a time, to fight a forest fire while larger animals stood by. When they asked what it thought it was doing, the hummingbird answered that it was doing the best it could. Maathai died in 2011, but her message endures: small actions, repeated by many hands, can change a country.`,
    focus: ['central-idea', 'text-structure', 'summarize'],
    vocab: [
      ['sacred', 'deeply respected and treated as holy'],
      ['excelled', 'did extremely well'],
      ['doctorate', 'the highest degree a university gives'],
      ['seedling', 'a young plant grown from a seed'],
      ['restore', 'to bring something back to a healthy condition'],
      ['endures', 'continues to last'],
    ],
    questions: [
      Q("What problems did rural women describe to Maathai in the 1970s?", 'detail', 2,
        "Streams were drying up, and firewood and food were becoming scarce.",
        "They could not afford to send their daughters to school.",
        "Officials were taking their farms to build skyscrapers.",
        "They wanted to study at universities in the United States."),
      Q("In the final paragraph, endures means—", 'vocab', 2,
        "continues to last",
        "ends quickly",
        "is forgotten",
        "becomes painful"),
      Q("Why does the author begin with Maathai's memory of the fig tree?", 'craft', 3,
        "It introduces the connection between trees and water that shaped her later work.",
        "It shows that she disobeyed her mother as a child.",
        "It explains why she studied in the United States.",
        "It proves that fig trees are the most important trees in Kenya."),
      Q("Based on the passage, why did the Nobel committee give a peace prize to an environmental activist?", 'inference', 3,
        "It viewed protecting the environment as connected to democracy and peace.",
        "She had ended a war between two countries.",
        "She planted more trees than anyone in history by herself.",
        "She was the first woman to serve in Kenya's parliament."),
      Q("How does the hummingbird story connect to Maathai's life?", 'theme', 3,
        "Like the hummingbird, she kept doing what she could even when the problem seemed overwhelming.",
        "Like the hummingbird, she preferred working alone.",
        "The story describes a real forest fire she helped fight.",
        "The story shows that larger animals supported her movement."),
    ],
    writePrompt: "Trace how Maathai's childhood experiences, education, and conversations with rural women led to the Green Belt Movement. Use evidence from at least three sections of the biography.",
  },
  {
    id: '68-09',
    band: '68',
    genre: 'fiction',
    title: 'The Library Lockbox',
    origin: ORIG,
    text: `The book fair cash box disappeared sometime between 11:40 and 12:15 on Thursday, and by 12:30 the whole sixth grade had decided that Marcus Webb took it.

It made sense, people said. Marcus had been the library helper during lunch. Marcus had been the only student in the room. And Marcus, everybody knew, had been saving for a new skateboard.

Ines Castillo was not so sure. She had read every mystery on the library's third shelf, and the first rule of every good detective was the same: the obvious answer is not always the right one.

"Tell me exactly what happened," she said, finding Marcus slumped outside the principal's office.

Marcus rubbed his eyes. "Ms. Albright went to make copies at 11:40. She told me to watch the fair. The box was on the checkout table, I swear. Then Mr. Diaz came in to fix the window over the radiator. It's been leaking since the storm. He sent me to get a bucket from the custodian's closet. When I came back, he'd gone and the box was gone too."

"So you weren't alone the whole time."

"No. But Mr. Diaz is the custodian. Nobody's going to accuse him."

Ines didn't want to accuse anyone. She wanted to look.

The library was quiet, smelling of new paper and wet plaster. The checkout table sat under the leaking window. A brown water stain spread across the carpet below, and the radiator ticked as it heated. Ines walked slowly around the table, then knelt.

Behind the radiator, wedged against the wall, was a soggy yellow sticky note. She eased it out with a pencil. The ink had run, but the words were still readable: Moved box to office safe. Window leaking on it. D.

"D," said Marcus, reading over her shoulder. "Diaz."

Ines nodded. "He saw water dripping onto the cash box, so he moved it somewhere dry. He left a note on the table for Ms. Albright. But the radiator blows warm air up, and the note was right at the edge..."

"It got blown off," Marcus finished. "And fell behind."

Ten minutes later, Ms. Albright opened the office safe. The cash box sat inside, slightly damp and completely full.

Afterward, several classmates mumbled apologies to Marcus. A few didn't, which Ines thought said more about them than about him.

"How did you know to look behind the radiator?" Marcus asked as they walked to class.

"I didn't," Ines admitted. "I just knew that everyone had stopped looking the moment they found someone to blame."`,
    focus: ['inference', 'plot', 'theme'],
    vocab: [
      ['obvious', 'easy to see or understand'],
      ['slumped', 'sitting or leaning in a tired, heavy way'],
      ['custodian', 'a person who takes care of a building'],
      ['accuse', 'to say someone did something wrong'],
      ['wedged', 'stuck tightly in a narrow space'],
      ['soggy', 'very wet and soft'],
    ],
    questions: [
      Q("Why did the sixth graders believe Marcus took the cash box?", 'detail', 2,
        "He was the library helper, seemed to be alone, and was saving money.",
        "Someone saw him carrying the box out.",
        "His fingerprints were found on the box.",
        "He had argued with Ms. Albright that morning."),
      Q("The note was 'wedged against the wall.' Wedged means—", 'vocab', 2,
        "stuck tightly in a narrow space",
        "taped neatly",
        "torn into pieces",
        "hidden on purpose"),
      Q("Which clue is most important to solving the mystery?", 'evidence', 3,
        "The sticky note behind the radiator explaining that the box had been moved",
        "The smell of new paper in the library",
        "Marcus's plan to buy a skateboard",
        "The time Ms. Albright left to make copies"),
      Q("What does Ines's approach reveal about her?", 'inference', 3,
        "She gathers evidence before reaching a conclusion.",
        "She enjoys proving her classmates wrong.",
        "She suspects Mr. Diaz from the beginning.",
        "She wants to become a custodian."),
      Q("Which statement best expresses the story's theme?", 'theme', 3,
        "Rushing to blame someone can keep people from finding the truth.",
        "Adults are always more trustworthy than students.",
        "Money should never be left unattended.",
        "Reading mysteries is a waste of time."),
    ],
    writePrompt: "Ines says everyone 'stopped looking the moment they found someone to blame.' Explain what this line means and how the story's events support it, citing at least two details.",
  },
  {
    id: '68-10',
    band: '68',
    genre: 'informational',
    title: 'Checks and Balances: Why Power Is Shared',
    origin: ORIG,
    text: `## A Problem to Solve

In the summer of 1787, delegates met in Philadelphia to write a new plan of government for the United States. Many of them had lived under a king and feared any government that gave one person or group too much control. But they also knew that a government that was too weak could not keep order or protect people's rights. Their solution was to divide power among three branches and give each branch ways to limit the others. This system is called checks and balances.

## Three Branches, Three Jobs

The Constitution describes each branch in its own article. The legislative branch, Congress, makes laws. It has two parts: the Senate, with two senators from each state, and the House of Representatives, where states with more people have more seats. The executive branch, led by the president, carries out and enforces laws. The judicial branch, headed by the Supreme Court, interprets laws and decides cases about what they mean.

The delegates borrowed this idea partly from the French writer Montesquieu, who argued that liberty is safest when the power to make, enforce, and judge laws is not held by the same hands.

## How the Checks Work

Each branch can slow or stop the others. When Congress passes a bill, the president can sign it into law or veto it. But Congress can override a veto if two-thirds of both the House and the Senate vote to do so. The president nominates federal judges and many top officials, but the Senate must confirm them. The Supreme Court can rule that a law or government action violates the Constitution; this power, called judicial review, was established in the 1803 case Marbury v. Madison. Congress, in turn, can propose amendments to the Constitution and, in serious cases, can impeach and remove officials, including the president or judges.

## Slow on Purpose

Critics sometimes complain that checks and balances make the government slow. Bills can stall for months, and branches often disagree. Supporters respond that the slowness is partly the point. Because major decisions require cooperation, no single leader can easily change the rules alone, and different viewpoints get a chance to be heard.

## Not the Only Model

The United States is not the only country to separate powers, and not every democracy does it the same way. In parliamentary systems such as those in the United Kingdom and Canada, the prime minister is usually a member of the legislature and leads the largest party there. Each design balances the same two goals the delegates faced in 1787: a government strong enough to act, but limited enough to protect freedom.`,
    focus: ['central-idea', 'text-structure', 'vocabulary'],
    vocab: [
      ['delegates', 'people chosen to represent others at a meeting'],
      ['enforces', 'makes sure rules or laws are obeyed'],
      ['interprets', 'explains the meaning of something'],
      ['veto', 'to officially reject a bill so it does not become law'],
      ['override', 'to cancel a decision by using greater authority'],
      ['nominates', 'officially suggests someone for a job'],
      ['confirm', 'to formally approve'],
    ],
    questions: [
      Q("What is the central idea of the passage?", 'main-idea', 2,
        "The Constitution divides power among three branches that can limit one another to prevent abuse of power.",
        "The president holds the most power in the U.S. government.",
        "Parliamentary systems are better than the U.S. system.",
        "The Supreme Court writes most of the nation's laws."),
      Q("What can Congress do if the president vetoes a bill?", 'detail', 2,
        "Override the veto with a two-thirds vote in both the House and the Senate",
        "Ask the Supreme Court to sign the bill instead",
        "Nothing, because a veto is always final",
        "Hold a national election on the bill"),
      Q("Based on the passage, a court that interprets a law—", 'vocab', 3,
        "explains what the law means and how it applies",
        "writes a brand-new law",
        "votes to reject the law before it passes",
        "uses police to enforce the law"),
      Q("Why does the author include the section 'Slow on Purpose'?", 'craft', 3,
        "To present a criticism of the system along with the response of its supporters",
        "To argue that the government should be made faster",
        "To explain how senators are chosen",
        "To describe events of the summer of 1787"),
      Q("Based on the passage, why did the delegates also fear a government that was too weak?", 'inference', 3,
        "It might not be able to keep order or protect people's rights.",
        "It would be controlled by a king.",
        "It would pass too many laws.",
        "It would be copied by France."),
    ],
    writePrompt: "Choose two checks described in the passage. Explain how each one prevents a branch from gaining too much power, and then evaluate whether the 'slow on purpose' argument is convincing.",
  },
  {
    id: '68-11',
    band: '68',
    genre: 'folktale',
    title: 'The Quarry Wish',
    origin: 'Folktale retold — told in Japan and Java',
    text: `High on a mountainside, where the quarries rang from dawn to dusk, there once worked a stonecutter. He split granite for temple steps and garden walls, guiding his chisel along the grain until each block broke clean. The labor was punishing, yet he whistled through it, and most evenings he was content. The old women of the valley claimed a spirit dwelt deep in the rock and now and then answered a wish. He had never asked it for anything.

That changed the afternoon he delivered a cartload of paving stones to a merchant's estate. Beyond the gate he glimpsed lacquered furniture, a pond of golden carp, and servants gliding past with steaming dishes. He trudged back up the path, his shoulders burning. "What would it be like," he said aloud, "never to lift another stone?"

Out of the cliff came an answer like grinding gravel: "Find out."

His hut was gone. In its place stood a mansion, and he was its master. The novelty lasted a season. Then a prince passed through the valley in a gold-trimmed carriage, a servant holding a parasol above his head, and merchants knelt in the dust as he went by. The stonecutter felt suddenly small. "Wealth bows to rank," he said bitterly. "Let me be a prince."

So he became one. But that summer brought a drought, and no parasol could shield him from the glare. The lotus blossoms in his courtyard wilted on their stems. "Even princes sweat under the sun," he complained. "Make me the sun."

Now he was the sun, scorching the rice paddies and cracking the riverbeds, delighted by his own fierceness, until a bank of storm clouds rolled beneath him and smothered his light. "Then I will be the cloud," he demanded.

As a cloud he hurled down rain for days. Rivers jumped their banks; bridges and huts washed away. Yet through all the flooding, one shape refused to budge. The mountain shrugged off the water as if it were mist. "That," he said, "is real strength."

He became the mountain: vast, silent, unshakable. Storms broke against him and passed. Nothing in the world, he thought, could touch him now.

Then came a small, steady sound at his base. Clink. Clink. Crack. A man no bigger than an ant was working a chisel into his flank, prying loose block after block, and the mountain could not so much as twitch to stop him.

The stonecutter understood at last what he had traded away. "Give me back my hammer," he said.

The spirit did. He woke on his straw mat in the old hut, sore-handed and poor, and walked up to the quarry whistling. He never made another wish.`,
    focus: ['theme', 'text-structure', 'plot'],
    vocab: [
      ['chisel', 'a tool with a sharp edge used to cut stone or wood'],
      ['content', 'satisfied and at peace'],
      ['trudged', 'walked slowly and heavily'],
      ['parasol', 'an umbrella used for shade from the sun'],
      ['wilted', 'drooped and became limp'],
      ['scorching', 'burning with great heat'],
      ['unshakable', 'impossible to move or weaken'],
    ],
    questions: [
      Q("Which list shows the order of the stonecutter's transformations?", 'sequence', 2,
        "rich man, prince, sun, cloud, mountain, stonecutter",
        "prince, rich man, cloud, sun, mountain, stonecutter",
        "rich man, sun, prince, mountain, cloud, stonecutter",
        "prince, sun, mountain, cloud, rich man, stonecutter"),
      Q("At the beginning, the stonecutter is described as content. Content means—", 'vocab', 2,
        "satisfied and at peace",
        "angry and jealous",
        "tired and weak",
        "proud and boastful"),
      Q("Why does the storyteller repeat the pattern of the stonecutter seeing something stronger and wishing to become it?", 'craft', 3,
        "To build toward the surprising realization that the stonecutter was powerful all along",
        "To show that the spirit grows tired of granting wishes",
        "To teach readers how weather works",
        "To prove that the sun is the strongest force in nature"),
      Q("Why is the stonecutter never satisfied after each wish?", 'inference', 3,
        "He keeps comparing himself to whatever seems more powerful.",
        "The spirit tricks him by granting the wrong wishes.",
        "His neighbors make fun of each new form.",
        "Each new form makes him physically ill."),
      Q("Which statement best expresses the theme?", 'theme', 3,
        "Always wanting to be someone else can keep you from valuing who you are.",
        "Hard work always makes people rich.",
        "Nature is more powerful than people.",
        "Wishes should never be spoken aloud."),
    ],
    writePrompt: "Explain how the story's circular structure, beginning and ending with the hero as a stonecutter, helps develop its theme. Use at least two specific moments from the tale.",
  },
  {
    id: '68-12',
    band: '68',
    genre: 'poetry',
    title: 'What the Old Bridge Knows',
    origin: ORIG,
    text: `I have stood here a hundred and twelve years,
an iron arch across a river
that never once has stopped to thank me.
That is fine. I was not built for thanks.
I was built for crossing.

I remember the first wagons,
wooden wheels clattering my planks
like a drummer who had not practiced.
I remember horses who balked at the middle,
staring down at the brown water,
and the farmers who coaxed them on
with apples and patient words.

Then came the automobiles,
coughing and proud,
and the town painted me green
and replaced my planks with concrete
and hung a sign that said
WEIGHT LIMIT, as if I had ever
refused anyone.

I have felt the boots of soldiers
marching off to a war across the ocean,
and fewer boots marching home.
I have felt the parade floats on the Fourth of July,
the high school band, a little off-key,
the fire truck with its bell,
the children waving flags
too big for their hands.

I have carried brides to churches
and mourners home again.
I have carried a boy on a bicycle
racing his own shadow,
and the same boy, sixty years later,
walking slowly with a cane,
pausing at my rail
to look at the river
as if it might remember him too.

The river does not remember. That is the river's way.
It is always leaving, always new,
always somewhere else by morning.
But I stay. Staying is my gift,
the way leaving is the river's.
Between us, we make a place
where people can stop
and watch the world go by.

In winter, ice grinds against my legs
and I groan in the cold.
In spring, the floods rise to my belly
and drag whole trees against me,
and I hold.
Every year I am a little more rust,
a little less iron.
Engineers come with clipboards
and tap me with hammers
and frown.

Someday they will build a new bridge,
wider and stronger, with four lanes
and lights that never flicker.
I will not be jealous.
I will hope it learns
what I learned:
that strength is not standing still.
It is holding steady
while everything moves through you,
and letting it go
to wherever it is going.`,
    focus: ['point-of-view', 'figurative-language', 'theme'],
    vocab: [
      ['clattering', 'making a loud rattling noise'],
      ['balked', 'stopped and refused to go on'],
      ['coaxed', 'gently persuaded someone to do something'],
      ['mourners', 'people who are grieving after someone has died'],
      ['grinds', 'rubs hard against something, wearing it down'],
      ['flicker', 'to shine unsteadily, going bright and dim'],
    ],
    questions: [
      Q("From whose point of view is the poem told?", 'craft', 2,
        "The old bridge itself",
        "The boy on the bicycle",
        "An engineer inspecting the bridge",
        "The river"),
      Q("In stanza 2, horses 'balked at the middle.' Balked means—", 'vocab', 2,
        "stopped and refused to go on",
        "ran faster",
        "fell into the water",
        "neighed happily"),
      Q("How does the speaker contrast itself with the river?", 'compare', 3,
        "The bridge stays in one place, while the river is always moving and changing.",
        "The bridge is young, while the river is ancient.",
        "The bridge is angry, while the river is calm.",
        "The bridge remembers nothing, while the river remembers everyone."),
      Q("What does the image of the boy who returns 'sixty years later' suggest?", 'inference', 3,
        "The bridge has been a lasting part of people's lives across generations.",
        "The boy never left the town.",
        "The bridge is about to collapse.",
        "Bicycles are no longer allowed on the bridge."),
      Q("What does the speaker mean by 'strength is not standing still'?", 'theme', 3,
        "True strength means staying steady while letting life pass through and change around you.",
        "The bridge wishes it could move like the river.",
        "Strong things never need to be replaced.",
        "Standing still is a sign of weakness."),
    ],
    writePrompt: "Analyze how the poet uses personification to give the bridge a personality. What kind of character is the bridge, and which lines reveal its attitude toward change and being replaced?",
  },

  // ── Grade 7 ────────────────────────────────────────────────────────────────
  {
    id: '68-13',
    band: '68',
    genre: 'fiction',
    title: 'Black Sunday: A Letter',
    origin: ORIG,
    text: `April 15, 1935
Boise City, Oklahoma

Dear Aunt Lena,

Mama says I should write down what happened yesterday while it is fresh, so that someday I can tell my own children and they will believe me. I am not sure anyone will believe me. I was there, and I hardly believe it myself.

Sunday started out the prettiest day we'd had in weeks. After a month of dusters, the sky was clear blue and the air was still and warm. Mama opened every window to air out the house. She took down the wet sheets we'd hung over the doorways to catch the dust, and we scrubbed the grit off the sills and out of the cupboards. Papa said maybe the worst was over. Even the chickens seemed cheerful.

Around four o'clock, Davey ran in from the yard shouting that the birds were acting strange.

I went to the porch. Hundreds of birds were flying low and fast toward the south, and jackrabbits were running across the field the same way, as though something were chasing them. Then I saw it on the northern horizon: a black wall, rolling toward us, taller than anything I have ever seen. It was not a cloud. Clouds are soft. This had edges.

Papa yelled for us to get inside. We slammed the windows, and Mama soaked towels in the washtub and stuffed them under the doors. Then the light went out of the world.

Aunt Lena, I cannot describe how dark it was. I held my hand in front of my face and could not see it. Davey started crying, and Mama lit the lamp, but it made only a small brown glow, like looking through mud. The wind howled, and dust hissed against the house like sand thrown at a window, over and over, for hours. We tied wet rags over our noses and mouths. I could taste dirt anyway, gritty between my teeth.

Papa sat by the door the whole time with his hands clasped. Once, I heard him say quietly to Mama, "That's the Nelsons' farm blowing past. And the Kaufmans'. And ours." I did not understand at first. Then I did. The storm was made of fields. Our wheat ground, the soil Grandpa broke with his plow, was lifting into the sky and sailing away.

This morning, everything is buried. Drifts of dust are piled against the barn like snow. Two of the hens did not make it. The well pump is choked. Mama has been sweeping since dawn and says she will sweep until she dies.

Papa talks about California now. Some neighbors have already gone. I don't want to leave, but I also don't know how anything can grow in ground that has blown away.

Mama says the dust cannot take what matters. We are all here, and we are all breathing, even if we are breathing dirt. I am trying to believe her.

Please write soon and tell us about the rain in Missouri. Davey wants to know if it is real.

Your loving niece,
Ruth`,
    focus: ['point-of-view', 'word-choice', 'inference'],
    vocab: [
      ['dusters', 'dust storms, as people on the Great Plains called them'],
      ['grit', 'tiny, hard bits of sand or dirt'],
      ['horizon', 'the line where the land seems to meet the sky'],
      ['clasped', 'held tightly together'],
      ['drifts', 'piles formed by wind, like snowbanks'],
      ['choked', 'blocked so that nothing can pass through'],
    ],
    questions: [
      Q("What first warns the family that something is wrong?", 'detail', 2,
        "Birds and jackrabbits are fleeing toward the south.",
        "Papa hears a warning on the radio.",
        "The sky turns gray at noon.",
        "The chickens stop laying eggs."),
      Q("In the letter, dusters refers to—", 'vocab', 2,
        "earlier dust storms",
        "cleaning cloths",
        "farmers who left for California",
        "wind-powered machines"),
      Q("What does Papa mean when he says, 'That's the Nelsons' farm blowing past'?", 'inference', 3,
        "The storm is made of soil lifted from the region's farms, including their own.",
        "The Nelsons' house is being blown apart by the wind.",
        "He can see the neighbors driving away.",
        "He is confused because he cannot see."),
      Q("How does telling the story as a letter from Ruth affect the reader?", 'craft', 3,
        "It makes the event feel personal and immediate through a young witness's eyes.",
        "It lets the reader know what every neighbor was thinking.",
        "It explains the scientific causes of the storm in detail.",
        "It shows the event from Aunt Lena's point of view."),
      Q("Which line best supports the theme that family endurance matters more than possessions?", 'theme', 3,
        "Mama says the dust cannot take what matters.",
        "This morning, everything is buried.",
        "Two of the hens did not make it.",
        "Papa talks about California now."),
    ],
    writePrompt: "Ruth writes, 'Clouds are soft. This had edges.' Analyze how the author uses sensory details and comparisons to help readers experience the storm. Cite at least three examples and explain the effect of each.",
  },
  {
    id: '68-14',
    band: '68',
    genre: 'informational',
    title: 'Cities Under the Sea: Coral Reefs',
    origin: ORIG,
    text: `## Animals That Build

At first glance, a coral reef looks like a garden of rocks and plants. Yet the builders of these underwater cities are animals. Each coral is made of many tiny creatures called polyps, relatives of jellyfish and sea anemones. A single polyp may be smaller than a pencil eraser. It has a soft, tube-shaped body and a ring of tentacles around its mouth. Reef-building polyps take calcium from seawater and use it to build hard limestone skeletons beneath themselves. When polyps die, new ones grow on top of the old skeletons, and over thousands of years these layers form reefs large enough to see from space. The Great Barrier Reef off the coast of Australia stretches roughly 2,300 kilometers.

## A Partnership in Color

Corals have a secret partner. Living inside the tissues of most reef-building corals are microscopic algae. Like plants, the algae use sunlight to make food through photosynthesis, and they share much of that food with the coral. In return, the coral gives the algae shelter and nutrients. This kind of relationship, in which two different organisms both benefit, is called mutualism. The algae also give many corals their brilliant colors of gold, green, and brown. Because the algae need sunlight, most reefs grow in clear, shallow, warm water.

## Rich and Valuable

Coral reefs cover less than one percent of the ocean floor, but scientists estimate they support about a quarter of all known marine species. Fish, sea turtles, crabs, sponges, and octopuses find food and hiding places in the reef's cracks and branches. Reefs also matter to people. They provide food and jobs for millions of people, attract tourists, and act as natural breakwaters, absorbing the energy of waves before they reach the shore.

## When Corals Turn White

Corals are sensitive to their surroundings. When the water becomes too warm for too long, the partnership breaks down. Stressed corals expel the algae living in their tissues, and without them the coral's white skeleton shows through its clear tissue. This is called coral bleaching. A bleached coral is not dead, but it is starving. If temperatures return to normal soon enough, the algae can return and the coral can recover. If the heat lasts, the coral may die. Scientists have recorded several widespread bleaching events in recent decades, linked to unusually warm ocean temperatures. Pollution, overfishing, and damage from anchors or careless divers add further stress.

## Helping Reefs Recover

People around the world are working to protect reefs. Some countries have created marine protected areas where fishing and development are limited. Communities reduce runoff from farms and cities so that cleaner water reaches the coast. In coral nurseries, scientists and volunteers grow small fragments of coral on underwater frames and then replant them on damaged reefs. These efforts cannot replace healthy oceans, but they give reefs time and a better chance to heal.`,
    focus: ['central-idea', 'text-structure', 'vocabulary'],
    vocab: [
      ['polyps', 'tiny soft-bodied sea animals that make up a coral'],
      ['microscopic', 'too small to see without a microscope'],
      ['photosynthesis', 'the process plants and algae use to make food from sunlight'],
      ['mutualism', 'a relationship in which two different living things both benefit'],
      ['breakwaters', 'barriers that protect a shore from the force of waves'],
      ['expel', 'to force something out'],
      ['fragments', 'small pieces broken off from something larger'],
    ],
    questions: [
      Q("Which sentence best states the central idea?", 'main-idea', 2,
        "Coral reefs are living structures built by animals that support great biodiversity but are threatened by stresses such as warming water.",
        "Coral reefs are made of rocks that slowly turn white with age.",
        "The Great Barrier Reef is the only reef that can be seen from space.",
        "Algae are harmful to coral and are the cause of bleaching."),
      Q("In the section 'A Partnership in Color,' mutualism means—", 'vocab', 2,
        "a relationship in which two organisms both benefit",
        "a relationship in which one organism harms another",
        "the process of building limestone",
        "the way corals change color"),
      Q("Why do most reefs grow in clear, shallow water?", 'inference', 3,
        "The algae inside corals need sunlight to make food.",
        "Polyps cannot survive the pressure of deep water.",
        "Deep water contains no calcium.",
        "Divers can reach shallow reefs more easily."),
      Q("How is the section 'When Corals Turn White' mainly organized?", 'craft', 3,
        "Cause and effect",
        "Chronological biography",
        "Comparison of two oceans",
        "Question and answer"),
      Q("Which detail best supports the idea that bleaching is not always permanent?", 'evidence', 3,
        "If temperatures return to normal soon enough, the algae can return and the coral can recover.",
        "A single polyp may be smaller than a pencil eraser.",
        "Pollution, overfishing, and damage from anchors add further stress.",
        "Reefs act as natural breakwaters."),
    ],
    writePrompt: "Explain how the partnership between corals and algae connects to the problem of coral bleaching. Then identify which solution in the final section you think would help most, using evidence from the passage to support your choice.",
  },
  {
    id: '68-15',
    band: '68',
    genre: 'opinion',
    title: 'A Better Calendar: The Case for Year-Round School',
    origin: ORIG,
    text: `Every September, teachers across the country spend weeks reviewing material students learned the spring before. Students return from a long summer having forgotten math facts, reading habits, and even how to get up early. There is a better way to organize the school year. Schools should adopt a balanced, or year-round, calendar that replaces the long summer break with shorter, more frequent breaks.

## Same Days, Different Shape

First, it is important to understand what a year-round calendar is and is not. It does not mean more school. Most balanced calendars keep about 180 school days, the same as a traditional calendar. The difference is how the days are arranged. A common model is called "45-15": students attend for about nine weeks, then have three weeks off, repeating that pattern through the year, with a shorter summer break of around five or six weeks.

## Less Forgetting

The strongest reason for a balanced calendar is the problem known as "summer slide." Studies have found that many students lose some of their skills over a long summer, especially in math. The losses tend to be larger for students whose families cannot afford camps, trips, or tutoring. Shorter breaks give the brain less time to forget, which means teachers can spend less time reviewing and more time teaching new material.

## Rest When It Is Needed

Second, frequent breaks can reduce burnout. In a traditional calendar, the stretch from January to June can feel endless for students and teachers alike. Regular three-week breaks act like rest stops on a long drive. Some districts also use these breaks for intersessions, optional short programs where students who are struggling can catch up and others can explore enrichment activities like robotics or art.

## Considering the Other Side

Critics raise serious objections. Many families rely on summer for vacations, family visits, and summer jobs that help teenagers earn money. Summer camps and businesses that depend on young workers could lose out. Parents with children in different schools might face mismatched calendars and childcare headaches. Opponents also point out that research on year-round schooling is mixed: some studies show modest gains, while others show little difference in overall achievement.

These concerns deserve a fair hearing. Yet a balanced calendar still includes a summer break, just a shorter one, so family trips and many summer jobs remain possible. Districts can align calendars across all their schools to prevent mismatched schedules. And while the research is not settled, even modest gains for the students most affected by summer slide could make a meaningful difference.

## A Calendar for Learners

Our school calendar was shaped long ago, partly by the heat of summers in buildings without air conditioning and by the schedules families kept at the time. Today, our calendar should be designed around how students learn best. A balanced calendar is worth trying.`,
    focus: ['argument', 'claim-evidence', 'author-purpose'],
    vocab: [
      ['burnout', 'exhaustion caused by working hard for too long without rest'],
      ['intersessions', 'short optional programs held during breaks in a school calendar'],
      ['enrichment', 'activities that add extra interest and learning'],
      ['objections', 'reasons for disagreeing with something'],
      ['modest', 'small but noticeable'],
      ['align', 'to arrange things so they match or line up'],
      ['mismatched', 'not fitting or matching well together'],
    ],
    questions: [
      Q("What is the author's claim?", 'main-idea', 2,
        "Schools should adopt a balanced calendar with shorter, more frequent breaks.",
        "Schools should add many more days to the school year.",
        "Summer break should be eliminated completely.",
        "Students should attend summer camps to prevent forgetting."),
      Q("The word modest, as used in 'modest gains,' most nearly means—", 'vocab', 2,
        "small but noticeable",
        "humble and shy",
        "very large",
        "harmful"),
      Q("Why does the author argue that summer slide matters especially for some students?", 'evidence', 3,
        "The losses are often larger for students whose families cannot afford camps, trips, or tutoring.",
        "Some students take longer summer vacations than others.",
        "Teachers dislike reviewing material.",
        "Math is the only subject affected by summer slide."),
      Q("Which statement best describes how the author handles the counterclaim?", 'craft', 3,
        "The author acknowledges that research is mixed and that families have concerns, then responds to each.",
        "The author claims research proves year-round school always works.",
        "The author dismisses critics as uninformed.",
        "The author changes position and agrees with the critics."),
      Q("Why does the author include the section 'Same Days, Different Shape' early in the essay?", 'craft', 3,
        "To correct a likely misunderstanding that year-round school means more school days",
        "To explain the full history of summer vacation",
        "To describe what students do during intersessions",
        "To present the strongest counterclaim"),
    ],
    writePrompt: "The author admits that research on year-round schooling is mixed. Does this admission strengthen or weaken the argument? Write a response that evaluates the author's reasoning and evidence.",
  },
  {
    id: '68-16',
    band: '68',
    genre: 'folktale',
    title: 'How Māui Slowed the Sun',
    origin: 'Myth retold — Māori (Aotearoa New Zealand)',
    text: `In the time when the world was still being shaped, the sun raced across the sky. He leapt up from his pit at the edge of the world each morning and dashed overhead so swiftly that the day was over almost before it had begun. People could not finish their work. Food could not be cooked before darkness fell. Crops did not have enough light to ripen, and fishermen barely had time to paddle out before they had to paddle home.

Māui, the clever and restless demigod known across the Pacific, watched this with growing frustration. Among the Māori of Aotearoa, the land now called New Zealand, the story is told of how he decided to do something about it.

"The sun is too fast," Māui told his older brothers. "We will catch him and make him slow down."

His brothers laughed. "No one can catch the sun. He would burn us to ashes."

But Māui had a plan, and he had something powerful: the magic jawbone of his grandmother, Murirangawhenua, which she had given him. He persuaded his brothers to help him gather flax and twist it into ropes, strong and many-stranded. They braided night after night until they had a great mass of ropes.

Then they set out, traveling only by night so the sun would not see them coming. They journeyed far to the east, to the edge of the world, where the sun slept in his pit. There they built walls of clay to shield themselves from his heat, and they laid their ropes in a great noose across the opening.

"When he rises, pull," Māui told them. "And do not let go, no matter how he struggles."

As dawn came, the sun lifted his head from the pit. His blazing head passed through the noose, then his shoulders. "Now!" shouted Māui. The brothers hauled on the ropes. The noose snapped tight around the sun, and he roared and thrashed, sending out waves of heat so fierce that the brothers' skin blistered behind their clay walls. Still they held.

Māui leapt forward with the jawbone and struck the sun, again and again. The sun cried out, "Why are you doing this? Do you want to kill Tama-nui-te-rā?" This was the first time anyone had heard the sun's great name. To speak his true name was to admit defeat.

"We do not want to kill you," Māui answered. "We want you to travel slowly, so that people have time to live."

At last the sun, weakened and bruised, agreed. When the brothers released him, he limped up into the sky, moving slowly, as he has done ever since.

And that is why the days are long enough for people to fish, to plant, to cook, and to tell stories like this one before night falls.`,
    focus: ['plot', 'character', 'theme'],
    vocab: [
      ['restless', 'unable to stay still or be satisfied'],
      ['demigod', 'a being who is part god and part human'],
      ['persuaded', 'convinced someone to do something'],
      ['noose', 'a loop of rope that tightens when pulled'],
      ['hauled', 'pulled with great effort'],
      ['thrashed', 'moved wildly and violently'],
      ['blistered', 'formed painful bubbles on the skin from heat'],
    ],
    questions: [
      Q("What problem does Māui want to solve?", 'detail', 2,
        "The sun moves so fast that people do not have enough daylight to work, cook, and grow food.",
        "The sun has stopped rising.",
        "His brothers refuse to go fishing.",
        "The flax has stopped growing."),
      Q("What do the brothers do right before the sun rises from his pit?", 'sequence', 2,
        "They build clay walls and lay a rope noose across the opening.",
        "They strike the sun with the jawbone.",
        "They ask the sun to tell them his name.",
        "They return home to rest."),
      Q("What does Māui's response to his brothers' laughter reveal about him?", 'inference', 3,
        "He is determined and confident in his plan even when others doubt him.",
        "He is easily discouraged.",
        "He wants to hurt the sun out of anger.",
        "He prefers to work alone."),
      Q("Why is it significant that the sun reveals his name, Tama-nui-te-rā?", 'craft', 3,
        "It shows the sun has been forced to give in, a turning point in the struggle.",
        "It shows the sun wants to become Māui's brother.",
        "It explains why the sun lives in a pit.",
        "It proves the brothers were wrong to help."),
      Q("Which idea is best supported by the myth?", 'theme', 3,
        "Courage, cleverness, and teamwork can overcome a problem that seems impossible.",
        "People should never try to change nature.",
        "Younger siblings should always obey older ones.",
        "The sun is the enemy of human beings."),
    ],
    writePrompt: "Explain how this myth accounts for the length of the day. Then analyze how Māui's actions show qualities the storytellers valued, citing evidence from the text.",
  },
  {
    id: '68-17',
    band: '68',
    genre: 'fiction',
    title: 'All of It',
    origin: ORIG,
    text: `Minh had translated for his mother at the pharmacy, the bank, the landlord's office, and once, terrifyingly, at the emergency room when his little sister broke her wrist. He was good at it. He knew how to turn his mother's careful Vietnamese into English that made strangers nod, and how to turn their fast English back into words that made her shoulders relax.

But he had never translated a conversation about himself.

"Thank you for coming, Mrs. Tran," said Mr. Hallworth, his science teacher, shaking her hand across the small round table. "And Minh, thanks for helping."

His mother smiled and folded her hands. She had come straight from her shift at the nail salon, and the smell of acetone clung faintly to her jacket. She looked at Minh, waiting.

"He says thank you for coming," Minh told her in Vietnamese.

Mr. Hallworth opened a folder. "I'll be honest. Minh is one of the brightest kids in my class. His questions are excellent. But he's missed four lab reports this quarter, and his grade has dropped to a D."

Minh's throat went dry.

His mother tilted her head, waiting for the words to cross the table through him.

It would be easy. Minh could say: He says I ask good questions. He says I'm one of the brightest. He could leave out the rest. His mother would smile, and they would go home, and she would tell his aunt on the phone that the teacher had praised him. No one in the room would ever know, except Minh.

He thought about the lab reports, sitting unfinished in his backpack, because after school he watched his sister until his mother came home at seven, and by then he was tired, and the reports felt endless.

He thought about how his mother checked the mailbox every day for his report card as if it were a letter from home.

"He says I am smart," Minh said slowly in Vietnamese. "He says I ask good questions." He took a breath. "And he says I have not turned in four lab reports, and my grade is now a D."

His mother's face did not change much. It never did in public. But she was quiet for a long moment, and then she asked him something, and he turned to Mr. Hallworth.

"She wants to know why. And..." Minh hesitated. "I should tell you. I watch my sister after school. I don't have time until late."

Mr. Hallworth leaned back. "I didn't know that. Thank you for telling me." He thought for a moment. "We have a homework room after school until four-thirty. Could your sister come too? There's a reading corner for younger kids."

Minh translated. His mother asked two questions, and Mr. Hallworth answered both, and slowly the conversation stopped being about a grade and started being about a plan.

On the walk to the bus, his mother put her hand on his shoulder.

"You could have told only the good part," she said in Vietnamese.

Minh looked at her, startled. She smiled a little.

"I understand more English than you think," she said. "Thank you for giving me all of it."`,
    focus: ['character', 'point-of-view', 'theme'],
    vocab: [
      ['terrifyingly', 'in a way that causes great fear'],
      ['acetone', 'a strong-smelling liquid used to remove nail polish'],
      ['clung', 'stuck to or held on tightly'],
      ['praised', 'spoke well of someone\'s work or qualities'],
      ['hesitated', 'paused before doing or saying something'],
      ['startled', 'suddenly surprised'],
    ],
    questions: [
      Q("What does Mr. Hallworth tell Minh's mother about Minh's work?", 'detail', 2,
        "Minh asks excellent questions but has missed four lab reports and has a D.",
        "Minh has the highest grade in the class.",
        "Minh is disruptive and needs to change seats.",
        "Minh should move to a more advanced class."),
      Q("When his mother speaks at the end, Minh is startled. Startled means—", 'vocab', 2,
        "suddenly surprised",
        "deeply ashamed",
        "slightly bored",
        "very angry"),
      Q("Why is translating this conversation harder for Minh than translating at the bank or pharmacy?", 'inference', 3,
        "He controls how his mother hears news about his own struggles.",
        "He does not know the English words for science.",
        "Mr. Hallworth speaks too quickly.",
        "His mother refuses to listen to him."),
      Q("How does the final line change the reader's understanding of the story?", 'craft', 3,
        "It reveals that his mother understood the English all along, so she would have known if he left out the bad news, which makes his honesty even more meaningful.",
        "It shows that his mother is angry about his grade.",
        "It reveals that Mr. Hallworth speaks Vietnamese.",
        "It suggests Minh will stop translating for his family."),
      Q("Which theme is best developed in the story?", 'theme', 3,
        "Telling the whole truth can lead to understanding and real solutions.",
        "Children should never translate for their parents.",
        "Grades are the best measure of intelligence.",
        "Teachers rarely care about students' lives outside school."),
    ],
    writePrompt: "Minh imagines leaving out the bad news. Analyze how the author builds tension in the paragraphs before Minh decides, and explain what his choice reveals about his character.",
  },
  {
    id: '68-18',
    band: '68',
    genre: 'informational',
    title: 'Why Prices Change: Supply and Demand',
    origin: ORIG,
    text: `## A Lesson From a Lemonade Stand

On the hottest day of summer, a lemonade stand on a busy corner might sell out by noon. On a cool, rainy day, the same stand might sit untouched for hours. The lemonade hasn't changed. What has changed is how many people want it. That simple observation is the starting point for one of the most important ideas in economics: the relationship between supply and demand.

## What Demand Means

Demand is the amount of a product people are willing and able to buy at different prices. In general, when the price of something goes up, people buy less of it, and when the price goes down, they buy more. Economists call this the law of demand. If a movie theater cuts ticket prices in half on Tuesdays, it usually sells more tickets on Tuesdays.

Demand can also shift for reasons other than price. A popular video can make a toy suddenly fashionable. Hot weather increases demand for fans and swimming pools. If people's incomes rise, they may buy more of some goods, such as restaurant meals.

## What Supply Means

Supply is the amount of a product sellers are willing and able to offer at different prices. Generally, when prices are higher, producers want to sell more, because they can earn more profit. A farmer who can get a high price for strawberries may plant more strawberry fields next season. Supply can shift too. A drought can shrink a harvest; a new machine can let a factory make goods faster and more cheaply.

## Where They Meet

The price of a product tends to settle where the amount buyers want matches the amount sellers offer. Economists call this the equilibrium price. If a price is set too high, sellers end up with a surplus, extra goods that no one is buying, and they often lower prices to clear them out. If a price is too low, buyers want more than sellers have, creating a shortage, and prices tend to rise.

Think about concert tickets for a famous performer. Thousands of fans want seats, but the arena holds a limited number. Because demand far exceeds supply, tickets sold on resale websites can cost several times their original price.

## Real Life Is Complicated

Supply and demand are not the only forces that shape prices. Governments may tax some goods or set limits on prices. A few large companies may control most of a market. People also make choices based on habit, loyalty, or values, not just cost. Still, supply and demand offer a powerful starting point for understanding why a winter coat goes on sale in March, why strawberries are cheaper in summer, and why the lemonade stand does its best business on the hottest days.`,
    focus: ['central-idea', 'vocabulary', 'text-structure'],
    vocab: [
      ['economics', 'the study of how people make, buy, sell, and use goods and services'],
      ['drought', 'a long period with little or no rain'],
      ['equilibrium', 'a state of balance between forces'],
      ['surplus', 'an amount that is more than what is needed or wanted'],
      ['shortage', 'a situation in which there is not enough of something'],
      ['exceeds', 'is greater than'],
    ],
    questions: [
      Q("What is the main purpose of the passage?", 'main-idea', 2,
        "To explain how supply and demand work together to help determine prices",
        "To persuade readers to open a lemonade stand",
        "To argue that governments should control all prices",
        "To describe the history of money"),
      Q("According to the passage, a surplus happens when—", 'vocab', 2,
        "sellers have more goods than buyers want at the current price",
        "buyers want more goods than sellers have",
        "a government taxes a product",
        "a drought shrinks a harvest"),
      Q("Based on the passage, why does a winter coat often go on sale in March?", 'inference', 3,
        "Demand for winter coats falls as the weather warms, so stores lower prices to sell extra coats.",
        "Factories make more coats in March than at other times.",
        "Governments require stores to lower prices in spring.",
        "Coats are made of materials that spoil quickly."),
      Q("Why does the author begin and end with the lemonade stand?", 'craft', 3,
        "To frame a complex idea with a familiar, concrete example readers can connect to",
        "To show that lemonade is the most important product in economics",
        "To tell a story about the author's childhood business",
        "To compare lemonade prices in different countries"),
      Q("Which detail best supports the idea that prices are shaped by more than supply and demand?", 'evidence', 3,
        "Governments may tax some goods or set limits on prices.",
        "If a movie theater cuts ticket prices in half, it usually sells more tickets.",
        "A drought can shrink a harvest.",
        "Hot weather increases demand for fans."),
    ],
    writePrompt: "Use the ideas of supply, demand, shortage, and equilibrium to explain why concert tickets can resell for far more than their original price. Then explain one factor from the final section that could complicate this explanation.",
  },
  {
    id: '68-19',
    band: '68',
    genre: 'drama',
    title: 'The Recording',
    origin: ORIG,
    text: `CHARACTERS:
JADE, 13
ELI, her brother, 10
GRANDPA WALT, their grandfather, 74

SETTING: A cluttered attic on a rainy Saturday afternoon. Boxes are stacked everywhere. A single bulb hangs from the ceiling. JADE kneels beside an open cardboard box. ELI digs through another.

ELI: (holding up a dusty object) What is this? It looks like a tiny plastic sandwich.

JADE: It's a cassette tape. People recorded music on them before phones. (She takes it and squints at the faded label.) It says "Rosa, Kitchen, 1989."

ELI: Rosa? That's Grandma.

(A pause. JADE turns the tape over in her hands.)

JADE: There's an old player in this box. Dad said Grandpa never throws anything away. (She pulls out a battered cassette player and presses buttons.) The batteries might still...

(The player clicks. A hiss. Then, faint and crackly, a woman's voice humming, then singing in Spanish. Pots clatter in the background. A younger man's laugh is heard.)

ELI: (whispering) Is that her?

JADE: I think so. And that laugh... that's Grandpa.

(Footsteps on the attic stairs. GRANDPA WALT appears, a little out of breath, holding two mugs.)

GRANDPA WALT: Your mother said you two were up here looking for the camping lantern, and I thought... (He stops. He hears the tape. His face goes still.)

JADE: (quickly) We found it in a box. I'm sorry, we can turn it off.

GRANDPA WALT: (quietly) No. (He sets down the mugs carefully, as if they might break.) No, leave it.

(They listen. The voice on the tape laughs and says something in Spanish.)

ELI: What did she say?

GRANDPA WALT: She said, "Walter, if you burn the rice again, you're sleeping on the porch." (He laughs, but his voice cracks.) I burned it anyway.

(He lowers himself onto a trunk. JADE and ELI exchange a look.)

JADE: Grandpa, why is this in a box? Don't you want to hear her?

GRANDPA WALT: (after a long moment) I put a lot of things in boxes after she passed. I told myself I was being organized. (He shakes his head.) The truth is, I was afraid. I thought if I heard her voice, it would be like losing her all over again.

ELI: Is it?

(GRANDPA WALT listens. On the tape, ROSA begins another song, and the younger WALT starts singing along, badly.)

GRANDPA WALT: (smiling despite himself) No. It's not. It's like she walked into the room.

JADE: We could make a copy. Put it on your phone, so it never gets lost again.

GRANDPA WALT: You can do that?

ELI: (proudly) Jade can do anything with a phone.

GRANDPA WALT: (reaching out and squeezing JADE's hand) Then I'd like that very much. (He pauses.) And maybe... maybe you two would like to learn her rice recipe. The real one. I've been keeping that in a box too.

ELI: Will you burn it?

GRANDPA WALT: (laughing) Probably. She'd expect nothing less.

(The tape plays on. Rain drums softly on the roof. The lights slowly fade as the three of them sit together, listening.)

END OF SCENE`,
    focus: ['character', 'theme', 'inference'],
    vocab: [
      ['cluttered', 'messy and filled with too many things'],
      ['squints', 'looks with eyes partly closed to see better'],
      ['faded', 'having lost brightness or color over time'],
      ['battered', 'damaged from long or rough use'],
      ['crackly', 'making small popping or snapping sounds'],
      ['organized', 'arranged in a neat, orderly way'],
    ],
    questions: [
      Q("How do Jade and Eli figure out whose voice is on the tape?", 'detail', 2,
        "The label says 'Rosa, Kitchen, 1989,' and Eli knows Rosa was their grandmother.",
        "Grandpa tells them before they press play.",
        "Their mother described the tape to them.",
        "The voice on the tape says her full name."),
      Q("What is the main purpose of stage directions such as '(His face goes still.)'?", 'craft', 2,
        "They show characters' actions and emotions that the dialogue alone does not reveal.",
        "They translate what the characters say in Spanish.",
        "They list the props each actor must bring.",
        "They explain the history of cassette tapes."),
      Q("Why does Grandpa set the mugs down 'as if they might break'?", 'inference', 3,
        "He is overwhelmed by emotion and moving carefully to steady himself.",
        "The mugs are antiques that belonged to Rosa.",
        "He is angry and trying not to throw them.",
        "The attic floor is uneven."),
      Q("How does Grandpa Walt change during the scene?", 'inference', 3,
        "He moves from avoiding memories of his wife out of fear to embracing them and sharing them.",
        "He moves from happiness to anger at the children for snooping.",
        "He decides to throw away all of Rosa's belongings.",
        "He refuses to listen to the tape from beginning to end."),
      Q("Which line best expresses the play's theme about memory and grief?", 'theme', 3,
        "It's like she walked into the room.",
        "It's a cassette tape.",
        "Jade can do anything with a phone.",
        "Your mother said you two were up here looking for the camping lantern."),
    ],
    writePrompt: "Explain how the playwright uses the cassette tape and the rice recipe as symbols. What do these objects reveal about Grandpa Walt's grief and how it changes during the scene? Cite both dialogue and stage directions.",
  },
  {
    id: '68-20',
    band: '68',
    genre: 'biography',
    title: "Ramanujan's Notebooks",
    origin: ORIG,
    text: `In 1913, a mathematician at Cambridge University named G. H. Hardy opened a letter from India. It came from a 25-year-old clerk he had never heard of, and it was crammed with pages of formulas. Some were already known. Others looked impossible. Hardy's first thought was that the letter might be a hoax. By the end of the evening, he and his colleague J. E. Littlewood had reached a different conclusion: the writer was a genius.

## A Boy and a Book

Srinivasa Ramanujan was born in 1887 in Erode, in southern India, and grew up in the town of Kumbakonam, where his father worked as a clerk in a cloth shop. As a teenager, he borrowed a book called A Synopsis of Elementary Results in Pure and Applied Mathematics. It listed thousands of mathematical results, called theorems, usually with only brief explanation. For most readers, it would have been a dry reference book. For Ramanujan, it was a doorway. He worked through it on his own and then went far beyond it, filling notebooks with discoveries of his own.

## Struggle and Persistence

His passion came at a cost. Ramanujan won a scholarship to college, but he was so absorbed in mathematics that he neglected his other subjects and lost it. He tried again at another college and did not finish a degree. For years he lived in poverty, sometimes relying on friends, while continuing to fill page after page with formulas. Eventually, with help from supporters who recognized his talent, he found work as a clerk at the Madras Port Trust. It was from there that he wrote to Hardy.

## Cambridge

Hardy invited Ramanujan to England. The decision was not easy. Traveling overseas raised religious and family concerns, and his mother at first objected. But in 1914 he sailed for England. At Cambridge, he and Hardy formed one of the most remarkable partnerships in the history of mathematics. Hardy, trained in formal proof, pushed Ramanujan to demonstrate why his results were true. Ramanujan, who often arrived at answers through intuition, gave Hardy ideas no one else could have imagined. Together they published influential work on numbers.

Life in England was hard. The climate was cold and damp, World War I made food scarce, and Ramanujan, a strict vegetarian, struggled to eat well. His health began to fail. Still, in 1918 he was elected a Fellow of the Royal Society, one of the highest honors a scientist in Britain could receive.

## The Taxicab Number

Hardy liked to tell a story from a visit to Ramanujan when he was ill. Hardy mentioned that his taxi's number, 1729, seemed rather dull. Ramanujan disagreed at once: 1729, he said, is the smallest number that can be written as the sum of two cubes in two different ways. It equals 1 cubed plus 12 cubed, and also 9 cubed plus 10 cubed.

Ramanujan returned to India in 1919 and died the following year, at only 32. Yet mathematicians are still studying his notebooks today, and some of his formulas have found uses in fields he never knew existed. In India, his birthday, December 22, is celebrated as National Mathematics Day.`,
    focus: ['central-idea', 'summarize', 'compare'],
    vocab: [
      ['hoax', 'a trick meant to fool people'],
      ['theorems', 'mathematical statements that can be proven true'],
      ['absorbed', 'so interested in something that you notice little else'],
      ['neglected', 'failed to give enough care or attention to'],
      ['intuition', 'understanding something without step-by-step reasoning'],
      ['influential', 'having a strong effect on others'],
      ['scarce', 'hard to find because there is not enough'],
    ],
    questions: [
      Q("Why did Ramanujan lose his college scholarship?", 'detail', 2,
        "He focused so completely on mathematics that he neglected his other subjects.",
        "He moved to England before finishing.",
        "He refused to study the Synopsis.",
        "He became too ill to attend classes."),
      Q("Hardy at first thought the letter might be a hoax. A hoax is—", 'vocab', 2,
        "a trick meant to fool people",
        "a famous discovery",
        "a difficult math problem",
        "a letter of recommendation"),
      Q("How did Hardy's and Ramanujan's different strengths help their partnership?", 'compare', 3,
        "Hardy brought skill in formal proof, while Ramanujan brought powerful intuition and original ideas.",
        "Hardy supplied money, while Ramanujan supplied a university position.",
        "Both had identical training, so they worked quickly.",
        "Ramanujan taught Hardy how to write proofs."),
      Q("Why does the author include the taxicab story?", 'craft', 3,
        "To illustrate how deeply Ramanujan noticed and understood patterns in numbers",
        "To explain how Ramanujan traveled around Cambridge",
        "To show that Hardy disliked mathematics",
        "To prove that 1729 is the largest important number"),
      Q("Which statement best summarizes the central idea of the biography?", 'main-idea', 3,
        "Despite poverty, setbacks, and illness, Ramanujan's extraordinary talent produced mathematics that still matters today.",
        "Ramanujan became famous because he won many scholarships.",
        "Cambridge University discovered Ramanujan by searching India for students.",
        "Ramanujan's work was forgotten soon after his death."),
    ],
    writePrompt: "Ramanujan faced many obstacles. Choose the two you think were most serious and explain, with evidence from the text, how he overcame them or how they affected his life and work.",
  },
  {
    id: '68-21',
    band: '68',
    genre: 'fiction',
    title: 'The Quiet City',
    origin: ORIG,
    text: `In the city of New Harmon, nobody heard anything they didn't want to hear.

Everyone over the age of eight wore a Lull, a thin silver curve tucked behind the ear. The Lull filtered sound the way sunglasses filter light. Traffic became a soft hum. Construction faded to nothing. Crying babies, barking dogs, arguments on the train: tap your Lull twice, and they vanished. The ads called it "Your Personal Peace."

Oren Vasquez had worn his since third grade. He couldn't remember the last time he'd heard a stranger's voice unless he chose to.

Then, on a Tuesday in March, his Lull died.

It happened on the walk to school. One moment the street was its usual muffled blur. The next, the world crashed in. A bus wheezed to a stop. Pigeons flapped and muttered on a ledge. Somewhere above him, a window was open, and someone was practicing violin, badly, then less badly, then the same phrase again, over and over.

Oren stopped on the sidewalk, stunned. People flowed around him, each wrapped in silence, eyes forward.

At school, the repair kiosk said replacement parts would take three days. Three days. Oren expected to hate it.

Instead, he started noticing things.

The lunch server, Ms. Petrakis, hummed old songs while she worked. He had passed her every day for years and never known. In the hallway, he heard a girl from his math class, Amara, telling a friend she was scared about her brother's surgery. Her friend, Lull glowing faintly, wasn't listening. Oren hesitated, then said, "I hope he's okay." Amara turned, surprised, and for the first time they actually talked.

On the second day, he heard a man on the corner asking for directions. Five passersby walked past him without a flicker. The man was lost, and they hadn't heard him at all. Oren walked him four blocks to the clinic.

On the third evening, Oren sat on his fire escape and listened to the city. It was loud. It was messy. There were sirens and shouting and the violin again, now playing the whole song all the way through. Down on the street, an old couple argued cheerfully about whether to buy peaches. A baby laughed. A door slammed. It was the most alive he had ever felt.

The next morning, the repair kiosk pinged. His new Lull was ready, silver and sleek in its little box.

Oren held it for a long time.

At school, he found Amara in the hallway. "My brother's surgery went fine," she said, grinning. "Thanks for asking. Nobody else did."

Oren thought about all the voices he'd never heard. All the people asking for help, or singing, or practicing the same hard phrase until they got it right.

He slipped the Lull into his pocket, still in its box. Maybe he'd use it on the train, when the noise got to be too much.

But not today.`,
    focus: ['theme', 'inference', 'plot'],
    vocab: [
      ['filtered', 'removed unwanted parts while letting others pass through'],
      ['muffled', 'made quieter and less clear'],
      ['stunned', 'so shocked that you cannot react right away'],
      ['kiosk', 'a small booth or machine that provides a service'],
      ['passersby', 'people who are walking past'],
      ['flicker', 'a quick, small movement or sign'],
      ['sleek', 'smooth, shiny, and stylish'],
    ],
    questions: [
      Q("What does the Lull do?", 'detail', 2,
        "It filters out sounds the wearer does not want to hear.",
        "It translates foreign languages.",
        "It records conversations for later.",
        "It plays music through a tiny speaker."),
      Q("The street was usually a 'muffled blur.' Muffled means—", 'vocab', 2,
        "made quieter and less clear",
        "brightly colored",
        "extremely crowded",
        "completely silent"),
      Q("What does the scene with the lost man suggest about life in New Harmon?", 'inference', 3,
        "The technology that gives people peace also keeps them from noticing those who need help.",
        "Most people in New Harmon are rude on purpose.",
        "The clinic is hard to find because it is new.",
        "Oren is the only person who knows the city well."),
      Q("Why does the author mention the violin player three times?", 'craft', 3,
        "The improving violin mirrors Oren's growing appreciation of the sounds around him.",
        "The violin is the loudest sound in the city.",
        "It shows that the violinist is Oren's close friend.",
        "It proves that Oren's Lull is still partly working."),
      Q("Which statement best expresses the theme?", 'theme', 3,
        "Shutting out discomfort can also shut out connection with others.",
        "Technology always makes life worse.",
        "Cities are too noisy to live in.",
        "People should avoid talking to strangers."),
    ],
    writePrompt: "At the end, Oren pockets the new Lull and thinks 'not today.' Analyze what this decision shows about how he has changed, using at least three events from the story as evidence.",
  },
  {
    id: '68-22',
    band: '68',
    genre: 'informational',
    title: 'How GPS Knows Where You Are',
    origin: ORIG,
    text: `## A Question Your Phone Answers Constantly

When you open a map app and a blue dot appears exactly where you're standing, your phone is solving a remarkable puzzle. It is listening to signals from satellites about 20,000 kilometers above Earth and using them to calculate your position, often within a few meters. The system that makes this possible is called the Global Positioning System, or GPS.

## A Ring of Satellites

GPS is operated by the United States and is based on a group, or constellation, of about 30 satellites. They are arranged in orbits so that, at almost any moment and from almost anywhere on Earth, at least four are above the horizon. Each satellite circles the planet about twice a day. Other countries and regions run similar systems, including Russia's GLONASS, Europe's Galileo, and China's BeiDou. Many modern phones can use signals from several systems at once.

## Timing Is Everything

Each GPS satellite carries extremely precise atomic clocks. Over and over, it broadcasts a radio signal that says, in effect, "I am this particular satellite, here is where I am, and this is the exact time I sent this message."

Your phone's receiver picks up the signal and notes when it arrived. Radio signals travel at the speed of light, roughly 300,000 kilometers per second. By measuring how long the signal took to arrive, the receiver can calculate how far away the satellite is. Because light is so fast, timing must be extraordinarily precise: an error of just one millionth of a second would throw the distance off by about 300 meters.

## Finding the Spot

Knowing your distance from one satellite tells you only that you are somewhere on a giant imaginary sphere around it. Add a second satellite, and the possible locations narrow to the circle where two spheres meet. A third narrows it down to just two points, one of which is usually far out in space and can be ignored. This method of finding a position from distances is called trilateration.

So why do receivers need a fourth satellite? Your phone's clock is far less accurate than an atomic clock. The fourth signal lets the receiver correct for its own timing error, which makes the position much more accurate.

## Einstein in Your Pocket

There is one more surprising correction. According to Albert Einstein's theories of relativity, clocks that move fast, or that sit higher above Earth where gravity is weaker, tick at slightly different rates from clocks on the ground. For GPS satellites, the overall effect makes their clocks run faster by about 38 microseconds per day. Engineers adjust for this difference. Without that correction, position errors would build up by several kilometers every day.

## Beyond Directions

GPS does far more than help drivers find their way. Farmers use it to guide tractors in straight rows. Scientists use it to measure the slow movement of the plates that make up Earth's crust. Banks, power grids, and cell networks rely on GPS timing signals to keep their systems synchronized. A technology created for navigation has become an invisible clock for the modern world.`,
    focus: ['text-structure', 'central-idea', 'vocabulary'],
    vocab: [
      ['constellation', 'a group of things arranged in a pattern, such as satellites'],
      ['precise', 'exact and accurate'],
      ['broadcasts', 'sends out a signal for many receivers to pick up'],
      ['sphere', 'a perfectly round, ball-shaped object'],
      ['trilateration', 'finding a location by measuring distances from known points'],
      ['relativity', 'Einstein\'s theories about how time, space, and motion are connected'],
      ['synchronized', 'set to happen at exactly the same time'],
    ],
    questions: [
      Q("What is the central idea of the passage?", 'main-idea', 2,
        "GPS finds locations by precisely timing signals from several satellites and correcting for errors.",
        "GPS satellites take photographs to locate phones.",
        "Only the United States has a satellite navigation system.",
        "Einstein designed the first GPS satellites."),
      Q("Why does a receiver need a fourth satellite?", 'detail', 2,
        "To correct for the timing error in the receiver's own less accurate clock",
        "Because one satellite is always broken",
        "To measure the satellites' speed",
        "To connect the phone to the internet"),
      Q("Which phrase best helps the reader understand the word trilateration?", 'vocab', 3,
        "This method of finding a position from distances",
        "a giant imaginary sphere around it",
        "extremely precise atomic clocks",
        "Many modern phones can use signals from several systems"),
      Q("Based on the passage, what would most likely happen if engineers stopped correcting for relativity?", 'inference', 3,
        "GPS positions would become less accurate by several kilometers each day.",
        "Satellites would fall out of orbit.",
        "Phones would receive signals faster.",
        "GPS would work better in cities."),
      Q("How does the section 'Finding the Spot' organize its explanation?", 'craft', 3,
        "It adds one satellite at a time to show how each narrows down the possible location.",
        "It compares GPS with Galileo and BeiDou.",
        "It describes the history of GPS in time order.",
        "It presents an argument about who should pay for GPS."),
    ],
    writePrompt: "The author calls GPS 'an invisible clock for the modern world.' Explain what this means and why timing is central to how GPS works, citing at least three details from the passage.",
  },
  {
    id: '68-23',
    band: '68',
    genre: 'poetry',
    title: 'Instructions for My Younger Self',
    origin: ORIG,
    text: `When the new school swallows you whole
that first September, and the hallways
seem to stretch like rubber bands
toward rooms you cannot find,
don't run.
Everyone is lost the first week.
Some of them are just better at pretending.

Learn the names of the people who clean the building.
Say good morning to them.
You will be amazed how many doors open
when you treat everyone as if they matter,
because they do.

When you fail the first test, and you will,
the one on fractions, in the gray room
with the clock that ticks too loudly,
do not fold the paper into a tiny square
and bury it at the bottom of your backpack.
Unfold it. Look at it the way a detective
studies a footprint.
Mistakes are not verdicts.
They are directions.

Don't laugh when they laugh at the boy
with the stutter in second period.
You will want to. Laughing is easier
than being the next one they notice.
Don't. Sit next to him at lunch instead.
Years from now, he will still be your friend,
and you will not remember
a single name of the ones who laughed.

Read the books nobody assigned,
the fat ones with cracked spines
on the bottom shelf of the library,
the ones that smell like dust and somebody else's summer.
Some of them will bore you.
One of them will change your life.
You won't know which until you've read it.

Call Grandma on Sundays,
even when you'd rather be doing anything else,
even when she asks the same three questions
and tells the story about the goat again.
Someday you would give anything
to hear about that goat
one more time.

When you are angry, go outside.
Walk until the anger walks out of you
and sits down on a bench somewhere behind you,
breathing hard.
Then go home and say what you meant
instead of what you felt.

Stop measuring yourself
against the girl who wins every race,
the boy who draws like the pictures are already
inside the paper, waiting.
They have their own instructions.
You have yours.

And when you find something
that makes the hours disappear,
a song, a sport, a sentence,
a problem that won't leave you alone,
hold on to it with both hands.
Do not let anyone talk you out of it,
especially you.

Last thing:
it gets better. Not all at once,
not in a straight line,
but it does.
I know, because I am standing here,
older, writing this down,
and I turned out
mostly fine.`,
    focus: ['theme', 'figurative-language', 'point-of-view'],
    vocab: [
      ['pretending', 'acting as if something is true when it is not'],
      ['verdicts', 'final decisions or judgments, like those made in court'],
      ['stutter', 'a speech pattern in which sounds are repeated or held'],
      ['assigned', 'given as a required task'],
      ['spines', 'the edges of books where the pages are bound'],
      ['measuring', 'judging or comparing the size or worth of something'],
    ],
    questions: [
      Q("Who is the speaker addressing in the poem?", 'detail', 2,
        "Their own younger self",
        "A new teacher",
        "Their grandmother",
        "The boy with the stutter"),
      Q("What does the line 'Mistakes are not verdicts. / They are directions.' mean?", 'craft', 2,
        "Mistakes do not decide who you are; they show you what to work on next.",
        "Mistakes should be reported to a judge.",
        "Mistakes happen only when you get lost.",
        "Teachers give directions so that students avoid mistakes."),
      Q("What can the reader infer from the stanza about calling Grandma?", 'inference', 3,
        "The speaker's grandmother has likely died, and the speaker wishes those calls had been more valued.",
        "The speaker's grandmother lives on a goat farm.",
        "The speaker never enjoyed talking to Grandma.",
        "Grandma calls the speaker every Sunday."),
      Q("Why does the poet structure the poem as a series of instructions?", 'craft', 3,
        "It creates the feeling of advice gathered from experience and passed to someone who needs it.",
        "It shows that the speaker is writing an official rulebook for school.",
        "It makes the poem rhyme more easily.",
        "It allows the speaker to describe one day in time order."),
      Q("Which lines best capture the poem's message about growing up?", 'theme', 3,
        "it gets better. Not all at once, / not in a straight line, / but it does.",
        "Read the books nobody assigned,",
        "When you are angry, go outside.",
        "Everyone is lost the first week."),
    ],
    writePrompt: "Choose the instruction in the poem you think is most important. Analyze the imagery or figurative language the poet uses in that stanza, and explain how it supports the poem's larger message.",
  },
  {
    id: '68-24',
    band: '68',
    genre: 'fiction',
    title: 'The Keeper\'s Code',
    origin: ORIG,
    text: `Sam had expected the summer at Aunt Judith's to be boring. Gull Point Lighthouse was a white tower on a rock at the end of a long gravel road, with no stores, spotty cell service, and a museum that got maybe nine visitors on a good day.

Aunt Judith was its volunteer curator. On Sam's third morning, she handed him a pair of white cotton gloves and a stack of crumbling logbooks.

"The historical society wants these scanned before the paper falls apart," she said. "Gently. Every page."

The logbooks belonged to the keepers who had tended the light for a century. Most entries were dull: weather, wind direction, gallons of oil burned, ships sighted. Sam scanned page after page from 1921, written in the neat, slanted handwriting of a keeper named Walter Haines.

Then he noticed something strange.

At the bottom of many entries, below Haines's signature, were tiny pencil marks. Dots and dashes, faint as eyelashes. At first Sam thought they were smudges. But they were too regular, and they appeared only on certain days, always in the same lower corner.

"Aunt Judith," he called. "Did lighthouse keepers know Morse code?"

"Many did. They used it to communicate with ships and stations. Why?"

Sam didn't answer. He was already holding his phone toward the window to catch one bar of signal. A Morse chart loaded slowly. He copied the marks from the first page onto a notepad. Dot-dot-dash. Dash-dot. Dash-dot-dot.

U. N. D.

His heart started thumping. The marks weren't one message per page; they continued from one entry to the next, like a sentence spread across weeks. By lunchtime he had it written out in block letters:

UNDER THIRD STEP. FOR WHOEVER FINDS IT. E.H.

"E.H.," Aunt Judith said slowly. "Haines had a daughter. Eleanor. The records say she grew up here." She looked at the pencil marks, then at Sam. "Which steps?"

There were two sets: the spiral iron staircase inside the tower, and three stone steps leading up to the keeper's cottage. Iron steps had no space to hide anything. Stone steps might.

The third stone step was loose. It took both of them and a crowbar from the shed, but at last it shifted with a grinding scrape. Underneath, in a hollow packed with dry sand, lay a rusted tin box.

Inside was a seashell, a photograph of a girl in a too-big wool coat standing at the top of the tower, and a note in faded pencil:

My name is Eleanor Haines. I am twelve. Everyone thinks this is the loneliest place in the world, but they are wrong. If you are reading this, you found my code, which means you were paying attention. That is what keepers do. Take care of the light.

Sam read it twice. Then he looked up at the tower, white against the blue sky, and decided the summer might not be boring after all.`,
    focus: ['plot', 'inference', 'theme'],
    vocab: [
      ['curator', 'a person who takes care of a museum\'s collection'],
      ['crumbling', 'breaking into small pieces from age'],
      ['tended', 'took care of'],
      ['regular', 'following an even, repeated pattern'],
      ['communicate', 'to share information or messages'],
      ['hollow', 'an empty space inside something'],
    ],
    questions: [
      Q("What is Sam's job at the lighthouse museum?", 'detail', 2,
        "Scanning old keepers' logbooks before the paper falls apart",
        "Cleaning the lighthouse lens",
        "Giving tours to visitors",
        "Repairing the stone steps"),
      Q("Aunt Judith is the museum's curator. A curator is someone who—", 'vocab', 2,
        "takes care of a museum's collection",
        "builds lighthouses",
        "guides ships into harbor",
        "writes in logbooks every day"),
      Q("Why does Sam decide the message refers to the stone steps rather than the iron staircase?", 'inference', 3,
        "He reasons that the iron steps have no space to hide anything, while stone steps might.",
        "Aunt Judith tells him exactly where to look.",
        "The coded message includes the word 'stone.'",
        "The iron staircase is locked."),
      Q("Which clue first convinces Sam that the pencil marks are not smudges?", 'evidence', 3,
        "They were too regular and appeared only on certain days in the same corner.",
        "They were written in ink instead of pencil.",
        "They spelled out his name.",
        "They were signed by Walter Haines."),
      Q("How does Eleanor's note connect to Sam's experience?", 'theme', 3,
        "Like a keeper, Sam found the hidden message because he paid close attention to details others overlooked.",
        "Like Eleanor, Sam felt lonely and wanted to go home.",
        "Sam had been told about the code by the historical society.",
        "Eleanor's note proves that the lighthouse is haunted."),
    ],
    writePrompt: "Eleanor writes that paying attention 'is what keepers do.' Analyze how the author builds suspense as Sam solves the mystery, and explain how Eleanor's note expresses the story's theme.",
  },

  // ── Grade 8 ────────────────────────────────────────────────────────────────
  {
    id: '68-25',
    band: '68',
    genre: 'fiction',
    title: 'Scrap Drive, 1943',
    origin: ORIG,
    text: `In the fall of 1943, the whole city of Detroit seemed to be made of metal and noise. The car factories had stopped building automobiles and started building tanks, engines, and bombers. My sister June, who was nineteen, rode a bus every morning to the Willow Run plant, where she drove rivets into the wings of B-24 bombers. She came home with aluminum dust in her hair and her hands too tired to hold a fork. I was thirteen, and I wanted desperately to be useful too.

So when Miss Albers announced that our school would hold a scrap metal drive, I nearly leapt out of my seat.

"Every pound of scrap helps build ships and planes," she told us, tapping a poster that showed a frying pan turning into a fighter plane. "Old pots. Broken tools. Bedsprings. Anything made of iron, steel, copper, or rubber."

The class that collected the most would win a war bond and have its picture in the newspaper. I made a list that night: the rusted wagon wheels in the garage, Papa's broken lawnmower, the dented washtub, a coil of copper wire. It was a good list. It was not a winning list. The Petersen twins down the block had an uncle with a junkyard.

On Thursday, I was rummaging through the basement when I saw it: an iron bed frame, painted white, folded against the wall under a sheet. It had been my brother Tommy's. Tommy was in the Navy now, somewhere in the Pacific. His letters came every few weeks, full of blacked-out lines where the censors had cut anything that might reveal where he was.

The frame must have weighed sixty pounds. I could practically see the frying pan turning into a fighter plane.

At dinner, I asked. Mama put down her spoon.

"No," she said.

"But it's just sitting there. Tommy's not even using it. He'd want it to help. You always say..."

"I said no, Frances."

June glanced at Mama, then at me, and shook her head very slightly. I didn't understand. I went to bed angry, thinking about the Petersen twins and their uncle's junkyard.

Late that night, I came downstairs for water and found Mama in the basement. She had pulled the sheet off the bed frame and was sitting on an overturned crate beside it, one hand resting on the white iron rail. She wasn't crying. She was just sitting there, very still, the way people sit in church.

I stood on the stairs for a long time before she noticed me.

"When he comes home," Mama said quietly, without turning around, "he'll need a bed."

And suddenly I understood. The bed wasn't scrap. It was a promise. As long as it waited in the basement, Tommy was coming back to sleep in it.

I sat down on the step. "I won't take it," I said.

We sat together in the cold basement for a while, listening to the furnace tick.

The next morning, I pulled my wagon through the neighborhood instead, knocking on doors. Mrs. Lindqvist gave me a broken radiator. The Greenbergs gave me a box of old hinges and a cracked iron skillet. Old Mr. Duffy, who usually yelled at kids for cutting across his lawn, dragged an entire rusted plow from behind his garage and said, "Take it, kid," then looked embarrassed and went inside.

Our class did not win. The Petersen twins' uncle saw to that. But we collected over eight hundred pounds, and Miss Albers said every ounce counted.

Tommy came home in the spring of 1946. The first night, he slept in the white iron bed. Mama stood in the doorway for a long time, watching, the way you watch something you were afraid you would never see again.`,
    focus: ['theme', 'character', 'inference'],
    vocab: [
      ['rivets', 'metal pins used to fasten pieces of metal together'],
      ['desperately', 'with a strong, urgent need'],
      ['rummaging', 'searching through things in a careless or hurried way'],
      ['censors', 'officials who remove information considered secret or harmful'],
      ['reveal', 'to make known something that was hidden'],
      ['overturned', 'turned upside down'],
    ],
    questions: [
      Q("Why does Frances want to donate the bed frame?", 'detail', 2,
        "It is heavy iron that could add many pounds to her class's scrap total.",
        "Her brother asked her to get rid of it.",
        "Her mother wants more space in the basement.",
        "Miss Albers specifically asked for beds."),
      Q("Tommy's letters had lines blacked out by censors. Censors are people who—", 'vocab', 2,
        "remove information that is considered secret or harmful",
        "deliver mail to soldiers",
        "translate letters into other languages",
        "repair damaged paper"),
      Q("Why does June shake her head at Frances during dinner?", 'inference', 3,
        "June understands why the bed matters to Mama and signals Frances to stop pushing.",
        "June wants the bed for herself.",
        "June thinks scrap drives are useless.",
        "June is too tired to talk."),
      Q("What does the bed frame come to symbolize in the story?", 'craft', 3,
        "Mama's hope and promise that Tommy will come home safely",
        "the factories of Detroit",
        "Frances's desire to win the contest",
        "the family's poverty during the war"),
      Q("Which statement best expresses the theme?", 'theme', 3,
        "Some objects carry meanings worth more than their practical use, and there is more than one way to help.",
        "Winning a contest is the best way to support a cause.",
        "Children should never question their parents.",
        "War brings only loss and never brings a community together."),
    ],
    writePrompt: "Frances realizes, 'The bed wasn't scrap. It was a promise.' Analyze how the author develops this realization through Mama's actions and dialogue, and explain how the final paragraph reinforces it.",
  },
  {
    id: '68-26',
    band: '68',
    genre: 'informational',
    title: 'The Press That Changed the World',
    origin: ORIG,
    text: `## Before the Press

Imagine needing a copy of a book and having only one option: paying someone to write the entire thing out by hand. In medieval Europe, that was how most books were made. Skilled scribes, many of them monks, copied texts letter by letter. A single large book could take months or even years to finish. Books were rare and expensive, and most people never owned one.

## Printing Begins in Asia

Printing itself was not a European invention. In China, printers carved entire pages into wooden blocks, inked them, and pressed paper onto them. The oldest surviving printed book with a date, a Buddhist text called the Diamond Sutra, was printed in China in 868 CE. Around the 1040s, a Chinese craftsman named Bi Sheng created movable type from baked clay: individual characters that could be arranged, printed, and reused. In Korea, printers developed movable metal type, and a Buddhist book known as the Jikji, printed in 1377, is the oldest surviving book made with it.

Yet movable type spread slowly in East Asia, partly because Chinese writing uses thousands of different characters, making a full set of type enormous.

## Gutenberg's Combination

In the German city of Mainz, around 1450, a goldsmith named Johannes Gutenberg brought together several technologies in a new way. He developed a method for casting large numbers of identical metal letters quickly and precisely. He used an oil-based ink that stuck to metal better than the water-based inks used for woodblocks. And he adapted the screw press, a machine long used to squeeze grapes and olives, to press paper evenly against inked type.

The European alphabet, with only a few dozen letters and symbols, was well suited to this system. A worker could set a page of type, print hundreds of copies, then break the page apart and reuse the letters. Around 1455, Gutenberg's workshop completed a famous edition of the Bible. Historians estimate that about 180 copies were printed, and fewer than 50 survive today, some only in part.

## An Information Explosion

The new technology spread with astonishing speed. Within fifty years, printing presses were operating in more than two hundred European cities, and historians estimate that millions of books had been printed. Prices fell. More people learned to read, and more books were written in everyday languages rather than only in Latin.

The effects rippled through society. In 1517, a German monk named Martin Luther wrote a list of criticisms of the Catholic Church. Printers reproduced his ideas quickly, and within weeks they had spread across Germany, helping launch the Protestant Reformation. Scientists could now share their findings with colleagues across the continent, and printed diagrams meant that everyone was looking at the same accurate image. Some historians argue that the printing press helped make the Scientific Revolution possible.

## A Double-Edged Tool

Printing did not only spread knowledge. It also spread rumors, insults, and false claims, often in cheap pamphlets whose authors were difficult to trace. Authorities in many places tried to control what could be printed, requiring licenses or banning certain books.

Today, people sometimes compare the printing press to the internet. Both made it far easier to share information widely and cheaply. Both brought enormous benefits and new problems. In each case, the technology itself was only the beginning. What mattered most was how people chose to use it.`,
    focus: ['central-idea', 'text-structure', 'author-purpose'],
    vocab: [
      ['scribes', 'people whose job was to copy documents by hand'],
      ['movable', 'able to be moved and rearranged'],
      ['adapted', 'changed something so it could be used in a new way'],
      ['edition', 'all the copies of a book printed at one time'],
      ['astonishing', 'extremely surprising'],
      ['rippled', 'spread outward in widening waves'],
      ['pamphlets', 'small, thin printed booklets'],
    ],
    questions: [
      Q("Which statement best expresses the central idea?", 'main-idea', 2,
        "The printing press, built on earlier Asian inventions and Gutenberg's innovations, transformed how information spread, with both benefits and drawbacks.",
        "Gutenberg invented printing, which had never existed anywhere before.",
        "The printing press was used mainly to print Bibles.",
        "Movable type failed in Asia because it was poorly designed."),
      Q("Which of these did Gutenberg adapt from a machine used for grapes and olives?", 'detail', 2,
        "The screw press",
        "Oil-based ink",
        "Movable clay type",
        "Woodblock carving"),
      Q("According to the passage, why did movable type spread more slowly in East Asia than in Europe?", 'compare', 3,
        "Chinese writing uses thousands of characters, making a full set of type enormous.",
        "East Asian rulers banned all printing.",
        "Paper was not available in East Asia.",
        "East Asian printers did not know how to make metal type."),
      Q("Why does the author include the section 'A Double-Edged Tool'?", 'craft', 3,
        "To show that the printing press created problems as well as benefits",
        "To argue that the printing press should have been banned",
        "To explain how pamphlets were bound",
        "To describe Gutenberg's money troubles"),
      Q("What connection does the author draw between the printing press and the internet?", 'inference', 3,
        "Both made sharing information easy and cheap, and their impact depends on how people use them.",
        "Both were invented in Germany.",
        "The internet will soon replace all printed books.",
        "Both were controlled entirely by governments from the start."),
    ],
    writePrompt: "The author writes that Gutenberg 'brought together several technologies in a new way.' Explain each part of his system and evaluate whether he deserves to be called the inventor of printing, using evidence from the passage.",
  },
  {
    id: '68-27',
    band: '68',
    genre: 'opinion',
    title: 'Phones in Lockers: The Case for Phone-Free School Days',
    origin: ORIG,
    text: `The bell rings for lunch, and the cafeteria goes quiet, not because students are listening, but because many of them are staring at screens. Conversations happen in short bursts between notifications. Schools should require students to store their phones in lockers or pouches during the school day, because doing so improves focus, strengthens face-to-face relationships, and reduces online conflict during school hours.

## Attention Is a Limited Resource

The first reason is focus. Phones are designed to capture attention. Every buzz and banner is a small interruption, and research on multitasking shows that switching attention back and forth makes it harder to learn and remember. Some studies suggest that even a phone sitting silently on a desk can be a distraction, because part of the mind stays alert to it. Teachers report spending valuable minutes reminding students to put devices away. When phones are out of reach, that energy can go toward learning.

## Real Conversations

Second, phone-free days encourage students to connect with the people around them. Middle school is a time for learning how to start conversations, resolve disagreements, and read facial expressions. These skills are built through practice, and the practice happens at lunch tables, in hallways, and on playgrounds. Some schools that have adopted phone-free policies report livelier cafeterias, with more students talking, playing games, and joining clubs.

## Fewer Conflicts

Third, phones bring online drama into the school building. A hurtful message or an embarrassing photo can spread through a school in minutes, and students may be dealing with it in the middle of math class. Keeping phones stored during the day does not end cyberbullying, but it creates hours of relief from it and limits the chance that a photo is taken in a locker room or bathroom without permission.

This idea is not unusual. France restricted phone use in primary and middle schools in 2018, and in 2023 a United Nations education report urged countries to think carefully about how and when phones are used in classrooms. Many schools in the United States have adopted similar rules.

## Addressing the Concerns

Opponents raise thoughtful objections. The most common is safety: parents want to reach their children in an emergency, and students want to contact family. Others argue that phones can be valuable learning tools for research, calculation, or translation, and that schools should teach responsible use rather than banning devices. Some point out that research on phone restrictions is still developing, and results have varied from school to school.

These points deserve serious attention. However, schools already have office phones and emergency communication systems, and some school safety experts warn that a flood of calls and texts during a crisis can interfere with instructions from staff and responders. School-owned laptops or tablets can provide learning tools without the constant stream of social media. And teaching responsible use does not require phones to be available every minute; students can learn digital skills in specific lessons while enjoying focused time the rest of the day. As for the research, schools can adopt policies carefully, measure the results, and adjust.

## A Small Change

Asking students to put their phones away for seven hours is not a punishment. It is an invitation to pay attention: to lessons, to friends, and to the world right in front of them. The phones will still be there at three o'clock.`,
    focus: ['argument', 'claim-evidence', 'tone'],
    vocab: [
      ['notifications', 'alerts on a device that announce new messages or updates'],
      ['multitasking', 'trying to do more than one task at the same time'],
      ['resolve', 'to settle or find a solution to a problem'],
      ['cyberbullying', 'using technology to repeatedly hurt or embarrass someone'],
      ['objections', 'reasons given for disagreeing'],
      ['interfere', 'to get in the way of something'],
      ['invitation', 'a friendly request to do or join something'],
    ],
    questions: [
      Q("What is the author's main claim?", 'main-idea', 2,
        "Schools should require students to store phones during the school day.",
        "Students should not own phones until high school.",
        "Phones are the best learning tools available.",
        "Cafeterias should be silent during lunch."),
      Q("According to the author, why can a phone be distracting even when it is silent?", 'detail', 2,
        "Part of the mind stays alert to it.",
        "It still vibrates quietly.",
        "Its screen stays lit.",
        "Teachers check it constantly."),
      Q("How does the author respond to the argument that phones are useful learning tools?", 'craft', 3,
        "By suggesting that school-owned laptops or tablets can provide those tools without social media",
        "By claiming phones have no educational value at all",
        "By agreeing that phones should stay on desks",
        "By ignoring the argument entirely"),
      Q("Which evidence does the author use to show that phone restrictions are not unusual?", 'evidence', 3,
        "France restricted phone use in schools in 2018, and a UN education report urged careful use.",
        "Teachers report spending minutes on reminders.",
        "A hurtful message can spread in minutes.",
        "The phones will still be there at three o'clock."),
      Q("How does the final paragraph shape the argument's tone?", 'craft', 3,
        "It reframes the policy as an invitation rather than a punishment, ending on a positive, reassuring note.",
        "It becomes angry at students who use phones.",
        "It introduces new statistical evidence.",
        "It admits that the author's claim is probably wrong."),
    ],
    writePrompt: "Evaluate whether the author adequately addresses the safety concern. Then state your own position on phone-free school days, supporting it with reasons and at least one piece of evidence from the passage.",
  },
  {
    id: '68-28',
    band: '68',
    genre: 'folktale',
    title: 'The Weaver and the Cowherd',
    origin: 'Myth retold — China',
    text: `High in the heavens, long ago, there lived a young goddess named Zhinü, the Weaver Girl. She was a granddaughter of the Queen Mother of the West, and her task was to weave the clouds. Each day at her loom, she wove the delicate morning mists, the glowing sunsets, and the soft silver clouds that drift across the night. Her work was beautiful, but she was lonely. Day after day she wove, and nothing changed.

Far below, on Earth, lived a poor young cowherd named Niulang. His parents had died when he was small, and his older brother's family had treated him harshly, finally sending him away with nothing but an old ox. Niulang cared for the ox tenderly, and the two lived together in a simple hut at the foot of the mountains.

The ox was no ordinary animal. Long before, it had been a star in the heavens. One evening, it spoke to Niulang in a human voice. "Tomorrow," it said, "the heavenly maidens will come down to bathe in the river. If you are brave, you will meet the one meant for you."

Niulang went to the river. There he saw Zhinü and her sisters laughing in the water, and he and Zhinü saw each other. In some tellings, Niulang hid her robe so she could not return to the sky; in others, they simply spoke and fell in love at once. Either way, Zhinü chose to stay on Earth. She married Niulang, and they lived happily. She taught the village women to weave, and he farmed the land with the old ox. They had two children, a boy and a girl.

But the heavens had noticed the missing clouds. When the Queen Mother of the West discovered that her granddaughter had married a mortal, she was furious. She sent heavenly soldiers to bring Zhinü back to the sky.

Niulang returned from the fields to find his wife gone and his children crying. Before it died, the old ox had told him to keep its hide, for it would help him in a time of need. Now Niulang wrapped himself in the ox's hide, placed his children in two baskets hanging from a carrying pole, and rose into the sky after Zhinü.

He nearly reached her. But the Queen Mother pulled a golden hairpin from her hair and drew a line across the heavens. Instantly, a wide, rushing river of stars poured between them. That river is what we now call the Milky Way. Zhinü stood on one bank and Niulang on the other, and they could not cross.

Yet their love moved even the creatures of the earth. Every year, the story says, the magpies of the world fly up to the heavens and join their wings to form a bridge across the river of stars. On the seventh day of the seventh month, Zhinü and Niulang cross the bridge and are together for one night.

If you look up on a clear summer night, you can see them still. Zhinü is the bright star Vega, and Niulang is the star Altair, with two fainter stars beside him, their children. Between them flows the Milky Way.

In China and in other parts of East Asia, people celebrate this reunion with the Qixi Festival. Some say that if it rains that night, the raindrops are the lovers' tears of joy.`,
    focus: ['theme', 'plot', 'compare'],
    vocab: [
      ['loom', 'a frame or machine used for weaving cloth'],
      ['delicate', 'fine, light, and easily damaged'],
      ['harshly', 'in a cruel or unkind way'],
      ['tenderly', 'in a gentle, loving way'],
      ['mortal', 'a human being who will someday die'],
      ['hide', 'the skin of an animal'],
      ['reunion', 'a coming together again after being apart'],
    ],
    questions: [
      Q("How does Niulang first learn about the heavenly maidens?", 'detail', 2,
        "His ox speaks to him and tells him where they will bathe.",
        "Zhinü sends him a message woven into the clouds.",
        "His older brother tells him about them.",
        "He sees them from a mountaintop."),
      Q("The Queen Mother is angry that Zhinü married a mortal. This means Niulang is—", 'vocab', 2,
        "a human who will someday die",
        "a god from another heaven",
        "a heavenly soldier",
        "a magical animal"),
      Q("Why might the storyteller mention that 'in some tellings' Niulang hid the robe and 'in others' they simply fell in love?", 'craft', 3,
        "To show that the myth has been retold in different versions over many generations",
        "To confuse readers about what happens next",
        "To prove that the story is historically accurate",
        "To suggest that every version agrees on every detail"),
      Q("Why did the Queen Mother likely act when Zhinü left the heavens?", 'inference', 3,
        "Zhinü had stopped weaving the clouds, a duty the heavens depended on, and had married a mortal.",
        "Zhinü had stolen her golden hairpin.",
        "Niulang had insulted the heavenly soldiers.",
        "The magpies had complained about the couple."),
      Q("Which idea is best supported by the myth?", 'theme', 3,
        "Love and devotion can endure even when people are separated.",
        "Duty is always more important than love.",
        "Animals cannot be trusted.",
        "Rules made by elders should never be questioned."),
    ],
    writePrompt: "Many myths explain features of the natural world. Explain which natural features and cultural traditions this myth accounts for, and analyze how the storyteller blends sorrow and hope in the ending.",
  },
  {
    id: '68-29',
    band: '68',
    genre: 'fiction',
    title: 'Undertow',
    origin: ORIG,
    text: `Dani hadn't been deeper than her knees in the ocean since she was nine.

Five summers ago, at this same beach, a wave had knocked her down and the water had dragged her away from the shore so fast that the beach seemed to slide away like a picture pulled across a table. She remembered the burn of salt in her throat, her father's arm locking around her chest, and afterward, the way everyone on the sand had stared. She had not gone past her knees since.

Now she sat on a towel with a book she wasn't reading, watching her cousin Leo, who was ten and fearless, ride waves on a foam boogie board.

"Come in!" he yelled for the twentieth time.

"I'm good," Dani called back, for the twentieth time. Her aunt had gone to buy lunch. The lifeguard stand, a white tower with a red flag snapping in the wind, stood a long way down the beach.

Dani had spent the past year reading about the ocean, not because she liked it, but because she wanted to understand what had happened to her. She knew now that what had grabbed her that day was a rip current: a narrow channel of water rushing away from shore. She knew rip currents don't pull people under; they pull them out. She knew that many swimmers get into trouble because they panic and try to swim straight back against the current, wearing themselves out. She knew the advice: don't fight it. Swim parallel to the shore, out of the channel, then angle back in. Or float, and signal for help.

Knowing it on paper was one thing.

She looked up from her book, and Leo was farther out than he should have been.

He was not riding waves anymore. He was paddling hard toward shore, his face pinched with effort, and he was not getting any closer. The water around him looked different: darker, choppier, a strip of churning foam stretching away from the beach like a road. Dani's stomach turned to ice.

"Leo!" She was on her feet. Her legs felt like they belonged to someone else. "Stop swimming in! Stop!"

He couldn't hear her over the surf.

Dani ran to the water's edge. The cold slapped her ankles, and every cell in her body screamed at her to go back. She thought of the beach sliding away. She thought of the salt.

Then she cupped her hands around her mouth and shouted as loudly as she had ever shouted anything.

"LEO! SWIM SIDEWAYS! THAT WAY!" She flung her arm toward the left, parallel to the beach, again and again. "SIDEWAYS! HOLD THE BOARD!"

For a terrible moment, nothing happened. Then Leo's head turned. He saw her arm. He hesitated, then kicked to the left, clinging to the board, moving along the shore instead of against the current.

Dani waded in to her knees, then her waist, farther than she had been in five years, and kept pointing, kept shouting. With her other arm she waved over her head toward the lifeguard stand, back and forth, the way she had read you should signal for help.

Leo kicked. Ten yards. Twenty. Suddenly the water around him smoothed out, and a wave picked him up and carried him toward shore. He tumbled into the shallows, coughing and laughing and crying all at once, just as the lifeguard came sprinting down the sand with a rescue buoy.

Later, wrapped in towels, Leo looked at her. "How did you know to do that?"

Dani looked at the water, which was blue and glittering and ordinary again. Her heart was still pounding.

"I was scared of it for a long time," she said. "So I learned everything I could about it."

The lifeguard, kneeling beside them, nodded. "That," he said, "is exactly the right way to be scared."`,
    focus: ['character', 'theme', 'word-choice'],
    vocab: [
      ['channel', 'a narrow path through which water flows'],
      ['parallel', 'running alongside something in the same direction'],
      ['signal', 'to send a message using a sign or movement'],
      ['pinched', 'squeezed tight, showing strain'],
      ['churning', 'moving and stirring roughly'],
      ['clinging', 'holding on tightly'],
    ],
    questions: [
      Q("According to what Dani has read, why do many swimmers get into trouble in rip currents?", 'detail', 2,
        "They panic and wear themselves out swimming straight against the current.",
        "The current pulls them deep underwater.",
        "They swim parallel to the shore.",
        "They cannot see the lifeguard."),
      Q("Dani tells Leo to swim parallel to the shore. Parallel means—", 'vocab', 2,
        "alongside the shoreline, in the same direction",
        "straight toward the beach",
        "directly out to sea",
        "in circles"),
      Q("How has Dani responded to her childhood experience?", 'inference', 3,
        "She avoided the water but studied it closely to understand what had happened.",
        "She forgot about it completely.",
        "She became a competitive swimmer.",
        "She refused ever to return to the beach."),
      Q("The author repeats the image of the beach 'sliding away' during the rescue mainly to—", 'craft', 3,
        "show Dani's old fear returning at the moment she must act",
        "describe a change in the tide",
        "suggest that Leo is imagining things",
        "explain how waves form"),
      Q("What does the lifeguard mean by 'That is exactly the right way to be scared'?", 'theme', 3,
        "Fear can be useful when it pushes people to prepare and act wisely.",
        "People should never be afraid of the ocean.",
        "Being scared is a sign of weakness.",
        "Only lifeguards should help swimmers in trouble."),
    ],
    writePrompt: "Analyze how the author uses Dani's internal conflict and the pacing of the rescue scene to build tension. Then explain how the story's resolution develops its theme about fear and knowledge.",
  },
  {
    id: '68-30',
    band: '68',
    genre: 'informational',
    title: 'Your Changing Brain',
    origin: ORIG,
    text: `## A Brain That Rewires Itself

For much of the twentieth century, many scientists believed that the adult brain was mostly fixed. You were born with a certain number of brain cells, the thinking went, and after childhood the wiring was largely set. Research over the past several decades has overturned much of that view. The brain, we now know, continually reshapes itself in response to experience. This ability is called neuroplasticity.

## Cells and Connections

The human brain contains roughly 86 billion nerve cells called neurons. Neurons communicate by sending electrical and chemical signals across tiny gaps called synapses. A single neuron can connect with thousands of others, forming vast networks.

When you learn something new, such as a dance step, a Spanish verb, or a chess opening, groups of neurons fire together. The more often they fire together, the stronger and more efficient their connections become. Psychologist Donald Hebb proposed a version of this idea in 1949, and it is often summarized with a catchy phrase: neurons that fire together wire together. Connections that are rarely used, on the other hand, may weaken over time.

Practice may also affect myelin, a fatty coating that wraps around the long fibers of many neurons. Myelin works somewhat like insulation on an electrical wire, helping signals travel faster. Scientists have linked repeated practice of a skill to changes in myelin, which may be one reason practiced movements become smooth and automatic.

## Evidence From the Streets of London

One famous study looked at London taxi drivers. To earn a license, drivers must memorize a maze of about 25,000 streets, a challenge known as "the Knowledge." In 2000, researchers led by neuroscientist Eleanor Maguire used brain scans and found that experienced taxi drivers had a larger rear portion of the hippocampus, a brain region important for spatial memory, than people who were not taxi drivers. Later research that followed trainees over several years found changes in those who passed the test, suggesting that intense learning itself can reshape the brain.

## The Teenage Brain Under Construction

Neuroplasticity is especially powerful during childhood and adolescence. During the teen years, the brain goes through a period of pruning, trimming away connections that are rarely used while strengthening those that are used often. Meanwhile, the prefrontal cortex, the region behind the forehead that helps with planning, judgment, and controlling impulses, continues developing into a person's mid-twenties.

This has a practical meaning. The activities teenagers spend time on, such as playing an instrument, reading, playing sports, or learning languages, help shape the brain they will carry into adulthood.

## Healing and Limits

Neuroplasticity also helps people recover from injuries. After a stroke damages part of the brain, therapy can help other regions take over some lost functions, such as speech or movement. Recovery is often slow and incomplete, but it shows the brain's remarkable capacity to adapt.

Scientists caution that neuroplasticity is not magic. The brain does not change overnight, and some abilities are harder to regain than others. Sleep, exercise, and good nutrition all support the brain's ability to change. But the central lesson is hopeful: abilities are not simply fixed at birth. Through effort and practice, the brain grows to meet the challenges we give it.`,
    focus: ['central-idea', 'claim-evidence', 'vocabulary'],
    vocab: [
      ['neuroplasticity', 'the brain\'s ability to change and form new connections'],
      ['synapses', 'tiny gaps where nerve cells pass signals to each other'],
      ['efficient', 'working well without wasting time or energy'],
      ['insulation', 'a covering that protects and keeps energy from escaping'],
      ['spatial', 'having to do with space, places, and position'],
      ['impulses', 'sudden urges to act without thinking'],
      ['capacity', 'the ability to do or hold something'],
    ],
    questions: [
      Q("What is the central idea of the passage?", 'main-idea', 2,
        "The brain constantly reshapes its connections in response to experience and practice.",
        "Adults cannot learn new skills after childhood.",
        "London taxi drivers are smarter than other people.",
        "Myelin is the most important part of the brain."),
      Q("Myelin works 'somewhat like insulation on an electrical wire.' In this context, insulation is—", 'vocab', 2,
        "a covering that protects a wire and helps signals travel efficiently",
        "a type of electricity",
        "a switch that turns signals off",
        "a tool for cutting wires"),
      Q("Why is the later study that followed taxi trainees important?", 'evidence', 3,
        "Following trainees over time suggested that learning caused the brain changes, rather than drivers simply being born that way.",
        "It proved that every taxi trainee passes the test.",
        "It showed that the hippocampus shrinks with practice.",
        "It found that taxi drivers sleep less than other people."),
      Q("Based on the passage, why might the teen years be an especially important time to practice skills?", 'inference', 3,
        "The brain is pruning unused connections and strengthening used ones, so habits during this time shape the adult brain.",
        "Teenagers have far more neurons than adults.",
        "The prefrontal cortex is fully developed by age thirteen.",
        "Teenagers do not need sleep to learn."),
      Q("Why does the author include the section 'Healing and Limits'?", 'craft', 3,
        "To show a real-world benefit of neuroplasticity while cautioning against exaggerating it",
        "To argue that strokes are easy to recover from",
        "To introduce a new definition of the hippocampus",
        "To persuade readers to become therapists"),
    ],
    writePrompt: "Using evidence from the passage, explain how neuroplasticity works at the level of neurons and synapses. Then describe what this science suggests about how students should approach learning difficult skills.",
  },
  {
    id: '68-31',
    band: '68',
    genre: 'biography',
    title: 'Katherine Johnson: The Mathematician Behind the Mission',
    origin: ORIG,
    text: `In February 1962, astronaut John Glenn was preparing to become the first American to orbit Earth. NASA had begun using new electronic computers to calculate the path his capsule would follow, but Glenn was uneasy about trusting his life to a machine. Before the launch, he asked that one particular mathematician check the computer's numbers by hand. If she agreed with them, he said, he was ready to go. Her name was Katherine Johnson.

## A Gift for Numbers

Katherine Coleman was born in 1918 in White Sulphur Springs, West Virginia. She loved to count: steps, dishes, stars, anything. She was so far ahead of her classmates that she started high school at age ten. But her county, like much of the American South at the time, was segregated, and the local schools for Black students did not go beyond eighth grade. Her father moved the family more than a hundred miles each school year so the children could attend high school on the campus of West Virginia State College, a historically Black college.

Katherine graduated from that college at eighteen with degrees in mathematics and French. One of her professors, W. W. Schieffelin Claytor, among the first African Americans to earn a doctorate in mathematics, encouraged her to become a research mathematician. At the time, few such jobs were open to women, and even fewer to Black women. For years, she worked as a teacher. Through marriage, she later took the last name Johnson, and she is known today as Katherine Johnson.

## The Computers of Langley

In 1953, Johnson joined the National Advisory Committee for Aeronautics, the agency that would later become NASA, at its Langley laboratory in Virginia. She was hired as a "computer," a person who performed complex calculations by hand. She worked in the West Area Computing unit, a group of Black women mathematicians who, under segregation, worked separately from their white colleagues and had to use separate dining and restroom facilities.

Johnson quickly stood out. She asked questions, insisted on attending engineering briefings that women were usually excluded from, and was soon assigned to a team studying flight. She later explained that she simply asked to go, and no one could point to a rule against it.

## Plotting the Path to Space

Johnson calculated the trajectory, or flight path, for Alan Shepard's 1961 mission, which made him the first American in space. Getting a capsule into space and safely back down required solving difficult equations involving Earth's rotation, gravity, and the capsule's speed, and the margin for error was tiny.

After John Glenn's successful orbit in 1962, Johnson continued working on America's space program. She contributed calculations for the Apollo 11 mission that landed astronauts on the Moon in 1969. Over her career, she co-wrote more than two dozen research reports, at a time when women were rarely credited as authors on such papers.

## Recognition at Last

For decades, Johnson's contributions were little known outside NASA. That began to change in her later years. In 2015, at age ninety-seven, she received the Presidential Medal of Freedom, the highest civilian honor in the United States. The 2016 book and film Hidden Figures told the story of Johnson and her colleagues to millions of people, and NASA named a research facility after her.

Katherine Johnson died in 2020 at the age of 101. She often said that she was simply doing her job. But her job helped carry human beings beyond Earth, and her persistence opened doors for those who came after her.`,
    focus: ['central-idea', 'text-structure', 'inference'],
    vocab: [
      ['segregated', 'separated by race under unfair laws or customs'],
      ['briefings', 'meetings where people receive important information'],
      ['excluded', 'kept out or not allowed to take part'],
      ['trajectory', 'the path an object follows as it moves through space or air'],
      ['margin', 'the amount of room allowed for error'],
      ['civilian', 'having to do with people who are not in the military'],
      ['persistence', 'continuing firmly despite difficulty'],
    ],
    questions: [
      Q("Why did Katherine's father move the family each school year?", 'detail', 2,
        "Local schools for Black students did not go beyond eighth grade, so the children needed to attend high school elsewhere.",
        "He took a new job at NASA.",
        "Katherine had been expelled from her school.",
        "The family wanted to live near the ocean."),
      Q("Johnson calculated the trajectory for Alan Shepard's mission. Trajectory means—", 'vocab', 2,
        "the path an object follows as it moves",
        "the speed of a rocket's engine",
        "the length of time a mission lasts",
        "the weight of a spacecraft"),
      Q("What does John Glenn's request reveal about how Johnson was viewed at NASA?", 'inference', 3,
        "Her accuracy was so trusted that an astronaut wanted her to confirm a new computer's results.",
        "She was the only person at NASA who knew how to use computers.",
        "Glenn did not trust any of NASA's engineers.",
        "She was in charge of the entire space program."),
      Q("Why does the author begin with the 1962 John Glenn story instead of Johnson's birth?", 'craft', 3,
        "To grab attention with a dramatic moment that shows Johnson's importance before telling her life story",
        "Because the author does not know when Johnson was born",
        "To argue that Glenn was more important than Johnson",
        "To explain how electronic computers work"),
      Q("Which statement best summarizes how Johnson overcame barriers?", 'main-idea', 3,
        "She combined exceptional skill with persistence, asking to be included in work that women and Black employees were often kept from.",
        "She avoided challenges by working alone.",
        "She relied on luck to be chosen for important missions.",
        "She waited quietly for others to recognize her talent."),
    ],
    writePrompt: "The author writes that Johnson 'often said that she was simply doing her job.' Using evidence from the biography, argue whether this statement is an accurate description of her achievements.",
  },
  {
    id: '68-32',
    band: '68',
    genre: 'poetry',
    title: 'Where Two Rivers Meet',
    origin: ORIG,
    text: `I.
Near Manaus, in the heart of the Amazon,
two rivers meet and do not mix.
The Rio Negro arrives dark as strong tea,
warm and slow, steeped in the leaves of a thousand forests.
The Solimões comes pale and fast,
the color of milky coffee,
heavy with sand from the Andes.

For miles they run side by side
in a single riverbed,
a seam down the middle of the water
as clean as a line drawn with a ruler.
Tourists lean over the rails of boats
and dip their hands in both at once:
one side warm, one side cool,
one side dark, one side light.

II.
My mother is from a city of mountains
where the bread is sweet and the winter is gray.
My father is from an island of salt wind,
where the music starts after midnight
and nobody ever whispers.
I am the riverbed they share.

At my mother's table, we speak softly,
pass the dishes to the left,
and finish everything on our plates.
At my father's table, everyone talks at once,
the food arrives in waves,
and no one has ever finished anything
because there is always more coming.

My mother's lullabies were slow and low,
like someone walking home in snow.
My father's were all drums and laughter,
songs you could not sleep to,
songs that made you want to stand up in your crib.

I learned two ways to say good morning,
two ways to apologize,
two ways to grieve.
When my grandmother died, my mother's family
sat in silence for days.
When my grandfather died, my father's family
sang until the windows rattled.
Both were love. I did not know
which one I was supposed to feel.

III.
For years I thought I had to choose.
At school, they asked me where I was from,
and I watched their faces
when I gave two answers,
as if I had told them the sky was two colors.
I tried being only one thing.
I tried being the other.
Both felt like wearing someone else's shoes.

IV.
Here is what I learned about the rivers.
They are different because of where they began:
temperature, speed, what they carry.
That is why they do not blend at first.
But they are not fighting.
They are traveling together,
learning each other slowly,
mile by mile, until somewhere downstream
the seam softens, curls, swirls,
and the water becomes one river,
the greatest river in the world,
which does not forget either source.
It carries the dark and the gold together
all the way to the sea.

V.
I am still near Manaus, I think,
still at the place where the line is sharp
and people stare.
But I can feel the current pulling
toward somewhere downstream,
toward a wider water
where I will not have to explain
why I am warm on one side
and cool on the other.

Until then, I carry both.
Two ways to say good morning.
Two ways to sing.
One riverbed,
deep enough for all of it.`,
    focus: ['figurative-language', 'theme', 'compare'],
    vocab: [
      ['steeped', 'soaked in a liquid so it takes on flavor or color'],
      ['seam', 'a line where two things are joined'],
      ['grieve', 'to feel deep sadness, especially after a death'],
      ['rattled', 'shook with quick, sharp noises'],
      ['blend', 'to mix together completely'],
      ['source', 'the place where something begins'],
      ['current', 'the steady flow of water in one direction'],
    ],
    questions: [
      Q("According to the poem, why don't the two rivers mix at first?", 'detail', 2,
        "They differ in temperature, speed, and what they carry.",
        "A stone wall separates them.",
        "One river flows uphill.",
        "They are fighting each other."),
      Q("In section I, the 'seam down the middle of the water' is—", 'vocab', 2,
        "the visible line where the two rivers meet",
        "a crack in the riverbed",
        "a fishing net",
        "a bridge across the river"),
      Q("What does the speaker's comparison between the rivers and their own life suggest?", 'compare', 3,
        "Like the rivers, the speaker carries two distinct heritages that do not have to compete and can gradually come together.",
        "The speaker wants to move to the Amazon.",
        "The speaker's parents argue constantly.",
        "The speaker secretly prefers one parent's culture."),
      Q("What does the line 'Both felt like wearing someone else's shoes' reveal?", 'inference', 3,
        "Trying to be only one part of their identity felt unnatural and uncomfortable.",
        "The speaker's family could not afford new shoes.",
        "The speaker borrowed clothes from classmates.",
        "The speaker disliked both parents."),
      Q("How does the poem's structure in numbered sections support its meaning?", 'craft', 3,
        "It moves like a journey downstream, from a sharp divide toward a hope of unity.",
        "It lists events in the speaker's life in reverse order.",
        "It gives each section to a different speaker.",
        "It separates facts about rivers from unrelated personal stories."),
    ],
    writePrompt: "Analyze how the poet develops the extended metaphor of the two rivers. How does the image change from the beginning of the poem to the end, and what does that change reveal about the speaker's understanding of identity?",
  },
  {
    id: '68-33',
    band: '68',
    genre: 'fiction',
    title: 'The Librarian of Kepler Station',
    origin: ORIG,
    text: `The vote was scheduled for 0900, and by 0830 Imani Achterberg had read the same page of her speech eleven times without absorbing a word.

Kepler Station had circled at the edge of the outer belt for sixty-three years, a ring of steel and glass housing four hundred people who mined ice and minerals from passing asteroids. Most of the station's systems were old but reliable. The data core was not. Three weeks ago, a cascade failure had destroyed nearly a third of its storage. The engineers had stabilized it, but there was no longer enough room for everything.

Something had to be deleted. And the council had proposed deleting the Archive.

The Archive was Imani's whole world. It held eleven million books, two hundred thousand films, centuries of music, and the paintings of Earth's great museums, scanned before the station launched. Imani had been the librarian's apprentice since she was nine. When old Mr. Osei died last winter, she had become, at fourteen, the only person on Kepler who knew how the Archive's catalog actually worked.

In the council chamber, Chief Engineer Delacroix laid out the problem in her clipped, careful way. "We need every remaining byte for navigation models, medical databases, and repair schematics," she said. "Those keep us alive. The Archive is beautiful, but it is not essential. I'm sorry."

Heads nodded around the room. It was hard to argue with survival.

Imani stood. Her hands were shaking, so she set her speech down and didn't look at it.

"Chief Delacroix is right that we need the technical files," she began. "I'm not asking anyone to delete those. But I want to tell you about some things I've seen in the Archive's records."

She took a breath. "Last year, the medical bay used the Archive to find an old paper on treating radiation burns. It wasn't in the medical database. It was in a history book. When the water recycler failed four years ago, the fix came from an old manual for submarines, filed under 'Literature of the Sea.' And every night, the Archive logs show more than two hundred people on this station opening something: a song, a story, a picture of a place they'll never see. We don't keep the Archive because it's decoration. We keep it because we don't know yet what we'll need from it."

Delacroix folded her arms. "I understand. But the storage still doesn't exist. Feelings don't make room."

"No," Imani said. "But people do."

She tapped her tablet, and a diagram appeared on the chamber screen. "Every person on this station owns a personal device. Most of them use less than a fifth of their memory. If we divide the Archive into four hundred pieces and give each person one, with every piece copied to at least three people, the whole collection survives. The core keeps only a catalog, a map of who holds what. If anyone needs a book, the system asks the right devices for it."

The room was silent.

"It would make every one of us a librarian," Imani said. "Mr. Osei used to say a library isn't a building. It's a promise between people that they'll keep things for each other."

Delacroix studied the diagram for a long time. Then she pulled up her own tablet and began checking the numbers. The council watched her.

"The math works," she said at last, almost reluctantly. "The redundancy is acceptable. It will take a month to distribute."

"Then we have a month," Imani said.

The vote passed, nine to two.

That night, Imani sent each resident their share of the Archive. Most people got a random selection. But she chose one piece on purpose: Chief Delacroix received the poetry of Earth's oceans, along with the submarine manuals.

The next morning, a message was waiting in Imani's inbox. It said only: Started reading. Thank you, Librarian.`,
    focus: ['argument', 'character', 'theme'],
    vocab: [
      ['cascade', 'a series of events in which each one causes the next'],
      ['stabilized', 'made steady so it would not get worse'],
      ['apprentice', 'a person learning a skill by working with an expert'],
      ['schematics', 'detailed diagrams showing how something is built'],
      ['essential', 'absolutely necessary'],
      ['reluctantly', 'in an unwilling or hesitant way'],
      ['redundancy', 'extra copies kept so nothing is lost if one fails'],
    ],
    questions: [
      Q("Why does the council propose deleting the Archive?", 'detail', 2,
        "A failure destroyed much of the data core's storage, and the council considers technical files more essential.",
        "No one on the station reads books anymore.",
        "The Archive contains dangerous information.",
        "Imani asked for the Archive to be deleted."),
      Q("When Delacroix says 'the redundancy is acceptable,' redundancy refers to—", 'vocab', 2,
        "keeping extra copies so nothing is lost if one copy fails",
        "the station's water recycling system",
        "the number of council votes",
        "unnecessary words in a speech"),
      Q("Which evidence does Imani use to challenge the claim that the Archive is not essential?", 'evidence', 3,
        "Past emergencies were solved with information found in a history book and a literature section.",
        "The Archive is the oldest part of the station.",
        "Mr. Osei wanted the Archive saved.",
        "The Archive takes up very little storage."),
      Q("What does Delacroix's choice to check the numbers herself reveal about her?", 'inference', 3,
        "She is practical and fair-minded, willing to change her position when the evidence supports it.",
        "She distrusts Imani and hopes to prove her wrong.",
        "She secretly wanted the Archive deleted for personal reasons.",
        "She does not understand mathematics."),
      Q("Which line best expresses the story's theme?", 'theme', 3,
        "a library isn't a building. It's a promise between people that they'll keep things for each other.",
        "The vote passed, nine to two.",
        "Feelings don't make room.",
        "It will take a month to distribute."),
    ],
    writePrompt: "Imani persuades a skeptical council. Analyze the techniques she uses in her speech, including evidence, appeals, and her proposed solution, and explain why the final detail about Delacroix's share of the Archive is meaningful.",
  },
  {
    id: '68-34',
    band: '68',
    genre: 'informational',
    title: 'Roads in the Sky: Inca Engineering',
    origin: ORIG,
    text: `## An Empire on a Mountain Spine

In the 1400s and early 1500s, the largest empire in the Americas stretched along the Andes Mountains of South America, from what is now southern Colombia through Ecuador, Peru, and Bolivia into Chile and Argentina. Its people called it Tawantinsuyu, meaning "the four parts together." Today we usually call it the Inca Empire. At its height, it governed perhaps ten million people across deserts, rainforests, and some of the highest mountains on Earth. Holding such a land together was an extraordinary engineering challenge.

## The Great Road

The Inca answer was a road network known in the Quechua language as Qhapaq Ñan. Built partly on older roads from earlier Andean cultures and greatly expanded by the Inca, it stretched an estimated 30,000 kilometers or more. Some sections were wide, paved highways; others were narrow paths cut into cliffs or staircases carved from stone. Engineers built drainage channels to carry away rainwater and retaining walls to keep mountain roads from washing away. Parts of the network are still walked today, and in 2014 it was named a UNESCO World Heritage Site.

Because the Inca did not use wheeled vehicles or horses, the roads were designed for people on foot and for llamas, which carried loads of goods. Along the routes stood many tambos, waystations stocked with food, cloth, and weapons, where travelers and soldiers could rest.

## Messages on the Run

Information moved along the roads through a relay system of runners called chasquis. Each runner covered a short stretch at top speed, then passed the message to the next runner waiting at a station. Working in relays, chasquis could carry messages hundreds of kilometers in a few days, a speed that impressed later Spanish observers.

## Bridges of Grass

Deep river gorges cut through the Andes, and the Inca crossed them with suspension bridges woven from grass. Communities twisted thousands of strands of grass into cords, then braided the cords into thick cables anchored to stone platforms on either side. Because grass rots, the bridges had to be rebuilt regularly. One bridge, the Q'eswachaka in Peru, is still rebuilt each year by local Quechua communities using traditional methods, in a ceremony that lasts several days.

## Records in Knots

The Inca managed a vast empire without a written script in the way Europeans understood writing. Instead, officials used khipus, collections of colored cotton cords with knots tied in them. The type and position of knots recorded numbers using a base-ten system, tracking information such as population counts, harvests, and tribute owed to the state. Some scholars believe khipus may also have recorded stories or historical information, but this remains an open question, and researchers are still working to understand them.

## Farming the Mountains

To feed so many people in steep terrain, Andean farmers built terraces, flat steps of land cut into hillsides and held up by stone walls. Terraces reduced erosion, captured water, and created small differences in temperature that let farmers grow different crops at different heights. Andean peoples also made chuño, potatoes freeze-dried by cold mountain nights and sunny days, which could be stored for years.

## A Living Legacy

The empire fell to Spanish invaders beginning in 1532, after it had been weakened by a civil war and by diseases brought from Europe. But the Andean world did not disappear. Millions of people still speak Quechua today, and many Inca roads, terraces, and techniques remain in use, carrying their engineers' knowledge into the present.`,
    focus: ['central-idea', 'text-structure', 'summarize'],
    vocab: [
      ['retaining', 'holding something in place'],
      ['waystations', 'stopping places along a route where travelers rest'],
      ['relay', 'a system in which a task is passed from one person to the next'],
      ['gorges', 'deep, narrow valleys with steep sides'],
      ['tribute', 'payment of goods or labor owed to a ruler or state'],
      ['terrain', 'the physical features of an area of land'],
      ['erosion', 'the wearing away of soil or rock by water or wind'],
    ],
    questions: [
      Q("What is the central idea of the passage?", 'main-idea', 2,
        "The Inca used remarkable engineering and organization to hold together a vast mountain empire.",
        "The Inca Empire fell because its roads were poorly built.",
        "Machu Picchu was the capital of the Inca Empire.",
        "The Inca were the first people in the Americas to use the wheel."),
      Q("Why were Inca roads designed for walkers and llamas?", 'detail', 2,
        "The Inca did not use wheeled vehicles or horses.",
        "The government banned carts on mountain roads.",
        "Llamas refused to walk on paved roads.",
        "The roads were too short for vehicles."),
      Q("In the section 'Farming the Mountains,' terraces reduced erosion. Erosion is—", 'vocab', 3,
        "the wearing away of soil by water or wind",
        "the growth of new crops",
        "a method of freezing potatoes",
        "a type of stone wall"),
      Q("Why does the author describe the yearly rebuilding of the Q'eswachaka bridge?", 'inference', 3,
        "To show that Inca engineering knowledge continues in living communities today",
        "To argue that grass bridges are safer than steel ones",
        "To explain why the Inca Empire fell",
        "To describe how khipus were made"),
      Q("How does the author treat the question of whether khipus recorded stories?", 'craft', 3,
        "The author presents it as an open question that scholars are still studying.",
        "The author states that khipus definitely recorded poems.",
        "The author dismisses the idea as false.",
        "The author avoids the topic entirely."),
    ],
    writePrompt: "The author calls holding the Inca Empire together 'an extraordinary engineering challenge.' Choose two Inca solutions from the passage and explain how each one solved a specific problem created by the Andean environment.",
  },
  {
    id: '68-35',
    band: '68',
    genre: 'opinion',
    title: 'Twenty Hours That Matter: Requiring Community Service',
    origin: ORIG,
    text: `Every community has needs that no single program can meet: food banks that run short of hands, parks littered with trash, elderly neighbors who would welcome a visitor, younger children who need a reading buddy. At the same time, students spend years learning about citizenship from textbooks. Schools should connect these two facts by requiring a modest amount of community service, around twenty hours spread across middle school, before students move on to high school.

## Learning by Doing

The first reason is that service turns lessons into experience. Students can read about hunger in a social studies chapter, but sorting cans at a food pantry and seeing the line of families outside teaches something a chapter cannot. Many schools pair service with reflection, asking students to write or talk about what they observed and why the need exists. This approach, often called service learning, connects classroom subjects to real problems.

## Building Skills and Confidence

Second, service develops skills that matter in school, work, and life. Volunteers learn to communicate with adults, show up on time, work in teams, and solve unexpected problems. For a shy student, introducing herself to a new group or leading a younger child through a book can build confidence that carries back into the classroom. Some students also discover interests, such as medicine, teaching, or environmental science, that shape their later choices.

## Strengthening Communities

Third, a requirement multiplies the good that students can do. If five thousand eighth graders in a large district each complete twenty hours, that is one hundred thousand hours of help for local organizations. Research on volunteering suggests that young people who volunteer are more likely to stay involved in their communities as adults. A requirement can be the first step toward a lifelong habit.

Requirements like this are not new. The state of Maryland, for example, has required public high school students to complete service learning hours to graduate since the 1990s, and many school districts across the country have similar policies.

## Considering the Objections

Critics make important points. Some argue that "required volunteering" is a contradiction: if service is forced, it is no longer truly voluntary, and students may simply go through the motions to check a box. Others worry about fairness. Students who care for younger siblings, live far from organizations, or lack transportation may struggle to complete hours outside school. Teachers and counselors may also face extra paperwork tracking hours.

These concerns are serious, and a good policy must address them. The requirement should be small and flexible, and schools can offer service opportunities during the school day or at school itself, such as tutoring younger students, organizing a recycling program, or making cards for a hospital, so that no one is shut out by transportation or family duties. Helping care for a family member could even count. As for the worry about checking a box, reflection assignments push students to think about what they did, and many students who start out reluctant end up caring more than they expected. We require students to take math and science because we believe these subjects matter, even when students would not choose them on their own. Citizenship deserves the same respect.

## A Habit Worth Starting

A community service requirement asks for a small amount of time and offers a large return: stronger students, stronger communities, and young people who know from experience that they can make a difference. That is a lesson worth twenty hours.`,
    focus: ['argument', 'claim-evidence', 'author-purpose'],
    vocab: [
      ['modest', 'small or limited in amount'],
      ['reflection', 'careful thinking about an experience and what it means'],
      ['multiplies', 'increases greatly in number or amount'],
      ['contradiction', 'an idea made of two parts that oppose each other'],
      ['voluntary', 'done by choice, not because it is required'],
      ['flexible', 'able to change to fit different needs'],
      ['reluctant', 'unwilling or hesitant'],
    ],
    questions: [
      Q("What is the author's claim?", 'main-idea', 2,
        "Schools should require a modest amount of community service before students move on to high school.",
        "Community service should replace social studies classes.",
        "Students should volunteer only if they choose to.",
        "Every student should work at a food bank."),
      Q("Critics call 'required volunteering' a contradiction. A contradiction is—", 'vocab', 2,
        "an idea made of two parts that oppose each other",
        "an agreement between two groups",
        "a long list of rules",
        "a proven fact"),
      Q("Which detail best supports the idea that a requirement can greatly benefit communities?", 'evidence', 3,
        "If five thousand eighth graders each complete twenty hours, that is one hundred thousand hours of help.",
        "For a shy student, introducing herself can build confidence.",
        "Teachers may face extra paperwork.",
        "Students read about hunger in a social studies chapter."),
      Q("How does the author respond to the concern about students without transportation?", 'craft', 3,
        "By proposing service opportunities during the school day or at school itself",
        "By saying those students should be excused from moving on to high school",
        "By claiming transportation is never a real problem",
        "By suggesting parents should drive every student"),
      Q("Why does the author compare community service to math and science requirements?", 'craft', 3,
        "To argue that schools already require valuable things students might not choose, so citizenship can be treated the same way",
        "To show that math and science matter less than service",
        "To suggest that service should be graded like a test",
        "To explain how to calculate service hours"),
    ],
    writePrompt: "Identify the strongest objection the author presents. Evaluate whether the author's response to it is convincing, and explain what additional evidence or reasoning would make the argument stronger.",
  },
  {
    id: '68-36',
    band: '68',
    genre: 'informational',
    title: 'Why Bridges Stand',
    origin: ORIG,
    text: `## Two Invisible Forces

Every bridge, from a log across a creek to a highway spanning a bay, fights the same battle: gravity is trying to pull it down. The weight of the bridge itself, called the dead load, and the weight of the people, vehicles, and wind it must handle, called the live load, push and pull on every part of the structure. Engineers describe these pushes and pulls with two key words. Compression is a squeezing force that pushes material together. Tension is a stretching force that pulls material apart. A good bridge design channels these forces safely to the ground.

Different materials handle these forces differently. Stone and concrete are strong under compression but crack easily under tension. Steel cables are excellent at resisting tension. Much of bridge engineering is the art of putting each material where it works best.

## The Beam

The simplest bridge is a beam: a rigid, horizontal piece resting on supports at each end. When weight presses down on the middle, the top of the beam is squeezed in compression while the bottom is stretched in tension. That is why long beams sag and why beam bridges work best for short spans. Engineers often add supports, called piers, to break a long crossing into shorter sections.

## The Arch

The arch solves the beam's problem by turning downward weight into compression. Push down on the top of an arch, and the force travels along its curve and out to the ends, which are braced against the ground. Because the arch stays almost entirely in compression, it can be built from stone. The ancient Romans used arches to build bridges and aqueducts, and some, like the Pont du Gard in southern France, have stood for nearly two thousand years.

## The Truss

A truss is a framework of straight pieces connected in triangles. Triangles are rigid: unlike a square, a triangle cannot be pushed out of shape without changing the length of one of its sides. In a truss bridge, some pieces carry compression and others carry tension, spreading loads across the whole structure. Trusses made it possible to build strong railway bridges in the 1800s using relatively little material.

## The Suspension Bridge

For the longest spans, engineers turn to suspension bridges. Two tall towers support huge main cables draped between them and anchored firmly at each end. Vertical cables called suspenders hang from the main cables and hold up the deck. The cables work in tension, and the towers carry the load down to the ground in compression. San Francisco's Golden Gate Bridge, opened in 1937, has a main span of about 1,280 meters. In 2022, Turkey's Çanakkale 1915 Bridge opened with a main span of more than two kilometers, the longest in the world.

## Learning From Failure

Bridges must handle not just weight but movement. In 1940, the newly opened Tacoma Narrows Bridge in Washington State began twisting violently in a steady wind and collapsed into the water about four months after it opened. No people died, though a dog trapped in a car was lost. Engineers learned that a deck's shape can catch the wind, and that wind can feed energy into twisting motions until a structure fails. Since then, bridge designs have been tested with models in wind tunnels.

Even modern designs can surprise their builders. When London's Millennium Footbridge opened in 2000, crowds of walkers caused it to sway sideways, and it closed after two days. Engineers added devices called dampers to absorb the motion, and it reopened in 2002.

Each failure taught engineers something new. Behind every bridge we cross without a second thought are centuries of experiments, mistakes, and careful calculations, all aimed at one goal: sending the forces safely home to the earth.`,
    focus: ['text-structure', 'central-idea', 'vocabulary'],
    vocab: [
      ['compression', 'a squeezing force that pushes material together'],
      ['tension', 'a stretching force that pulls material apart'],
      ['rigid', 'stiff and not able to bend easily'],
      ['piers', 'strong posts or columns that hold up a bridge'],
      ['braced', 'supported firmly to resist pressure'],
      ['aqueducts', 'bridge-like channels built to carry water long distances'],
      ['dampers', 'devices that absorb shaking or swaying motion'],
    ],
    questions: [
      Q("What is the central idea of the passage?", 'main-idea', 2,
        "Bridge designs succeed by managing compression and tension, and engineers improve designs by learning from failures.",
        "Suspension bridges are the only safe kind of bridge.",
        "The Romans invented every modern bridge design.",
        "Wind is the only force that bridges must resist."),
      Q("As used in the passage, compression is—", 'vocab', 2,
        "a squeezing force that pushes material together",
        "a stretching force that pulls material apart",
        "the weight of vehicles on a bridge",
        "the twisting of a bridge in the wind"),
      Q("Based on the passage, why could the Romans build long-lasting bridges from stone?", 'inference', 3,
        "Arches keep the structure almost entirely in compression, which stone handles well.",
        "Stone is especially strong under tension.",
        "Roman bridges had steel cables hidden inside.",
        "Roman bridges never carried heavy loads."),
      Q("How is most of the passage organized?", 'craft', 3,
        "It introduces key forces, explains how each bridge type manages them, and ends with lessons from failures.",
        "It tells the life story of a famous engineer.",
        "It ranks bridges in different countries by height.",
        "It argues that beam bridges should be replaced."),
      Q("Which detail best supports the idea that engineers learn from failures?", 'evidence', 3,
        "Since then, bridge designs have been tested with models in wind tunnels.",
        "The Golden Gate Bridge has a main span of about 1,280 meters.",
        "Triangles are rigid.",
        "Stone and concrete are strong under compression."),
    ],
    writePrompt: "Choose two bridge types from the passage. Explain how each one handles compression and tension, and then use evidence to argue which design would be best for crossing a wide, windy bay.",
  },
];
