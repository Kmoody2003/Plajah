/**
 * materials.ts — what things are made of: how each material takes light and how it behaves when it moves.
 *
 * Roughness and metalness are the values PBR renderers expect. To add a material, add a line here and re-run
 * scripts/argilla/embedCodexPhrases.ts so the vision model can tell it apart.
 */

/** How a part moves: what cloth, rigging and physics should do with it. */
export type Behaviour = 'cloth' | 'stiff cloth' | 'flexible' | 'rigid' | 'hair' | 'skin' | 'brittle';

export interface Material {
  id: string;
  label: string;
  roughness: number;
  metalness: number;
  behaviour: Behaviour;
  /** How it might be described under a picture, for the vision model. */
  looks: string[];
}

const row = (id: string, label: string, roughness: number, metalness: number, behaviour: Behaviour, ...looks: string[]): Material => ({ id, label, roughness, metalness, behaviour, looks });

export const MATERIALS: Material[] = [
  row('cotton', 'Cotton', 0.9, 0, 'cloth', 'soft cotton fabric', 'a cotton t-shirt'),
  row('denim', 'Denim', 0.92, 0, 'stiff cloth', 'blue denim fabric', 'jeans denim'),
  row('wool', 'Wool', 0.95, 0, 'cloth', 'woven wool cloth', 'a wool coat'),
  row('poly-twill', 'Poly-wool twill', 0.78, 0, 'stiff cloth', 'pressed uniform twill fabric', 'a uniform shirt'),
  row('silk', 'Silk or satin', 0.35, 0, 'cloth', 'shiny satin fabric', 'silk cloth'),
  row('nylon', 'Nylon webbing', 0.65, 0, 'flexible', 'black nylon webbing', 'tactical nylon gear'),
  row('leather', 'Leather', 0.5, 0, 'flexible', 'brown leather', 'a leather surface'),
  row('polished-leather', 'Polished leather', 0.28, 0, 'flexible', 'polished black leather shoes', 'glossy patent leather'),
  row('rubber', 'Rubber', 0.85, 0, 'flexible', 'black rubber', 'a rubber tire'),
  row('plastic', 'Plastic', 0.45, 0, 'rigid', 'molded plastic', 'a glossy plastic casing'),
  row('painted-metal', 'Painted metal', 0.38, 0.35, 'rigid', 'painted sheet metal', 'car paint'),
  row('steel', 'Steel', 0.35, 1, 'rigid', 'brushed steel', 'stainless steel metal'),
  row('iron', 'Dark iron', 0.65, 1, 'rigid', 'rough dark iron', 'forged black iron'),
  row('aluminium', 'Aluminium', 0.42, 1, 'rigid', 'riveted aluminium panels', 'bare aluminium'),
  row('brass', 'Brass or gold', 0.25, 1, 'rigid', 'polished brass', 'shiny gold metal'),
  row('chrome', 'Chrome or silver', 0.08, 1, 'rigid', 'mirror chrome', 'polished silver'),
  row('wood', 'Wood', 0.68, 0, 'rigid', 'natural wood grain', 'a wooden surface'),
  row('varnished-wood', 'Varnished wood', 0.3, 0, 'rigid', 'glossy varnished wood', 'polished lacquered wood'),
  row('glass', 'Glass', 0.05, 0, 'brittle', 'clear glass', 'a glass window'),
  row('ceramic', 'Ceramic', 0.25, 0, 'brittle', 'glazed ceramic', 'porcelain'),
  row('clay', 'Terracotta', 0.85, 0, 'brittle', 'unglazed terracotta', 'fired clay pottery'),
  row('stone', 'Stone', 0.88, 0, 'rigid', 'rough grey stone', 'carved rock'),
  row('concrete', 'Concrete', 0.92, 0, 'rigid', 'concrete wall', 'weathered cement'),
  row('skin', 'Skin', 0.5, 0, 'skin', 'human skin', 'a human face'),
  row('hair', 'Hair', 0.55, 0, 'hair', 'human hair', 'a head of hair'),
  row('fur', 'Fur', 0.85, 0, 'hair', 'thick animal fur', 'a furry coat of an animal'),
  row('hide', 'Animal hide', 0.72, 0, 'flexible', 'stretched drum skin', 'rawhide'),
  row('foliage', 'Leaves', 0.7, 0, 'flexible', 'green leaves', 'plant foliage'),
  row('paper', 'Paper or card', 0.9, 0, 'flexible', 'paper', 'printed cardboard'),
];

export const MATERIAL_BY_ID = new Map(MATERIALS.map((m) => [m.id, m]));
