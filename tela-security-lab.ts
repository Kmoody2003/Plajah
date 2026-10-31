// Fires real attacks through the real cleaner and serializer in a real browser, and checks nothing ran:
//   npx vite --config tela-security-lab.vite.config.mjs  ->  http://127.0.0.1:3199/tela-security-lab.html
// Each payload sets window.__pwned if it gets to run. Results: window.__results.
import { cleanTelaDoc, cleanVectorObject, sanitizeRichText } from './services/tela/telaSecurity';
import { objectToSvg } from './services/tela/geometry/serialize';

const w = window as any;
w.__pwned = [];
w.__hit = (id: string) => w.__pwned.push(id);
const stage = document.getElementById('stage')!;
const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note });

const ATTACKS: [string, string][] = [
  ['img onerror', `<img src=x onerror="__hit('img')">`],
  ['script tag', `<script>__hit('script')</script>`],
  ['svg onload', `<svg onload="__hit('svg')"></svg>`],
  ['svg animate', `<svg><animate onbegin="__hit('anim')" attributeName=x dur=1s></svg>`],
  ['iframe srcdoc', `<iframe srcdoc="<script>parent.__hit('iframe')</script>"></iframe>`],
  ['details ontoggle', `<details open ontoggle="__hit('details')">x</details>`],
  ['video onerror', `<video src=x onerror="__hit('video')"></video>`],
  ['body onload', `<body onload="__hit('body')">`],
  ['mutation via noscript', `<noscript><p title="</noscript><img src=x onerror=__hit('mxss1')>">`],
  ['mutation via math', `<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;img src=1 onerror=__hit('mxss2')&gt;">`],
  ['mutation via form', `<form><math><mtext></form><form><mglyph><style></math><img src onerror=__hit('mxss3')>`],
  ['javascript link', `<a href="javascript:__hit('link')" id="lablink">x</a>`],
  ['obfuscated link', `<a href=" java\tscript:__hit('link2')" id="lablink2">x</a>`],
  ['style url', `<span style="background:url(javascript:__hit('css'))">x</span>`],
  ['meta refresh', `<meta http-equiv="refresh" content="0;url=javascript:__hit('meta')">`],
  ['unknown tag handler', `<foo onclick="__hit('foo')" onmouseover="__hit('foo2')">x</foo>`],
];

const fill = '"><img src=x onerror="__hit(\'fill\')"><rect x="';
const VECTOR_ATTACKS: [string, Record<string, unknown>][] = [
  ['fill', { fill }],
  ['stroke', { stroke: fill }],
  ['opacity as text', { opacity: fill }],
  ['path data', { kind: 'PATH', svgPathData: 'M0 0"/><image href=x onerror="__hit(\'d\')"/><path d="', geom: {} }],
  ['font family', { kind: 'TEXT', text: 'hi', fontFamily: `x" onload="__hit('font')` }],
  ['gradient stop', { fill: '#000', gradient: { kind: 'LINEAR', stops: [{ offset: 0, color: fill }] } }],
];
const baseObject = { id: 'o1', kind: 'RECT', x: 0, y: 0, w: 10, h: 10, fill: '#123456', stroke: 'none', strokeWidth: 0, opacity: 1 };

async function run() {
  for (const [name, html] of ATTACKS) {
    const threats: string[] = [];
    const safe = sanitizeRichText(html, (k) => threats.push(k));
    const host = document.createElement('div');
    stage.appendChild(host);
    host.innerHTML = safe;
    host.querySelectorAll('a').forEach((a) => a.click());
    check(`rich text: ${name} left no handler`, !/\son[a-z]+\s*=|javascript:/i.test(host.innerHTML), host.innerHTML);
  }
  for (const [name, patch] of VECTOR_ATTACKS) {
    const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    stage.appendChild(host);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    host.appendChild(g);
    let svg = '';
    try { svg = objectToSvg({ ...baseObject, ...patch } as any); } catch (e) { svg = ''; }
    g.innerHTML = svg;
    check(`vector: ${name} injected no element or handler`, !g.querySelector('img,script,foreignObject') && !Array.from(g.querySelectorAll('*')).some((el) => Array.from(el.attributes).some((a) => a.name.startsWith('on'))), svg);
  }
  await new Promise((r) => setTimeout(r, 800));
  check('no payload ran', w.__pwned.length === 0, w.__pwned.join(', '));

  // The control: without the cleaner the same attack really does run, so a pass above means something.
  const control = document.createElement('div');
  stage.appendChild(control);
  control.innerHTML = `<img src=x onerror="__hit('control')">`;
  await new Promise((r) => setTimeout(r, 400));
  check('control: the raw payload does run in this browser', w.__pwned.includes('control'));

  // Ordinary documents must come through untouched.
  const KEEP = ['plain words', '<b>bold</b> and <em>em</em><br>', '<span style="color: rgb(255, 0, 0); font-size: 14px">red</span>', '<a href="https://plajah.com" target="_blank" rel="noopener">link</a>', 'a &lt; b and 2 &gt; 1', '<ul><li>one</li></ul>', '<span data-kind="x" class="y">z</span>', '<img src="data:image/png;base64,AAAA" alt="a">'];
  for (const html of KEEP) check(`keeps: ${html}`, sanitizeRichText(html) === html, sanitizeRichText(html));

  const cleanDoc: any = { id: 'd', title: 'About <script> tags', ownerId: 'u', frames: [], bindings: [], devices: {
    w: { id: 'w', type: 'WRITER', blocks: [{ id: 'b', kind: 'p', text: '<b>hello</b>' }] },
    v: { id: 'v', type: 'VECTOR', objects: [{ ...baseObject, kind: 'TEXT', text: 'Lesson: <script>alert(1)</script> onclick=x', fontFamily: '"Source Serif 4", serif', svgPathData: 'M0 0L1 1Z', fill: 'rgba(0,0,0,.5)', sourceImageSrc: 'https://x/y.png' }] },
    g: { id: 'g', type: 'GRID', cells: { A1: { value: '=SUM(A2:A9)' }, A2: { value: '=A3<B4' }, A3: { value: '-5' } } },
    t: { id: 't', type: 'BASE', rows: [{ note: 'mentions <img onerror=x> as text' }] },
  } };
  const res = cleanTelaDoc(cleanDoc);
  check('a clean document returns the same object', res.doc === cleanDoc && res.threats.length === 0, JSON.stringify(res.threats));
  const obj = { ...baseObject };
  check('a clean vector object returns the same object', cleanVectorObject(obj) === obj);

  const badDoc: any = JSON.parse(`{"id":"d","ownerId":"u","frames":[],"devices":{
    "w":{"id":"w","name":"Intro","type":"WRITER","blocks":[{"id":"b","kind":"p","text":"keep <img src=x onerror=alert(1)>"}]},
    "v":{"id":"v","type":"VECTOR","objects":[{"id":"o","fill":"\\"><img src=x onerror=alert(1)>","text":"keep me"}]},
    "m":{"id":"m","type":"MEDIA","src":"javascript:alert(1)"},
    "i":{"id":"i","type":"IMAGE","layers":[{"src":"data:image/svg+xml;base64,${btoa('<svg onload=alert(1)>')}"},{"src":"data:image/svg+xml;base64,${btoa('<svg><rect/></svg>')}"}]},
    "g":{"id":"g","type":"GRID","cells":{"A1":{"value":"=cmd|' /c calc'!A0"},"A2":{"value":"=WEBSERVICE(\\"http://evil\\")"}}},
    "__proto__":{"polluted":true}}}`);
  const bad = cleanTelaDoc(badDoc);
  const out: any = bad.doc;
  check('threats found in every part', ['event-handler', 'attribute-injection', 'dangerous-url', 'spreadsheet-command', 'prototype-pollution'].every((k) => bad.threats.some((t) => t.kind === k)), JSON.stringify(bad.threats.map((t) => t.kind)));
  check('the words stay', out.devices.w.blocks[0].text.startsWith('keep') && out.devices.v.objects[0].text === 'keep me');
  check('the code goes', !/onerror/.test(out.devices.w.blocks[0].text) && !out.devices.v.objects[0].fill && !out.devices.m.src && !out.devices.i.layers[0].src);
  check('a safe SVG image stays', !!out.devices.i.layers[1].src);
  check('spreadsheet commands are made inert', out.devices.g.cells.A1.value.startsWith("'") && out.devices.g.cells.A2.value.startsWith("'"));
  check('the source says where', bad.threats.some((t) => t.where === 'Intro'));
  check('the original is not mutated', /onerror/.test(badDoc.devices.w.blocks[0].text));
  check('nothing polluted', !('polluted' in {}));

  const big = '<span style="color:red">x</span>'.repeat(2000);
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) sanitizeRichText(big);
  check('large block stays fast', (performance.now() - t0) / 20 < 50, `${((performance.now() - t0) / 20).toFixed(1)} ms`);

  w.__results = results;
  document.getElementById('root')!.innerHTML = `<h3>${results.filter((r) => r.ok).length}/${results.length} passed</h3>` + results.map((r) => `<div class="${r.ok ? 'pass' : 'fail'}">${r.ok ? 'PASS' : 'FAIL'} ${r.name.replace(/</g, '&lt;')}${!r.ok && r.note ? ` <code>${String(r.note).replace(/</g, '&lt;')}</code>` : ''}</div>`).join('');
}
void run();
