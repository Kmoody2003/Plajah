// telaThumbOracle — prove an editor-renderer change does not move template thumbnails.
//
// Renders every gallery template page (37k objects) through the in-app thumbnail renderer
// (TelaStaticSvg → ObjectEl) of TWO versions of components/tela/TelaVector.tsx in the same
// process, with Math.random / Date.now seeded per page so id-generating designers are
// deterministic, and compares the markup:
//   - pages with no engine (geom) objects must be byte-identical;
//   - pages with geom objects must render each geom object exactly as the canonical
//     serialiser does (the editor now matches exports, Fabula and letters).
//
//   git show HEAD:components/tela/TelaVector.tsx > components/tela/TelaVector.baseline.tsx
//   npx tsx scripts/telaThumbOracle.tsx components/tela/TelaVector.baseline.tsx
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TelaStaticSvg, usesSerializer } from '../components/tela/TelaVector';
import { TELA_TEMPLATE_GALLERY } from '../services/tela/telaTemplateRegistry';
import { objectToSvg } from '../services/tela/geometry/serialize';
import type { TelaVectorObject } from '../types';

const baselinePath = process.argv[2];
if (!baselinePath) { console.error('usage: telaThumbOracle <baseline TelaVector.tsx>'); process.exit(2); }

let seed = 1; const realNow = Date.now;
const seedPage = (k: number) => { seed = 1 + k; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; Date.now = () => 1_700_000_000_000 + k; };

(async () => {
  const Base = await import(pathToFileURL(resolve(baselinePath)).href) as { TelaStaticSvg: typeof TelaStaticSvg };
  let pages = 0, objects = 0, identical = 0, geomPages = 0, geomObjects = 0; const bad: string[] = [];
  let k = 0;
  for (const t of TELA_TEMPLATE_GALLERY) for (let i = 0; i < t.pages.length; i++) {
    seedPage(++k); let o: TelaVectorObject[]; try { o = t.pages[i].build(); } catch { continue; }
    pages++; objects += o.length;
    const now = renderToStaticMarkup(<TelaStaticSvg objects={o} width={t.width} height={t.height} />);
    const was = renderToStaticMarkup(<Base.TelaStaticSvg objects={o} width={t.width} height={t.height} />);
    if (now === was) { identical++; continue; }
    const g = o.filter(usesSerializer);
    if (!g.length) { bad.push(`${t.id}#${i}`); continue; }
    // Every changed page must differ ONLY in its geom objects, which must equal the serialiser.
    const plain = o.filter(x => !usesSerializer(x));
    const plainNow = renderToStaticMarkup(<TelaStaticSvg objects={plain} width={t.width} height={t.height} />);
    const plainWas = renderToStaticMarkup(<Base.TelaStaticSvg objects={plain} width={t.width} height={t.height} />);
    const geomOk = g.every(x => renderToStaticMarkup(<TelaStaticSvg objects={[x]} width={t.width} height={t.height} />).includes(objectToSvg(x)));
    if (plainNow !== plainWas || !geomOk) bad.push(`${t.id}#${i}${geomOk ? '' : ' (geom ≠ serialiser)'}`);
    else { geomPages++; geomObjects += g.length; }
  }
  Date.now = realNow;
  console.log(`pages ${pages} · objects ${objects}`);
  console.log(`${identical} pages byte-identical · ${geomPages} pages changed only in ${geomObjects} engine-finish objects, each now rendered exactly as the canonical serialiser (= export)`);
  console.log(bad.length ? `REGRESSIONS ${bad.length}: ${bad.slice(0, 30).join(', ')}` : 'no regressions');
  process.exit(bad.length ? 1 : 0);
})();
