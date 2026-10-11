import { TELA_TEMPLATE_GALLERY } from '../../services/tela/telaTemplateRegistry';
import { SLIDE_THEMES } from '../../services/ambo/slideTemplates/themes';
const by: Record<string, number> = {}; for (const t of TELA_TEMPLATE_GALLERY) by[t.collection] = (by[t.collection] || 0) + 1;
console.log('gallery', TELA_TEMPLATE_GALLERY.length, by);
console.log('slide themes', SLIDE_THEMES.length);
console.log('eras sample', TELA_TEMPLATE_GALLERY.filter(t => t.collection === 'DESIGN_HISTORY').slice(0, 40).map(t => t.name).join(' | '));
