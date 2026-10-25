/**
 * Curriculum → collection mapping. A lesson/course topic resolves to museum search queries so
 * "Study this object" can pull real works from the Met, Smithsonian, Europeana, Cleveland, AIC,
 * Commons and LoC. Rules are matched in order; the first hit wins, else the topic itself is searched.
 */
import type { MuseumRegion } from '../services/museum/regions';

export interface StudyRule { match: RegExp; queries: string[]; lens?: 'formal' | 'historical' | 'material' | 'cultural'; region?: MuseumRegion }

export const MUSEUM_STUDY_RULES: StudyRule[] = [
  // World traditions — region-lensed so Asian, Middle Eastern, African and Americas collections lead.
  { match: /ukiyo|japan|woodblock|samurai|\bedo\b|meiji/i, queries: ['woodblock print', 'screen painting', 'lacquer'], lens: 'cultural', region: 'asia' },
  { match: /\bchina\b|chinese|dynasty|\bming\b|\bqing\b|\btang\b|song dynasty|silk road/i, queries: ['porcelain', 'scroll painting', 'bronze ritual vessel'], lens: 'cultural', region: 'asia' },
  { match: /korea|joseon|goryeo|celadon/i, queries: ['celadon', 'Joseon painting'], lens: 'cultural', region: 'asia' },
  { match: /india|mughal|hindu|buddhis|south asia|southeast asia|khmer|angkor/i, queries: ['miniature painting', 'bronze sculpture', 'manuscript'], lens: 'cultural', region: 'asia' },
  { match: /islam|persian|ottoman|arab|calligraph|arabesque|mamluk|safavid|mesopotamia|middle east/i, queries: ['calligraphy', 'manuscript', 'tile', 'metalwork'], lens: 'cultural', region: 'middle-east' },
  { match: /\bafrica|\bbenin\b|yoruba|ashanti|ethiopia|\bmali\b|swahili|kente|\bnok\b/i, queries: ['mask', 'textile', 'sculpture', 'metalwork'], lens: 'cultural', region: 'africa' },
  { match: /maya|aztec|inca|andean|pre-?columbian|olmec|mesoamerica/i, queries: ['ceramic', 'textile', 'gold', 'stone sculpture'], lens: 'cultural', region: 'latin-america' },
  { match: /latin america|mexic|brazil|\bperu\b|colombia|argentin|\bchile\b|caribbean|latino/i, queries: ['painting', 'folk art', 'textile'], lens: 'cultural', region: 'latin-america' },
  { match: /native american|indigenous|first nations|navajo|haida|pueblo|\bplains\b/i, queries: ['basket', 'pottery', 'beadwork', 'textile'], lens: 'cultural', region: 'indigenous-americas' },
  { match: /oceania|polynesia|maori|pacific|aboriginal|melanesia/i, queries: ['carving', 'canoe', 'bark cloth'], lens: 'cultural', region: 'oceania' },
  { match: /renaissance|humanis|perspective/i, queries: ['Renaissance painting', 'linear perspective'], lens: 'formal' },
  { match: /baroque|chiaroscuro/i, queries: ['Baroque painting', 'chiaroscuro'], lens: 'formal' },
  { match: /impression/i, queries: ['Impressionism landscape', 'Monet', 'Pissarro'], lens: 'formal' },
  { match: /cubis|modernis|abstract/i, queries: ['Cubism', 'abstract painting'], lens: 'formal' },
  { match: /ukiyo|japan|woodblock/i, queries: ['ukiyo-e woodblock print', 'Hokusai'], lens: 'cultural' },
  { match: /egypt|pharaoh|nile/i, queries: ['Egyptian relief', 'ancient Egypt'], lens: 'historical' },
  { match: /greek|roman|classical antiquity/i, queries: ['Greek vase', 'Roman sculpture'], lens: 'historical' },
  { match: /medieval|gothic|illuminat/i, queries: ['illuminated manuscript', 'Gothic'], lens: 'historical' },
  { match: /islamic|calligraph|arabesque/i, queries: ['Islamic calligraphy', 'arabesque tile'], lens: 'cultural' },
  { match: /textile|fashion|costume|dress/i, queries: ['textile', 'costume dress'], lens: 'material' },
  { match: /ceramic|pottery|vessel/i, queries: ['ceramic vessel', 'porcelain'], lens: 'material' },
  { match: /poster|typograph|graphic design|print/i, queries: ['poster', 'typography specimen', 'lithograph'], lens: 'formal' },
  { match: /photograph/i, queries: ['photograph', 'daguerreotype'], lens: 'formal' },
  { match: /sculpt|bronze|marble/i, queries: ['bronze sculpture', 'marble relief'], lens: 'material' },
  { match: /civil war|american revolution|founding|us history|american history/i, queries: ['Civil War', 'American Revolution'], lens: 'historical' },
  { match: /space|aviation|flight|science|invention/i, queries: ['aircraft', 'telescope', 'invention'], lens: 'historical' },
  // Art College (data/artCollege) — studio and scholarship topics
  { match: /drawing|contour|gesture|sketch/i, queries: ['Rembrandt drawing', 'Matisse line drawing', 'Chardin still life'], lens: 'formal' },
  { match: /colou?r|hue|palette/i, queries: ['Josef Albers', 'Rothko painting', 'Monet'], lens: 'formal' },
  { match: /painting|oil|acrylic|alla prima|watercolou?r/i, queries: ['oil painting still life', 'Turner watercolor', 'Cezanne'], lens: 'formal' },
  { match: /printmaking|etching|intaglio|relief print|screen ?print|lithograph/i, queries: ['etching', 'woodcut', 'screenprint'], lens: 'material' },
  { match: /illustration|picture book|sequential|comic|storyboard/i, queries: ['book illustration', 'Hokusai manga', 'illuminated manuscript'], lens: 'formal' },
  { match: /pattern|motif|textile design|surface design/i, queries: ['William Morris textile', 'Islamic geometric tile'], lens: 'formal' },
  { match: /install|public art|site[- ]specific|fabricat/i, queries: ['Richard Serra', 'Isamu Noguchi', 'Alexander Calder mobile'], lens: 'material' },
  { match: /architectur|environmental design/i, queries: ['architectural drawing', 'Frank Lloyd Wright'], lens: 'historical' },
  { match: /contemporary|conceptual|since 1945|installation art/i, queries: ['Andy Warhol', 'Kara Walker', 'Robert Rauschenberg'], lens: 'cultural' },
  { match: /provenance|repatriat|museum studies/i, queries: ['Benin bronze plaque', 'Parthenon marbles'], lens: 'cultural' },
];

export function studyQueriesFor(topic: string): { queries: string[]; lens: NonNullable<StudyRule['lens']>; region?: MuseumRegion } {
  const rule = MUSEUM_STUDY_RULES.find(r => r.match.test(topic));
  return { queries: rule?.queries ?? [topic], lens: rule?.lens ?? 'formal', region: rule?.region };
}

/** Looking protocol: the same five moves for every object. */
export const STUDY_STEPS = [
  { id: 'look', title: 'Look', prompt: 'Look for a full minute before reading anything. What do you notice first? List five things you can see.' },
  { id: 'describe', title: 'Describe', prompt: 'Describe it as if to someone who cannot see it: subject, colours, shapes, materials, scale.' },
  { id: 'analyze', title: 'Analyze', prompt: 'How is it made? What did the maker choose — composition, line, light, technique — and what does it do to your eye?' },
  { id: 'interpret', title: 'Interpret', prompt: 'What do you think it is about? What in the object makes you say that?' },
  { id: 'context', title: 'Place it', prompt: 'When and where was it made, and by whom? What was happening then that explains it?' },
] as const;
