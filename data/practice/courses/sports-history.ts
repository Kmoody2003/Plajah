import type { CourseModule } from '../courseModule';
import type { Question } from '../types';

const mcq = (lessonId: string, n: number, level: 1 | 2 | 3, prompt: string, choices: string[], answer: number, hint: string, explanation: string): Question => ({
  id: `${lessonId}.q${n}`, lessonId, kind: 'mcq', prompt, choices, answer, hint, explanation, level,
});
const tf = (lessonId: string, n: number, level: 1 | 2 | 3, prompt: string, answer: 0 | 1, hint: string, explanation: string): Question => ({
  id: `${lessonId}.q${n}`, lessonId, kind: 'tf', prompt, answer, hint, explanation, level,
});

export const COURSE_MODULE: CourseModule = {
  curriculum: {
    id: 'sports-history',
    label: 'Sports History: The World Cup',
    blurb: 'The story of football and the FIFA World Cup, from Uruguay in 1930 to the three-nation 2026 tournament.',
    accent: '#3FB98E',
    framework: 'c3',
    tracks: [
      {
        id: 'sports-history.t1',
        title: 'The First Cups, 1930 to 1958',
        blurb: 'A tournament is born, survives a world war and produces its first great upsets.',
        level: 'FOUNDATION',
        lessons: [
          {
            id: 'sports-history.l01',
            title: '1930: Uruguay and the First World Cup',
            blurb: 'Thirteen teams, one host and a trophy named after a FIFA president.',
            minutes: 6,
            body: `The first FIFA World Cup took place in 1930 in Uruguay, and it was a modest affair by modern standards: thirteen teams took part. The hosts were also the champions. Uruguay beat Argentina 4-2 in the final at the Estadio Centenario in Montevideo, so the first World Cup was won by the country that hosted it.

The prize was the Jules Rimet Trophy, which would be awarded from 1930 until 1970. It was retired when Brazil won its third title and kept the trophy permanently. In 1974 it was replaced by the FIFA World Cup Trophy, which is still used today.

Those early finals set patterns that later tournaments repeated. Host nations often did well: Uruguay in 1930 and Italy in 1934 won at home, and later England in 1966, West Germany in 1974, Argentina in 1978 and France in 1998 did the same. South America and Europe quickly became the two strongholds of the game.

Why it matters: the 1930 tournament proved that countries from different continents would travel to compete for one title. It was the seed from which the 48-team event of 2026 grew.`,
          },
          {
            id: 'sports-history.l02',
            title: 'Italy, Back-to-Back and the War Gap',
            blurb: 'The first repeat champions and two tournaments that never happened.',
            minutes: 6,
            body: `Italy hosted the 1934 World Cup and won it, beating Czechoslovakia 2-1 after extra time in the final at the Stadio Nazionale PNF in Rome. Four years later, at the 1938 tournament in France, Italy beat Hungary 4-2 at the Stade Olympique de Colombes in Paris. That made Italy the first back-to-back champions.

After 1938 came a long gap. The tournaments that would have been held in 1942 and 1946 were cancelled because of World War II. The World Cup did not return until 1950, which means there was a twelve-year pause in the sequence of finals.

The war gap changed football's story. Players who might have peaked in the early 1940s never played in a World Cup. A generation of fans waited until Brazil hosted the competition in 1950. Italy's record of titles in 1934 and 1938 stood as a high point of that first era and would later grow with a third title in 1982 and a fourth in 2006.

The lesson for history students is that events outside sport, such as wars, can erase whole chapters. The official record of finals marks 1942 and 1946 as cancelled, not as missing data.`,
          },
          {
            id: 'sports-history.l03',
            title: '1950: The Maracanazo',
            blurb: 'Uruguay silence the Maracana, and the United States stun England.',
            minutes: 7,
            body: `The 1950 World Cup in Brazil produced two of the great upsets in football history. The first was the Maracanazo. Brazil, the hosts, were expected to win the title, and the final was played at the Estadio do Maracana in Rio de Janeiro. Uruguay won 2-1 and silenced a crowd that the museum records as roughly 174,000, the biggest final crowd ever. The popular nickname, Maracanazo, means the Maracana blow.

Uruguay had also been the first champions in 1930, so this second title confirmed their place among the game's greats. Juan Alberto Schiaffino was a star of that win.

The second shock is known as the Miracle on Grass. A part-time United States side beat mighty England 1-0 in one of the greatest upsets in sport.

Together, these results show a lasting feature of the World Cup: favourites can lose, and a single match can define a national memory. Brazil would have to wait until 1958 for its first title. Modern Brazilian football still carries the memory of 1950 as a spur to excellence, even as it later became the most successful nation in the competition.`,
          },
          {
            id: 'sports-history.l04',
            title: '1954 and 1958: Bern and the Birth of Pele',
            blurb: 'The Magyars fall and a 17-year-old arrives.',
            minutes: 7,
            body: `The 1954 World Cup in Switzerland ended with one of the biggest surprises in the competition. Hungary, known as the Mighty Magyars, were widely seen as the best team in the world. West Germany beat them 3-2 in the final at Wankdorf Stadium in Bern. The result is called the Miracle of Bern.

In 1958 the tournament moved to Sweden. Brazil beat the hosts 5-2 in the final at Rasunda Stadium in Solna. The match is remembered for the arrival of Pele, who at 17 scored twice in the final. The museum's records list Pele as the youngest World Cup winner, at age 17.

That same tournament produced another record: Just Fontaine of France scored 13 goals in a single World Cup, a total that is still unbeaten.

Four years later Brazil won again in Chile, beating Czechoslovakia 3-1 in Santiago. Garrincha, a dazzling dribbler who also won in 1958, carried Brazil to those back-to-back titles.

Why it matters: 1958 marks the moment Brazil became a global football brand, defined by flair and attack. The shift from European dominance in 1954 to Brazilian success showed that no single region owned the sport.`,
          },
        ],
      },
      {
        id: 'sports-history.t2',
        title: 'Dynasties and Total Football, 1962 to 1982',
        blurb: 'Brazil keeps a trophy, England wins at home and new ideas change the game.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'sports-history.l05',
            title: 'Brazil and the Jules Rimet Trophy',
            blurb: 'Three titles in 12 years and a trophy kept forever.',
            minutes: 7,
            body: `Between 1958 and 1970, Brazil won three World Cups: in 1958, 1962 and 1970. The 1970 final in Mexico City ended Brazil 4-1 Italy at the Estadio Azteca. It was Pele's third crown, and because it was Brazil's third title, the Jules Rimet Trophy was retired and kept by Brazil forever.

Pele remains the only three-time World Cup winner, a record noted in the legends list, along with the claim of more than 1,000 career goals. Garrincha, a winger known for dazzling dribbling, won in 1958 and 1962. Later Brazilian stars included Romario, who won the Golden Ball in 1994, and Ronaldo and Roberto Carlos, who won in 2002.

The 1970 tournament also gave football one of its most celebrated moments: Gordon Banks of England made what is still called the save of the century, clawing away Pele's downward header.

Brazil's total of five titles, in 1958, 1962, 1970, 1994 and 2002, is the most of any nation. Defender Cafu holds another record: he played in three consecutive finals, in 1994, 1998 and 2002.

The lesson: sustained success comes from a blend of individual brilliance and a national style that other countries try to copy.`,
          },
          {
            id: 'sports-history.l06',
            title: '1966 and 1974: England at Wembley, Germany at Munich',
            blurb: 'A hat-trick, a new trophy and the shadow of Total Football.',
            minutes: 7,
            body: `In 1966, England hosted the World Cup and won it. They beat West Germany 4-2 after extra time in the final at Wembley Stadium in London. Geoff Hurst scored a hat-trick, and commentary about the final minutes, they think it's all over, became part of English culture. Bobby Moore captained the side and Bobby Charlton was one of its stars. It remains England's only World Cup win.

Eight years later, in 1974, West Germany hosted and won. They beat the Netherlands 2-1 at the Olympiastadion in Munich. Franz Beckenbauer lifted the brand-new FIFA World Cup Trophy, which had replaced the retired Jules Rimet Trophy. Beckenbauer is credited with inventing the modern sweeper and later won the Cup as a manager in 1990. Gerd Muller, nicknamed Der Bomber, was also a 1974 winner.

The Dutch team lost the final but left a legacy. Johan Cruyff, a three-time Ballon d'Or winner, is called the father of Total Football, a style in which players constantly switch positions. The Netherlands lost the 1978 final as well, again to the host nation, and a third final in 2010.

The point to remember is that style and results do not always coincide: the Dutch were widely admired, yet the trophy went to the better-organised German side.`,
          },
          {
            id: 'sports-history.l07',
            title: '1978 and 1982: Kempes and Rossi',
            blurb: 'A home triumph in Buenos Aires and a redemption in Madrid.',
            minutes: 6,
            body: `The 1978 World Cup was hosted by Argentina. In the final at the Estadio Monumental in Buenos Aires, Argentina beat the Netherlands 3-1 after extra time. Mario Kempes led the hosts, winning the Golden Boot on home soil, and the final is remembered for its ticker-tape atmosphere. Defender Daniel Passarella captained the winning team.

Four years later, in 1982, the tournament took place in Spain. Italy beat West Germany 3-1 at the Santiago Bernabeu in Madrid. It was Italy's third title, adding a third star to the shirt. The hero was Paolo Rossi, whose redemption tournament saw him win the Golden Boot, the Golden Ball and later the Ballon d'Or.

That year Brazil's side, with Zico, was beloved by many fans even though it did not win. Zico earned the nickname the White Pele and remains a symbol of attacking football.

The two tournaments show how a World Cup can create a hero. Kempes and Rossi each turned a competition into a personal story. They also show that the record books and the popular memory sometimes disagree: Italy lifted the trophy in 1982, while many remember Brazil's style more warmly.`,
          },
        ],
      },
      {
        id: 'sports-history.t3',
        title: 'Global Game, 1986 to 2010',
        blurb: 'Four decades of stars, shocks and shootouts as the tournament goes worldwide.',
        level: 'INTERMEDIATE',
        lessons: [
          {
            id: 'sports-history.l08',
            title: '1986: Maradona\'s World Cup',
            blurb: 'The Hand of God, the Goal of the Century and a title for Argentina.',
            minutes: 7,
            body: `The 1986 World Cup was hosted by Mexico, and the final was played at the Estadio Azteca in Mexico City. Argentina beat West Germany 3-2, and the tournament is widely known as Maradona's World Cup. Diego Maradona won the Golden Ball.

Two moments from the quarter-final against England define it. Within four minutes, Maradona scored one goal with his fist, called the Hand of God, and another slaloming past half of England's team, called the Goal of the Century. The match is recorded in the museum as the Hand of God and Goal of the Century.

The Azteca has a special place in World Cup history. It hosted the 1970 and 1986 finals and is listed as the only stadium to host three World Cups, as it will also stage the 2026 opening match.

Gary Lineker of England won the Golden Boot in 1986, a reminder that individual awards and team success can be different stories.

Why it matters: Maradona's performance showed how one player can seem to carry a whole team. It also created a debate about the line between brilliance and rule-breaking that fans still discuss when comparing him with Pele, Messi and others.`,
          },
          {
            id: 'sports-history.l09',
            title: '1990 and 1994: Penalties and a Shootout Final',
            blurb: 'A low-scoring Italia 90, Roger Milla\'s dance and the first final decided by penalties.',
            minutes: 7,
            body: `In 1990 Italy hosted the World Cup. West Germany beat Argentina 1-0 in a rematch of the 1986 final at the Stadio Olimpico in Rome, with Andreas Brehme's late penalty deciding the match. Beckenbauer, who had captained West Germany to the 1974 title, now won as manager.

That tournament also gave the game a joyful image. At 38, Roger Milla of Cameroon lit up Italia 90 and invented a celebration with the corner flag that the world never forgot.

Four years later the World Cup came to the United States. The 1994 final at the Rose Bowl in Pasadena ended 0-0, and Brazil beat Italy 3-2 on penalties. It was the first final decided on penalties. Roberto Baggio, the tournament's best player, skied the last kick over the bar. Romario won the Golden Ball for Brazil.

The 1994 event also helped football grow in North America, a process that continues with the 2026 tournament.

The takeaway is that the World Cup can be decided by a single kick. A penalty shootout is dramatic because it reduces a month-long tournament to the nerves of a few players.`,
          },
          {
            id: 'sports-history.l10',
            title: '1998 and 2002: Zidane, Ronaldo and Korea',
            blurb: 'France\'s first title, Brazil\'s fifth, and an Asian co-hosted shock.',
            minutes: 7,
            body: `In 1998 France hosted the World Cup and won it for the first time. They beat Brazil 3-0 in the final at the Stade de France in Saint-Denis. Zinedine Zidane scored twice with headers. Marcel Desailly anchored the defence, and Thierry Henry was among the stars.
The 2002 World Cup was the first co-hosted by two countries, South Korea and Japan. Brazil beat Germany 2-0 in the final at the International Stadium in Yokohama. Ronaldo scored both goals, a redemption after 1998, and Brazil collected a fifth star. Oliver Kahn of Germany won the Golden Ball, the only goalkeeper ever to do so.

That tournament also contained a surprise run by South Korea, who stunned Italy and Spain to reach the semi-finals. And Hakan Sukur of Turkey scored the fastest World Cup goal, in 11 seconds.

The lesson is that the World Cup was no longer an event dominated by two continents. A host from Asia reaching the semi-final, plus the combination of a European champion in 1998 and a South American one in 2002, shows the competition had become global.`,
          },
          {
            id: 'sports-history.l11',
            title: '2006 and 2010: The Headbutt and Iniesta',
            blurb: 'A final marked by a red card and a first title for Spain.',
            minutes: 7,
            body: `The 2006 World Cup was held in Germany. Italy and France met in the final at the Olympiastadion in Berlin, and it finished 1-1, with Italy winning 5-3 on penalties. It will be remembered for Zinedine Zidane's headbutt, a red card that ended his glorious career in a moment of madness. Fabio Cannavaro captained Italy, and Fabio Grosso's penalty won the Cup. Gianluigi Buffon and Andrea Pirlo were also in the winning team.

In 2010 the tournament came to Africa for the first time, with South Africa as host. Spain beat the Netherlands 1-0 after extra time in the final at Soccer City in Johannesburg. Andres Iniesta scored in the 116th minute, giving Spain their first title. Iker Casillas captained Spain, and Xavi was the metronome of a golden generation that also won two European Championships.

Netherlands lost their third final. Diego Forlan of Uruguay won the Golden Ball that year.

Why it matters: Spain's win showed that a patient passing style could succeed at the highest level, and the 2010 event proved that Africa could host a full World Cup. The 2006 drama is a reminder that discipline and emotion are always in tension in elite sport.`,
          },
        ],
      },
      {
        id: 'sports-history.t4',
        title: 'The Modern Game and 2026',
        blurb: 'From Brazil 2014 to the three-nation 2026 tournament.',
        level: 'ADVANCED',
        lessons: [
          {
            id: 'sports-history.l12',
            title: '2014 and 2018: The 7-1 and a French Triumph',
            blurb: 'Germany humble Brazil, then France win in Moscow.',
            minutes: 7,
            body: `The 2014 World Cup in Brazil produced one of the most shocking scorelines in the competition. In the semi-final, Germany beat the hosts 7-1, scoring four goals in six second-half minutes. In the final, played at the Estadio do Maracana in Rio de Janeiro, Germany beat Argentina 1-0 after extra time. Mario Gotze volleyed in the only goal with a chest-and-volley in the 113th minute. Miroslav Klose, who scored the all-time record of 16 World Cup goals, was a winner, and Manuel Neuer was the sweeper-keeper who won the Golden Glove.

In 2018 Russia hosted. The tournament ran from 14 June to 15 July, and France won, beating Croatia 4-2 at the Luzhniki Stadium in Moscow. Kylian Mbappe announced himself. Harry Kane of England won the Golden Boot with 6 goals, Luka Modric of Croatia won the Golden Ball, and Belgium's Thibaut Courtois won the Golden Glove. Belgium finished third and England fourth. The tournament had 169 goals.

For learners, the key point is that dominance can shift quickly. Brazil, the most successful team in history, lost heavily at home in 2014, while Germany's long-term planning paid off with the title.`,
          },
          {
            id: 'sports-history.l13',
            title: '2022: Qatar and the Greatest Final',
            blurb: 'Messi completes football in a 3-3 final decided on penalties.',
            minutes: 7,
            body: `The 2022 World Cup was hosted by Qatar and ran from 20 November to 18 December 2022. It had 32 teams and produced 172 goals. The final, at Lusail Stadium in Lusail, ended 3-3 after extra time, and Argentina won 4-2 on penalties against France. The museum calls it the greatest final ever played.

Lionel Messi was the Golden Ball winner, scoring seven goals and providing three assists. The museum says Messi completed football, and the win ended a 36-year wait for Argentina. Emiliano Martinez won the Golden Glove, making key saves in the shootouts. Kylian Mbappe scored a hat-trick in the final, which helped him finish with 8 goals and the Golden Boot. Julian Alvarez of Argentina scored four goals, as did France's Olivier Giroud.

The tournament also contained history. Morocco beat Spain and Portugal to become the first African side in a World Cup semi-final, finishing fourth. Croatia took third place.

Why it matters: 2022 reminds us that a single tournament can contain multiple narratives, from a veteran star finally winning, to a young star scoring a record-style hat-trick, to a surprising African run. It was also the third World Cup final decided on penalties, after 1994 and 2006.`,
          },
          {
            id: 'sports-history.l14',
            title: '2026: Three Hosts, 48 Teams and 16 Stadiums',
            blurb: 'The biggest World Cup ever spreads across the USA, Canada and Mexico.',
            minutes: 8,
            body: `The 2026 World Cup was designed as the biggest ever. It had 48 teams, 104 matches and three host nations: the United States, Canada and Mexico. Matches were spread across 16 stadiums. Eleven are in the USA, two in Canada, at Toronto and Vancouver, and three in Mexico, at Mexico City, Guadalajara and Monterrey.

The opening match was scheduled for 11 June 2026 at Estadio Azteca in Mexico City. The Azteca, opened in 1966, is the only stadium to host three World Cups, in 1970, 1986 and 2026. The final was scheduled for 19 July 2026 at MetLife Stadium in East Rutherford, near New York, with a capacity of about 82,500.

The venues have interesting features. AT&T Stadium in Dallas has a capacity of about 92,000, the largest on the list. BC Place in Vancouver has the largest cable-supported retractable roof in the world. Arrowhead Stadium in Kansas City holds the Guinness record for the loudest outdoor stadium. Mercedes-Benz Stadium in Atlanta has an eight-petal retractable roof.

The expansion from 13 teams in 1930 to 48 in 2026 shows how far the competition has grown, and the shared hosting echoes the first co-hosted event in 2002.`,
          },
        ],
      },
    ],
  },
  bank: {
    curriculumId: 'sports-history',
    questions: [
      // l01
      mcq('sports-history.l01', 1, 1, 'Who won the first World Cup in 1930?', ['Argentina', 'Uruguay', 'Italy', 'Brazil'], 1, 'The hosts.', 'Uruguay hosted and won, beating Argentina 4-2 in Montevideo.'),
      mcq('sports-history.l01', 2, 1, 'How many teams played in the 1930 World Cup?', ['8', '24', '32', '13'], 3, 'A small field.', 'The museum records 13 teams at the first World Cup.'),
      mcq('sports-history.l01', 3, 2, 'Which trophy was awarded from 1930 to 1970?', ['The FIFA World Cup Trophy', 'The Golden Boot', 'The Jules Rimet Trophy', 'The Copa America'], 2, 'Named after a person.', 'The Jules Rimet Trophy was used from 1930 until 1970, when Brazil kept it.'),
      mcq('sports-history.l01', 4, 3, 'What does the 1930 final show about early World Cups?', ['Hosts could win at home', 'Only Europeans took part', 'Penalties decided finals', 'The final was in Rome'], 0, 'Think about where Uruguay played.', 'Uruguay won on home soil, a pattern later repeated by Italy, England, Argentina and France.'),
      // l02
      mcq('sports-history.l02', 1, 1, 'Which country was the first back-to-back champion?', ['Italy', 'Brazil', 'Uruguay', 'Hungary'], 0, 'It won in 1934 and 1938.', 'Italy won in 1934 and 1938.'),
      mcq('sports-history.l02', 2, 1, 'Why were the 1942 and 1946 tournaments not played?', ['A trophy shortage', 'A referees strike', 'World War II', 'Lack of stadiums'], 2, 'Think of global events.', 'Both were cancelled because of World War II.'),
      mcq('sports-history.l02', 3, 2, 'Which team lost the 1938 final to Italy?', ['Czechoslovakia', 'Hungary', 'Argentina', 'France'], 1, 'The score was 4-2.', 'Italy beat Hungary 4-2 in the 1938 final in Paris.'),
      mcq('sports-history.l02', 4, 3, 'If the World Cup was held in 1938 and resumed in 1950, about how many years was the gap?', ['4', '8', '16', '12'], 3, 'Subtract the years.', '1950 minus 1938 is twelve years, with 1942 and 1946 cancelled.'),
      // l03
      mcq('sports-history.l03', 1, 1, 'What is the Maracanazo?', ['Brazil\'s win in 1970', 'Spain\'s win in 2010', 'A famous free kick', 'Uruguay\'s win over Brazil in 1950'], 3, 'It happened in Rio.', 'It is the name for Uruguay\'s 2-1 win over Brazil in the 1950 decider.'),
      tf('sports-history.l03', 2, 1, 'The United States beat England 1-0 at the 1950 World Cup.', 0, 'Check the Miracle on Grass.', 'The museum records the United States beating England 1-0.'),
      mcq('sports-history.l03', 3, 2, 'Which stadium hosted the 1950 final?', ['Estadio do Maracana', 'Estadio Azteca', 'Wembley', 'Rose Bowl'], 0, 'In Rio de Janeiro.', 'The 1950 final was played at the Estadio do Maracana in Rio.'),
      mcq('sports-history.l03', 4, 3, 'Why did 1950 matter for Brazilian football memory?', ['Brazil won their first title', 'Brazil kept the trophy', 'The hosts lost a final they were expected to win', 'The final went to penalties'], 2, 'Think about expectations.', 'Hosts Brazil were favourites but lost to Uruguay, a defeat that became a national memory.'),
      // l04
      mcq('sports-history.l04', 1, 1, 'Who won the 1954 World Cup, in Bern?', ['Hungary', 'Brazil', 'West Germany', 'Czechoslovakia'], 2, 'They beat the Mighty Magyars.', 'West Germany beat Hungary 3-2 in the Miracle of Bern.'),
      mcq('sports-history.l04', 2, 1, 'How old was Pele when he scored twice in the 1958 final?', ['17', '21', '25', '30'], 0, 'A teenager.', 'He was 17 and is the youngest World Cup winner.'),
      mcq('sports-history.l04', 3, 2, 'Who scored a record 13 goals in a single World Cup in 1958?', ['Pele of Brazil', 'Garrincha of Brazil', 'Sandor Kocsis of Hungary', 'Just Fontaine'], 3, 'A French striker.', 'Just Fontaine of France scored 13 in 1958, still unbeaten.'),
      mcq('sports-history.l04', 4, 3, 'What does Brazil\'s 1958 and 1962 success show?', ['Europe won every title', 'No single region owned the sport', 'Hosts always win', 'Penalties decided both finals'], 1, 'Compare 1954 with 1958.', 'After a European win in 1954, Brazil\'s back-to-back titles showed the sport was global.'),
      // l05
      mcq('sports-history.l05', 1, 1, 'How many World Cups has Brazil won?', ['3', '5', '4', '6'], 1, 'The most of any nation.', 'The museum lists five titles: 1958, 1962, 1970, 1994 and 2002.'),
      mcq('sports-history.l05', 2, 1, 'What happened to the Jules Rimet Trophy after 1970?', ['It was returned to FIFA headquarters in Zurich', 'It was sold at auction to a private collector', 'It went to Mexico', 'It was kept by Brazil'], 3, 'Brazil won three times.', 'It was retired with Brazil\'s third title and kept by Brazil.'),
      mcq('sports-history.l05', 3, 2, 'Which defender played three consecutive World Cup finals?', ['Roberto Carlos', 'Beckenbauer', 'Cafu', 'Maldini'], 2, 'He played in 1994, 1998 and 2002.', 'Cafu holds the record for final appearances with three.'),
      mcq('sports-history.l05', 4, 3, 'Which moment from 1970 is called the save of the century?', ['Banks stopping Pele\'s header', 'Neuer\'s sweeping', 'Casillas in 2010', 'Martinez in 2022'], 0, 'An English goalkeeper.', 'Gordon Banks clawed away Pele\'s downward header.'),
      // l06
      mcq('sports-history.l06', 1, 1, 'Who scored a hat-trick in the 1966 final?', ['Geoff Hurst', 'Bobby Charlton', 'Gary Lineker', 'Bobby Moore'], 0, 'A forward for England.', 'Geoff Hurst scored three as England beat West Germany 4-2 aet.'),
      mcq('sports-history.l06', 2, 1, 'Which trophy did Beckenbauer lift in 1974?', ['The Jules Rimet Trophy', 'The Golden Boot', 'The FIFA World Cup Trophy', 'The Olympic football gold medal trophy'], 2, 'It was brand new.', 'The FIFA World Cup Trophy replaced the Rimet Trophy in 1974.'),
      mcq('sports-history.l06', 3, 2, 'Which team lost the 1974 final?', ['Argentina', 'Netherlands', 'Hungary', 'Czechoslovakia'], 1, 'Cruyff\'s team.', 'West Germany beat the Netherlands 2-1 in Munich.'),
      mcq('sports-history.l06', 4, 3, 'What does the 1974 final show about style versus results?', ['The best attackers always win', 'The host never wins', 'Extra time decided the match', 'Admired style did not guarantee the trophy'], 3, 'The Dutch were admired.', 'The Netherlands influenced the game but lost to the German side.'),
      // l07
      mcq('sports-history.l07', 1, 1, 'Who won the Golden Boot while leading Argentina to the 1978 title?', ['Diego Maradona', 'Karl-Heinz Rummenigge', 'Daniel Passarella', 'Mario Kempes'], 3, 'He played on home soil.', 'Mario Kempes won the Golden Boot in 1978.'),
      mcq('sports-history.l07', 2, 1, 'Which country won in 1982?', ['Brazil', 'Italy', 'West Germany', 'Argentina'], 1, 'Third star.', 'Italy beat West Germany 3-1 in Madrid.'),
      mcq('sports-history.l07', 3, 2, 'Which stadium hosted the 1978 final?', ['Estadio Monumental', 'Santiago Bernabeu', 'Wembley Stadium in London', 'Azteca'], 0, 'In Buenos Aires.', 'The final was played at the Estadio Monumental in Buenos Aires.'),
      mcq('sports-history.l07', 4, 3, 'What did Paolo Rossi achieve in 1982?', ['Only the Golden Glove', 'A shootout save', 'Golden Boot and Golden Ball', 'A final hat-trick'], 2, 'He had a redemption tournament.', 'He won both the Golden Boot and Golden Ball, then the Ballon d\'Or.'),
      // l08
      mcq('sports-history.l08', 1, 1, 'Which two goals did Maradona score in the 1986 quarter-final?', ['Two headers', 'Two free kicks', 'The Hand of God and the Goal of the Century', 'Two penalties'], 2, 'Four minutes apart.', 'He scored with his fist and then slalomed past half of England\'s team.'),
      mcq('sports-history.l08', 2, 1, 'What was the 1986 final score?', ['Argentina 3-2 West Germany', 'Argentina 1-0 West Germany', 'West Germany 3-2 Argentina', 'Brazil 4-1 Italy'], 0, 'Played at the Azteca.', 'Argentina beat West Germany 3-2.'),
      mcq('sports-history.l08', 3, 2, 'Which stadium hosted both the 1970 and 1986 finals?', ['Wembley', 'Maracana', 'Estadio Centenario', 'Estadio Azteca'], 3, 'Mexico City.', 'Estadio Azteca hosted both and will host a third World Cup in 2026.'),
      mcq('sports-history.l08', 4, 3, 'Why is 1986 called "Maradona\'s World Cup"?', ['He scored all of Argentina\'s goals', 'He dominated the tournament as its best player', 'He was the manager', 'He won the Golden Boot'], 1, 'He won the Golden Ball.', 'Maradona won the Golden Ball and carried Argentina to the title.'),
      // l09
      mcq('sports-history.l09', 1, 1, 'Who scored the late penalty that won the 1990 final?', ['Roberto Baggio', 'Andreas Brehme', 'Zidane', 'Romario'], 1, 'West Germany.', 'Brehme scored the penalty in the 1-0 win over Argentina.'),
      mcq('sports-history.l09', 2, 1, 'What was historic about the 1994 final?', ['The first in Africa', 'The first with 48 teams', 'The first held in Europe', 'The first decided on penalties'], 3, 'Rose Bowl.', 'It ended 0-0 and Brazil won 3-2 on penalties.'),
      mcq('sports-history.l09', 3, 2, 'Which player skied the final penalty in 1994?', ['Paolo Maldini', 'Romario', 'Roberto Baggio', 'Gianluca Pagliuca'], 2, 'An Italian forward.', 'Baggio\'s miss gave Brazil the title.'),
      mcq('sports-history.l09', 4, 3, 'Which player lit up Italia 90 at age 38 with a corner-flag dance?', ['Roger Milla', 'Salvatore Schillaci', 'Jorge Campos', 'Rashidi Yekini'], 0, 'Cameroon.', 'Roger Milla\'s celebration is one of the most remembered moments.'),
      // l10
      mcq('sports-history.l10', 1, 1, 'Who scored twice with headers in the 1998 final?', ['Zidane', 'Thierry Henry', 'Ronaldo Nazario', 'Marcel Desailly'], 0, 'France won 3-0.', 'Zidane scored two headers against Brazil.'),
      mcq('sports-history.l10', 2, 1, 'Which two countries co-hosted the 2002 World Cup?', ['USA and Mexico', 'Spain and Portugal', 'South Korea and Japan', 'Germany and the Netherlands'], 2, 'Asia.', 'The 2002 tournament was co-hosted by South Korea and Japan.'),
      mcq('sports-history.l10', 3, 2, 'Who scored both goals in the 2002 final?', ['Ronaldinho', 'Ronaldo', 'Oliver Kahn', 'Roberto Carlos'], 1, 'Brazil\'s fifth star.', 'Ronaldo scored both as Brazil beat Germany 2-0.'),
      mcq('sports-history.l10', 4, 3, 'Which record did Hakan Sukur set in 2002?', ['Most goals in a tournament', 'Youngest scorer', 'Most finals', 'Fastest World Cup goal at 11 seconds'], 3, 'Think of speed.', 'The museum lists his 11-second goal as the fastest in World Cup history.'),
      // l11
      mcq('sports-history.l11', 1, 1, 'How was the 2006 final decided?', ['Extra-time goal', 'A 3-0 win', 'A replay', 'Penalties after a 1-1 draw'], 3, 'Italy v France.', 'It finished 1-1 and Italy won 5-3 on penalties.'),
      mcq('sports-history.l11', 2, 1, 'Who scored Spain\'s winner in the 2010 final?', ['Fernando Torres', 'Andres Iniesta', 'Casillas', 'Puyol'], 1, 'Minute 116.', 'Iniesta scored the only goal in extra time.'),
      mcq('sports-history.l11', 3, 2, 'Where was the 2010 final played?', ['Soccer City, Johannesburg', 'Olympiastadion, Berlin', 'Stade de France, Saint-Denis', 'Luzhniki Stadium'], 0, 'Africa\'s first World Cup.', 'Spain beat the Netherlands at Soccer City in Johannesburg.'),
      mcq('sports-history.l11', 4, 3, 'Which was a first in World Cup history in 2010?', ['It was the first with penalties', 'It was the first co-hosted', 'It was the first held in Africa', 'It was the first in Asia'], 2, 'Host South Africa.', 'It was the first World Cup hosted in Africa and Spain\'s first title.'),
      // l12
      mcq('sports-history.l12', 1, 1, 'What was the semi-final score when Germany played Brazil in 2014?', ['4-2', '3-3', '7-1', '1-0'], 2, 'Four goals in six minutes.', 'Germany beat the hosts 7-1.'),
      mcq('sports-history.l12', 2, 1, 'Who scored the winner in the 2014 final?', ['Mario Gotze', 'Miroslav Klose', 'Thomas Muller', 'Manuel Neuer'], 0, 'A chest-and-volley.', 'Gotze scored in extra time against Argentina.'),
      mcq('sports-history.l12', 3, 2, 'Who won the 2018 Golden Boot with 6 goals?', ['Kylian Mbappe', 'Romelu Lukaku', 'Antoine Griezmann', 'Harry Kane'], 3, 'An England striker.', 'Kane won the Golden Boot in 2018 with 6 goals.'),
      mcq('sports-history.l12', 4, 3, 'What was the 2018 final score?', ['France 3-0 Croatia', 'France 4-2 Croatia', 'Croatia 2-1 France', 'France 1-0 Croatia'], 1, 'Luzhniki Stadium.', 'France beat Croatia 4-2 in Moscow.'),
      // l13
      mcq('sports-history.l13', 1, 1, 'Which country hosted the 2022 World Cup?', ['South Africa', 'Qatar', 'United States', 'South Korea'], 1, 'Lusail.', 'Qatar hosted the tournament.'),
      mcq('sports-history.l13', 2, 1, 'How did the 2022 final end?', ['1-0 aet', '4-2', '0-0, 3-2 on penalties', '3-3 aet, Argentina won 4-2 on penalties'], 3, 'Argentina v France.', 'Argentina won 4-2 on penalties after a 3-3 draw.'),
      mcq('sports-history.l13', 3, 2, 'Who won the 2022 Golden Boot with 8 goals?', ['Lionel Messi', 'Julian Alvarez', 'Kylian Mbappe', 'Olivier Giroud'], 2, 'He scored a final hat-trick.', 'Mbappe scored 8, one more than Messi.'),
      mcq('sports-history.l13', 4, 3, 'Which team became the first African side in a World Cup semi-final in 2022?', ['Morocco', 'Ivory Coast', 'South Africa', 'Cameroon'], 0, 'Atlas Lions.', 'Morocco beat Spain and Portugal and finished fourth.'),
      // l14
      mcq('sports-history.l14', 1, 1, 'How many teams played in the 2026 World Cup?', ['48', '32', '40', '64'], 0, 'The biggest ever.', 'The 2026 event has 48 teams and 104 matches.'),
      mcq('sports-history.l14', 2, 1, 'Where was the 2026 final scheduled?', ['Estadio Azteca', 'SoFi Stadium', 'MetLife Stadium', 'Mercedes-Benz Stadium, Atlanta'], 2, 'East Rutherford.', 'The final was scheduled for 19 July 2026 at MetLife Stadium.'),
      mcq('sports-history.l14', 3, 2, 'Which stadium has hosted three World Cups (1970, 1986 and 2026)?', ['Wembley', 'Estadio Azteca', 'AT&T Stadium', 'Estadio do Maracana'], 1, 'Mexico City.', 'Estadio Azteca is the only stadium to host three World Cups.'),
      mcq('sports-history.l14', 4, 3, 'How many World Cup stadiums are in Canada?', ['3', '5', '11', '2'], 3, 'Toronto and Vancouver.', 'Canada has BMO Field and BC Place; the USA has 11 and Mexico 3.'),
    ],
  },
};
