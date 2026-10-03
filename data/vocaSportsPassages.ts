/**
 * Voca — sports-history read-alouds, Pre-K → Grade 12.
 * Original Plajah writing; every fact is well-documented sports history (where details are contested
 * or numbers uncertain, the text is simplified rather than guessed). Same policy as vocaPassages.ts.
 */
import type { VocaPassage } from './vocaPassages';

const P = (p: VocaPassage) => p;
const SRC = 'Original (Plajah); historical facts';

export const VOCA_SPORTS_PASSAGES: VocaPassage[] = [
  // ───────── Level 1
  P({ id: 'sport-L1-a', level: 1, title: 'A Ball and a Goal', kind: 'story', source: SRC,
    text: 'I have a ball. I kick the ball. It goes in the net! That is a goal. People all over the world play this game.',
    question: { prompt: 'What do I do with the ball?', choices: ['Kick it', 'Eat it', 'Sleep on it'], answer: 0 } }),
  P({ id: 'sport-L1-b', level: 1, title: 'A Race in Greece', kind: 'story', source: SRC,
    text: 'Long ago, men ran in a race in Greece. Run, run, run! The man who ran best won a crown. The crown was made of leaves.',
    question: { prompt: 'What was the crown made of?', choices: ['Gold', 'Paper', 'Leaves'], answer: 2 } }),

  // ───────── Level 2
  P({ id: 'sport-L2-a', level: 2, title: 'The Peach Basket', kind: 'story', source: SRC,
    text: 'A man named James Naismith put a peach basket up on a wall. Kids tossed a ball in the basket. It was fun! That game is now called basketball.',
    question: { prompt: 'What did he put on the wall?', choices: ['A big drum', 'A peach basket', 'A red bus'], answer: 1 } }),
  P({ id: 'sport-L2-b', level: 2, title: 'Tennis on the Grass', kind: 'story', source: SRC,
    text: 'Tennis is a game with a net, a ball, and a racket. Long ago, in 1877, men played at Wimbledon, near London. They played on the grass. The first winner was a man from England.',
    question: { prompt: 'Where did they play?', choices: ['On the grass', 'On the ice', 'In a pool'], answer: 0 } }),

  // ───────── Level 3
  P({ id: 'sport-L3-a', level: 3, title: 'A Boy Named Pelé', kind: 'story', source: SRC,
    text: 'Pelé grew up in Brazil. He loved soccer, and he played all the time. In 1958, when he was just seventeen, he went to the World Cup in Sweden. He scored goals, and Brazil won the cup! Pelé cried happy tears.',
    question: { prompt: 'How old was Pelé at the 1958 World Cup?', choices: ['Ten', 'Seventeen', 'Fifty'], answer: 1 } }),
  P({ id: 'sport-L3-b', level: 3, title: 'The Four-Minute Mile', kind: 'informational', source: SRC,
    text: 'Roger Bannister was a fast runner from England. In 1954, he ran one mile in less than four minutes. Before that day, many people thought no one could run that fast. Bannister showed that it could be done. Soon, other runners did it too.',
    question: { prompt: 'What did many people think before 1954?', choices: ['That a mile was too short', 'That no one could run that fast', 'That runners got too tired'], answer: 1 } }),

  // ───────── Level 4
  P({ id: 'sport-L4-a', level: 4, title: 'Wilma Runs', kind: 'story', source: SRC,
    text: 'Wilma Rudolph was sick when she was a little girl, and she wore a brace on her leg. She did not give up. She worked hard and learned to run very fast. In 1960, she ran at the Olympic Games in Rome, Italy. She won three gold medals, and people cheered her name.',
    question: { prompt: 'How many gold medals did Wilma win in Rome?', choices: ['One', 'Ten', 'Three'], answer: 2 } }),
  P({ id: 'sport-L4-b', level: 4, title: 'Jackie Plays Ball', kind: 'story', source: SRC,
    text: 'In 1947, a man named Jackie Robinson ran onto a baseball field in Brooklyn. He played for the Dodgers. He was the first Black player in the major leagues in modern times. Some fans were unkind to him, but Jackie stayed calm and played very well. He helped change the game of baseball for everyone.',
    question: { prompt: 'Which team did Jackie Robinson play for?', choices: ['The Giants', 'The Dodgers', 'The Eagles'], answer: 1 } }),

  // ───────── Level 5
  P({ id: 'sport-L5-a', level: 5, title: 'Baskets in the Gym', kind: 'informational', source: SRC,
    text: 'In the winter of 1891, a teacher named James Naismith needed a game that his students could play inside a gym in Springfield, Massachusetts. He nailed two peach baskets high on a wall and wrote thirteen rules. Players passed a soccer ball and tried to toss it into the baskets. After every goal, someone had to climb up and take the ball out! Later, people used nets with open bottoms instead. Today, basketball is played around the world.',
    question: { prompt: 'Why did Naismith invent the game?', choices: ['He wanted to sell peach baskets', 'His students needed a game to play inside', 'He ran out of soccer balls'], answer: 1 },
    syllables: { naismith: ['nay', 'smith'], massachusetts: ['mass', 'a', 'chu', 'setts'] } }),
  P({ id: 'sport-L5-b', level: 5, title: 'The Games Return to Athens', kind: 'informational', source: SRC,
    text: 'In 1896, the first modern Olympic Games took place in Athens, Greece. The ancient Greeks had held games long ago, and a Frenchman named Pierre de Coubertin wanted to bring them back. Athletes ran, jumped, swam, and wrestled. The marathon was the last big race, and a Greek runner named Spyridon Louis won it. The crowd cheered, and the whole country celebrated.',
    question: { prompt: 'Who won the first modern marathon?', choices: ['Pierre de Coubertin', 'A swimmer from Italy', 'Spyridon Louis'], answer: 2 },
    syllables: { coubertin: ['cou', 'ber', 'tin'], spyridon: ['spy', 'ri', 'don'], marathon: ['mar', 'a', 'thon'] } }),

  // ───────── Level 6
  P({ id: 'sport-L6-a', level: 6, title: 'One Set of Rules', kind: 'informational', source: SRC,
    text: 'In the early 1800s, schools in England played football, but each school had its own rules. That made games between schools confusing, because the two teams could not agree on how to play. In 1863, clubs met in London and formed the Football Association. They agreed on one set of rules for everyone. One big rule was that players could not carry the ball in their hands. Their rules became the base for modern soccer.',
    question: { prompt: 'Why were games between schools confusing?', choices: ['Each school had its own rules', 'The balls were too small', 'There were no fields'], answer: 0 },
    syllables: { association: ['as', 'so', 'ci', 'a', 'tion'], confusing: ['con', 'fus', 'ing'] } }),
  P({ id: 'sport-L6-b', level: 6, title: 'A Race to Sell Newspapers', kind: 'informational', source: SRC,
    text: 'In 1903, a French newspaper wanted to sell more copies, so it started a bicycle race around the whole country. It was called the Tour de France. The first race lasted more than two weeks, and the riders pedaled for hours each day over long, dusty roads. A rider named Maurice Garin won it. People bought the newspaper to read about the race, and the plan worked. Today, the Tour de France is one of the most famous bike races in the world.',
    question: { prompt: 'Why did the newspaper start the race?', choices: ['To teach people to ride', 'To sell more newspapers', 'To fix the roads'], answer: 1 },
    syllables: { newspaper: ['news', 'pa', 'per'], garin: ['ga', 'rin'] } }),

  // ───────── Level 7
  P({ id: 'sport-L7-a', level: 7, title: 'The Perfect Ten', kind: 'informational', source: SRC,
    text: 'In 1976, at the Olympic Games in Montreal, a fourteen-year-old gymnast from Romania named Nadia Comaneci stepped up to the uneven bars. When she finished, the judges gave her a perfect score of 10. No gymnast had ever earned that score at the Olympics before. The scoreboard was not built to show a 10, so it flashed 1.00 instead, and the crowd had to understand what it meant. Nadia went on to earn more perfect scores at those Games and won three gold medals.',
    question: { prompt: 'Why did the scoreboard show 1.00?', choices: ['It was not built to show a score of 10', 'Nadia had fallen from the bars', 'The judges were confused about the rules'], answer: 0 },
    syllables: { comaneci: ['co', 'ma', 'nech'], montreal: ['mon', 'tre', 'al'], gymnast: ['gym', 'nast'], romania: ['ro', 'ma', 'ni', 'a'] } }),
  P({ id: 'sport-L7-b', level: 7, title: 'The First Super Bowl', kind: 'informational', source: SRC,
    text: 'For years, two professional football leagues in the United States, the NFL and the AFL, competed for fans and players. In 1966, they agreed to join together, and their two champions would meet in one big game. That game took place on January 15, 1967, in Los Angeles. The Green Bay Packers, coached by Vince Lombardi, played the Kansas City Chiefs and won 35 to 10. At first, the game had a long official name, but people soon began calling it the Super Bowl. Today, the winning team receives the Vince Lombardi Trophy.',
    question: { prompt: 'What did the two leagues agree to do in 1966?', choices: ['Join together', 'Stop playing games', 'Move to Canada'], answer: 0 },
    syllables: { lombardi: ['lom', 'bar', 'di'], professional: ['pro', 'fes', 'sion', 'al'], champions: ['cham', 'pi', 'ons'] } }),

  // ───────── Level 8
  P({ id: 'sport-L8-a', level: 8, title: 'Games at Stoke Mandeville', kind: 'informational', source: SRC,
    text: 'In 1948, a doctor named Ludwig Guttmann, who had come to England as a refugee from Germany in 1939, organized an archery contest at Stoke Mandeville Hospital in England. The archers were patients who used wheelchairs, and many of them were former soldiers with spinal injuries. The contest began on the same day that the London Olympic Games opened. Guttmann believed that sport could help people rebuild their strength and their confidence. Over the years, the competition grew and welcomed athletes from other countries. In 1960, the first Paralympic Games were held in Rome, and today the Paralympics are one of the biggest events in sport.',
    question: { prompt: 'What did Guttmann believe sport could help people do?', choices: ['Win more medals', 'Rebuild strength and confidence', 'Travel to Rome'], answer: 1 },
    syllables: { guttmann: ['gutt', 'mann'], mandeville: ['man', 'de', 'ville'], paralympic: ['par', 'a', 'lym', 'pic'], archery: ['arch', 'er', 'y'] } }),
  P({ id: 'sport-L8-b', level: 8, title: 'The Hat-Trick at Wembley', kind: 'informational', source: SRC,
    text: 'On July 30, 1966, England met West Germany in the World Cup final at Wembley Stadium in London. The score was tied 2 to 2 at the end of normal time, so the teams played extra time. England\'s Geoff Hurst scored two more goals, and England won 4 to 2. Altogether, Hurst scored three goals in that final, which soccer fans call a hat-trick. Millions of people watched on television, and England\'s captain, Bobby Moore, lifted the trophy as the crowd roared. It remains one of the most famous matches in soccer history, and fans still talk about it today.',
    question: { prompt: 'How many goals did Geoff Hurst score in the final?', choices: ['One', 'Two', 'Three'], answer: 2 },
    syllables: { wembley: ['wem', 'bley'], hurst: ['hurst'], captain: ['cap', 'tain'] } }),

  // ───────── Level 9
  P({ id: 'sport-L9-a', level: 9, title: 'Four Golds in Berlin', kind: 'informational', source: SRC,
    text: 'At the 1936 Olympic Games in Berlin, the host government hoped to use the Games to show off its belief that some races were better than others. A young American sprinter and long jumper named Jesse Owens proved how false that belief was. Owens, a Black student from Ohio State University, won four gold medals: in the 100 meters, the 200 meters, the long jump, and the 4x100-meter relay. The German long jumper Luz Long, who won the silver medal, congratulated him warmly in front of the crowd. Yet when Owens returned home, he still faced segregation, and he was not invited to the White House to be honored. His victories are remembered as a triumph of talent over prejudice.',
    question: { prompt: 'How many gold medals did Jesse Owens win in 1936?', choices: ['Two', 'Four', 'Six'], answer: 1 },
    syllables: { owens: ['o', 'wens'], berlin: ['ber', 'lin'], segregation: ['seg', 're', 'ga', 'tion'], prejudice: ['prej', 'u', 'dice'], triumph: ['tri', 'umph'] } }),
  P({ id: 'sport-L9-b', level: 9, title: 'The Silence at the Maracanã', kind: 'informational', source: SRC,
    text: 'In 1950, Brazil hosted the World Cup and built an enormous stadium for it, the Maracanã in Rio de Janeiro. That year, the tournament ended with a final round of four teams rather than a single final match. On July 16, Brazil needed only a draw against Uruguay to win the title, and more than 150,000 people packed the stadium to watch. Brazil scored first, but Uruguay equalized and then scored again late in the second half to win 2 to 1. The crowd fell into a stunned silence. The shock was so great that Brazilians still talk about that afternoon, which they call the "Maracanazo."',
    question: { prompt: 'What result did Brazil need against Uruguay?', choices: ['A win by five goals', 'Only a draw', 'A game with no goals at all'], answer: 1 },
    syllables: { maracanã: ['ma', 'ra', 'ca', 'nã'], uruguay: ['u', 'ru', 'guay'], enormous: ['e', 'nor', 'mous'], equalized: ['e', 'qual', 'ized'], maracanazo: ['ma', 'ra', 'ca', 'na', 'zo'] } }),

  // ───────── Level 10
  P({ id: 'sport-L10-a', level: 10, title: 'Title IX and the Women\'s Game', kind: 'informational', source: SRC,
    text: 'Until the 1970s, many American girls had few chances to play organized school sports. Teams for girls were scarce, and athletic scholarships for women were almost unheard of. That began to change on June 23, 1972, when President Richard Nixon signed Title IX of the Education Amendments. The law said that no one could be excluded from, or denied the benefits of, any education program that received federal money because of gender. The word "sports" does not appear in its central sentence, but schools soon recognized that the law applied to athletics as well. Over the following decades, schools were pressed to add teams, coaches, and facilities for girls and women. In 1971, roughly 300,000 girls played high school sports in the United States; today, more than three million do. Many of the women who have since won Olympic medals and World Cup titles for the United States grew up in a country where that opportunity existed because of one short, carefully worded law.',
    question: { prompt: 'What did Title IX require of schools that received federal money?', choices: ['That they end discrimination by gender in their programs', 'That they build new stadiums', 'That they hire more coaches for boys'], answer: 0 },
    syllables: { amendments: ['a', 'mend', 'ments'], scholarships: ['schol', 'ar', 'ships'], discrimination: ['dis', 'crim', 'i', 'na', 'tion'], athletics: ['ath', 'let', 'ics'], facilities: ['fa', 'cil', 'i', 'ties'], excluded: ['ex', 'clud', 'ed'] } }),
  P({ id: 'sport-L10-b', level: 10, title: 'The First World Cup, 1930', kind: 'informational', source: SRC,
    text: 'In 1930, FIFA, the world governing body of soccer, held the first World Cup in Uruguay. FIFA\'s president, a Frenchman named Jules Rimet, had long dreamed of such a tournament. Uruguay was chosen partly because its team had won the Olympic soccer tournaments of 1924 and 1928, and partly because the country was celebrating one hundred years since its first constitution. Only thirteen teams entered, and travel was a serious obstacle: the four European teams that came had to make a long ocean voyage to South America, which took about two weeks by ship. The matches were played in the capital, Montevideo, including at a brand-new arena called the Estadio Centenario, named for that centennial. On July 30, Uruguay defeated its neighbor Argentina 4 to 2 in the final and became the first world champion. Since that afternoon, the tournament has grown from a small gathering of thirteen teams into one of the largest sporting events on Earth.',
    question: { prompt: 'What was a major obstacle for the teams from Europe?', choices: ['The long ocean trip to South America', 'A shortage of soccer balls', 'A lack of stadiums in Montevideo'], answer: 0 },
    syllables: { montevideo: ['mon', 'te', 'vid', 'e', 'o'], centenario: ['cen', 'te', 'na', 'rio'], constitution: ['con', 'sti', 'tu', 'tion'], obstacle: ['ob', 'sta', 'cle'], argentina: ['ar', 'gen', 'ti', 'na'], rimet: ['ri', 'met'] } }),
];
